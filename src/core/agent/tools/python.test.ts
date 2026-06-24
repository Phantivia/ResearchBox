import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentDeps } from "../types";
import type { PyodideClient, PyOutput } from "../python/workerClient";
import * as workerClientModule from "../python/workerClient";
import { executeTool } from "../execute";
import {
  pythonTool,
  pythonInputSchema,
  PYTHON_OUTPUT_MAX_CHARS,
} from "./python";
import { buildResearchTools } from "./index";

function makeDeps(overrides: Partial<AgentDeps> = {}): AgentDeps {
  return {
    db: {} as AgentDeps["db"],
    llm: { id: "fake", chat: async () => "" },
    store: {
      messages: [],
      pendingApprovals: [],
      runningTools: {},
      permissionMode: "default",
      append: () => {},
      enqueueApproval: () => {},
      setRunningTool: () => {},
      clearRunningTool: () => {},
    },
    signal: new AbortController().signal,
    requestApproval: async () => true,
    ...overrides,
  };
}

function makeFakeClient(
  impl: (code: string, signal: AbortSignal) => Promise<PyOutput>,
): PyodideClient {
  return { run: vi.fn(impl) };
}

async function drainCall(
  input: { code: string; purpose: string },
  deps: AgentDeps,
) {
  const parsed = pythonInputSchema.parse(input);
  const gen = pythonTool.call(parsed, deps);
  const stages: string[] = [];
  let step = await gen.next();
  while (!step.done) {
    stages.push(step.value.stage);
    step = await gen.next();
  }
  return { result: step.value, stages };
}

async function drainExecuteTool(
  call: { id: string; name: string; input: unknown },
  deps: AgentDeps,
) {
  const gen = executeTool(call, [pythonTool], deps);
  let step = await gen.next();
  while (!step.done) {
    step = await gen.next();
  }
  return step.value;
}

describe("pythonTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is not read-only and not concurrency-safe", () => {
    const input = { code: "print(1)", purpose: "test" };
    expect(pythonTool.isReadOnly(input)).toBe(false);
    expect(pythonTool.isConcurrencySafe(input)).toBe(false);
  });

  it("checkPermissions asks with high risk", async () => {
    const result = await pythonTool.checkPermissions(
      { code: "print(1)", purpose: "plot chart" },
      makeDeps(),
    );
    expect(result).toEqual({
      behavior: "ask",
      reason: "执行 Python: plot chart",
      risk: "high",
    });
  });

  it("yields loading and running stages and passes through stdout/result", async () => {
    const fakeClient = makeFakeClient(async () => ({
      stdout: "hello\n",
      result: "42",
    }));
    vi.spyOn(workerClientModule, "getPyodideClient").mockReturnValue(fakeClient);

    const { result, stages } = await drainCall(
      { code: "print('hello')", purpose: "compute" },
      makeDeps(),
    );

    expect(stages).toEqual(["loading", "running"]);
    expect(fakeClient.run).toHaveBeenCalledWith(
      "print('hello')",
      expect.any(AbortSignal),
    );
    expect(result.data).toBe("stdout:\nhello\n\n\nresult:\n42");
  });

  it("truncates output beyond PYTHON_OUTPUT_MAX_CHARS", async () => {
    const longText = "x".repeat(PYTHON_OUTPUT_MAX_CHARS + 500);
    const fakeClient = makeFakeClient(async () => ({
      stdout: longText,
      result: "",
    }));
    vi.spyOn(workerClientModule, "getPyodideClient").mockReturnValue(fakeClient);

    const { result } = await drainCall(
      { code: "print('big')", purpose: "large output" },
      makeDeps(),
    );

    expect(result.data).toContain("[输出过大，已截断");
    expect(result.data).toContain("x".repeat(100));
    expect(result.data.length).toBeLessThan(`stdout:\n${longText}`.length);
  });

  it("throws friendly error when client rejects", async () => {
    const fakeClient = makeFakeClient(async () => {
      throw new Error("worker crashed");
    });
    vi.spyOn(workerClientModule, "getPyodideClient").mockReturnValue(fakeClient);

    await expect(
      drainCall({ code: "bad()", purpose: "fail" }, makeDeps()),
    ).rejects.toThrow("Python 执行失败: worker crashed");
  });

  it("throws friendly error when Python returns error field", async () => {
    const fakeClient = makeFakeClient(async () => ({
      stdout: "traceback line",
      result: "",
      error: "ZeroDivisionError: division by zero",
    }));
    vi.spyOn(workerClientModule, "getPyodideClient").mockReturnValue(fakeClient);

    await expect(
      drainCall({ code: "1/0", purpose: "divide" }, makeDeps()),
    ).rejects.toThrow("Python 异常: ZeroDivisionError: division by zero");
  });

  it("client throw surfaces as isError tool_result via executeTool", async () => {
    const fakeClient = makeFakeClient(async () => {
      throw new Error("worker crashed");
    });
    vi.spyOn(workerClientModule, "getPyodideClient").mockReturnValue(fakeClient);

    const result = await drainExecuteTool(
      {
        id: "t1",
        name: "python",
        input: { code: "bad()", purpose: "fail" },
      },
      makeDeps(),
    );

    expect(result.message.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: "工具执行失败: Python 执行失败: worker crashed",
      isError: true,
    });
  });
});

describe("buildResearchTools python injection", () => {
  it("includes pythonTool only when allowCode is true", () => {
    const without = buildResearchTools({ allowWeb: false, allowCode: false });
    const withCode = buildResearchTools({ allowWeb: false, allowCode: true });

    expect(without.some((t) => t.name === "python")).toBe(false);
    expect(withCode.some((t) => t.name === "python")).toBe(true);
    expect(withCode.find((t) => t.name === "python")).toBe(pythonTool);
  });
});
