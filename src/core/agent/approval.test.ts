import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { makeApprovalFn, resolvePermission } from "./approval";
import type { AgentDeps, AgentStore, ApprovalRequest, Tool } from "./types";
import type { LLMProvider } from "@/core/llm/types";

const inputSchema = z.object({ text: z.string() });

type TestTool = Tool<typeof inputSchema, unknown>;

function makeMockStore(): AgentStore & {
  queue: Array<ApprovalRequest & { resolve: (ok: boolean) => void }>;
} {
  const queue: Array<ApprovalRequest & { resolve: (ok: boolean) => void }> =
    [];
  return {
    messages: [],
    pendingApprovals: [],
    runningTools: {},
    permissionMode: "default",
    append: () => {},
    enqueueApproval: (req) => {
      queue.push(req);
    },
    queue,
  };
}

function makeDeps(
  overrides: Partial<AgentDeps> = {},
): AgentDeps {
  return {
    db: {} as AgentDeps["db"],
    llm: { id: "fake", chat: async () => "" } as LLMProvider,
    store: {} as AgentDeps["store"],
    signal: new AbortController().signal,
    requestApproval: async () => true,
    ...overrides,
  };
}

function makeTool(
  overrides: Partial<TestTool> & { name: string },
): TestTool {
  return {
    description: "test tool",
    inputSchema,
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    checkPermissions: async () => ({ behavior: "allow", updatedInput: {} }),
    call: async function* () {
      return { data: null };
    },
    ...overrides,
  };
}

describe("makeApprovalFn", () => {
  it("resolves true when the enqueued item is resolved with true", async () => {
    const store = makeMockStore();
    const fn = makeApprovalFn(store);
    const req: ApprovalRequest = {
      tool: "python",
      input: { code: "print(1)" },
      reason: "execute code",
      risk: "high",
    };

    const promise = fn(req);
    expect(store.queue).toHaveLength(1);
    expect(store.queue[0]).toMatchObject(req);

    store.queue[0]!.resolve(true);
    await expect(promise).resolves.toBe(true);
  });

  it("resolves false when the enqueued item is resolved with false", async () => {
    const store = makeMockStore();
    const fn = makeApprovalFn(store);

    const promise = fn({
      tool: "python",
      input: {},
      reason: "execute code",
      risk: "high",
    });

    store.queue[0]!.resolve(false);
    await expect(promise).resolves.toBe(false);
  });
});

describe("resolvePermission", () => {
  it("returns deny when checkPermissions denies", async () => {
    const tool = makeTool({
      name: "blocked",
      checkPermissions: async () => ({
        behavior: "deny",
        message: "not allowed",
      }),
    });

    const result = await resolvePermission({
      tool,
      input: { text: "x" },
      deps: makeDeps(),
      mode: "default",
    });

    expect(result).toBe("deny");
  });

  it("returns allow when checkPermissions allows", async () => {
    const tool = makeTool({
      name: "open",
      checkPermissions: async () => ({
        behavior: "allow",
        updatedInput: { text: "x" },
      }),
    });

    const result = await resolvePermission({
      tool,
      input: { text: "x" },
      deps: makeDeps(),
      mode: "default",
    });

    expect(result).toBe("allow");
  });

  it("denies write tools in plan mode when checkPermissions asks", async () => {
    const tool = makeTool({
      name: "writer",
      isReadOnly: () => false,
      checkPermissions: async () => ({
        behavior: "ask",
        reason: "write",
        risk: "high",
      }),
    });
    const requestApproval = vi.fn(async () => true);

    const result = await resolvePermission({
      tool,
      input: { text: "x" },
      deps: makeDeps({ requestApproval }),
      mode: "plan",
    });

    expect(result).toBe("deny");
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("allows read-only tools in plan mode when checkPermissions asks", async () => {
    const tool = makeTool({
      name: "reader",
      isReadOnly: () => true,
      checkPermissions: async () => ({
        behavior: "ask",
        reason: "read",
        risk: "low",
      }),
    });
    const requestApproval = vi.fn(async () => true);

    const result = await resolvePermission({
      tool,
      input: { text: "x" },
      deps: makeDeps({ requestApproval }),
      mode: "plan",
    });

    expect(result).toBe("allow");
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("auto-approves read-only tools in autoApproveRead mode when checkPermissions asks", async () => {
    const tool = makeTool({
      name: "reader",
      isReadOnly: () => true,
      checkPermissions: async () => ({
        behavior: "ask",
        reason: "read",
        risk: "low",
      }),
    });
    const requestApproval = vi.fn(async () => true);

    const result = await resolvePermission({
      tool,
      input: { text: "x" },
      deps: makeDeps({ requestApproval }),
      mode: "autoApproveRead",
    });

    expect(result).toBe("allow");
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("uses requestApproval in default mode when checkPermissions asks", async () => {
    const tool = makeTool({
      name: "risky",
      isReadOnly: () => false,
      checkPermissions: async () => ({
        behavior: "ask",
        reason: "needs approval",
        risk: "high",
      }),
    });
    const requestApproval = vi.fn(async () => true);

    const allowed = await resolvePermission({
      tool,
      input: { text: "x" },
      deps: makeDeps({ requestApproval }),
      mode: "default",
    });

    expect(allowed).toBe("allow");
    expect(requestApproval).toHaveBeenCalledWith({
      tool: "risky",
      input: { text: "x" },
      reason: "needs approval",
      risk: "high",
    });

    requestApproval.mockResolvedValueOnce(false);

    const denied = await resolvePermission({
      tool,
      input: { text: "x" },
      deps: makeDeps({ requestApproval }),
      mode: "default",
    });

    expect(denied).toBe("deny");
  });

  it("returns deny when checkPermissions throws", async () => {
    const tool = makeTool({
      name: "broken",
      checkPermissions: async () => {
        throw new Error("boom");
      },
    });

    const result = await resolvePermission({
      tool,
      input: { text: "x" },
      deps: makeDeps(),
      mode: "default",
    });

    expect(result).toBe("deny");
  });
});
