// AgentStore 只在此定义接口：core 不依赖 React，Zustand 实现放在 src/store/agentStore.ts。
import { z } from "zod";
import { ArtifactKindSchema } from "@/core/agent/artifact/schema";
import type { PaperIRDatabase } from "@/db";
import type { LLMProvider, ProviderConfig } from "@/core/llm";

export const PermissionModeSchema = z.enum(["default", "ask"]);
export type PermissionMode = z.infer<typeof PermissionModeSchema>;

export const ContentBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("image"),
    mediaType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
    data: z.string(),
  }),
  z.object({
    type: z.literal("ocr_text"),
    text: z.string(),
    imageName: z.string(),
    pending: z.boolean().optional(),
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
  z.object({
    type: z.literal("artifact_card"),
    artifactId: z.string(),
    title: z.string(),
    kind: ArtifactKindSchema,
  }),
]);

export const AgentMessageSchema = z.object({
  role: z.enum(["user", "assistant", "tool"]),
  content: z.array(ContentBlockSchema),
  /** 仅用于 LLM 上下文、不在聊天 UI 展示（如工具注入的证据块）。 */
  uiHidden: z.boolean().optional(),
  /** 仅在聊天 UI 展示、不送入 LLM（如 artifact 完成卡片）。 */
  llmHidden: z.boolean().optional(),
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
  permissionMode: PermissionMode;
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
  /** Active provider config; sub-agent derives an isolated LLM from this. */
  providerConfig?: ProviderConfig;
}
