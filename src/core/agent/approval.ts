import { z } from "zod";
import type {
  AgentDeps,
  AgentStore,
  ApprovalFn,
  ApprovalRequest,
  Tool,
} from "./types";

export function makeApprovalFn(store: AgentStore): ApprovalFn {
  return (req: ApprovalRequest) =>
    new Promise<boolean>((resolve) => {
      store.enqueueApproval({ ...req, resolve });
    });
}

export async function resolvePermission(args: {
  tool: Tool<z.ZodTypeAny, unknown>;
  input: unknown;
  deps: AgentDeps;
  mode: "default" | "plan" | "autoApproveRead";
}): Promise<"allow" | "deny"> {
  const { tool, input, deps, mode } = args;
  try {
    const perm = await tool.checkPermissions(
      input as z.infer<typeof tool.inputSchema>,
      deps,
    );

    if (perm.behavior === "deny") {
      return "deny";
    }
    if (perm.behavior === "allow") {
      return "allow";
    }

    if (mode === "plan") {
      return tool.isReadOnly(input as z.infer<typeof tool.inputSchema>)
        ? "allow"
        : "deny";
    }

    if (
      mode === "autoApproveRead" &&
      tool.isReadOnly(input as z.infer<typeof tool.inputSchema>)
    ) {
      return "allow";
    }

    const ok = await deps.requestApproval({
      tool: tool.name,
      input,
      reason: perm.reason,
      risk: perm.risk,
    });
    return ok ? "allow" : "deny";
  } catch {
    return "deny";
  }
}
