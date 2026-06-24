# ResearchBox · Research Agent 分阶段实施方案（面向 Cursor Coding Agent）

> 本文把 `BuildResearchAgent.md`（架构映射）、`Claude_prompts.md`（可复用 Prompt 原文）、`ResearchBoxAgent.md`（产品/UX 设计与里程碑）三份设计，落实为**可逐步交给 Cursor 执行的工程方案**。
>
> 每个阶段给出：目标 → 改动清单 → 若干「步骤」。每个步骤包含**可直接粘贴给 Cursor 的完整 Prompt** + **验收标准**，并标注**难易度 / 改动范围 / 推荐模型**。
>
> 使用方式：按阶段、按步骤顺序把 Prompt 粘贴进 Cursor。每个 Prompt 已自带「读哪些设计文档、改哪些文件、遵守哪些铁律、跑什么验收命令」，无需额外上下文。

---

## 0. 全局约定（每个 Prompt 都隐含遵守）

所有交给 Cursor 的 Prompt 都默认追加以下约束（写在每个 Prompt 末尾的「交付要求」里，不再逐条重复解释）：

1. 严格遵守 `CLAUDE.md`：TS strict；React 19 + Vite；Tailwind（无运行时 CSS-in-JS）；Zustand（不引入 Redux）；Dexie；Zod 为唯一数据事实来源；named export；不加「解释做了什么」的注释。
2. **架构铁律**：`src/core/` 下代码**不得 import React、不得操作 DOM 全局副作用**（`media` 类模块除外）。UI 只能调用 core 暴露的函数，禁止 core 反向依赖 UI。
3. **不引入技术栈外的新依赖**；确需新依赖（如 Pyodide）必须先在回复里说明理由并停下等确认。
4. 交付前必须跑通 `npm run typecheck` 与 `npm run test` 并贴出结果；每个 core 模块配同名 `.test.ts`。
5. 改动涉及多文件时先列「改动清单」再写代码；不确定的接口停下来问，不要猜。

> ⚠️ **与 `BuildResearchAgent.md` 的两处刻意偏离**（已为遵守 `CLAUDE.md` 调整，Prompt 中会强调）：
> - **状态分层**：`BuildResearchAgent.md` 把 Zustand store 放在 `src/core/agent/store.ts`。但 core 不得 import React，而本项目 Zustand store 统一在 `src/store/`。因此：**纯逻辑（loop / tools / execute / orchestrate）放 `src/core/agent/`，只依赖 `AgentStore` 接口**；**真正的 Zustand 实现放 `src/store/agentStore.ts`**，经 `AgentDeps` 注入。
> - **数据存储**：当前 Dexie（库名 `researchbox`，v4）**没有** `blocks` 表，也**没有** `toolResults` 表。论文区块存在每篇 `PaperIR.blocks` 数组内。检索/结果预算相关阶段需新增 **v5 迁移**（`toolResults` 表 + 可选 `aiSessions` 复用），并从 `papers` 表内的 IR 遍历 blocks，而非假想的独立 `blocks` 表。

---

## 1. 模型分派图例（贯穿全文）

用户要求：**低难度 · 大范围 → 快速模型**；**高难度 · 小范围 → 专家模型**。据此约定三档：

| 标记 | 难易度 | 改动范围 | 适合任务类型 | 推荐模型档位 |
|------|--------|----------|--------------|--------------|
| 🟢 **快速档** | 低 | 大 | 脚手架、样板、类型搬运、注册表、UI 布局、i18n 文案、Dexie 迁移样板 | 快速模型（如 Composer / 快速通用模型） |
| 🟡 **标准档** | 中 | 中 | 普通组件、store action、工具骨架接线、常规单测 | 标准模型（如 Sonnet 档） |
| 🔴 **专家档** | 高 | 小 | 主循环 / 批分区并发 / 流式解析 / 权限边界 / Pyodide 消息往返 / side-query 召回算法 | 专家模型（如 Opus / GPT-5 high 推理） |

> 经验法则：**范围越大、越机械 → 越靠快速档**；**逻辑越微妙、出错代价越高、越需要正确性 → 越靠专家档**（哪怕只改十几行）。每个步骤标题旁的徽章即为推荐档位。

---

## 2. 阶段总览与依赖顺序

融合 `ResearchBoxAgent.md` 的产品里程碑（先纯聊天 → 单工具 agent loop → 扩展）与 `BuildResearchAgent.md` 附录 A 的依赖顺序：

| 阶段 | 名称 | 对应能力 / 里程碑 | 依赖 |
|------|------|-------------------|------|
| **P0** | 公共骨架与 Provider 扩展 | 基建：`types.ts` + `agentStore` + `runWithTools` | — |
| **P1** | 基础 Chat（无工具） | 产品里程碑①：聊天 UI、思维流、上下文计量 | P0 |
| **P2** | Agent 主循环 + 首个工具（PaperBox Read） | 产品里程碑②、能力⑤骨架 | P1 |
| **P3** | 人审批节点 + 权限系统 | 能力⑤（human-in-the-loop） | P2 |
| **P4** | 盒内导航 + 封闭域检索 `retrieval`（`paperbox_list` + blockId 引用 + 检索姿态） | 能力② | P2/P3 |
| **P5** | 学术检索 `academic_search` + 逐篇纳入闸门 | 差异化主工作量 | P2/P3 |
| **P6** | 开放域 Web 搜索 `websearch`（Tavily/Perplexity） | 能力① | P3 |
| **P7** | 盒子开关 + provenance + 边界规则（采集/研究边界） | 核心交互 | P4/P5/P6 |
| **P8** | Artifacts 生成 + 侧栏产出区 | 能力③ | P3/P4 |
| **P9** | Python 沙盒（Pyodide Worker） | 能力④ | P6 + 结果预算 |
| **P10** | 子代理 + 结果预算 + 会话持久化/历史搜索 | 能力增强 + UX 收尾 | P4/P8 |

> 本文 **P4 及以后** 已按 `实施方案修订案.md` 重做：先补齐修订案定义的「检索 / 搜索 / 盒子开关」工作流（P4–P7，差异化核心），再保留原计划的 Artifacts / Python / 子代理作为后续增强（P8–P10）。

```text
P0 ─> P1 ─> P2 ─> P3 ─┬─> P4(导航+retrieval) ─┐
                      ├─> P5(academic_search) ─┼─> P7(盒子开关/边界) ─> P8(Artifacts)
                      └─> P6(websearch) ───────┘                         │
                                                            P6+预算 ─> P9(Python)   │
                                                                       P4/P8 ─> P10 ┘
```

---

# 阶段 P0 · 公共骨架与 Provider 扩展

**目标**：建立 `src/core/agent/` 的类型骨架（对应 `BuildResearchAgent.md` 公共骨架）、Zustand `agentStore`、并把现有 `LLMProvider` 扩展出 tool-use 能力。完成后尚无任何 UI/工具，但后续所有阶段都依赖这层契约。

**改动清单**
- 新增 `src/core/agent/types.ts`（`AgentDeps` / `Tool` / `ToolResult` / `PermissionResult` / `AgentMessage` / `Terminal` / `AgentStore` 接口）
- 新增 `src/core/agent/types.test.ts`
- 修改 `src/core/llm/types.ts`（新增 `runWithTools` 到 `LLMProvider`，新增 `ToolSchema` / `StreamEvent` / `AssistantMessage` 类型）
- 新增 `src/store/agentStore.ts` + `src/store/agentStore.test.ts`，并在 `src/store/index.ts` 导出

## P0-1 · 定义 Agent 公共类型骨架　🔴 专家档（高难度 · 小范围）

> 类型契约是后续所有阶段的地基，必须一次定义准确（判别联合、Zod 泛型、deps 注入边界）。范围小但极考究，交专家模型。

```text
你在 ResearchBox 项目（纯前端 TS + React 19 + Vite + Zustand + Dexie + Zod）中工作。请先阅读 @CLAUDE.md、@BuildResearchAgent.md 的「ResearchBox Agent 的公共骨架」一节与 §1/§5/§6，以及 @PROJECT.md 第 4.10 节（LLM 抽象）与第 11 节（关键数据类型）。

任务：新建 src/core/agent/types.ts，定义学术 Agent 的公共类型骨架，作为后续主循环、工具、执行管线的唯一契约。要求：

1. 用 Zod 定义并导出 AgentMessage 的 schema 与类型。AgentMessage 至少覆盖：
   - { role: 'user' | 'assistant' | 'tool'; content: ContentBlock[] }
   - ContentBlock 为判别联合：{ type:'text'; text:string } | { type:'thinking'; text:string } | { type:'tool_use'; id:string; name:string; input:unknown } | { type:'tool_result'; toolUseId:string; content:string; isError?:boolean }
2. 定义并导出 PermissionResult 判别联合：
   - { behavior:'allow'; updatedInput:unknown } | { behavior:'ask'; reason:string; risk:'low'|'high' } | { behavior:'deny'; message:string }
3. 定义并导出泛型 ToolResult<O>：{ data:O; newMessages?: AgentMessage[]; contextModifier?: (deps:AgentDeps)=>AgentDeps }
4. 定义并导出泛型 Tool<I extends z.ZodTypeAny, O, P = unknown>，字段：name、description、inputSchema:I、isConcurrencySafe(input):boolean、isReadOnly(input):boolean、checkPermissions(input, deps):Promise<PermissionResult>、call(input, deps):AsyncGenerator<P, ToolResult<O>>。与 Claude Code 的 Tool<Input,Output,Progress> 三参数同构。
5. 定义并导出 Terminal 判别联合（主循环终止状态）：{ reason:'completed' } | { reason:'aborted' } | { reason:'max_turns' } | { reason:'approval_denied'; toolName:string } | { reason:'model_error'; error:unknown }。
6. 定义并导出 ApprovalRequest（{ tool:string; input:unknown; reason:string; risk:'low'|'high' }）与 ApprovalFn = (req:ApprovalRequest)=>Promise<boolean>。
7. 定义并导出 AgentStore **接口**（注意：只定义接口，不在 core 里实现 Zustand，因为 core 不得 import React）。字段至少：messages、pendingApprovals、runningTools、permissionMode（'default'|'plan'|'autoApproveRead'），方法 append(m)、enqueueApproval(r)。
8. 定义并导出 AgentDeps 接口：{ db: PaperIRDatabase; llm: LLMProvider; store: AgentStore; signal: AbortSignal; requestApproval: ApprovalFn }。db 用 import type 从 @/db 引（即 src/db 的 Dexie 实例类型），llm 从 @/core/llm 的 LLMProvider 引；均用 import type 避免运行时副作用。

约束（务必遵守）：
- src/core/agent/types.ts 不得 import react、不得有 DOM 副作用。
- 全部 named export，不用 default。
- AgentStore 在此**只能是接口**；真正的 Zustand 实现将放在 src/store/agentStore.ts（后续步骤）。在文件顶部写一行「为什么」的注释解释这一分层（core 不依赖 React）。
- 不写解释「做了什么」的注释。

同时新建 src/core/agent/types.test.ts：用 Vitest 对 AgentMessage 的 Zod schema 写最小往返校验（合法对象 parse 通过、非法 role 被拒）。

交付要求：列出改动清单；跑 `npm run typecheck` 与 `npm run test` 并贴出结果。
```

**验收标准**
- `src/core/agent/types.ts` 存在，导出上述全部类型/schema，且 `AgentStore` 为接口而非实现。
- 文件内**无** `import ... from 'react'`、无 DOM 全局访问；`db`/`llm` 用 `import type`。
- `types.test.ts` 至少 2 个用例（合法 parse、非法拒绝）通过。
- `npm run typecheck` 零错误；`npm run test` 全绿。

## P0-2 · 扩展 LLMProvider 支持 tool-use　🔴 专家档（高难度 · 小范围）

> 现有 `chat()` 只产文本。为 Agent 加 `runWithTools` 的流式 tool-use 接口（含 thinking / tool_use 事件），是后续主循环的输入边界，须与现有 SSE/流式风格一致。

```text
请阅读 @PROJECT.md 第 4.10 与 12 节、@BuildResearchAgent.md §4、@Claude_prompts.md §4，以及现有 src/core/llm/types.ts、src/core/llm/createProvider.ts、src/core/llm/providers/anthropic.ts、src/core/llm/sse.ts。

现状：LLMProvider 接口为 `chat(opts: ChatOptions, deps?): AsyncIterable<string> | Promise<string>`，仅产纯文本，供翻译用。

任务：在不破坏现有 chat() 的前提下，给 Agent 增加 tool-use 能力。

1. 在 src/core/llm/types.ts 新增类型（named export）：
   - ToolSchema = { name:string; description:string; inputSchema: Record<string,unknown> }  // JSON Schema
   - StreamEvent 判别联合（流式增量）：{ type:'text_delta'; text:string } | { type:'thinking_delta'; text:string } | { type:'tool_use_start'; id:string; name:string } | { type:'tool_use_input_delta'; id:string; partialJson:string } | { type:'tool_use_stop'; id:string }
   - AssistantMessage = { content: AgentContentBlock[]; stopReason:'end_turn'|'tool_use'|'max_tokens' }，AgentContentBlock 复用 @/core/agent/types 中的 ContentBlock（用 import type）。
2. 给 LLMProvider 接口新增可选方法：
   runWithTools?(req: { messages: AgentMessage[]; tools: ToolSchema[]; system: string; model?: string; signal?: AbortSignal }): AsyncGenerator<StreamEvent, AssistantMessage>
   - AgentMessage 从 @/core/agent/types import type。
   - 设计为可选（?），这样未实现该方法的 provider 不报错；Agent 启动时若 provider 无该方法则提示用户该 provider 暂不支持工具。
3. 仅在 AnthropicProvider 上实现 runWithTools（复用现有 SSE 解析骨架 src/core/llm/sse.ts，对接 Anthropic Messages API 的 tools 参数与 content_block_start / content_block_delta（含 input_json_delta、thinking_delta）/ content_block_stop / message_delta 事件）。OpenAICompatibleProvider 与 GeminiProvider 暂不实现（留空即可，不实现 runWithTools 方法）。
4. 控制成本：参考 Claude Code 的 8K 输出上限思路，max_tokens 默认设一个合理上限（如 8192），并允许 req 不显式传 model 时回落到 provider 配置的 model。

约束：
- 不引入新依赖；沿用现有 fetch + SSE 解析风格。
- src/core/llm 下不得 import react。
- 为 AnthropicProvider.runWithTools 写单测 src/core/llm/providers/anthropic.test.ts 的新增用例：用 mock fetch 喂一段含 text_delta + 一个 tool_use（带 input_json_delta 分片）的 SSE，断言 yield 出的 StreamEvent 序列与最终 AssistantMessage.stopReason==='tool_use' 且能拼出完整 tool_use input JSON。

交付要求：先列改动清单；跑 typecheck + test 贴结果。若 Anthropic SSE 的 tool_use 事件结构有不确定处，停下来问，不要猜字段名。
```

**验收标准**
- `LLMProvider` 新增可选 `runWithTools`；`chat()` 签名与行为不变。
- `AnthropicProvider.runWithTools` 能流式 yield `StreamEvent` 并 return `AssistantMessage`，正确拼接分片的 tool_use input JSON。
- 新增 mock-SSE 单测通过（覆盖 text + tool_use 分片 + stopReason）。
- typecheck 零错误，test 全绿。

## P0-3 · 实现 Zustand agentStore（UI 态）　🟢 快速档（低难度 · 大范围）

> 标准 Zustand store 样板，照搬现有 `src/store/*` 风格即可，机械且范围大，交快速模型。

```text
请阅读 @PROJECT.md 第 3、6 节、@BuildResearchAgent.md §3，并参考现有 src/store/translationJobStore.ts、src/store/readerStore.ts 的写法与 src/store/index.ts 的导出风格。

任务：新建 src/store/agentStore.ts，实现 @/core/agent/types.ts 中定义的 AgentStore 接口的 Zustand 版本（用 React 版 zustand 的 create，与现有 store 一致）。

状态字段：
- messages: AgentMessage[]（从 @/core/agent/types import type）
- pendingApprovals: (ApprovalRequest & { id:string; resolve:(ok:boolean)=>void })[]
- runningTools: Record<string, { name:string; stage:string }>
- permissionMode: 'default' | 'plan' | 'autoApproveRead'（默认 'default'）
- 额外 UI 态：streamingText:string（当前流式拼接的 assistant 文本）、streamingThinking:string、contextChars:number（当前上下文估算字符数，供上下文计量用）

Actions：
- append(m: AgentMessage): void
- setStreaming(partial:{ text?:string; thinking?:string }): void
- commitStreamingToMessage(): void  // 把 streamingText/Thinking 落成一条 assistant message 并清空流式缓冲
- enqueueApproval(req): string  // 生成 id 压入队列，返回 id
- resolveApproval(id:string, ok:boolean): void  // 调用对应 resolve 并出队
- setRunningTool(id, info) / clearRunningTool(id)
- setContextChars(n:number): void
- reset(): void

并在 src/store/index.ts 增加 `export { useAgentStore } from "./agentStore"`。

约束：与现有 store 同风格（named export、create()、不写多余注释）。
新建 src/store/agentStore.test.ts：用 Vitest 测 append / enqueueApproval+resolveApproval（断言 resolve 被以正确布尔调用并出队）/ commitStreamingToMessage / reset。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**
- `useAgentStore` 实现 `AgentStore` 接口并扩展流式/上下文/审批队列字段；从 `src/store/index.ts` 导出。
- `enqueueApproval` 返回 id，`resolveApproval(id, ok)` 以正确布尔调用 resolve 并出队（单测覆盖）。
- typecheck 零错误，test 全绿。

---

# 阶段 P1 · 基础 Chat（无任何工具）

**目标**：实现 `ResearchBoxAgent.md` 里程碑①——把 Agent Chat 做成侧边栏第三大项，纯聊天（直接用现有 `LLMProvider.chat`，不走工具/主循环），美观展示用户/模型对话、思维内容、流式打字，并提供**实时上下文大小计量**。

**改动清单**
- 新增 `src/core/agent/contextSize.ts` + `.test.ts`（纯函数：估算消息上下文字符/Token 数）
- 新增 `src/ui/ai-panel/` 下：`AgentChatPanel.tsx`、`MessageBubble.tsx`、`ThinkingBlock.tsx`、`ChatComposer.tsx`、`ContextMeter.tsx`，并在 `src/ui/ai-panel/index.ts` 导出
- 新增 `src/pages/AgentChat.tsx`
- 修改 `src/App.tsx`（加路由）、`src/ui/shell/featureNav.ts`（加导航项）、`src/ui/shell/featureIcons.tsx`（加图标）、`src/core/i18n/messages.ts`（加文案 key）
- 新增 `src/core/agent/chatController.ts` + `.test.ts`（纯逻辑：把一次 chat 调用驱动成 store 更新；不 import React）

## P1-1 · 上下文大小估算纯函数　🟡 标准档（中难度 · 小范围）

```text
请阅读 @CLAUDE.md 与 @BuildResearchAgent.md §4（输出/上下文预算思路）。

任务：新建 src/core/agent/contextSize.ts（纯 TS，不 import react）。导出：
- estimateChars(messages: AgentMessage[]): number —— 统计所有 content block 文本总字符数（text/thinking/tool_result 的字符；tool_use 的 input 用 JSON.stringify 计）。
- estimateTokens(messages: AgentMessage[]): number —— 用「约 4 字符≈1 token」的粗略启发式（中文按约 1.5 字符≈1 token 处理，做一个合理近似即可），返回整数。
- contextUsageRatio(tokens:number, contextWindow:number): number —— 返回 0~1 占比，contextWindow<=0 时返回 0。

AgentMessage 从 @/core/agent/types import type。

新建 src/core/agent/contextSize.test.ts，覆盖：空数组=0；纯文本字符计数正确；含 tool_use input 的 JSON 计入；ratio 边界（contextWindow=0）。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**：`estimateChars/estimateTokens/contextUsageRatio` 行为符合上述；单测覆盖空、文本、tool_use、边界 4 类；core 纯净（无 React）。typecheck/test 通过。

## P1-2 · chatController 驱动逻辑　🔴 专家档（高难度 · 小范围）

> 把「流式 chat → store 更新」抽成可单测的纯逻辑，是 UI 与 core 的边界，需正确处理 AsyncIterable / abort / 错误。范围小但易错，交专家模型。

```text
请阅读 @PROJECT.md 第 4.10、6.5 节（translationJobStore 的流式驱动范式）、@BuildResearchAgent.md §5、现有 src/core/llm/types.ts。

任务：新建 src/core/agent/chatController.ts（纯 TS，不 import react）。导出 async 函数：
  runChat(params: { provider: LLMProvider; system: string; messages: AgentMessage[]; signal: AbortSignal; onDelta:(text:string)=>void; onDone:(full:string)=>void; onError:(e:unknown)=>void }): Promise<void>
逻辑：
- 调用 provider.chat({ system, messages: 转成 {role,content} 的纯文本消息, stream:true, signal })。
- chat 可能返回 AsyncIterable<string> 或 Promise<string>，两种都要正确处理：迭代时每个增量 chunk 调 onDelta 并累加；结束调 onDone(累加全文)；signal.aborted 时停止并直接返回（不视为错误）；其它异常调 onError。
- 把 AgentMessage[] 投影成 LLM 的 Message[]（role + 拼接后的 text，仅取 text block；忽略 thinking/tool_*，本阶段无工具）。

不要在此 import store 或 React——只通过回调暴露副作用，便于单测。

新建 src/core/agent/chatController.test.ts：
- mock 一个返回 async generator 的 provider.chat，断言 onDelta 按序收到分片、onDone 收到全文。
- mock 一个返回 Promise<string> 的 provider.chat，断言 onDone 收到该字符串。
- 触发 abort，断言不调用 onError、提前结束。
- provider.chat 抛错，断言 onError 被调用。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**：`runChat` 同时正确处理 `AsyncIterable` 与 `Promise<string>`；abort 不报错；异常走 `onError`；4 个单测全过；无 React 依赖。typecheck/test 通过。

## P1-3 · Chat UI 组件与思维流展示　🟢 快速档（低难度 · 大范围）

> 多个展示型 React 组件 + Tailwind 布局，范围大、逻辑浅，交快速模型批量产出。

```text
请阅读 @ResearchBoxAgent.md（用户侧设计：显示思考内容、对话、approval 等）、@PROJECT.md 第 7 节（UI 风格、调色盘 CSS 变量 --rb-*）、并参考现有 src/ui/reader/ 组件与 src/ui/settings/ 的 Tailwind 风格。

任务：在 src/ui/ai-panel/ 下新建以下 React 组件（用 Tailwind，颜色用 --rb-* CSS 变量，复用项目既有视觉风格，桌面与移动端都可用）：

1. MessageBubble.tsx —— props { role:'user'|'assistant'; children }。用户气泡靠右、assistant 靠左，圆角卡片，使用 --rb-card-bg / --rb-primary / --rb-text-primary 等变量。assistant 内容用 react-markdown 渲染（项目已装 react-markdown）。
2. ThinkingBlock.tsx —— 可折叠的「思考过程」展示块（默认折叠，点击展开），灰底、等宽或斜体，明显区别于正式回答；props { text:string; streaming?:boolean }，streaming 时显示一个轻量的「思考中…」动画点。
3. ContextMeter.tsx —— props { tokens:number; contextWindow:number }。显示「上下文：{tokens} tokens（{百分比}%）」，用一个细进度条（占比 >80% 变橙、>95% 变红）。
4. ChatComposer.tsx —— 底部输入框 + 发送按钮。props { disabled:boolean; onSend:(text:string)=>void }。支持 Enter 发送 / Shift+Enter 换行；发送后清空。
5. AgentChatPanel.tsx —— 组装上述组件的主面板：顶部 ContextMeter，中部可滚动消息列表（消息自动滚到底），底部 ChatComposer。**本阶段先用占位/假数据接线，不接真实模型**（真实接线在下一步）。

在 src/ui/ai-panel/index.ts 导出全部组件。

约束：纯展示组件，状态尽量来自 props；不要把业务逻辑写进组件。Tailwind 无运行时 CSS-in-JS。不写多余注释。

交付要求：列改动清单；跑 typecheck 贴结果（本步可不写单测，但组件须类型自洽）。
```

**验收标准**：5 个组件存在并从 `index.ts` 导出；使用 `--rb-*` 变量与 Tailwind；`ThinkingBlock` 可折叠、`ContextMeter` 有阈值变色、`ChatComposer` 支持 Enter/Shift+Enter；typecheck 通过。

## P1-4 · 接入侧边栏/路由并打通真实聊天　🟡 标准档（中难度 · 中范围）

```text
请阅读现有 src/ui/shell/featureNav.ts、src/ui/shell/featureIcons.tsx、src/App.tsx、src/core/i18n/messages.ts（MessageKey 机制）、src/store/settingsStore.ts（getActiveProvider）、src/store/agentStore.ts、src/core/agent/chatController.ts、src/core/agent/contextSize.ts。

任务：把 P1 的 Chat 打通成可用功能。

1. 新增导航项：在 src/ui/shell/featureNav.ts 的 FEATURE_NAV 增加 { id:'agent-chat', labelKey:'nav.agentChat', icon:'agent-chat', requiresProject:true, path: p => `/p/${encodeURIComponent(p)}/agent`, isActive: p => /\/agent(?:\/|$)/.test(p) }。在 featureIcons.tsx 增加 'agent-chat' 图标（一个聊天/对话气泡 SVG，风格与现有图标一致）。在 src/core/i18n/messages.ts 为 zh/en 增加 'nav.agentChat'（中:「研究助手」/ 英:「Agent」）及面板需要的文案 key。
   —— 注：@ResearchBoxAgent.md 要求 Agent Chat 成为平行于「功能、设置」的第三大项；若侧栏分组结构需要调整，按既有 Sidebar 实现的最小改动接入即可，不确定就先放进 FEATURE_NAV。
2. 新增路由：在 src/App.tsx 的 /p/:projectId 子路由下加 `paper/agent → AgentChat` 页面（路径与上面 isActive 对应，命名为 `agent`）。
3. 新建 src/pages/AgentChat.tsx：从 useSettingsStore 取 active provider（createProvider 见 src/core/llm/createProvider.ts），用 useAgentStore 管理消息与流式态。用户发送时：append 用户消息 → 调 src/core/agent/chatController.runChat，把 onDelta 写入 store.setStreaming、onDone 调 commitStreamingToMessage、onError 写一条错误 assistant 消息。每次消息变化用 contextSize.estimateTokens 更新 store.contextChars / ContextMeter（contextWindow 可从 provider 配置或给个默认如 200000）。无 active provider 时提示去设置页配置。
4. 把 AgentChatPanel 接上真实 store 数据（替换 P1-3 的占位数据）。

约束：页面级组件可用 default export（项目允许页面 default）；其余 named export。core 逻辑不得进 UI。

交付要求：列改动清单；跑 typecheck + test 贴结果；并说明如何在 dev 下手动验证（打开某项目 → 侧栏研究助手 → 发消息 → 看到流式回复与上下文计量）。
```

**验收标准**
- 侧边栏出现「研究助手」入口，点击进入 `/p/:projectId/agent`。
- 配置了 provider 后可真实对话：流式打字、消息气泡、思维块（若 provider 返回 thinking 则展示）、上下文计量实时更新。
- 无 provider 时有友好提示。
- typecheck/test 通过。

---

# 阶段 P2 · Agent 主循环 + 首个工具（PaperBox Read）

**目标**：实现 `ResearchBoxAgent.md` 里程碑②——最小可用的 Agent 主循环（`BuildResearchAgent.md` §5），接入**第一个工具 `paperbox_read`**（读取当前项目论文列表 / 某篇论文 IR 内容），并在 Chat UI 中展示工具调用过程。本阶段权限一律 `allow`（审批留到 P3）。

**改动清单**
- 新增 `src/core/agent/loop.ts` + `.test.ts`（主循环 `runAgent`）
- 新增 `src/core/agent/execute.ts` + `.test.ts`（单工具执行管线，无审批版）
- 新增 `src/core/agent/orchestrate.ts` + `.test.ts`（批分区 + 限流）
- 新增 `src/core/agent/schema.ts`（Zod→JSON Schema 转换辅助）
- 新增 `src/core/agent/tools/paperboxRead.ts` + `.test.ts`
- 新增 `src/core/agent/tools/index.ts`（`buildResearchTools`）
- 新增 `src/core/agent/systemPrompt.ts`（静态/动态分段，对应 `Claude_prompts.md` §1/§4）
- 修改 `src/pages/AgentChat.tsx`（改走 `runAgent` 而非裸 `chat`）、`src/ui/ai-panel/` 增 `ToolCallCard.tsx`

## P2-1 · Zod→JSON Schema 转换辅助　🟡 标准档（中难度 · 小范围）

```text
请阅读 @BuildResearchAgent.md §6、现有 src/core/agent/types.ts（Tool.inputSchema 为 z.ZodTypeAny）。

任务：新建 src/core/agent/schema.ts（纯 TS）。导出 toToolSchema(tool: Tool<any,any>): ToolSchema —— 把一个 Tool 转成 @/core/llm/types 的 ToolSchema（name、description、inputSchema 为 JSON Schema 对象）。

实现要求：用 Zod v4 内置能力把 z 对象转 JSON Schema（Zod v4 提供 z.toJSONSchema；若该 API 在本项目 Zod 版本不可用，则实现一个覆盖本项目所需类型子集的最小转换器：object/string/number/boolean/array/enum/optional/default/strictObject）。先确认项目 Zod 版本里 z.toJSONSchema 是否存在，存在就优先用它。

新建 src/core/agent/schema.test.ts：对一个 z.strictObject({ query:z.string(), topK:z.number().default(5), paperIds:z.array(z.string()).optional() }) 断言生成的 JSON Schema 含正确 type/properties/required。

交付要求：列改动清单；先确认 Zod 版本与可用 API（不确定就先查 package.json 与 node_modules，别猜）；跑 typecheck + test 贴结果。
```

**验收标准**：`toToolSchema` 能把示例 Zod schema 正确转 JSON Schema（type/properties/required）；优先复用 Zod 原生能力；单测通过；typecheck 通过。

## P2-2 · 主循环 runAgent　🔴 专家档（高难度 · 小范围）

> 整个 Agent 的心脏。异步生成器 + 不可变 state 重建 + Terminal 判别联合 + 断路器。范围小、正确性要求极高，交专家模型。

```text
请仔细阅读 @BuildResearchAgent.md §1 与 §5（含 runAgent 伪代码）、@Claude_prompts.md §5、现有 src/core/agent/types.ts、src/core/llm/types.ts（runWithTools / StreamEvent / AssistantMessage）。

任务：新建 src/core/agent/loop.ts（纯 TS，不 import react），导出：
  async function* runAgent(params: { messages: AgentMessage[]; tools: Tool<any,any>[]; system: string; model?: string; maxTurns?: number }, deps: AgentDeps): AsyncGenerator<AgentMessage, Terminal>

实现（严格对应 §5 骨架）：
- 维护不可变 state：{ turn:number; messages: AgentMessage[] }。每轮 continue 时全量重建 state（展开新数组），不要原地 push。
- 循环开始检查：deps.signal.aborted → return { reason:'aborted' }；turn >= (maxTurns ?? 30) → return { reason:'max_turns' }。
- 调 deps.llm.runWithTools({ messages, tools: tools.map(toToolSchema), system, model, signal })。若 deps.llm.runWithTools 不存在 → return { reason:'model_error', error: new Error('provider 不支持工具调用') }。
- 流式消费 runWithTools 的 StreamEvent：把 text/thinking 增量 yield 成中间 AgentMessage（或通过一个 onEvent 回调暴露，见下），最终拿到 AssistantMessage。把 assistant 消息 yield 出去并并入 messages。
- 取 assistant.content 中的 tool_use 块。无 tool_use → return { reason:'completed' }。
- 有 tool_use → 调用 executeBatched(toolUses, tools, deps)（来自 src/core/agent/orchestrate.ts，可先用 import；本步若 orchestrate 未就绪，定义其类型签名并用一个注入的 execute 函数占位，便于单测）。把工具结果消息 yield 并并入 messages。若结果里有 denied → return { reason:'approval_denied', toolName }。
- 断路器：连续工具错误（同一工具连续失败）达到上限（如 3 次）→ return { reason:'model_error', error }。务必防止无限循环烧 API。
- 每轮重建 state.turn+1、messages 更新。

为可测性：把「执行工具批次」做成可注入依赖。建议 runAgent 的 deps 之外，再接受一个可选的 executor 参数（默认 import 真实 executeBatched），单测时替换为假 executor。

新建 src/core/agent/loop.test.ts，用假的 llm.runWithTools 与假 executor 覆盖：
- 模型直接无 tool_use → 终止 completed。
- 模型请求 1 个工具 → 假 executor 返回结果 → 下一轮模型 completed。断言 yield 的消息序列正确、turn 递增。
- maxTurns 触发 max_turns。
- signal 预先 abort → aborted。
- executor 返回 denied → approval_denied。

交付要求：列改动清单；跑 typecheck + test 贴结果。任何关于 StreamEvent→AssistantMessage 组装的歧义，停下来问。
```

**验收标准**
- `runAgent` 为 AsyncGenerator，yield `AgentMessage`、return `Terminal`；每轮不可变重建 state。
- 覆盖 completed / 工具往返 / max_turns / aborted / approval_denied 的单测全过。
- 含连续失败断路器；provider 无 `runWithTools` 时返回 `model_error`。
- typecheck/test 通过；core 无 React。

## P2-3 · 执行管线 execute + 批分区 orchestrate　🔴 专家档（高难度 · 小范围）

> 对应 `BuildResearchAgent.md` §6/§7：Zod 校验 → checkPermissions → call → 错误分类；贪心保序批分区 + `mapLimit` 限流 + **按提交序回写**。并发正确性是难点，交专家模型。

```text
请仔细阅读 @BuildResearchAgent.md §6（执行管线，本阶段精简：Zod 校验→checkPermissions→call→错误分类，结果预算先不做）与 §7（partitionToolCalls 贪心保序、mapLimit 限流、保序 yield）、@Claude_prompts.md §6、现有 src/core/agent/types.ts。

任务一：新建 src/core/agent/execute.ts（纯 TS）。导出 async generator：
  executeTool(call:{ id:string; name:string; input:unknown }, tools: Tool<any,any>[], deps: AgentDeps): AsyncGenerator<unknown, AgentMessage>
逻辑（本阶段无审批，behavior:'ask' 也按 allow 处理，并在结果消息里标注「将来需审批」——审批接线在 P3）：
- 找 tool；找不到 → 返回 isError 的 tool_result 消息。
- tool.inputSchema.safeParse(call.input)；失败 → isError tool_result（含 zod 错误摘要）。
- await tool.checkPermissions(parsed.data, deps)；deny → isError tool_result（含 message）。ask/allow 本阶段都继续执行。
- yield* tool.call(parsed.data, deps) 取得 ToolResult；把 result.data 序列化进 tool_result content（type:'tool_result', toolUseId: call.id）。
- 透传 result.newMessages（追加到返回，或由调用方处理——本步把 newMessages 一并返回，约定 executeTool 返回主 tool_result，newMessages 通过另一个出参/结构暴露；为简单可返回 { message, newMessages }，但保持类型清晰）。
- 捕获 call 抛出的异常 → isError tool_result，并做简单错误分类（abort / 普通错误）。

任务二：新建 src/core/agent/orchestrate.ts（纯 TS）。导出：
- partitionToolCalls(calls, tools): Batch[] —— 贪心、保序合批：连续的 isConcurrencySafe(input)===true 工具并入同一并发批；遇到不安全工具断批并独占一批。解析失败/抛异常一律 fail-closed 视为串行（不安全）。
- executeBatched(calls, tools, deps): AsyncGenerator<unknown, { messages: AgentMessage[]; denied?: string }> —— 对每个批：并发批用 mapLimit(calls, 4, executeTool 的 drain) 执行，串行批逐个执行；**所有结果按原始提交序回写**（不是完成序）；任一结果是 deny 则记录 denied。

新建对应 .test.ts：
- execute.test.ts：未知工具、zod 校验失败、deny、正常 call、call 抛异常 5 类。
- orchestrate.test.ts：3 个全 safe 工具 → 1 个并发批；safe,unsafe,safe → 3 批且顺序保留；并发批结果按提交序返回（用带不同 delay 的假工具验证顺序）。

交付要求：列改动清单；跑 typecheck + test 贴结果。mapLimit 可自己实现一个最小版（不引入新依赖）。
```

**验收标准**
- `executeTool` 覆盖未知工具 / zod 失败 / deny / 正常 / 异常五种，均产出正确 `tool_result`（含 `isError`）。
- `partitionToolCalls` 贪心保序、fail-closed；`executeBatched` 并发批限流且**按提交序**回写、能报告 `denied`。
- 全部单测通过；无新依赖；core 无 React。typecheck 通过。

## P2-4 · paperbox_read 工具 + 系统提示 + 工具注册　🟡 标准档（中难度 · 中范围）

```text
请阅读 @PROJECT.md 第 4.1（PaperIR/Block）、4.2（Paper 条目）、第 5 节（Dexie 表：papers、paperEntries）、@BuildResearchAgent.md §6/附录A、@Claude_prompts.md §1/§4/附录A，现有 src/db/index.ts、src/db/paperEntries.ts、src/core/ir/schema.ts、src/core/agent/types.ts。

任务：

1. 新建 src/core/agent/tools/paperboxRead.ts，导出 paperboxReadTool: Tool。能力：读取「当前项目的论文盒」。
   - inputSchema: z.strictObject({ mode: z.enum(['list','paper']); routeId: z.string().optional(); section: z.enum(['meta','abstract','outline','full']).default('meta') })。
   - mode='list'：返回当前项目所有 paperEntries 的精简清单（title/authors/status/routeId）。
   - mode='paper'：按 routeId 取该论文 IR（papers 表），section 决定返回 meta / 摘要 blocks / 仅 heading 大纲 / 全文 blocks 文本。
   - isReadOnly: ()=>true；isConcurrencySafe: ()=>true；checkPermissions: 返回 { behavior:'allow', updatedInput }。
   - 通过 deps.db 访问 Dexie（projectId 如何获得：在 AgentDeps 里没有 projectId —— 因此请在 deps 之外，让工具从一个注入的「当前项目上下文」获取。最简方案：扩展 AgentDeps 增加可选 projectId 字段，由页面创建 deps 时注入；若扩展 AgentDeps，请同步更新 src/core/agent/types.ts 与相关 test）。注意：blocks 不是独立表，存在于 papers 表的 PaperIR.blocks。
   - description 用中文清楚说明何时用、各 mode/section 含义（供模型选择）。

2. 新建 src/core/agent/systemPrompt.ts，导出 buildAgentSystemPrompt(ctx:{ projectName?:string; date?:string }): string。结构对应 @Claude_prompts.md §1/§4：稳定段（角色=学术研究助手、可用能力概述、引用规范、安全声明）在前，动态段（当前项目名、日期）在后，用一行分隔注释标记边界（对应 SYSTEM_PROMPT_DYNAMIC_BOUNDARY 思路，利于将来 prompt 缓存）。措辞参考 Claude Code 主系统提示但改写为学术研究场景中文/英文均可（项目 UI 默认 en，可英文）。

3. 新建 src/core/agent/tools/index.ts，导出 buildResearchTools(opts:{ allowWeb:boolean; allowCode:boolean }): Tool[]，本阶段先只返回 [paperboxReadTool]（后续阶段往里加 retrieval/artifacts/websearch/python）。

为 paperboxRead 写 src/core/agent/tools/paperboxRead.test.ts（用 fake-indexeddb，按 src/db 测试范式 seed 一个项目+若干 paperEntries+1 个 PaperIR，断言 list 与 paper/full 返回结构正确）。systemPrompt 写一个最小测试断言稳定段在动态段之前。

交付要求：列改动清单；若需扩展 AgentDeps（projectId），明确写出并更新相关类型/测试；跑 typecheck + test 贴结果。
```

**验收标准**
- `paperboxReadTool` 可列出项目论文、按 `routeId`+`section` 返回论文内容；`isReadOnly/isConcurrencySafe=true`；从 `PaperIR.blocks` 读取（不依赖不存在的 blocks 表）。
- `buildAgentSystemPrompt` 稳定段在前、动态段在后；`buildResearchTools` 返回含该工具的数组。
- fake-indexeddb 单测通过；typecheck 通过。

## P2-5 · Chat UI 接入主循环 + 工具调用展示　🟡 标准档（中难度 · 中范围）

```text
请阅读现有 src/pages/AgentChat.tsx、src/ui/ai-panel/*、src/core/agent/loop.ts、src/core/agent/tools/index.ts、src/core/agent/systemPrompt.ts、src/store/agentStore.ts。

任务：

1. 新建 src/ui/ai-panel/ToolCallCard.tsx：展示一次工具调用。props { name:string; input:unknown; stage?:string; result?:string; isError?:boolean }。折叠展示输入 JSON 与结果预览；运行中显示 stage（如 running…）；出错红色标注。在 index.ts 导出。
2. 改造 src/pages/AgentChat.tsx：用户发送时不再走裸 chat，而是构造 AgentDeps（db=@/db 实例、llm=createProvider(activeProvider)、store=useAgentStore、signal=新 AbortController、requestApproval=暂时返回 Promise.resolve(true) 的占位、projectId=当前路由 projectId），调用 runAgent({ messages, tools: buildResearchTools({allowWeb:false,allowCode:false}), system: buildAgentSystemPrompt({projectName,date}) }, deps)。
   - 迭代 runAgent 产出的 AgentMessage：text/thinking 增量更新流式态；tool_use 块渲染 ToolCallCard（running）；tool_result 更新对应卡片（result/isError）。终止时根据 Terminal 显示状态（completed 正常；aborted/ max_turns/ model_error 给提示）。
   - 提供「停止」按钮触发 AbortController.abort()。
3. 上下文计量继续用 contextSize 更新，把工具结果也计入。

约束：UI 不写 core 逻辑；保持既有视觉风格。

交付要求：列改动清单；跑 typecheck + test 贴结果；说明手动验证步骤（让模型调用 paperbox_read 列出论文 / 读某篇摘要，UI 能看到工具卡片与最终回答）。
```

**验收标准**
- Chat 现在走 `runAgent`：模型可调用 `paperbox_read`，UI 出现工具调用卡片（输入/状态/结果），最终给出基于论文内容的回答。
- 有「停止」按钮可中断；Terminal 各状态有相应 UI 反馈。
- typecheck/test 通过。

---

# 阶段 P3 · 人审批节点 + 权限系统

**目标**：实现能力⑤的 human-in-the-loop（`BuildResearchAgent.md` §6/§14、`Claude_prompts.md` §14）。把 `execute.ts` 里被占位的 `ask` 真正接成「弹审批面板 → Promise 挂起主循环 → 用户批准/拒绝 → resolve」。引入权限模式（`default`/`plan`/`autoApproveRead`）。

**改动清单**
- 新增 `src/core/agent/approval.ts` + `.test.ts`（`makeApprovalFn`、权限解析）
- 修改 `src/core/agent/execute.ts`（接入真实审批 + 权限模式）+ 测试
- 新增 `src/ui/ai-panel/ApprovalDialog.tsx` + `PermissionModeSwitch.tsx`，index 导出
- 修改 `src/pages/AgentChat.tsx`（用真实 `makeApprovalFn`、渲染审批队列、权限模式开关）

## P3-1 · 审批回调与权限解析　🔴 专家档（高难度 · 小范围）

> 「Promise 挂起主循环」是 human-in-the-loop 的核心翻译，且权限解析链 + plan 模式只读约束是安全边界，错一点就放行危险操作。范围小、极关键，交专家模型。

```text
请仔细阅读 @BuildResearchAgent.md §6（权限解析链）、§14（审批 context → Promise 挂起主循环）、@Claude_prompts.md §14、现有 src/core/agent/types.ts（PermissionResult/ApprovalFn/ApprovalRequest/AgentStore）、src/store/agentStore.ts（pendingApprovals/enqueueApproval/resolveApproval）。

任务：新建 src/core/agent/approval.ts（纯 TS，不 import react）。导出：

1. makeApprovalFn(store: AgentStore): ApprovalFn —— 返回的函数接收 ApprovalRequest，内部 new Promise<boolean>，把 { ...req, resolve } 通过 store.enqueueApproval 压入队列，等待 UI 调 store.resolveApproval 来 resolve。（store 接口需支持持有 resolve；agentStore 已在 P0-3 设计为队列项含 resolve。）

2. resolvePermission(args:{ tool: Tool; input:unknown; deps: AgentDeps; mode:'default'|'plan'|'autoApproveRead' }): Promise<'allow'|'deny'> —— 实现权限解析链（精简版，对应 §6）：
   - 先 await tool.checkPermissions(input, deps)：
     - 'deny' → 直接 'deny'。
     - 'allow' → 'allow'。
     - 'ask' → 进入模式判定。
   - 模式判定（仅当工具自检为 'ask' 时）：
     - mode==='plan'：若 tool.isReadOnly(input)===false → 直接 'deny'（plan 模式禁止写/执行，对应 EnterPlanMode 只读语义）；只读工具 → 'allow'。
     - mode==='autoApproveRead' 且 tool.isReadOnly(input)===true → 'allow'（自动放行只读）。
     - 其余 → 调 deps.requestApproval(req) 弹审批，返回 true→'allow' / false→'deny'。
   - fail-closed：任何异常 → 'deny'。

新建 src/core/agent/approval.test.ts：
- makeApprovalFn：模拟 store，断言 enqueue 后手动 resolve(true/false) 能让 Promise 兑现对应布尔。
- resolvePermission：checkPermissions 直接 deny/allow 短路；'ask' + plan 模式下写工具被拒、读工具放行；autoApproveRead 下读工具自动放行；default 下走 requestApproval 且其返回值决定结果；checkPermissions 抛异常 → deny。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**
- `makeApprovalFn` 实现「压队列→等待→resolve」的 Promise 挂起；`resolvePermission` 正确实现 checkPermissions 短路 + 三种模式语义 + fail-closed。
- plan 模式拒绝非只读工具、autoApproveRead 放行只读工具的用例通过；全部单测过。typecheck 通过。

## P3-2 · execute 接入真实审批　🔴 专家档（高难度 · 小范围）

```text
请阅读 P2-3 产出的 src/core/agent/execute.ts、新产出的 src/core/agent/approval.ts、src/core/agent/types.ts。

任务：把 src/core/agent/execute.ts 里 P2 阶段的「ask 按 allow 占位」替换为真实权限解析：
- executeTool 不再自己只调 checkPermissions，而是调用 resolvePermission({ tool, input, deps, mode: deps.store.permissionMode })。
- 结果为 'deny' → 返回 isError 的 tool_result（content 说明被拒/被审批拒绝），并使 executeBatched 能据此设置 denied=toolName（保持 P2 的 denied 传播链）。
- 'allow' → 正常 yield* tool.call。
- 执行期间用 deps.store.setRunningTool/clearRunningTool 更新运行态（开始/结束/出错都要 clear）。

更新 src/core/agent/execute.test.ts：新增用例——工具 checkPermissions 返回 ask 且注入的 requestApproval 返回 false → 结果为 deny 且 denied 被传播；返回 true → 正常执行。plan 模式下写工具被拒。

注意保持 orchestrate/loop 的既有契约不变（denied 字段、保序）。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**：`executeTool` 走 `resolvePermission`；审批拒绝/通过、plan 模式拒写均有单测覆盖；`denied` 传播与保序不破坏；运行态正确 set/clear。typecheck/test 通过。

## P3-3 · 审批面板与权限模式开关　🟢 快速档（低难度 · 大范围）

```text
请阅读 @ResearchBoxAgent.md（用户 approval 体验）、@BuildResearchAgent.md §14、现有 src/ui/ai-panel/*、src/store/agentStore.ts（pendingApprovals/resolveApproval/permissionMode）、src/pages/AgentChat.tsx。

任务：
1. 新建 src/ui/ai-panel/ApprovalDialog.tsx：读取 useAgentStore().pendingApprovals 的队首项，渲染一个醒目的审批卡片/弹层：显示工具名、风险等级（low/high 用不同颜色，high 更醒目）、reason、待执行的 input 摘要，提供「批准」「拒绝」按钮，点击调用 store.resolveApproval(id, true/false)。无待审批项时不渲染。键盘可达（Enter=批准为可选增强）。
2. 新建 src/ui/ai-panel/PermissionModeSwitch.tsx：一个三态切换（default / plan / autoApproveRead），调用 store 改 permissionMode；附简短中文/英文说明每种模式含义（plan=只读规划、autoApproveRead=自动放行只读）。
3. 在 src/pages/AgentChat.tsx：把 P2 的占位 requestApproval 替换为 makeApprovalFn(useAgentStore的实例)；在面板顶部放 PermissionModeSwitch，在消息区上方或合适位置挂 ApprovalDialog（待审批时主循环应自然挂起，因为 tool.call 在等待 resolvePermission）。
4. index.ts 导出新组件。

约束：纯展示+store 交互；视觉风格沿用项目。

交付要求：列改动清单；跑 typecheck + test 贴结果；说明手动验证：构造一个会触发 ask 的工具（可临时让 paperbox_read 在某 mode 返回 ask，或等 P5/P7 的写/执行工具）→ 出现审批卡片 → 拒绝后模型收到「被拒」并调整。
```

**验收标准**
- 出现待审批请求时渲染 `ApprovalDialog`，主循环挂起；批准/拒绝经 `resolveApproval` 驱动继续/终止。
- `PermissionModeSwitch` 可切三种模式并影响放行逻辑。
- typecheck/test 通过。

---

# 阶段 P4 · 盒内导航 + 封闭域检索 `retrieval`（blockId 级引用 + 检索姿态）

**目标**：实现能力②，ResearchBox 的差异化核心（`BuildResearchAgent.md` §11、`Claude_prompts.md` §11/附录A②、`实施方案修订案.md` 一、四）。先补一个**盒内导航工具 `paperbox_list`**（列出盒内论文 title/authors/abstract，供检索前判断盒里已有什么、是否需要外搜、该深检哪几篇）；再实现封闭域检索 `retrieval`——**不上向量库**：位图预筛 → 构造轻量清单 → 小模型 side-query 选相关区块 → 取全文并**强制 `blockId` 级引用** + staleness 警告，命中后引导模型用 `paperbox_read` 拉全文；最后在系统提示加入**检索姿态（探索式 / 穷尽式）**规则。

> 关键现实：blocks 存于每篇 `PaperIR.blocks`，无独立 blocks 表。检索须遍历 `papers` 表的 IR 收集候选区块。
>
> provenance：本阶段引入来源标签 `paperbox | academic | web`（`src/core/agent/provenance.ts`），盒内工具一律标 `paperbox`；P5/P6 的外部工具复用同一类型，P7 在 UI 展示。

**改动清单**
- 新增 `src/core/agent/provenance.ts` + `.test.ts`（`Provenance` 类型与证据消息前缀辅助）
- 新增 `src/core/agent/tools/paperboxList.ts` + `.test.ts`（盒内导航：title/authors/abstract）
- 新增 `src/core/agent/retrieval/bitmapPrefilter.ts` + `.test.ts`（位图预筛，对应 §17）
- 新增 `src/core/agent/retrieval/manifest.ts` + `.test.ts`（清单构造，对应 `formatMemoryManifest`）
- 新增 `src/core/agent/retrieval/selectBlocks.ts` + `.test.ts`（side-query + 防幻觉校验）
- 新增 `src/core/agent/tools/retrieval.ts` + `.test.ts`
- 修改 `src/core/agent/tools/index.ts`（注册 `paperbox_list` / `retrieval`）、`src/core/agent/systemPrompt.ts`（加引用规范 + 检索姿态）

## P4-1 · 盒内导航 `paperbox_list` + provenance 基础　🟡 标准档（中难度 · 小范围）

> 检索前的导航工具：让模型先看清盒里有哪些论文（含 abstract）再决定是否外搜、对哪几篇深检。范围小、逻辑浅，但 provenance 类型要一次定准，P5/P6 复用。

```text
请阅读 @实施方案修订案.md（一、1 paperbox_list；三、provenance 来源标记）、现有 src/core/agent/tools/paperboxRead.ts、src/core/agent/tools/index.ts、src/core/agent/types.ts、src/core/ir/schema.ts、src/db/paperEntries.ts。

任务：

1. 新建 src/core/agent/provenance.ts（纯 TS，不 import react）。导出：
   - 类型 Provenance = 'paperbox' | 'academic' | 'web'。
   - withProvenance(p: Provenance, body: string): string —— 在证据/结果文本前加一行来源标签（如 `[来源: paperbox]`），供工具 newMessages 统一标注来源：给用户可见透明标签，也让模型标注盒外引用时有据可依。
   写最小单测覆盖三种来源前缀。

2. 新建 src/core/agent/tools/paperboxList.ts，导出 paperboxListTool: Tool。能力：列出当前项目盒内所有论文的 title / authors / abstract（供检索前导航）。
   - inputSchema: z.strictObject({})（无参数）。
   - isReadOnly:()=>true；isConcurrencySafe:()=>true；checkPermissions: allow。
   - call：用 deps.projectId 读 paperEntries 拿清单，再对每篇按 [arxivId, version] 读 papers 表 PaperIR 取 abstract（IR 不存在则 abstract 留空并标 status）。返回 data={ papers:[{ routeId, title, authors, abstract, status }] }；newMessages 用 withProvenance('paperbox', ...) 注入一段可读清单。
   - description（中/英）说明：检索或外搜前先用它判断盒里已有什么、是否需要外部检索、该对哪几篇做深度检索。
   注意：与 paperbox_read 的 list 模式职责重叠——把 paperbox_read 收敛为「单篇深读」，移除其 mode='list' 分支（或保留但在 description 标注已被 paperbox_list 取代），二选一并在回复说明，避免模型在两个清单工具间困惑。

3. 在 src/core/agent/tools/index.ts 的 buildResearchTools 注册 paperboxListTool。

新建 src/core/agent/tools/paperboxList.test.ts（fake-indexeddb）：seed 1 项目 + 2 paperEntries + 对应 PaperIR，断言返回含 title/authors/abstract，且 newMessages 带 [来源: paperbox] 标签。

交付要求：列改动清单；明确 paperbox_read list 模式的处理方式；跑 typecheck + test 贴结果。
```

**验收标准**
- `provenance.ts` 导出 `Provenance` 与 `withProvenance`，单测覆盖三来源。
- `paperboxListTool` 返回盒内 title/authors/abstract，注册进 `buildResearchTools`，newMessages 带 `paperbox` 来源标签。
- 明确处理与 `paperbox_read` list 模式的重叠；fake-indexeddb 单测通过；typecheck 通过。

## P4-2 · 位图预筛 + 清单构造　🟡 标准档（中难度 · 中范围）

```text
请阅读 @BuildResearchAgent.md §11 与 §17（26-bit 字母位图预筛、每路径 4 字节整数比较）、@Claude_prompts.md §11、现有 src/core/ir/schema.ts（Block：id/type/content/caption）、src/db/index.ts。

任务：

1. 新建 src/core/agent/retrieval/bitmapPrefilter.ts（纯 TS）。导出：
   - letterBitmap(text:string): number —— 把文本里出现过的 a–z 映射成 26-bit 位图（小写归一，忽略非字母；中文等可只看其中拉丁字母）。
   - queryBitmap(query:string): number。
   - passesPrefilter(blockBitmap:number, qBitmap:number): boolean —— (blockBitmap & qBitmap) === qBitmap 时通过（区块至少包含查询所需的全部字母集合）。
   用于在 side-query 前秒筛掉明显不含查询词字母的区块。注意这是「粗筛」，只为省 token，不追求精确。

2. 新建 src/core/agent/retrieval/manifest.ts（纯 TS）。导出：
   - buildBlockCandidates(papers: PaperIR[], opts:{ paperIds?:string[] }): Candidate[] —— 遍历 papers（可按 paperIds 过滤）的 blocks，产出 Candidate { paperId; blockId; heading?:string; preview:string（content/caption 截断到约 120 字符纯文本）; fetchedAt:number（用 PaperIR.createdAt） }。
   - formatManifest(candidates: Candidate[]): string —— 输出每行 `- {paperId}#{blockId} (heading?): preview`，对应 Claude Code formatMemoryManifest 的 `- [type] filename: description` 风格。

新建对应 .test.ts：位图（含/不含查询字母）；buildBlockCandidates 正确遍历多篇论文 blocks 并按 paperIds 过滤；formatManifest 行格式正确。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**：位图预筛 `(b&q)===q` 语义正确；`buildBlockCandidates` 从多篇 IR 的 `blocks` 收集候选并支持过滤；`formatManifest` 行格式与设计一致；单测通过；typecheck 通过。

## P4-3 · Haiku side-query 选区块（防幻觉）　🔴 专家档（高难度 · 小范围）

> 召回算法核心：用轻量模型从清单选 blockId，并**严格校验返回的 id 真实存在**（防幻觉），失败要降级。逻辑微妙、正确性关键，交专家模型。

```text
请仔细阅读 @BuildResearchAgent.md §11（scan→manifest→Sonnet/Haiku side-query 选最多 5、校验防幻觉）、@Claude_prompts.md §11.1（SELECT_MEMORIES_SYSTEM_PROMPT 原文 + 用户消息模板 Query/Available memories）、现有 src/core/llm/types.ts（chat 的 json 模式）。

任务：新建 src/core/agent/retrieval/selectBlocks.ts（纯 TS，不 import react）。导出：
  async function selectRelevantBlocks(args:{ query:string; candidates: Candidate[]; llm: LLMProvider; topK:number; signal:AbortSignal }): Promise<string[]>  // 返回选中的 "paperId#blockId" 列表
逻辑：
- 先用 bitmapPrefilter 过滤 candidates（不含查询字母集合的剔除）；若过滤后为空则回退用全部 candidates。
- 构造 side-query：system 改写自 SELECT_MEMORIES_SYSTEM_PROMPT（场景换成「为学术研究助手选出对回答 query 明确有用的论文区块，最多 topK 个，宁缺毋滥，不确定就不选」）；user = `Query: {query}\n\nAvailable blocks:\n{formatManifest(candidates)}`。
- 调 provider.chat({ system, messages:[{role:'user',content:user}], json:true, signal })，要求模型输出 JSON：{ "ids": ["paperId#blockId", ...] }。解析（chat 可能流式/Promise，先 drain 成完整字符串再 JSON.parse；解析失败要 try/catch）。
- **防幻觉校验**：只保留确实存在于 candidates 集合中的 id；丢弃模型编造的 id；截断到 topK。
- 任何异常或空结果 → 返回 []（fail-soft，由上层决定降级，如退回 bitmap 命中的前 topK）。

新建 src/core/agent/retrieval/selectBlocks.test.ts（用 mock llm.chat）：
- 模型返回合法 JSON 且 id 都存在 → 原样返回（截断 topK）。
- 模型返回含 1 个不存在 id → 该 id 被剔除。
- 模型返回非 JSON / 抛错 → 返回 []。
- topK 截断生效。

交付要求：列改动清单；side-query 的 system prompt 请贴近 Claude_prompts.md 原文风格改写；跑 typecheck + test 贴结果。
```

**验收标准**：`selectRelevantBlocks` 先位图预筛、再 side-query、再**校验 id 真实存在**、再截断 `topK`；幻觉 id 被剔除、解析失败返回 `[]`；单测 4 类通过；typecheck 通过。

## P4-4 · retrieval 工具（强制引用 + staleness + 拉全文引导 + provenance）　🟡 标准档（中难度 · 中范围）

```text
请阅读 @BuildResearchAgent.md §11（retrievalTool 伪代码：返回 RetrievalHit{ blockId, paperId, text, citation, staleDays }，newMessages 注入证据并要求模型引用 citation）、@Claude_prompts.md §11.3（memoryFreshnessText staleness 文本）、附录A②，现有 src/core/agent/retrieval/*、src/core/agent/types.ts、src/db/index.ts。

任务：

1. 新建 src/core/agent/tools/retrieval.ts，导出 retrievalTool: Tool。
   - inputSchema: z.strictObject({ query:z.string(), paperIds:z.array(z.string()).optional(), topK:z.number().default(5) })。
   - isReadOnly:()=>true；isConcurrencySafe:()=>true；checkPermissions: allow。
   - call：从 deps.db 读取（按 paperIds 或当前项目全部）papers IR → buildBlockCandidates → selectRelevantBlocks(deps.llm) → 对选中的 id 取回 block 全文，构造 RetrievalHit[]：{ blockId, paperId, citation:`${paperId}#${blockId}`, text, staleDays: 由 PaperIR.createdAt 算天数 }。
   - 返回 ToolResult：data=hits；newMessages 用 withProvenance('paperbox', ...)（见 P4-1）注入一条「证据」消息（把 hits 格式化为带 citation 的证据块，并附 staleDays>阈值（如 180 天）时的 memoryFreshnessText 风格警告），要求模型在回答中以 `paperId#blockId` 形式引用；并附引导：命中相关 block 后若需该论文完整上下文，可调用 paperbox_read(routeId) 拉全文。
   - 结果较大时本阶段先直接返回（结果预算落 IndexedDB 在 P10 实现）。

2. 在 src/core/agent/tools/index.ts 的 buildResearchTools 注册 retrievalTool。
3. 在 src/core/agent/systemPrompt.ts 的稳定段加入「引用规范」：使用 retrieval 得到证据后，回答中涉及论文内容的论断必须带 `paperId#blockId` 引用（对应 Claude Code 的 file:line 强制引用 + TRUSTING_RECALL）。

新建 src/core/agent/tools/retrieval.test.ts（fake-indexeddb + mock llm）：seed 2 篇 IR，query 命中其中若干 block，断言返回的 hits 带正确 citation 与 staleDays，且 newMessages 含引用要求文本。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**
- `retrievalTool` 端到端：候选→side-query→取全文→`RetrievalHit[]`（含 `citation`、`staleDays`）；`newMessages` 注入证据（带 `paperbox` 来源标签）并要求 `paperId#blockId` 引用 + 拉全文引导；超期有 staleness 警告。
- 注册进 `buildResearchTools`；系统提示含引用规范。
- fake-indexeddb 单测通过；typecheck 通过。

## P4-5 · 检索姿态系统提示（explore / exhaustive）　🟡 标准档（中难度 · 小范围）

> 文献检索没有「测试通过」式的二元收敛信号，收敛目标是 recall。姿态由任务意图决定，纯靠系统提示层引导，**不在主循环硬编码任何 recall 阈值**。

```text
请阅读 @实施方案修订案.md（二、检索行为：两种姿态；四、系统提示需包含的规则）、现有 src/core/agent/systemPrompt.ts（STABLE_PROMPT / SYSTEM_PROMPT_DYNAMIC_BOUNDARY / buildDynamicPrompt）。

任务：在 src/core/agent/systemPrompt.ts 的稳定段（STABLE_PROMPT）新增一节「检索姿态与收敛」，要点：
- 探索式（explore）：快、广度优先、不求完整、几轮即收手；对应「看看这方向有些啥 / 随便搜搜」，优先响应速度。
- 穷尽式（exhaustive）：慢、追求召回饱和、需报告检索覆盖；对应「系统调研 / 做综述 / meta-analysis 式搜罗」。
- 模型据用户措辞自主选姿态；不确定时默认探索式，必要时主动询问。
- 穷尽式可跟踪「已见 arxiv id / DOI 集合」作为可选工作记忆；当连续若干轮新增命中趋近于零（召回饱和）时向用户报告「检索已趋于饱和」。这是可选工作方式，不是强制规则，更不要在代码里写死数字阈值。
- 穷尽式收尾报告检索策略：用了哪些 query、覆盖了哪些来源、可能的盲区在哪（对标可报告检索）。

约束：仅改系统提示文本（稳定段），不动主循环逻辑；不引入任何 recall 数字阈值常量。措辞中英文均可（项目默认 en）。

更新 src/core/agent/systemPrompt.test.ts：断言稳定段含「explore / exhaustive（或 探索式 / 穷尽式）」与「饱和 / saturation」关键措辞，且仍在动态边界之前。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**：系统提示稳定段含探索式/穷尽式区分、默认探索式、召回饱和与可报告检索；**无硬编码 recall 阈值**；单测覆盖关键措辞且位于动态边界之前；typecheck/test 通过。

---

# 阶段 P5 · 学术检索 `academic_search` + 逐篇纳入闸门

**目标**：实现修订案「一、2 academic_search」与「纳入闸门」——以 arxiv 为中心的学术文献搜索（差异化主工作量）。数据源分层降级：默认 **Semantic Scholar**（无 key 即用），可选 **OpenAlex**（2026 起强制 key，无 key 回落 SS）；返回 arxivId + 标题 + 作者 + abstract（SS 直给纯文本；OpenAlex 给倒排索引需重建；都缺时抓 arxiv HTML 补齐）。**搜索结果不自动进盒**：用户逐篇审查，点「纳入」才进盒——这是外部文献进盒的唯一合法入口。

> ⚠️ 纳入的实现铁律（用户明确要求）：Agent 引入论文必须**复用 PaperBox 现有的引入接口**，与当前 PaperBox 支持的引入方式严格对齐——目前**只支持以 arxiv id 引入有 arxiv HTML 页面的论文**（`usePaperStore.addInput(projectId, input)` + 现有 `loadPaper*` 管线）。**不得另写一套平行导入逻辑。** 在「纳入调用点、`academic_search` 工具 description、系统提示」三处都留注释：将来 PaperBox 支持新的引入方式后，需同步修改 Agent 这些相关部分（含提示词）。

**改动清单**
- 修改 `src/core/settings/schema.ts` + `src/store/settingsStore.ts`（新增可选 `semanticScholarApiKey` / `openAlexApiKey`）+ 测试
- 新增 `src/core/agent/search/types.ts`（`AcademicHit`、`AcademicSearchAdapter` 接口）
- 新增 `src/core/agent/search/semanticScholar.ts` + `.test.ts`（适配器）
- 新增 `src/core/agent/search/openAlex.ts` + `.test.ts`（适配器 + 倒排索引重建）
- 新增 `src/core/agent/search/abstractFallback.ts` + `.test.ts`（缺 abstract 时抓 arxiv HTML 补齐，复用 `src/core/fetcher`/`cleaner`）
- 新增 `src/core/agent/search/runAcademicSearch.ts` + `.test.ts`（key 降级编排）
- 新增 `src/core/agent/tools/academicSearch.ts` + `.test.ts`
- 修改 `src/core/agent/tools/index.ts`（注册 academic_search）
- 新增 `src/core/agent/inclusion.ts` + `.test.ts`（纳入：复用 PaperBox 导入接口的薄封装 + 注释）
- 新增 `src/ui/ai-panel/SearchResultCard.tsx`（逐篇纳入闸门 UI），index 导出；修改 `src/pages/AgentChat.tsx`

## P5-1 · 学术检索 API key 设置　🟢 快速档（低难度 · 大范围）

```text
请阅读 @PROJECT.md 第 4.4 节（AppSettingsSchema）、@实施方案修订案.md（一、2 数据源分层降级）、现有 src/core/settings/schema.ts、src/store/settingsStore.ts、src/ui/settings/* 的 setXxx 范式。

任务：
1. 在 AppSettingsSchema 增加两个可选字符串字段（用 .default("") 兼容旧备份）：semanticScholarApiKey、openAlexApiKey；更新 DEFAULT_SETTINGS。
2. settingsStore 暴露 setSemanticScholarApiKey / setOpenAlexApiKey（同步写 DB，沿用现有范式）与读取。
3. 设置页新增「学术检索」区段：两个 key 输入框 + 说明文案（i18n key）：SS 无 key 也能用（共享额度）；OpenAlex 2026 起强制 key，免费，需在 openalex.org/settings/api 注册，无 key 时该源不可用、自动回落 SS。
4. 更新相关单测。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**：`AppSettings` 新增两个可选 key（默认空），有 store action 与设置页输入；既有设置测试不破坏；typecheck/test 通过。

## P5-2 · 数据源双适配器 + key 降级编排　🔴 专家档（高难度 · 小范围）

> 主工作量与最易错处：两套 REST 响应形状不同、OpenAlex abstract 是倒排索引要重建、key 降级与 arxiv HTML 兜底要稳。逻辑微妙，交专家模型。

```text
请仔细阅读 @实施方案修订案.md（一、2 academic_search 全部要点：数据源、技术约束、返回内容、纳入闸门）、现有 src/core/fetcher/fetchPaper.ts、src/core/fetcher/parseId.ts、src/core/cleaner/clean.ts、src/core/llm（fetch 风格）。

技术约束（务必遵守）：
- Semantic Scholar 与 OpenAlex 均纯 GET REST，浏览器可直接 fetch，无 CORS。
- arxiv 官方搜索 API 有 CORS 限制，**不直接调用**（只在补 abstract 时抓 arxiv HTML 页面，复用现有 fetcher/cleaner）。
- 所有适配器 fail-soft：网络/解析失败返回空数组，不抛。

任务：
1. 新建 src/core/agent/search/types.ts：
   - AcademicHit = { arxivId:string; title:string; authors:string[]; abstract:string; source:'semantic-scholar'|'openalex'; externalId?:string }
   - AcademicSearchAdapter = { name:string; search(query:string, opts:{ limit:number; apiKey?:string; signal:AbortSignal; fetchFn?:typeof fetch }):Promise<AcademicHit[]> }
2. 新建 src/core/agent/search/semanticScholar.ts：实现 SS 适配器。调 SS paper search REST，请求 fields 含 title/authors/abstract/externalIds；只保留能解析出 arxivId（externalIds.ArXiv）的命中；abstract 直接取纯文本。apiKey 存在时带上对应 header。
3. 新建 src/core/agent/search/openAlex.ts：实现 OpenAlex 适配器。**无 apiKey 直接返回 []（视为不可用）**。命中里 abstract 为 abstract_inverted_index，需重建为纯文本（按 position 还原词序）——这是本步重点，单独写 reconstructAbstract(invertedIndex) 纯函数并测。从 ids 中解析 arxivId。
4. 新建 src/core/agent/search/abstractFallback.ts：fillMissingAbstracts(hits, deps)：对 abstract 为空的命中，按 arxivId 抓 arxiv HTML（复用 fetchPaperHtml + cleanArxivHtml 取 abstract），失败则保持空。可并发但限流（沿用项目已有/最小 mapLimit）。
5. 新建 src/core/agent/search/runAcademicSearch.ts：runAcademicSearch({ query, limit, settings, signal, fetchFn }):Promise<AcademicHit[]>，编排 key 降级：
   - 若 openAlexApiKey 存在：先用 OpenAlex；
   - 否则 / OpenAlex 空结果：用 Semantic Scholar（带 semanticScholarApiKey 若有）；
   - 合并去重（按 arxivId）；对仍缺 abstract 的走 fillMissingAbstracts；
   - 全程 fail-soft。

为每个文件写 .test.ts（mock fetch）：SS 正常解析 / 过滤无 arxivId 命中；OpenAlex 无 key 返回空、倒排索引重建正确；abstractFallback 命中 HTML 补齐与失败保持空；runAcademicSearch 的降级分支（有 OpenAlex key 走 OpenAlex、无 key 走 SS、OpenAlex 空回落 SS）。

交付要求：先列改动清单；SS / OpenAlex 的具体 endpoint 与字段名若有不确定，先查官方文档再实现、并在回复里写明所用 endpoint/字段（不要猜字段名）；跑 typecheck + test 贴结果。
```

**验收标准**：两适配器纯 GET、fail-soft；OpenAlex 无 key 返回空且倒排索引重建正确；abstract 兜底抓 arxiv HTML；`runAcademicSearch` 正确实现 key 降级与去重；mock-fetch 单测覆盖各分支；typecheck/test 通过。

## P5-3 · academic_search 工具　🟡 标准档（中难度 · 中范围）

```text
请阅读 @实施方案修订案.md（一、2 返回内容 + 纳入闸门；三、provenance）、现有 src/core/agent/types.ts、src/core/agent/provenance.ts（P4-1）、src/core/agent/search/runAcademicSearch.ts、src/store/settingsStore.ts。

任务：
1. 新建 src/core/agent/tools/academicSearch.ts，导出 academicSearchTool: Tool。
   - inputSchema: z.strictObject({ query:z.string(), limit:z.number().default(10) })。
   - isReadOnly:()=>true；isConcurrencySafe:()=>true；checkPermissions: allow（联网，但学术来源威胁模型轻；纳入才是受控动作）。
   - call：从 settings 取 key，调 runAcademicSearch；返回 data=hits；newMessages 用 withProvenance('academic', ...) 注入命中清单（arxivId / 标题 / 作者 / abstract）。
   - description（中/英）必须写明：① 这是外部学术搜索，结果**不自动进盒**；② 让用户逐篇审查、对相关者点「纳入」；③ 注释：当前仅支持把有 arxiv HTML 的 arxiv 论文纳入盒子，将来支持新引入方式需更新本说明与系统提示。
2. 在 buildResearchTools 注册 academicSearchTool（本阶段无条件注入；P7 盒子开关再约束「关盒后不主动外搜」）。

新建 src/core/agent/tools/academicSearch.test.ts（mock runAcademicSearch 或注入 fetchFn）：断言返回 hits、newMessages 带 [来源: academic] 且含「不自动进盒/需用户纳入」措辞。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**：`academicSearchTool` 只读联网，返回带 `academic` 来源标签的命中清单，description 明确「结果不自动进盒、需用户逐篇纳入」与未来引入方式的注释；注册进 `buildResearchTools`；单测通过；typecheck 通过。

## P5-4 · 逐篇纳入闸门（复用 PaperBox 导入接口）　🟡 标准档（中难度 · 中范围）

> 这是外部文献进盒的**唯一入口**。**必须复用 PaperBox 现成导入接口**，不得另起炉灶。闸门在用户手里：一篇一篇地审、一篇一篇地纳。

```text
请仔细阅读 @实施方案修订案.md（一、2 纳入闸门）、现有 src/store/paperStore.ts（addInput(projectId, source) 的契约：解析 arxiv 输入→建 paperEntry→返回 routeId）、src/pages/PaperBox.tsx（现有「添加论文」走 addInput 的流程）、src/core/pipeline/loadPaper.ts（IR 抓取/落库管线）、src/ui/ai-panel/*。

铁律：Agent 纳入论文与 PaperBox「添加论文」走**同一套接口**。当前 PaperBox 只支持 importMethod='arxiv-html'（以 arxiv id 引入有 arxiv HTML 页面的论文），纳入也只支持这一种。**禁止**为 Agent 另写导入/抓取/落库逻辑。

任务：
1. 新建 src/core/agent/inclusion.ts：导出 includePaperFromSearch(opts:{ projectId:string; arxivId:string }):Promise<{ routeId:string }>，内部**仅调用 PaperBox 现有导入路径**（usePaperStore.getState().addInput(projectId, arxivId)，以及 PaperBox 触发 IR 抓取/落库所用的同一管线/store 动作；先查 PaperBox.tsx 与 paperStore.ts 确认现状再接线，不要新增并行实现）。
   - 在文件顶部留注释（中文）：
     「纳入论文复用 PaperBox 的 arxiv-html 导入接口。当前仅支持以 arxiv id 引入有 arxiv HTML 页面的论文。将来 PaperBox 支持新的引入方式（如 PDF / DOI / 手动上传）后，需同步修改：本函数、academic_search 工具 description、Agent 系统提示中关于‘可纳入什么’的措辞。」
   - 若 addInput 之外还需触发 IR 抓取才能让 retrieval/paperbox_read 用上该论文，则调用 PaperBox 同款触发方式（同一函数/store action），并在注释说明依赖点。
2. 新建 src/ui/ai-panel/SearchResultCard.tsx：渲染单条 academic 命中（标题/作者/abstract/来源标签），带「纳入」按钮；点击调 includePaperFromSearch；纳入中/已纳入/失败有状态反馈；已在盒内的（routeId 已存在）显示「已在盒中」。在 index.ts 导出。
3. AgentChat 把 academic_search 的命中渲染为一组 SearchResultCard（逐篇纳入闸门）。

新建 src/core/agent/inclusion.test.ts：mock paperStore/导入接口，断言 includePaperFromSearch 调用的是现有 addInput（同一接口）而非自写逻辑、返回 routeId；arxivId 非法/重复的处理。

交付要求：列改动清单；明确说明你复用了哪个现有接口、IR 抓取在何处触发（贴出调用链）；确认没有新增任何平行导入实现；跑 typecheck + test 贴结果。
```

**验收标准**
- 纳入**仅复用** PaperBox 现有 `addInput` + 同款 IR 抓取/落库路径，无平行实现；`inclusion.ts` 顶部有「未来新增引入方式需同步改 Agent（含提示词）」的注释。
- `SearchResultCard` 提供逐篇「纳入」闸门，状态反馈完整，已在盒内的可识别。
- 单测断言走的是同一导入接口；typecheck/test 通过。

---

# 阶段 P6 · 开放域 Web 搜索 `websearch`（Tavily / Perplexity）

**目标**：实现修订案「一、3 websearch」与能力①——通用网页搜索，供 agent 获取论文之外的开放域信息。**用户自带 key**，内置 Tavily / Perplexity 双适配器二选一；**无免费方案**：未配 key 时不注入该工具（或 fail-open 返回空）；网络失败 **fail-open**；要求模型回答末尾附 Sources；结果标 `web` 来源。受信任开关 `allowWeb` 控制。

**改动清单**
- 修改 `src/core/settings/schema.ts` + `src/store/settingsStore.ts`（新增 `allowWeb` / `allowCode` 信任开关、`webSearchProvider`、`tavilyApiKey` / `perplexityApiKey`）+ 测试
- 新增 `src/core/agent/search/webAdapters.ts` + `.test.ts`（Tavily / Perplexity 适配器）
- 新增 `src/core/agent/tools/webSearch.ts` + `.test.ts`
- 修改 `src/core/agent/tools/index.ts`（按 `allowWeb` + 是否配置 key 注入）、`src/pages/AgentChat.tsx`（传开关）、`src/ui/settings/`（信任开关 + key UI）

## P6-1 · 信任开关 + 网页搜索设置　🟢 快速档（低难度 · 大范围）

```text
请阅读 @BuildResearchAgent.md §2（信任边界：仅当用户开启「允许联网/执行代码」后才注入 websearch/python）、@实施方案修订案.md（一、3 websearch：用户自带 key、二选一、无免费方案、fail-open）、@PROJECT.md 第 4.4 节、现有 src/core/settings/schema.ts、src/store/settingsStore.ts、src/ui/settings/*。

任务：
1. AppSettingsSchema 新增：allowWeb（bool，默认 false）、allowCode（bool，默认 false，供 P9 Python 用）、webSearchProvider（z.enum(['tavily','perplexity']).default('tavily')）、tavilyApiKey（.default("")）、perplexityApiKey（.default("")）；更新 DEFAULT_SETTINGS。
2. settingsStore 暴露对应 setXxx 与读取（沿用范式）。
3. 设置页「Agent 能力」区段：允许联网搜索 / 允许执行代码两个开关（附风险提示）、网页搜索 provider 选择、对应 key 输入框；i18n 文案。
4. 更新相关单测。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**：新增 `allowWeb`/`allowCode`（默认 false）、`webSearchProvider` 与两个 key（默认空），有 store action 与设置页 UI；既有设置测试不破坏；typecheck/test 通过。

## P6-2 · websearch 工具（双适配器 + fail-open）　🟡 标准档（中难度 · 中范围）

```text
请阅读 @BuildResearchAgent.md §16（fail-open）、附录A①、@Claude_prompts.md 附录A①（getWebSearchPrompt：返回 markdown 链接、必须附 Sources、用正确年份）、@实施方案修订案.md（一、3）、现有 src/core/agent/types.ts、src/core/agent/provenance.ts、src/store/settingsStore.ts。

任务：
1. 新建 src/core/agent/search/webAdapters.ts：WebHit = { title:string; url:string; snippet:string }；两个适配器 tavilySearch / perplexitySearch（纯 fetch，用户 key，fail-soft 返回 []）；按 webSearchProvider 选择。Tavily / Perplexity 若有 CORS 限制，在回复里说明并给「需用户填可直连的 endpoint/代理」的降级方案，不擅自加后端依赖。
2. 新建 src/core/agent/tools/webSearch.ts，导出 webSearchTool: Tool。
   - inputSchema: z.strictObject({ query:z.string(), maxResults:z.number().default(5) })。
   - isReadOnly:()=>true；isConcurrencySafe:()=>true；checkPermissions: { behavior:'ask', reason:'联网搜索: '+query, risk:'low' }。
   - call：按所选 provider + key 搜；**fail-open**：未配 key / fetch 抛错 / 超时 → 返回空 hits 且不抛。返回 hits；newMessages 用 withProvenance('web', ...) 注入结果并要求模型在回答末尾给出 "Sources:" markdown 链接列表。
   - description：用途 + 必须引用来源 + 使用当前年份检索（注入当前日期）。
3. 在 buildResearchTools：`...(opts.allowWeb ? [webSearchTool] : [])`（可在 description/注入时附「未配 key 则结果为空」的提示）。AgentChat 用 settings.allowWeb 传入。

新建 src/core/agent/tools/webSearch.test.ts：mock 适配器正常返回 → hits + newMessages 含 Sources 要求且带 [来源: web]；mock 抛错 / 未配 key → 返回空、不抛（fail-open）。

交付要求：列改动清单；CORS/endpoint 决策在回复说明；跑 typecheck + test 贴结果。
```

**验收标准**：`webSearchTool` 仅在 `allowWeb` 注入；Tavily/Perplexity 二选一；只读可并行、`ask:low`；未配 key / fetch 失败 **fail-open** 返回空且不崩；结果带 `web` 来源 + 要求附 Sources；单测覆盖；typecheck/test 通过。

---

# 阶段 P7 · 盒子开关 + provenance + 边界规则（采集 / 研究边界）

**目标**：实现修订案「三、盒子开关」这一核心交互——一个会话级状态位（开/关）划分采集阶段与研究阶段。开盒：可用 academic_search / websearch 连外部拉文献进盒。关盒：回答绝对优先盒内文献。边界是**软规则（引用优先级 + 透明度），不是访问控制**：不开新会话、不折叠历史、不清洗上下文，全程心流连续。关盒动作 = 追加一条 boundary marker 消息 + 系统提示常驻盒内优先规则。盒内答不了时用盒外兜底并显式标注「来自盒外、尚未纳入」。

> 设计要点（务必传达给实现者）：boundary marker 给模型一条**只需服从的时间线规则**（标记前的外部内容降级为「检索过程记录」），而非要求模型逐条回看历史判断来源。它**不删任何历史**。provenance 标签（P4-1 引入）在此用于 UI 透明展示与模型标注盒外引用。关盒可在流程任意时刻发生（含多步任务执行到一半）。

**改动清单**
- 新增 `src/core/agent/boundary.ts` + `.test.ts`（boundary marker 消息构造 + 盒内优先规则文本）
- 修改 `src/store/agentStore.ts`（新增 `boxOpen` 状态位 + `setBoxOpen` / `closeBox` / `openBox`）+ 测试
- 修改 `src/core/agent/systemPrompt.ts`（稳定段加盒内优先规则；动态段反映当前盒子状态）+ 测试
- 新增 `src/ui/ai-panel/BoxSwitch.tsx` + provenance 标签展示，index 导出；修改 `src/pages/AgentChat.tsx`

## P7-1 · 盒子开关状态位 + boundary marker 注入　🔴 专家档（高难度 · 小范围）

> 核心交互的中枢：状态位 + 关盒时往历史注入一条优先级规则消息。错一点就破坏「上下文连续、不打断心流」的设计意图，交专家模型。

```text
请仔细阅读 @实施方案修订案.md（三、盒子开关 全文，尤其「关盒的具体实现」「盒内回答不了时的行为」）、现有 src/store/agentStore.ts、src/core/agent/types.ts（AgentMessage）。

任务：
1. 新建 src/core/agent/boundary.ts（纯 TS，不 import react）。导出：
   - buildBoundaryMarker():AgentMessage —— 一条 role:'user' 的 text-block 消息，内容即修订案给出的规则：「【盒子已关闭】从此标记起，回答必须绝对优先使用盒内论文内容，并以 paperId#blockId 形式引用；仅当盒内确无相关依据时，才可援引此前检索阶段获得的盒外信息，且一旦援引必须明确标注‘此点来自盒外、尚未正式纳入盒子’，以便用户判断是否需要正式纳入。」措辞贴近修订案原文。
   - IN_BOX_PRIORITY_RULE: string —— 供系统提示常驻引用的同义规则文本（P7-2 用）。
2. 修改 src/store/agentStore.ts：新增 boxOpen:boolean（默认 true）；setBoxOpen(b)、openBox()、closeBox()。closeBox() 不仅置位，还要 append(buildBoundaryMarker())（关盒即在历史留痕）；openBox() 仅置位（**不删任何历史**）。reset() 时 boxOpen 回 true。
3. 不要物理移除外部工具：关盒后靠系统提示约束「优先盒内、不主动外搜」；重新开盒即恢复。绝不清洗/折叠历史。

更新 src/store/agentStore.test.ts：closeBox 置 boxOpen=false 且历史追加了一条 boundary marker（断言其文本含「盒子已关闭/优先盒内」关键措辞）；openBox 置 true 且**不删除**历史；reset 恢复默认。boundary.test.ts 断言 marker 文本要点齐全。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**：`agentStore` 新增 `boxOpen`（默认 true）与 open/close/set；`closeBox` 追加 boundary marker 且不删历史；`buildBoundaryMarker` 文本贴近修订案；单测覆盖；typecheck/test 通过。

## P7-2 · 系统提示收口：盒内优先 + 引用规范　🟡 标准档（中难度 · 小范围）

```text
请阅读 @实施方案修订案.md（四、系统提示需包含的规则）、现有 src/core/agent/systemPrompt.ts（已含 P4-5 的检索姿态）、src/core/agent/boundary.ts（IN_BOX_PRIORITY_RULE）。

任务：在 systemPrompt 收口修订案要求的全部规则：
1. 稳定段加入「盒内优先规则」（复用 IN_BOX_PRIORITY_RULE 要点）：盒子关闭后绝对优先盒内 paperId#blockId 内容；盒内缺失才用盒外兜底，且兜底必须显式标注「来自盒外、尚未纳入」。
2. 稳定段加入/确认「引用规范」：涉及论文内容的论断必须带 paperId#blockId 引用。
3. 动态段（buildDynamicPrompt）反映当前盒子状态：buildAgentSystemPrompt 增加可选 ctx.boxOpen?:boolean，开盒时提示「采集阶段：可用 academic_search / websearch 拉文献进盒，结果需用户逐篇纳入」；关盒时提示「研究阶段：优先盒内、不主动外搜」。

更新 systemPrompt.test.ts：断言稳定段含盒内优先 + 引用规范；boxOpen=true/false 时动态段措辞不同；稳定段仍在动态边界之前。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**：系统提示含盒内优先 + 盒外兜底标注 + 引用规范；动态段按 `boxOpen` 变化；单测覆盖；typecheck/test 通过。

## P7-3 · 盒子开关 UI + provenance 标签展示　🟢 快速档（低难度 · 大范围）

```text
请阅读 @实施方案修订案.md（三、provenance 来源标记；标准工作流）、现有 src/ui/ai-panel/*、src/store/agentStore.ts（boxOpen/openBox/closeBox）、src/pages/AgentChat.tsx。

任务：
1. 新建 src/ui/ai-panel/BoxSwitch.tsx：一个醒目的开/关盒开关，读 useAgentStore().boxOpen，点击调 openBox/closeBox；开盒标「采集中（可联网拉文献）」、关盒标「研究中（优先盒内）」，附一句说明。关盒可在任意时刻发生（不阻断进行中的任务）。
2. provenance 标签：在工具结果 / 命中卡片（ToolCallCard、SearchResultCard）上展示来源徽标 paperbox / academic / web（颜色区分），让用户全程看见来源。
3. AgentChat：把 BoxSwitch 放面板顶部（与权限模式开关并列）；构造 deps 时把 boxOpen 传入 buildAgentSystemPrompt(ctx.boxOpen)。保证标准工作流连续：搜索→逐篇纳入→关盒→基于盒内提问，全程同一会话、不清历史。

交付要求：列改动清单；跑 typecheck + test 贴结果；说明手动验证：开盒搜索并纳入两篇 → 关盒（历史出现 boundary marker、出现「研究中」标识）→ 继续提问，回答优先盒内并带 paperId#blockId 引用，盒外点标注「来自盒外」。
```

**验收标准**：`BoxSwitch` 可开/关盒并反映状态；工具/命中展示 provenance 徽标；关盒注入 boundary marker 且会话连续不打断；动态系统提示随状态变化；typecheck/test 通过。

---

# 阶段 P8 · Artifacts 生成 + 侧栏产出区

**目标**：实现能力③（`BuildResearchAgent.md` §6/§12/附录A③、`Claude_prompts.md` 附录A③）：摘要 / 对比表 / 大纲等 Artifacts 作为**写操作**经审批后落 Dexie，并在 `ResearchBoxAgent.md` 要求的「侧栏子菜单开头 fixed 展示产出 artifacts」处呈现 + 预览。引入 **Dexie v5 迁移**（`artifacts` 表）。

**改动清单**
- 新增 `src/core/agent/artifact/schema.ts`（Zod `ArtifactSchema`）+ `.test.ts`
- 修改 `src/db/index.ts`（v5 迁移：新增 `artifacts` 表 + CRUD）+ 测试
- 新增 `src/core/agent/templates/litReview.md`、`compare.md`、`outline.md`（按需注入模板，对应 Skills 两阶段）
- 新增 `src/core/agent/skills.ts` + `.test.ts`（模板按需加载）
- 新增 `src/core/agent/tools/artifacts.ts` + `.test.ts`
- 修改 `src/core/agent/tools/index.ts`
- 新增 `src/ui/ai-panel/ArtifactList.tsx`、`ArtifactPreview.tsx`，index 导出；修改侧栏/页面挂载产出区

## P8-1 · Artifact schema + Dexie v5 迁移　🟢 快速档（低难度 · 大范围）

```text
请阅读 @PROJECT.md 第 5 节（Dexie 库 researchbox v4、版本迁移历史、CRUD 范式）、@CLAUDE.md（Zod 为唯一事实来源）、现有 src/db/index.ts、src/core/annotation/schema.ts（schema 写法范式）。

任务：
1. 新建 src/core/agent/artifact/schema.ts：用 Zod 定义并导出 ArtifactSchema + Artifact 类型。字段：{ id:string; projectId:string; kind:'summary'|'compare-table'|'outline'|'note'; title:string; content:string（markdown）; sourceCitations:string[]（paperId#blockId 列表）; createdAt:number; updatedAt:number }。写最小 schema 往返单测。
2. 修改 src/db/index.ts：把 Dexie 版本升到 v5，新增 artifacts 表，索引 `id, projectId, updatedAt, kind`。新增并导出 CRUD（沿用现有风格）：saveArtifact(a)、getArtifact(id)、listArtifacts(projectId)、deleteArtifact(id)。注意：必须保留 v1–v4 既有 stores 定义，仅在 v5 .stores({...}) 中追加 artifacts（遵循 Dexie 增量迁移；不破坏既有数据/测试）。
3. 在 @PROJECT.md 第 5.3 节风格上心里有数即可（不必改文档），但 v5 迁移须与既有迁移历史一致。

为 db 新增 CRUD 写测试（fake-indexeddb，沿用 src/db/*.test.ts 范式）：saveArtifact→getArtifact→listArtifacts(按 projectId)→deleteArtifact。

交付要求：列改动清单；跑 typecheck + test 贴结果。务必确认升级到 v5 后既有 v4 测试仍全绿。
```

**验收标准**：`ArtifactSchema` 定义完整；Dexie 升 v5 新增 `artifacts` 表与 4 个 CRUD，**不破坏 v1–v4**；CRUD 单测 + 既有 db 测试全绿；typecheck 通过。

## P8-2 · 研究模板（Skills 两阶段）　🟢 快速档（低难度 · 大范围）

```text
请阅读 @BuildResearchAgent.md §12（Skills 两阶段加载：仅 frontmatter 进系统提示，正文按需注入）、@Claude_prompts.md §12.1、现有 vite 的 ?raw import 支持。

任务：
1. 新建 src/core/agent/templates/ 下三个 markdown：litReview.md（结构化文献综述模板）、compare.md（论文对比表模板，要求输出含 paperId#blockId 引用的 markdown 表）、outline.md（论文/主题大纲模板）。每个模板正文给出清晰的产出结构与「必须带引用」的要求。
2. 新建 src/core/agent/skills.ts（纯 TS）。导出 ResearchSkill 接口 { name:string; description:string; load():Promise<string> } 与 skills: ResearchSkill[]，每项用 `() => import('./templates/xxx.md?raw').then(m => m.default)` 实现按需加载。导出 listSkillMenu(): {name,description}[]（仅供系统提示用的 frontmatter 菜单）。
3. 写 src/core/agent/skills.test.ts：断言 listSkillMenu 返回 name+description；load() 能取回非空字符串（在 Vitest 中 ?raw import 若不可用，可对 load 做 mock 或用 vitest 的 raw 处理；不确定就用最小可行方式并说明）。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**：三个模板存在；`skills.ts` 提供按需 `load()` 与 `listSkillMenu()`；单测通过；typecheck 通过。

## P8-3 · artifacts 工具（写操作 + 审批）　🔴 专家档（高难度 · 小范围）

> 第一个真正的**写工具**：要正确接 `checkPermissions→ask` + plan 模式禁写 + `contextModifier`/落库返回 `artifactId`。安全与一致性关键，交专家模型。

```text
请仔细阅读 @BuildResearchAgent.md §6（写工具 + contextModifier）、附录A③、@Claude_prompts.md 附录A③，现有 src/core/agent/types.ts、src/core/agent/artifact/schema.ts、src/db/index.ts（saveArtifact 等）、src/core/agent/approval.ts（resolvePermission 对 ask+plan 的处理）。

任务：新建 src/core/agent/tools/artifacts.ts，导出 artifactsTool: Tool。
- inputSchema: z.strictObject({ kind:z.enum(['summary','compare-table','outline','note']), title:z.string(), content:z.string(), sourceCitations:z.array(z.string()).default([]) })。
- isReadOnly: ()=>false（写操作）。
- isConcurrencySafe: ()=>false（写 Dexie，且与审批相关，串行）。
- checkPermissions: 返回 { behavior:'ask', reason:`生成 Artifact: ${input.title}`, risk:'low' }。（结合 P3 的 resolvePermission：plan 模式会因非只读被拒；default 模式弹审批；autoApproveRead 不放行写。）
- call: 校验 sourceCitations 形如 `paperId#blockId`（格式不合直接在结果里提示但仍可保存，或拒绝——选其一并说明）；调 deps.db.saveArtifact 落库（id 用 nanoid 或 crypto.randomUUID；projectId 来自 deps.projectId）；返回 ToolResult，data 含 artifactId 与摘要，newMessages 可注入「已生成 artifact，id=...」。

在 src/core/agent/tools/index.ts 注册 artifactsTool。

新建 src/core/agent/tools/artifacts.test.ts（fake-indexeddb）：
- 直接以 allow 路径调用 call → artifacts 表新增一行，data 含 artifactId。
- 经 resolvePermission（default + requestApproval=false）→ 不写库、返回 deny（这部分可在 execute.test 已覆盖时只做 call 级测试，并补一个 checkPermissions 返回 ask 的断言）。

交付要求：列改动清单；明确 projectId 来源（deps.projectId，P2-4 已扩展）；跑 typecheck + test 贴结果。
```

**验收标准**：`artifactsTool` 为写工具（`isReadOnly=false`、`checkPermissions→ask`），经审批后落 `artifacts` 表并返回 `artifactId`；plan 模式被拒（由 P3 逻辑保证）；单测通过；注册进 `buildResearchTools`；typecheck 通过。

## P8-4 · 侧栏产出区 + Artifact 预览　🟡 标准档（中难度 · 中范围）

```text
请阅读 @ResearchBoxAgent.md（侧栏子菜单开头 fixed 展示产出 artifacts、下方对话历史、最下方历史搜索入口）、现有 src/ui/shell/Sidebar 相关实现、src/ui/ai-panel/*、src/db/index.ts（listArtifacts）。

任务：
1. 新建 src/ui/ai-panel/ArtifactList.tsx：列出当前项目的 artifacts（listArtifacts(projectId)），每项显示 kind 图标 + title + 时间，点击打开预览。支持删除（deleteArtifact）。
2. 新建 src/ui/ai-panel/ArtifactPreview.tsx：用 react-markdown 渲染 artifact.content（数学用项目既有 KaTeX 渲染方式；引用 paperId#blockId 可做成可点击跳转的占位，真正跳转可后续做）。
3. 按 @ResearchBoxAgent.md 的布局，把 ArtifactList 放在「研究助手」侧栏子菜单/面板的**顶部 fixed 区**（具体挂载点按现有 Sidebar/面板结构做最小改动；若侧栏改造较大，先在 AgentChat 页面内的固定顶部区域呈现，并在回复里说明后续如何移入侧栏）。
4. artifactsTool 生成新 artifact 后，ArtifactList 能刷新（可在 store 增一个 artifactsVersion 计数或在工具完成回调里触发 reload）。

交付要求：列改动清单；跑 typecheck + test 贴结果；说明手动验证：让模型用 /lit-review 或直接请求生成对比表 → 审批通过 → 产出区出现新 artifact → 点击预览。
```

**验收标准**：产出区展示项目 artifacts 并可预览/删除；新生成的 artifact 能刷新呈现；布局贴近 `ResearchBoxAgent.md`（顶部固定产出区）。typecheck/test 通过。

---

# 阶段 P9 · Python 沙盒（Pyodide / WASM in Web Worker）

**目标**：实现能力④（`BuildResearchAgent.md` §17/§7/§15/附录A④）——Claude Code 本身没有此能力，为 ResearchBox 新增。**懒加载** ~10MB+ WASM、Web Worker 内**串行**执行（`isConcurrencySafe=false`）、`checkPermissions→ask:high`、大输出走结果预算（依赖 P10 或本阶段先做截断）。

> 这是最重的阶段，依赖信任开关（P6-1 的 `allowCode`）与审批（P3）。引入新依赖 `pyodide`——Prompt 要求先停下确认。

**改动清单**
- 新增 `src/workers/pyodide.worker.ts`（Worker 入口）
- 新增 `src/core/agent/python/workerClient.ts` + `.test.ts`（主线程↔Worker 消息往返，对应 §15 InProcessTransport 思路）
- 新增 `src/core/agent/tools/python.ts` + `.test.ts`
- 修改 `src/core/agent/tools/index.ts`（按 `allowCode` 注入）、`vite.config.ts`（Worker/WASM 配置）、`package.json`（新增 pyodide）

## P9-1 · Pyodide Worker 客户端（懒加载 + 串行）　🔴 专家档（高难度 · 小范围）

> Worker 消息往返 + 懒加载单例 + abort + 串行队列，是并发/性能/正确性交叉的硬骨头。范围小，交专家模型。

```text
请仔细阅读 @BuildResearchAgent.md §17（Pyodide 懒加载、Worker 内串行、输出预算）、§15（Worker 消息往返借鉴 InProcessTransport 的 queueMicrotask 投递思路）、§7（python 工具 isConcurrencySafe=false、单 Worker 硬串行）。

前置：本步需要新增依赖 pyodide。请**先停下**，在回复里说明：将 `npm i pyodide`（用最新稳定版），以及 vite 中加载 WASM/Worker 的方式（new Worker(new URL('...', import.meta.url), { type:'module' }) + pyodide 的 CDN/本地 assets 取舍）。等我确认后再装与改 vite.config.ts。

确认后任务：
1. 新建 src/workers/pyodide.worker.ts：Worker 内首次收到 run 消息时才 loadPyodide（懒加载），之后复用实例。接收 { type:'run', id, code }，执行后回传 { type:'result', id, stdout, result, error? }；捕获 Python 异常转成 error 文本。
2. 新建 src/core/agent/python/workerClient.ts（纯 TS，但允许使用 Worker API；不 import react）。导出一个懒加载单例工厂 getPyodideClient(): { run(code:string, signal:AbortSignal):Promise<PyOutput> }。
   - Worker 在首次 run 时才 spawn（lazy）。
   - **串行队列**：内部维护队列，保证同一时刻只有一个 code 在 Worker 中执行（单 Worker 硬串行）。
   - 支持 signal abort：abort 时 reject 当前 Promise（Pyodide 无法真正中断同步执行，至少要让上层不再等待，并标记该 client 需重建——可在 abort 后 terminate 并重置单例）。
   - 用 message id 关联请求/响应（对应 §15 的消息往返）。
3. PyOutput 类型：{ stdout:string; result:string; error?:string }。

为 workerClient 写可测试性设计：把「创建 Worker」做成可注入的 factory，单测时注入一个假的 Worker（用 EventTarget/postMessage mock）验证：串行性（第二个 run 在第一个 resolve 前不被投递）、id 关联正确、abort 行为。

交付要求：先停下确认依赖与 vite 改动；获批后列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**
- 先就 `pyodide` 依赖与 vite 配置征求确认（不擅自安装）。
- 获批后：Worker 懒加载、单 Worker 串行队列、id 关联、abort 重置；可注入假 Worker 的单测覆盖串行性与 id 关联。
- typecheck/test 通过。

## P9-2 · python 工具（高危审批 + 输出预算）　🔴 专家档（高难度 · 小范围）

```text
请阅读 @BuildResearchAgent.md §17（pythonTool 伪代码：checkPermissions→ask:high、懒 spawn、大输出落 IndexedDB）、附录A④、@Claude_prompts.md 附录A④、现有 src/core/agent/python/workerClient.ts、src/core/agent/types.ts、src/core/agent/approval.ts。

任务：新建 src/core/agent/tools/python.ts，导出 pythonTool: Tool。
- inputSchema: z.strictObject({ code:z.string(), purpose:z.string() })。
- isReadOnly:()=>false；isConcurrencySafe:()=>false（单 Worker 串行 + 副作用）。
- checkPermissions: { behavior:'ask', reason:`执行 Python: ${input.purpose}`, risk:'high' }（高危，default 模式必弹审批；plan 模式被拒）。
- call: yield { stage:'loading'|'running' } 进度；调 getPyodideClient().run(code, deps.signal)；返回 stdout/result；若输出超过阈值（如 30000 字符）先做截断预览（完整落 IndexedDB 的逻辑与 P10 结果预算统一；本步至少截断并提示「输出过大，已截断」）。
- 错误（Python 异常 / abort）转成 isError 友好信息。

在 src/core/agent/tools/index.ts：`...(opts.allowCode ? [pythonTool] : [])`；AgentChat 用 settings.allowCode 传入。

新建 src/core/agent/tools/python.test.ts：注入假的 pyodide client，断言 checkPermissions 返回 ask:high、call 透传 stdout/result、超长输出被截断、client 抛错 → isError。

交付要求：列改动清单；跑 typecheck + test 贴结果。
```

**验收标准**：`pythonTool` 仅在 `allowCode` 注入；`isConcurrencySafe=false`、`ask:high`；进度 stage、超长截断、错误友好化；注入假 client 的单测通过；typecheck/test 通过。

---

# 阶段 P10 · 子代理 + 结果预算 + 会话持久化/历史搜索

**目标**：收尾增强——子代理（`BuildResearchAgent.md` §8/§10「Never delegate understanding」）、工具**结果预算落 IndexedDB**（§6/§17）、以及 `ResearchBoxAgent.md` 要求的**对话历史持久化 + 历史搜索入口**。

**改动清单**
- 修改 `src/db/index.ts`（v6：`toolResults` 表 + CRUD；复用既有 `aiSessions` 做会话持久化）
- 修改 `src/core/agent/execute.ts`（结果预算：超阈值落 `toolResults`，回话放预览 + resultId）+ 测试
- 新增 `src/core/agent/subagent.ts` + `.test.ts`（`paper-summarizer` / `reviewer`）
- 修改 `src/core/agent/tools/index.ts`（注册 `sub_agent`）
- 新增 `src/core/agent/session.ts` + `.test.ts`（会话存取/搜索纯逻辑）
- 新增 `src/ui/ai-panel/HistorySearch.tsx`，修改侧栏/页面挂载历史区

## P10-1 · 结果预算落 IndexedDB　🔴 专家档（高难度 · 小范围）

```text
请仔细阅读 @BuildResearchAgent.md §6（结果预算：超阈值把全文存 toolResults 表、回话只放预览 + resultId，模型需要时再取回）、§17、@Claude_prompts.md §6.5（buildLargeToolResultMessage 的 <persisted_output> 预览格式），现有 src/db/index.ts、src/core/agent/execute.ts。

任务：
1. Dexie 升 v6：新增 toolResults 表（索引 `id, createdAt`），CRUD：addToolResult({content})→id、getToolResult(id)。保留 v1–v5。
2. 改 src/core/agent/execute.ts：工具 call 成功后序列化 result.data；若长度 > MAX_RESULT_CHARS（如 30000）→ db.addToolResult 落库，tool_result content 改为「预览（前 ~2000 字符）+ resultId + 提示模型可用 retrieval/专门取回」（格式参考 <persisted_output> 风格）；否则原样返回。
3. 让 paperbox_read（full）、retrieval、python 的大输出都自然走这条预算路径。
4. 可选：增加一个轻量 fetch_result 工具或在 retrieval 中支持按 resultId 取回（若加新工具，注册进 buildResearchTools 并写测试）。

更新 execute.test.ts：超阈值结果被落库且返回预览 + resultId；小结果原样返回。db 测试覆盖 toolResults CRUD。

交付要求：列改动清单；确认 v6 不破坏既有迁移与测试；跑 typecheck + test 贴结果。
```

**验收标准**：Dexie v6 新增 `toolResults` 表 + CRUD（不破坏 v1–v5）；`execute` 超阈值落库返回预览+`resultId`，小结果原样；单测覆盖；typecheck/test 通过。

## P10-2 · 子代理（paper-summarizer / reviewer）　🔴 专家档（高难度 · 小范围）

```text
请仔细阅读 @BuildResearchAgent.md §8（子代理复用主 runAgent、收窄工具池、独立消息历史、权限隔离：background 不弹审批、只读不能写/执行）、§10（Never delegate understanding：派发须给定 paperId + 具体问题）、@Claude_prompts.md §8.2–8.5（general/explore/verification 系统提示）、现有 src/core/agent/loop.ts、src/core/agent/tools/index.ts、src/core/agent/types.ts。

任务：新建 src/core/agent/subagent.ts，导出 subAgentTool: Tool。
- inputSchema: z.strictObject({ type:z.enum(['paper-summarizer','reviewer']), paperId:z.string().optional(), prompt:z.string() })。
- isConcurrencySafe:()=>true（多篇可并行总结）；isReadOnly:()=>true；checkPermissions: allow。
- call：根据 type 取子代理定义 SUBAGENTS[type]（收窄工具池：paper-summarizer 仅 [paperboxReadTool, retrievalTool] 且建议用便宜模型；reviewer 仅只读检索类工具、禁止 artifacts/python，对应 Verification 对抗性核查）；构造收窄的 childDeps（isolated store / 独立 messages；background 语义下 requestApproval 自动拒绝高危——即给一个永远 resolve(false) 的 requestApproval，保证子代理不能自批危险操作）；用 runAgent 跑（maxTurns 较小，如 8），收集消息，return { data: 蒸馏摘要, newMessages:[子代理转录附件] }。
- 子代理 system prompt：改写自 Claude_prompts §8 的 general/verification 风格（paper-summarizer=高效只读总结；reviewer=「不是确认能用，而是尝试证伪」核查引用完整性）。

在 buildResearchTools 注册 subAgentTool。

新建 src/core/agent/subagent.test.ts：注入假 llm/工具，断言 paper-summarizer 用收窄工具池跑出摘要、reviewer 的 childDeps.requestApproval 恒拒（不能写/执行）、返回含转录 newMessages。

交付要求：列改动清单；强调权限隔离（子代理不可自批危险操作）；跑 typecheck + test 贴结果。
```

**验收标准**：`subAgentTool` 复用 `runAgent`、收窄工具池、独立历史、**权限隔离**（子代理 `requestApproval` 恒拒高危）；两类子代理系统提示就位；单测通过；typecheck 通过。

## P10-3 · 会话持久化 + 历史搜索　🟡 标准档（中难度 · 中范围）

```text
请阅读 @ResearchBoxAgent.md（侧栏最下方历史对话搜索入口、变长区显示对话历史）、@PROJECT.md 第 5 节（aiSessions 表 `++id, paperId` 存 AISessionRow）、现有 src/db/index.ts、src/store/agentStore.ts。

任务：
1. 新建 src/core/agent/session.ts（纯 TS）。定义 AgentSession schema（Zod）：{ id?:number; projectId:string; title:string; messages:AgentMessage[]; createdAt:number; updatedAt:number }（复用/扩展 aiSessions 表；若 aiSessions 现有 schema 不兼容，则在 v6 已升级的前提下新增专用表 agentSessions —— 优先复用 aiSessions，不行就新增并说明）。导出纯函数 searchSessions(sessions, query): AgentSession[]（按 title + 消息文本做大小写不敏感子串匹配，按 updatedAt 倒序）。
2. db 层增 saveAgentSession/listAgentSessions(projectId)/getAgentSession(id)/deleteAgentSession（沿用现有风格）。
3. AgentChat 页面：对话进行中/结束时把当前会话持久化（debounce 或在 Terminal 时保存）；进入页面可加载该项目最近会话。
4. 新建 src/ui/ai-panel/HistorySearch.tsx：侧栏/面板最下方的历史搜索入口，输入关键词调 searchSessions 过滤展示，点击加载该会话到聊天区。

为 session.ts 的 searchSessions 写单测（标题命中、消息文本命中、排序、空查询返回全部按时间倒序）。db CRUD 写 fake-indexeddb 测试。

交付要求：列改动清单；明确会话表选型（复用 aiSessions 或新增）；跑 typecheck + test 贴结果。
```

**验收标准**：会话可持久化并按项目加载；`searchSessions` 纯函数按标题/正文匹配并排序（单测覆盖）；历史搜索入口可用、点击加载会话；db CRUD 单测通过；typecheck/test 通过。

---

## 附录 · 全部步骤的模型分派速查表

| 阶段 | 步骤 | 难易度 | 范围 | 推荐档位 |
|------|------|--------|------|----------|
| P0 | P0-1 定义公共类型骨架 | 高 | 小 | 🔴 专家 |
| P0 | P0-2 扩展 Provider tool-use | 高 | 小 | 🔴 专家 |
| P0 | P0-3 实现 agentStore | 低 | 大 | 🟢 快速 |
| P1 | P1-1 上下文估算纯函数 | 中 | 小 | 🟡 标准 |
| P1 | P1-2 chatController 驱动 | 高 | 小 | 🔴 专家 |
| P1 | P1-3 Chat UI 组件 | 低 | 大 | 🟢 快速 |
| P1 | P1-4 接入侧栏/路由 | 中 | 中 | 🟡 标准 |
| P2 | P2-1 Zod→JSON Schema | 中 | 小 | 🟡 标准 |
| P2 | P2-2 主循环 runAgent | 高 | 小 | 🔴 专家 |
| P2 | P2-3 execute + orchestrate | 高 | 小 | 🔴 专家 |
| P2 | P2-4 paperbox_read + 注册 | 中 | 中 | 🟡 标准 |
| P2 | P2-5 UI 接入主循环 | 中 | 中 | 🟡 标准 |
| P3 | P3-1 审批回调 + 权限解析 | 高 | 小 | 🔴 专家 |
| P3 | P3-2 execute 接审批 | 高 | 小 | 🔴 专家 |
| P3 | P3-3 审批面板 + 模式开关 | 低 | 大 | 🟢 快速 |
| P4 | P4-1 paperbox_list + provenance | 中 | 小 | 🟡 标准 |
| P4 | P4-2 位图预筛 + 清单 | 中 | 中 | 🟡 标准 |
| P4 | P4-3 side-query 选区块 | 高 | 小 | 🔴 专家 |
| P4 | P4-4 retrieval 工具 | 中 | 中 | 🟡 标准 |
| P4 | P4-5 检索姿态系统提示 | 中 | 小 | 🟡 标准 |
| P5 | P5-1 学术检索 key 设置 | 低 | 大 | 🟢 快速 |
| P5 | P5-2 SS/OpenAlex 双适配器 + 降级 | 高 | 小 | 🔴 专家 |
| P5 | P5-3 academic_search 工具 | 中 | 中 | 🟡 标准 |
| P5 | P5-4 逐篇纳入闸门（复用 addInput） | 中 | 中 | 🟡 标准 |
| P6 | P6-1 信任开关 + 网搜设置 | 低 | 大 | 🟢 快速 |
| P6 | P6-2 websearch 工具（Tavily/Perplexity） | 中 | 中 | 🟡 标准 |
| P7 | P7-1 盒子开关 + boundary marker | 高 | 小 | 🔴 专家 |
| P7 | P7-2 系统提示收口（盒内优先） | 中 | 小 | 🟡 标准 |
| P7 | P7-3 盒子开关 UI + provenance 标签 | 低 | 大 | 🟢 快速 |
| P8 | P8-1 Artifact schema + v5 | 低 | 大 | 🟢 快速 |
| P8 | P8-2 研究模板 Skills | 低 | 大 | 🟢 快速 |
| P8 | P8-3 artifacts 写工具 | 高 | 小 | 🔴 专家 |
| P8 | P8-4 产出区 + 预览 | 中 | 中 | 🟡 标准 |
| P9 | P9-1 Pyodide Worker 客户端 | 高 | 小 | 🔴 专家 |
| P9 | P9-2 python 工具 | 高 | 小 | 🔴 专家 |
| P10 | P10-1 结果预算落库 | 高 | 小 | 🔴 专家 |
| P10 | P10-2 子代理 | 高 | 小 | 🔴 专家 |
| P10 | P10-3 会话持久化 + 历史搜索 | 中 | 中 | 🟡 标准 |

**分派小结**：脚手架/UI/迁移样板（P0-3、P1-3、P3-3、P5-1、P6-1、P7-3、P8-1、P8-2）走🟢快速档；core 算法/主循环/并发/权限/召回/外部适配器/盒子边界/沙盒（P0-1/2、P1-2、P2-2/3、P3-1/2、P4-3、P5-2、P7-1、P8-3、P9、P10-1/2）走🔴专家档；其余工具接线与常规组件走🟡标准档。**P5-4 纳入闸门是本次修订的硬约束**：必须复用 PaperBox 现有 arxiv-html 导入接口、不得另写平行实现，并在纳入点/工具 description/系统提示三处留「未来新增引入方式需同步改 Agent」的注释。每个 Prompt 交付都以 `npm run typecheck` + `npm run test` 全绿为硬门槛。


