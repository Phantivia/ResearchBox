// AgentStore 只在此定义接口：core 不依赖 React，Zustand 实现放在 src/store/agentStore.ts。
import { z } from "zod";
import type { PaperIRDatabase } from "@/db";
import type { LLMProvider } from "@/core/llm";

export const ContentBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("thinking"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal("tool_result"),
    toolUseId: z.string(),
    content: z.string(),
    isError: z.boolean().optional(),
  }),
]);

export const AgentMessageSchema = z.object({
  role: z.enum(["user", "assistant", "tool"]),
  content: z.array(ContentBlockSchema),
});

export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export type PermissionResult =
  | { behavior: "allow"; updatedInput: unknown }
  | { behavior: "ask"; reason: string; risk: "low" | "high" }
  | { behavior: "deny"; message: string };

export interface ToolResult<O> {
  data: O;
  newMessages?: AgentMessage[];
  contextModifier?: (deps: AgentDeps) => AgentDeps;
}

export interface Tool<I extends z.ZodTypeAny, O, P = unknown> {
  name: string;
  description: string;
  inputSchema: I;
  isConcurrencySafe(input: z.infer<I>): boolean;
  isReadOnly(input: z.infer<I>): boolean;
  checkPermissions(input: z.infer<I>, deps: AgentDeps): Promise<PermissionResult>;
  call(input: z.infer<I>, deps: AgentDeps): AsyncGenerator<P, ToolResult<O>>;
}

export type Terminal =
  | { reason: "completed" }
  | { reason: "aborted" }
  | { reason: "max_turns" }
  | { reason: "approval_denied"; toolName: string }
  | { reason: "model_error"; error: unknown };

export interface ApprovalRequest {
  tool: string;
  input: unknown;
  reason: string;
  risk: "low" | "high";
}

export type ApprovalFn = (req: ApprovalRequest) => Promise<boolean>;

export interface AgentStore {
  messages: AgentMessage[];
  pendingApprovals: ApprovalRequest[];
  runningTools: Record<string, { name: string; stage: string }>;
  permissionMode: "default" | "plan" | "autoApproveRead";
  append(m: AgentMessage): void;
  enqueueApproval(r: ApprovalRequest & { resolve: (ok: boolean) => void }): string | void;
  setRunningTool(id: string, info: { name: string; stage: string }): void;
  clearRunningTool(id: string): void;
}

export interface AgentDeps {
  db: PaperIRDatabase;
  llm: LLMProvider;
  store: AgentStore;
  signal: AbortSignal;
  requestApproval: ApprovalFn;
  /** Active workspace; injected by the page when constructing deps. */
  projectId?: string;
}
