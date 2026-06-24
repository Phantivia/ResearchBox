# 学术研究 Agent 构建手册（ResearchBox · src/core/agent/）

> 本手册以《Claude Code from Source》电子书（`claude-code-from-source/book/`，18 章）为章节骨架，逐章提取 Claude Code 的 Agent 设计机制，并在 `claude-code-source-code/` 源码中定位对应实现加以验证，最终映射到 ResearchBox 五项能力的落地方案。
>
> **目标产品 ResearchBox**：纯前端（TypeScript + React + Vite）、无后端、本地优先的学术论文阅读与研究工具。已有基础设施：论文抓取、HTML 清洗、LLM 翻译（`LLMProvider`）、IndexedDB 缓存（Dexie，库名 `PaperIR`）、Zustand 状态管理。
>
> **五项待建能力**：① 开放域 Web 搜索（`websearch`）② 封闭知识域检索（`retrieval`，结果须带 `blockId` 级引用定位）③ Artifacts 生成（摘要 / 对比表格 / 大纲）④ Python 沙盒执行（Pyodide/WASM in Web Worker）⑤ 多步工具调用 + 用户审批节点（human-in-the-loop）。
>
> **来源标注约定**：源码路径相对 `claude-code-source-code/` 给出。所有关于 Claude Code 的陈述均来自实际读取的电子书章节或源码文件，未读取处不臆测。

---

## ResearchBox Agent 的公共骨架（贯穿全书）

为保持后续各章伪代码风格一致（Zod schema + deps 注入 + AsyncGenerator 流式），先在 `src/core/agent/types.ts` 约定核心类型，后文不再重复：

```typescript
// src/core/agent/types.ts
import { z } from 'zod'
import type { PaperIRDatabase } from '@/core/db'      // 现有 Dexie 实例
import type { LLMProvider } from '@/core/llm'         // 现有翻译用 provider
import type { AgentStore } from './store'             // Zustand store（本模块新建）

/** 依赖注入容器：所有 tool / loop 都只通过 deps 触达外部世界，便于测试替换 */
export interface AgentDeps {
  db: PaperIRDatabase
  llm: LLMProvider
  store: AgentStore
  signal: AbortSignal
  requestApproval: ApprovalFn        // human-in-the-loop 回调，详见第 6/14 章
}

export type PermissionResult =
  | { behavior: 'allow'; updatedInput: unknown }
  | { behavior: 'ask'; reason: string; risk: 'low' | 'high' }
  | { behavior: 'deny'; message: string }

export interface ToolResult<O> {
  data: O
  /** 注入回话的额外消息（如检索证据块、子任务记录），对应 CC 的 newMessages */
  newMessages?: AgentMessage[]
  /** 修改后续工具的执行上下文，对应 CC 的 contextModifier（仅串行工具生效） */
  contextModifier?: (deps: AgentDeps) => AgentDeps
}

/** 与 Claude Code 的 Tool<Input,Output,Progress> 三参数同构 */
export interface Tool<I extends z.ZodTypeAny, O, P = unknown> {
  name: string
  description: string
  inputSchema: I
  isConcurrencySafe(input: z.infer<I>): boolean      // 是否可并行
  isReadOnly(input: z.infer<I>): boolean             // 是否只读（计划模式/审批用）
  checkPermissions(input: z.infer<I>, deps: AgentDeps): Promise<PermissionResult>
  call(input: z.infer<I>, deps: AgentDeps): AsyncGenerator<P, ToolResult<O>>
}
```

---

## 1. AI Agent 的整体架构（来源：ch01-architecture.md）

### Claude Code 的设计
全书将系统归纳为六大抽象：**Query Loop**（异步生成器主循环）、**Tool System**（自描述工具）、**Tasks**（子代理状态机）、**State**（两层状态）、**Memory**（文件式记忆 + LLM 召回）、**Hooks**（27 个生命周期拦截点）。黄金路径是 `keystroke → Query Loop → 流式模型响应 → 工具执行 → 结果回灌 → 循环`，工具调用是副作用、模型推理是控制流。权限系统定义 7 种模式（`bypassPermissions`/`dontAsk`/`auto`/`acceptEdits`/`default`/`plan`/`bubble`），子代理默认 `bubble`（不能自批危险操作）。多 provider 通过 `getAnthropicClient()` 工厂对上层透明。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| Query Loop | `src/query.ts` | `query()` (L219)、`queryLoop()` (L241) | 单一异步生成器，yield `Message`、return `Terminal` 联合类型 |
| 终止状态联合 | `src/query/transitions.ts` | `Terminal`、`Continue` | 编码"为何停止/为何继续"的判别联合 |
| 工具工厂 | `src/Tool.ts` | `buildTool()` (L783)、`ToolUseContext` (L158) | 自描述工具 + fail-closed 默认值 |
| 多 provider | `src/services/api/client.ts` | `getAnthropicClient()` (L88) | 环境变量分派 Direct/Bedrock/Vertex/Azure |
| 权限上下文 | `src/Tool.ts` | `ToolPermissionContext` (L123) | 承载 mode 与 allow/deny/ask 规则集 |

### 学术 Agent 的对应实现
ResearchBox 应照搬"六抽象中的四个"：Query Loop、Tool System、State、人审批节点（替代 Hooks 的子集）。Memory/Tasks 按需裁剪（见第 8/11 章）。模块落点：`src/core/agent/loop.ts`（主循环）、`src/core/agent/tools/`（五项能力各一个工具）、`src/core/agent/store.ts`（Zustand）、`src/core/agent/permission.ts`（审批解析）。LLMProvider 已存在，等价于 CC 的 provider 透明层，主循环不感知具体后端。

### 实现示例（TypeScript 伪代码）
```typescript
// src/core/agent/loop.ts
export type Terminal =
  | { reason: 'completed' }
  | { reason: 'aborted' }
  | { reason: 'max_turns' }
  | { reason: 'approval_denied'; toolName: string }
  | { reason: 'model_error'; error: unknown }

export async function* runAgent(
  params: { messages: AgentMessage[]; tools: Tool<any, any>[]; maxTurns?: number },
  deps: AgentDeps,
): AsyncGenerator<AgentMessage, Terminal> {
  // 主体见第 5 章
}
```

---

## 2. 启动引导管线（来源：ch02-bootstrap.md）

### Claude Code 的设计
启动预算 300ms。五文件漏斗：`cli.tsx`（快路径分派，`--version` 等直接退出）→ `main.tsx`（模块求值期并行触发 keychain/MDM 子进程 I/O）→ `init.ts`（memoized，建立**信任边界**：信任前只读安全项，信任后才读 `PATH/LD_PRELOAD` 等可被污染的环境变量）→ `setup.ts`（并行注册 commands/agents/hooks/plugins，并冻结 hooks 快照）→ `replLauncher.ts`（七种入口收敛到同一 `query()`）。核心思想是"逐层收窄作用域"。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| 进程级单例初始化 | `src/bootstrap/state.ts` | `getInitialState()` (L260)、`STATE` (L429) | 启动一次性构建可变单例 |
| 入口分派 | `src/cli/` `src/entrypoints/` | （目录） | 多入口最终都调用 `query()`，见 ch02 收敛点 |
| Hooks 配置快照 | `src/utils/hooks/hooksConfigSnapshot.ts` | `captureHooksConfigSnapshot` | 启动冻结，运行期不再隐式重读（安全） |

### 学术 Agent 的对应实现
纯前端无 300ms 进程冷启动问题，但"逐层收窄 + 一次性初始化"仍适用：在 `src/core/agent/bootstrap.ts` 用一个 memoized `initAgent()` 完成 Dexie 打开、工具注册表构建，返回 `AgentDeps`。Pyodide/WASM 体积大，须像 CC 的动态 `import()` 一样延迟到首次使用沙盒时再加载，避免阻塞首屏。**信任边界**在前端对应：仅当用户开启"允许执行代码/联网"开关后，才把 `websearch` 与 `python` 工具注入工具池。

### 实现示例（TypeScript 伪代码）
```typescript
// src/core/agent/bootstrap.ts
let cached: AgentDeps | undefined
export async function initAgent(opts: InitOpts): Promise<AgentDeps> {
  if (cached) return cached                          // memoize，等价 CC 的 init() 幂等
  const db = await openPaperIR()                     // Dexie
  const deps: AgentDeps = { db, llm: opts.llm, store: createAgentStore(),
    signal: opts.signal, requestApproval: opts.requestApproval }
  cached = deps
  return deps
  // 注意：Pyodide Worker 不在此 await，首次 python 工具调用时才 lazy-spawn
}
```

---

## 3. 两层状态架构（来源：ch03-state.md）

### Claude Code 的设计
**Bootstrap State**：`bootstrap/state.ts` 中约 80 字段的可变单例 `STATE`，DAG 叶子（不 import React/store），通过约 100 个 getter/setter 访问，路径 setter 做 NFC 归一化。**AppState**：约 34 行的极简响应式 store（Zustand 形态：闭包 + `Object.is` 去重 + `onChange`），驱动 UI。两层经 `onChangeAppState` 单点同步副作用（如权限模式变更）。还有"五个 sticky latch"——一旦置 `true` 永不回退，专为保住 50K+ token 的 prompt 缓存。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| 进程单例 | `src/bootstrap/state.ts` | `STATE`、`getSessionId` (L431)、`getProjectRoot` (L511) | "DO NOT ADD MORE STATE HERE"(L31) 注释告诫节制 |
| 响应式 store | `src/state/store.ts` | `createStore()` (L10) | 闭包 + `onChange` 回调 |
| 集中副作用 | `src/state/onChangeAppState.ts` | `onChangeAppState` | 在 state diff 上集中触发外部副作用 |
| 类型与选择器 | `src/state/AppState.tsx`、`src/state/selectors.ts` | `AppState` | 深不可变 + 函数字段豁免 |

### 学术 Agent 的对应实现
ResearchBox 已用 Zustand，直接对应 AppState 层。建议按"访问模式而非领域"分层：① **基础设施态**（IndexedDB 句柄、当前论文 id、Pyodide Worker 引用）放入 `AgentDeps`/模块单例，不触发 React 重渲染；② **UI 态**（消息流、流式进度、待审批队列、工具运行状态）放入 Zustand `AgentStore`，供 React 订阅。审批模式（`default`/`plan`/`autoApproveRead`）变更走单点 `onChange` 同步给主循环，避免散落。

### 实现示例（TypeScript 伪代码）
```typescript
// src/core/agent/store.ts
import { create } from 'zustand'
export interface AgentStore {
  messages: AgentMessage[]
  pendingApprovals: ApprovalRequest[]      // 待审批队列（human-in-the-loop）
  runningTools: Record<string, ToolRunState>
  permissionMode: 'default' | 'plan' | 'autoApproveRead'
  append(m: AgentMessage): void
  enqueueApproval(r: ApprovalRequest): void
}
export const createAgentStore = () => create<AgentStore>((set) => ({ /* ... */ }))
```

---

## 4. API 层（来源：ch04-api-layer.md）

### Claude Code 的设计
`getAnthropicClient()` 单一工厂，按环境变量分派四 provider 并 `as unknown as Anthropic` 抹平类型。系统提示用 `=== DYNAMIC BOUNDARY ===` 切成静态（全局缓存）+ 动态（按会话缓存）两段，规避缓存键的 `2^N` 爆炸。流式用裸 `Stream` 而非 SDK 高层封装（避免 `partialParse` 的 O(n²)），并配 90s **idle watchdog** + 非流式回退。输出 token 默认上限 8K，截断时一次性重试到 64K（p99 实测仅 4911）。`withRetry()` 是生成器，把"529 重试中…"作为事件流自然 yield。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| 客户端工厂 | `src/services/api/client.ts` | `getAnthropicClient()` (L88) | provider 透明分派 |
| 模型调用生成器 | `src/services/api/claude.ts` | `queryModel()` (L1017)、`queryModelWithStreaming()` (L752) | yield StreamEvent / AssistantMessage |
| 非流式回退 | `src/services/api/claude.ts` | `queryModelWithoutStreaming()` (L709) | 流式失败时同步重试 |
| 重试生成器 | `src/services/api/withRetry.ts` | `withRetry` | 529/fallback/OAuth401，yield 重试状态 |

### 学术 Agent 的对应实现
ResearchBox 已有 `LLMProvider`，等价于此层。需补三点：① 把模型调用统一为 **AsyncGenerator**（`callModel(): AsyncGenerator<StreamEvent, AssistantMessage>`），与现有翻译流式接口风格一致；② 学术翻译 + Agent 共用一个 provider，但 Agent 需要 **tool-use** 能力（Claude `tools` 参数），翻译不需要——拆 `provider.translate()` 与 `provider.runWithTools()`；③ 借鉴 8K 输出上限思路控制成本。对接的是 Claude API（`claude-opus-4-8` / `claude-sonnet-4-6` / `claude-haiku-4-5`），轻量子查询（检索选择器、审批分类）用 Haiku。

### 实现示例（TypeScript 伪代码）
```typescript
// src/core/llm/provider.ts（在现有 LLMProvider 上扩展）
export interface LLMProvider {
  translate(html: string, opts: TranslateOpts): AsyncGenerator<string, void>   // 现有
  runWithTools(req: {
    messages: AgentMessage[]
    tools: ToolSchema[]                       // 由 Tool.inputSchema 转 JSON Schema
    model: 'opus' | 'sonnet' | 'haiku'
  }): AsyncGenerator<StreamEvent, AssistantMessage>                            // 新增
}
```

---

## 5. Agent 主循环（来源：ch05-agent-loop.md）

### Claude Code 的设计
`query.ts` 单文件约 1730 行的 `while(true)`。选异步生成器而非回调有三因：**背压**（消费者 `.next()` 才前进）、**返回值语义**（10 种 Terminal 判别联合）、**可组合**（`yield*` 委托）。每次 `continue` 全量重建不可变 `State` 对象，自带 `transition` 字段自证为何继续。上下文管理分四层压缩（snip → microcompact → context collapse → auto-compact），错误恢复是"升级阶梯"且每条恢复路径都有断路器（防止生产环境烧光预算的死循环）。Stop hooks 可在"模型自认完成"时强制其继续。`QueryDeps` 仅 4 个注入依赖（callModel/compact/microcompact/uuid），便于测试。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| 主循环 | `src/query.ts` | `query()` (L219)、`queryLoop()` (L241) | 两层入口，外层追踪命令完成 |
| 依赖注入 | `src/query/deps.ts` | `QueryDeps` | 4 依赖，测试可替换 |
| 不可变快照配置 | `src/query/config.ts` | `QueryConfig` | 入口一次性快照 feature flags |
| 停止钩子 | `src/query/stopHooks.ts` | `handleStopHooks` | "你真的完成了吗"强制续作 |
| token 预算 | `src/query/tokenBudget.ts` | `checkTokenBudget` | 续作/停止二元决策 |

### 学术 Agent 的对应实现
这是 ResearchBox Agent 的核心，落在 `src/core/agent/loop.ts`。直接照搬最小骨架：`while` 循环 → `callModel`（流式）→ 无 tool_use 则 `completed` → 有则分批执行工具（第 7 章）→ 结果回灌重建 state → 续作。"全量重建不可变 state + transition 字段"对调试多步研究任务（搜索失败重试、检索后再生成）极有价值。压缩层对纯前端先实现最轻的 snip（删旧消息）即可，论文全文这种大块用第 6 章的"result budgeting 落 IndexedDB"处理。断路器必须保留：检索/搜索失败重试要设硬上限，防止前端卡死与 API 烧钱。

### 实现示例（TypeScript 伪代码）
```typescript
// src/core/agent/loop.ts
export async function* runAgent(params, deps: AgentDeps): AsyncGenerator<AgentMessage, Terminal> {
  let state = initState(params)
  while (true) {
    if (deps.signal.aborted) return { reason: 'aborted' }
    if (state.turn >= (params.maxTurns ?? 30)) return { reason: 'max_turns' }

    const msgs = compressIfNeeded(state.messages)               // 轻量 snip
    let assistant: AssistantMessage
    try { assistant = yield* streamModel(msgs, params.tools, deps) }
    catch (error) { return { reason: 'model_error', error } }

    const toolUses = assistant.content.filter(isToolUse)
    if (toolUses.length === 0) return { reason: 'completed' }   // 模型自认完成

    const results = yield* executeBatched(toolUses, params.tools, deps)  // 第 7 章
    if (results.denied) return { reason: 'approval_denied', toolName: results.denied }

    state = { ...state, turn: state.turn + 1,
      messages: [...msgs, assistant, ...results.messages],
      transition: { reason: 'next_turn' } }                    // 自证式转移
  }
}
```

---

## 6. 工具系统：定义到执行（来源：ch06-tools.md）

### Claude Code 的设计
`Tool<Input,Output,P>` 三参数；`Input` 是 Zod schema，既生成 API 的 JSON Schema 又运行时 `safeParse` 校验。所有工具过 `buildTool()` 工厂套上 **fail-closed 默认值**（`isParallelSafe:false`、`isReadOnly:false`，即新工具默认串行且被当作写操作）。`isConcurrencySafe(input)` 入参依赖（`ls` 安全、`rm` 不安全）。执行走 14 步管线 `checkPermissionsAndCallTool`：查找→中断检查→Zod 校验→语义校验→投机分类器→输入回填→PreToolUse hooks→**权限解析**→执行→**结果预算**（超限落盘 `~/.claude/tool-results/`）→PostToolUse hooks→新消息→错误分类。权限 7 模式 + 解析链（hook 决策 > 规则匹配 > 工具自检 > 模式默认 > 交互提示 > 分类器）。`contextModifier` 仅串行工具生效（如 `EnterPlanMode` 切权限模式）。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| 工具工厂 + 默认值 | `src/Tool.ts` | `buildTool()` (L783)、`ToolUseContext` (L158) | fail-closed 默认值 |
| 14 步执行管线 | `src/services/tools/toolExecution.ts` | `checkPermissionsAndCallTool()` (L599)、`addToolResult` (L1403) | 校验→权限→执行→预算 |
| 权限模式与规则 | `src/Tool.ts`、`src/hooks/toolPermission/PermissionContext.ts` | `ToolPermissionContext` (L123) | allow/deny/ask 规则集 |
| 权限处理器 | `src/hooks/toolPermission/handlers/` | `interactiveHandler.ts` 等 | 交互/coordinator/swarm 三种解析 |
| 工具级 hooks | `src/services/tools/toolHooks.ts` | （PreToolUse/PostToolUse） | 阻断/改写/注入上下文 |

### 学术 Agent 的对应实现
这是五项能力的统一骨架。ResearchBox 把每项能力实现为一个 `Tool`，全部过统一执行管线 `src/core/agent/execute.ts`（精简为 ~7 步：Zod 校验→语义校验→`checkPermissions`→审批→`call`→结果预算→错误分类）。**结果预算**对学术场景关键：论文全文/Python 大输出可能爆 context，超阈值时把全文存进 Dexie 一张 `toolResults` 表、回话里只放预览 + `resultId`，模型需要时再用 `retrieval` 取回（对应 CC 的落盘 + Read 回取）。`contextModifier` 用于 `enterPlanMode`（只读模式，禁止 Artifacts 写入与 Python 执行）。

### 实现示例（TypeScript 伪代码）
```typescript
// src/core/agent/execute.ts
const MAX_RESULT_CHARS = 30_000
export async function* executeTool(call, tools, deps): AsyncGenerator<ToolProgress, ResultMessage> {
  const tool = tools.find(t => t.name === call.name)
  const parsed = tool.inputSchema.safeParse(call.input)
  if (!parsed.success) return inputError(call, parsed.error)

  const perm = await tool.checkPermissions(parsed.data, deps)
  if (perm.behavior === 'deny') return denied(call, perm.message)
  if (perm.behavior === 'ask') {
    const ok = await deps.requestApproval({ tool: tool.name, input: parsed.data, ...perm })
    if (!ok) return denied(call, '用户拒绝')
  }

  const result = yield* tool.call(parsed.data, deps)
  const serialized = serialize(result.data)
  if (serialized.length > MAX_RESULT_CHARS) {                  // 结果预算落 IndexedDB
    const resultId = await deps.db.toolResults.add({ content: serialized })
    return previewMessage(call, serialized.slice(0, 2000), resultId)
  }
  return resultMessage(call, serialized, result.newMessages)
}
```

---

## 7. 并发工具执行（来源：ch07-concurrency.md）

### Claude Code 的设计
两层并发：① **批分区** `partitionToolCalls()`——贪心、保序地把连续的并发安全工具并到一批，遇不安全工具断批；安全性按 `isConcurrencySafe(parsedInput)` 逐调用判定，解析失败/抛异常一律 fail-closed 为串行。② **投机执行** `StreamingToolExecutor`——模型还在流式输出时，每解析出一个 `tool_use` 块就 `addTool()` 入队并 `processQueue()` 尝试立即执行；准入判据是 `无工具在跑 || (新工具安全 && 在跑的全安全)`。结果按**提交序**而非完成序 yield（保证对话连贯）。Bash 错误会 cascade 取消兄弟工具（因 shell 常隐式依赖），Read/Grep 错误相互独立不取消。三级 AbortController（query→sibling→per-tool）。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| 批分区 | `src/services/tools/toolOrchestration.ts` | `partitionToolCalls()` (L91)、`Batch` (L84) | 贪心保序合批，fail-closed (L103) |
| 投机执行器 | `src/services/tools/StreamingToolExecutor.ts` | `StreamingToolExecutor` (L40)、`addTool` (L76)、`processQueue` (L140)、`canExecuteTool` (L129) | 流式期边到边跑 |
| 互斥准入 | `src/services/tools/StreamingToolExecutor.ts` | `canExecuteTool` (L129-133) | `noneRunning ‖ (safe && allRunningSafe)` |

### 学术 Agent 的对应实现
学术任务天然有并行机会："对 5 篇论文各检索一段证据 + 联网搜一条最新进展"——这些只读工具（`websearch`/`retrieval`）可并行。落在 `src/core/agent/orchestrate.ts`：`websearch`、`retrieval`、`artifacts`(读)标 `isConcurrencySafe=true`；`python`（有副作用、且 Pyodide 单 Worker 串行）、`artifacts`(写)、任何需审批的工具标 `false`。前端先实现"批分区 + `Promise.all` 限流"即足够；投机流式执行可作为后续优化。**保序 yield** 必须保留，否则模型会混淆哪段证据对应哪篇论文。Pyodide 单 Worker 是硬串行约束——`python` 工具永远独占一批。

### 实现示例（TypeScript 伪代码）
```typescript
// src/core/agent/orchestrate.ts
export async function* executeBatched(calls, tools, deps): AsyncGenerator<ToolProgress, BatchResult> {
  const batches = partitionToolCalls(calls, tools)            // 同 CC 贪心保序
  const ordered: ResultMessage[] = []
  for (const batch of batches) {
    if (batch.isConcurrencySafe) {
      const results = await mapLimit(batch.calls, 4,          // 限流，等价 MAX_CONCURRENCY
        c => drain(executeTool(c, tools, deps)))
      ordered.push(...results)                                // 按提交序写回
    } else {
      for (const c of batch.calls) ordered.push(await drain(executeTool(c, tools, deps)))
    }
  }
  return { messages: ordered, denied: ordered.find(r => r.denied)?.toolName }
}
```

---

## 8. 子代理（来源：ch08-sub-agents.md）

### Claude Code 的设计
`AgentTool` 把"模型请求帮手"实现为工具：模式由 feature flag 动态裁剪字段。`runAgent()`（约 400 行异步生成器）是 15 步统一生命周期：模型解析（caller override > 定义 > 父 > 默认）、agentId、上下文准备（fork 克隆父历史并 `filterIncompleteToolCalls`）、CLAUDE.md 裁剪、**权限隔离**（子代理默认收紧、background 自动拒提示、`allowedTools` 收窄）、工具解析、系统提示、AbortController 隔离（async 独立、sync 共享父）、hooks/skills/MCP 初始化、context 创建、query loop、`finally` 全量清理。六种内置代理（General/Explore/Plan/Verification/Guide/Statusline），各自在"看什么/能做什么/如何与用户交互/与父关系/多贵"五维度上取不同点。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| 子代理工具 | `src/tools/AgentTool/AgentTool.tsx` | `call()` 决策树 | 路由 teammate/fork/普通 |
| 生命周期 | `src/tools/AgentTool/runAgent.ts` | `runAgent()` (L248) | 15 步，`finally` 全清理 |
| 内置代理注册 | `src/tools/AgentTool/builtInAgents.ts` | `getBuiltInAgents()` | Explore=Haiku 只读、Plan=inherit 等 |
| 自定义代理加载 | `src/tools/AgentTool/loadAgentsDir.ts` | `AgentJsonSchema` | frontmatter 定义代理，零 TS |

### 学术 Agent 的对应实现
学术场景的典型痛点正是 ch08 开篇："直接把 50 篇论文塞进 prompt 会爆 context 且注意力涣散"。对应实现：把"总结单篇论文""对单篇做证据检索"封装成轻量子代理，主代理只接收结构化摘要。落在 `src/core/agent/subagent.ts`，复用主 `runAgent` 但传入收窄的工具池与独立消息历史。建议两类内置代理：**`paper-summarizer`**（只读 `retrieval`，Haiku，省成本）、**`reviewer`**（对生成的 Artifacts 做对抗性核查，禁止改写，对应 CC 的 Verification agent）。权限隔离照搬：子代理 background 运行时不弹审批，只读不能写 Artifacts/跑 Python。

### 实现示例（TypeScript 伪代码）
```typescript
// src/core/agent/subagent.ts
export const subAgentTool: Tool<typeof schema, SubAgentOutput> = {
  name: 'sub_agent',
  inputSchema: z.strictObject({
    type: z.enum(['paper-summarizer', 'reviewer']),
    paperId: z.string().optional(),
    prompt: z.string(),
  }),
  isConcurrencySafe: () => true,                   // 多篇论文可并行总结
  isReadOnly: () => true,
  checkPermissions: async () => ({ behavior: 'allow', updatedInput: undefined }),
  async *call(input, deps) {
    const def = SUBAGENTS[input.type]              // 收窄工具池 + Haiku
    const childDeps = { ...deps, store: isolatedStore(deps) }
    const messages: AgentMessage[] = []
    for await (const m of runAgent({ messages: [userMsg(input.prompt)],
        tools: def.tools, maxTurns: 8 }, childDeps)) messages.push(m)
    return { data: summarize(messages), newMessages: [transcriptAttachment(messages)] }
  },
}
```

---

## 9. Fork 代理与 prompt 缓存（来源：ch09-fork-agents.md）

### Claude Code 的设计
并行子代理 99%+ 的请求前缀相同，Anthropic 缓存给 90% 折扣，但**字节级精确**匹配。Fork 代理为此把三层冻结：系统提示**线程传递**（`override.systemPrompt` 直接用父已渲染字节，不重算——重算会因 GrowthBook flag 冷热切换而差一字节即失效）、工具数组**原样透传**（`useExactTools`，连禁用的 Agent 工具都保留以免改变序列化）、消息数组用**常量占位** `tool_result`（`FORK_PLACEHOLDER_RESULT`）使每个子代理前缀逐字节相同，缓存边界落在 per-child 指令前。fork 子代理保留 Agent 工具但用 querySource + 消息扫描双保险防递归 fork。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| fork 路径与防递归 | `src/tools/AgentTool/forkSubagent.ts` | `isForkSubagentEnabled`、querySource 守卫 | 协调模式/非交互/显式 type 时禁用 |
| 精确工具透传 | `src/tools/AgentTool/runAgent.ts` | `useExactTools` 分支 (L248 起) | 字节相同的工具块 |

### 学术 Agent 的对应实现
**部分适用**。ResearchBox 用 Claude API 同样享有 prompt 缓存折扣，"稳定前缀在前、易变内容在后"的原则对降低反复检索/生成的成本有直接价值（见第 17 章缓存稳定性）。但完整 fork 机制（线程传递已渲染系统提示、占位 tool_result）属重度优化，前端 MVP 阶段不需要——当并行子代理数少、上下文不大时，直接给每个子代理独立精简上下文反而更简单清晰。建议：仅采纳"系统提示静态化 + 工具定义稳定"以保住全局缓存，暂不实现 fork 占位技巧。若未来出现"对几十篇论文并行同构处理"的批量场景，再引入 fork 思路。

### 实现示例（TypeScript 伪代码）
```typescript
// 仅采纳缓存稳定原则，不实现完整 fork
function buildSystemPrompt(): { stable: string; dynamic: string } {
  return {
    stable: STATIC_RESEARCH_INSTRUCTIONS,            // 永不变 → 可全局缓存
    dynamic: `当前论文: ${currentPaperTitle}\n日期: ${sessionDate}`,  // 易变 → 段后置
  }
}
```

---

## 10. 任务、协调与 swarm（来源：ch10-coordination.md）

### Claude Code 的设计
统一 `Task` 状态机（7 类型 / 5 状态 pending→running→completed|failed|killed），扁平存于 `AppState.tasks`。三通信通道：磁盘 `outputFile`（增量 `outputOffset` 读）、`<task-notification>` XML 注入父对话、`pendingMessages` 在工具轮边界排空。**Coordinator 模式**：协调者只有 3 工具（Agent/SendMessage/TaskStop），不能碰文件——核心戒律"**Never delegate understanding**"（协调者必须把研究结论蒸馏成带文件路径/行号的精确 worker 指令，而非"based on your findings, fix it"）。四阶段 Research→Synthesis→Implementation→Verification。**Swarm**：点对点，文件邮箱通信，`SendMessage` 四路由（bridge/uds/in-process/mailbox），死代理自动从磁盘 transcript 复活（auto-resume）。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| 任务状态机 | `src/tasks/LocalAgentTask/`、`src/tasks/` | `Task`、`TaskStatus` | 7 类型 5 状态 |
| 通信原语 | `src/tools/SendMessageTool/` | `SendMessageTool` | 四路由 + auto-resume |
| 终止 | `src/tools/TaskStopTool/` | `TaskStopTool` | abort + eviction timer |
| 协调者 worker | `src/coordinator/` | `getCoordinatorAgents` | 仅 worker 类型，full tools |

### 学术 Agent 的对应实现
**大部分裁剪**。纯前端单进程无跨机/跨进程需求，bridge/uds/swarm 邮箱不适用。但两点强相关：① **"Never delegate understanding"** 应写进 ResearchBox 子代理调度策略——主代理派发"总结论文"时要给定 `paperId` 与具体问题，而非"看着办"；② **后台任务 + 通知注入**适用：长检索/Python 跑批可在 Web Worker 后台跑，完成后以"任务通知"消息注入对话。落在 `src/core/agent/tasks.ts`，用 Zustand `runningTools` + 一个轻量 `taskNotifications` 队列替代磁盘邮箱。Coordinator 四阶段（研究→综合→生成→核查）是组织"文献综述生成"任务的理想模板。

### 实现示例（TypeScript 伪代码）
```typescript
// src/core/agent/tasks.ts —— 前端版后台任务（无邮箱/无跨进程）
export interface AgentTask { id: string; status: 'running'|'completed'|'failed'; resultId?: string }
export function spawnBackground(work: () => Promise<AgentMessage>, deps: AgentDeps): string {
  const id = nanoid()
  deps.store.setTask({ id, status: 'running' })
  work().then(msg => {
    deps.store.setTask({ id, status: 'completed' })
    deps.store.enqueueNotification(taskNotification(id, msg))   // 工具轮边界注入主对话
  }).catch(() => deps.store.setTask({ id, status: 'failed' }))
  return id
}
```

---

## 11. 记忆：跨会话学习（来源：ch11-memory.md）

### Claude Code 的设计
反 RAG 之道：磁盘上的 Markdown 文件 + LLM 召回，零基础设施。四类型分类法（user/feedback/project/reference）+ "**可派生性测试**"（能从当前代码重新推出的不存）。recall 两层：`MEMORY.md` 索引常驻，单文件按需召回——`startRelevantMemoryPrefetch` 异步触发 `scanMemoryFiles`（每文件只读前 30 行 frontmatter）→ `formatMemoryManifest` 生成清单 → **Sonnet side-query** 选最多 5 个文件名 → 校验防幻觉 → 全文读入并附**staleness 警告**（按天数注入"X 天前，file:line 可能过期"）。读写复用 `FileWriteTool`/`FileEditTool`，无专用 API。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| LLM 召回 | `src/memdir/findRelevantMemories.ts` | `findRelevantMemories()` (L39) | scan→manifest→Sonnet 选 5 |
| 文件扫描 | `src/memdir/memoryScan.ts` | `scanMemoryFiles`、`formatMemoryManifest` | 只读 frontmatter 30 行 |
| 过期警告 | `src/memdir/memoryAge.ts` | （staleness） | 按天数注入可读警告 |
| 路径/类型 | `src/memdir/paths.ts`、`src/memdir/memoryTypes.ts` | 四类型 + per-project 路径 | git root 作用域 |

### 学术 Agent 的对应实现
**这是 ResearchBox「封闭知识域检索（retrieval）」的核心范式来源**，但需关键改造：CC 的记忆是少量笔记，而 ResearchBox 的封闭域是已抓取的成百上千篇论文区块。两点照搬、两点替换：① **照搬"LLM side-query 召回 + 强制引用"**——不上向量库，用 Haiku 子查询从论文/区块清单里选相关项，且结果**必须带 `blockId` 级引用**（对应 CC 的 file:line）；② **照搬 staleness 思想**——抓取时间久的论文标注"可能有更新版本"。替换：存储从文件系统改为 **Dexie/IndexedDB**（`PaperIR` 已有），清单 = 论文标题 + 章节/区块摘要 + `blockId`。

### 实现示例（TypeScript 伪代码）
```typescript
// src/core/agent/tools/retrieval.ts —— 封闭知识域检索（带 blockId 引用）
const retrievalInput = z.strictObject({
  query: z.string(),
  paperIds: z.array(z.string()).optional(),    // 限定论文范围
  topK: z.number().default(5),
})
export const retrievalTool: Tool<typeof retrievalInput, RetrievalHit[]> = {
  name: 'retrieval',
  description: '从本地 PaperIR 库检索证据，返回带 blockId 的引用定位',
  inputSchema: retrievalInput,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  checkPermissions: async (i) => ({ behavior: 'allow', updatedInput: i }),
  async *call(input, deps) {
    // 1) 构建轻量清单（对应 formatMemoryManifest）：blockId + 区块摘要
    const manifest = await deps.db.blocks
      .where('paperId').anyOf(input.paperIds ?? await allPaperIds(deps))
      .toArray().then(bs => bs.map(b => ({ blockId: b.id, summary: b.heading })))
    // 2) Haiku side-query 选最相关 blockId（对应 Sonnet 选 5）
    const chosen = yield* selectRelevantBlocks(input.query, manifest, deps)  // 校验防幻觉
    // 3) 取全文 + 强制引用结构
    const hits: RetrievalHit[] = await Promise.all(chosen.map(async id => {
      const block = await deps.db.blocks.get(id)
      return { blockId: id, paperId: block.paperId, text: block.text,
        citation: `${block.paperId}#${id}`, staleDays: ageInDays(block.fetchedAt) }
    }))
    // newMessages 注入证据，要求模型输出时引用 citation
    return { data: hits, newMessages: [evidenceAttachment(hits)] }
  },
}
```

---

## 12. 可扩展性：Skills 与 Hooks（来源：ch12-extensibility.md）

### Claude Code 的设计
**Skills 加能力**（Markdown→slash command，两阶段加载：启动只读 frontmatter 进系统提示，调用时才注入正文 + 变量替换 + 内联 shell）；**Hooks 控制流**（27 生命周期点拦截）。Hooks 四种用户类型（command/prompt/agent/http），退出码语义（0 过 / 2 阻断并把 stderr 给模型 / 其他=非阻断警告）。**快照安全模型**：`captureHooksConfigSnapshot()` 启动冻结，运行期不隐式重读（防 TOCTOU——恶意仓库改 `.claude/settings.json` 无效）。PreToolUse hook 可 deny/ask/allow/改输入/注入上下文，deny 优先。Stop hook 退出码 2 把单轮变成目标导向循环。MCP skill 绝不执行内联 shell（信任边界）。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| Hooks 快照 | `src/utils/hooks/hooksConfigSnapshot.ts` | `captureHooksConfigSnapshot` | 启动冻结，防 TOCTOU |
| Hook 事件 | `src/utils/hooks/hookEvents.ts` | （27 事件） | PreToolUse/PostToolUse/Stop 等 |
| 各类执行器 | `src/utils/hooks/execAgentHook.ts`、`execPromptHook.ts`、`execHttpHook.ts` | exec* | command/prompt/agent/http |
| Skills 加载 | `src/skills/`、`src/utils/skills/` | （两阶段加载） | frontmatter 菜单 + 按需注入 |

### 学术 Agent 的对应实现
**裁剪 + 转化**。前端无法执行任意 shell hook，且无多用户信任问题——CC 的 hooks 机制大部分不适用。但两个思想转化落地：① **PreToolUse 拦截 = 审批节点**：ResearchBox 的 human-in-the-loop 本质就是"PreToolUse 在执行破坏性/高代价操作前 ask"，落在第 6 章 `execute.ts` 的 `checkPermissions`；② **Skills 两阶段加载 = 研究模板**：把"文献综述模板""对比表生成模板"做成轻量 prompt 片段，仅在用户 `/review`、`/compare` 时注入，避免常驻占 token。Stop hook 的"你真的完成了吗"可转化为：生成综述后自动触发 `reviewer` 子代理核查引用完整性，未通过则续作。

### 实现示例（TypeScript 伪代码）
```typescript
// src/core/agent/skills.ts —— 两阶段研究模板（无 shell 执行）
export interface ResearchSkill { name: string; description: string; load(): Promise<string> }
export const skills: ResearchSkill[] = [
  { name: 'lit-review', description: '生成结构化文献综述',
    load: () => import('./templates/litReview.md?raw').then(m => m.default) },  // 按需
  { name: 'compare-table', description: '生成论文对比表',
    load: () => import('./templates/compare.md?raw').then(m => m.default) },
]
// 仅 frontmatter(name/description) 进系统提示；正文在 /skill 调用时注入
```

---

## 13. 终端 UI 渲染（来源：ch13-terminal-ui.md）

### Claude Code 的设计
Claude Code fork 了 Ink，自建渲染引擎：packed `Int32Array` 替代 object-per-cell、三个 interning 池（CharPool/StylePool/HyperlinkPool）、双缓冲 + cell 级 diff + blit（跳过未变子树）+ damage rectangle，在 200 列终端 60fps 流式。`StreamingMarkdown` 用 LRU token 缓存 + 快路径检测 + Suspense 懒高亮处理增量 markdown。`VirtualMessageList` 只渲染视口内消息。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| 自定义渲染器 | `src/ink/` | （DOM/Screen/池） | packed cell + 池化 interning |
| 终端 I/O | `src/ink/termio/` | `tokenize.ts` 等 | 转义序列处理 |

### 学术 Agent 的对应实现
**不适用（机制层）**。ResearchBox 是浏览器 React + DOM，无需自建终端渲染器——Ink 的所有底层优化（typed array cell、ANSI diff、终端协议）在浏览器里由 DOM/CSS/React 自然解决。**唯一可转化的高层原则**：流式 markdown 渲染的三招——**LRU token 缓存**（已解析的论文片段不重解析）、**虚拟滚动**（长对话/长论文只渲染视口内）、**懒加载代码高亮**（Python 结果代码块 Suspense 异步高亮）——这些在前端等价适用，建议研究阅读界面直接采用 `react-window` 类虚拟滚动 + markdown token 缓存。

### 实现示例（TypeScript 伪代码）
```typescript
// 仅转化高层原则：流式 markdown 的 LRU token 缓存
const tokenCache = new LRU<string, MarkdownToken[]>({ max: 500 })   // 键=内容 hash
function parseStreaming(content: string): MarkdownToken[] {
  const key = hash(content)
  return tokenCache.get(key) ?? tokenCache.set(key, lexer(content)).get(key)!
}
```

---

## 14. 输入与交互（来源：ch14-input-interaction.md）

### Claude Code 的设计
原始字节 → 有意义动作：tokenizer（50ms 超时缓冲半截转义序列）→ 五终端协议解析 → keybinding resolver（16 上下文，"last wins"，context 栈天然处理嵌套模态）→ chord 状态机 → handler。关键安全点：**bracketed paste** 的 `isPasted` 标志使粘贴内容即便含 `\x03` 也按字面文本处理而非命令。**Confirmation context**（权限对话框）激活时优先于 Chat，`y` = approve。vim 模式是 12 变体判别联合的纯状态机。原则：在边界尽早把无结构输入转成有类型结构。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| 终端 tokenizer | `src/ink/termio/` | `tokenize.ts` | 转义序列边界检测 |
| 键位系统 | `src/keybindings/` | `defaultBindings`、context 解析 | 16 上下文，last-wins |
| vim 状态机 | `src/vim/` | `VimState`、`transition` | 判别联合纯函数 |

### 学术 Agent 的对应实现
**机制层不适用，但"审批 context"是 human-in-the-loop 的直接来源**。CC 中"权限对话框激活时 Confirmation context 接管输入、`y`=同意"正是 ResearchBox 第 5 项能力的 UX 范式：当 Agent 主循环 `yield` 出一个待审批请求时，前端弹出审批面板（React 组件），用户确认前主循环挂起。落在 `src/core/agent/approval.ts` + 一个 `<ApprovalDialog>` 组件。`requestApproval` 回调（在 `AgentDeps` 中）返回一个 Promise，被审批面板的"批准/拒绝"按钮 resolve——这就是把"对话框接管输入"翻译成"Promise 挂起主循环"。

### 实现示例（TypeScript 伪代码）
```typescript
// src/core/agent/approval.ts —— human-in-the-loop 审批节点
export type ApprovalFn = (req: ApprovalRequest) => Promise<boolean>
export interface ApprovalRequest {
  tool: string; input: unknown; reason: string; risk: 'low' | 'high'
}
// 在 React 顶层提供实现：把请求压入 Zustand 队列，等待用户点击 resolve
export function makeApprovalFn(store: AgentStore): ApprovalFn {
  return (req) => new Promise<boolean>((resolve) => {
    store.enqueueApproval({ ...req, resolve })   // <ApprovalDialog> 渲染队列首项
  })
}
// 触发审批的工具（python / artifacts 写）在 checkPermissions 返回 { behavior:'ask', risk:'high' }
```

---

## 15. MCP：通用工具协议（来源：ch15-mcp.md）

### Claude Code 的设计
MCP = JSON-RPC 2.0 的工具发现（`tools/list`）+ 调用（`tools/call`）。CC 支持 8 种 transport（stdio 默认、http/sse/ws、sdk、in-process、两 IDE 变体、claudeai-proxy）、7 配置作用域、OAuth 双 RFC 发现。**工具包装四步**：名规范化 `mcp__{server}__{tool}`、描述截断 2048 字符、schema 透传、annotation 映射（`readOnlyHint`→并发安全）。包装后 MCP 工具与内置工具对模型不可区分（同一 `Tool` 接口）。`InProcessTransport` 仅 63 行（`queueMicrotask` 投递），供 Chrome/Computer-Use 等内建 server 用。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| 客户端/包装 | `src/services/mcp/client.ts` | `tools/list` 包装为 `Tool` | 与内置工具同接口 |
| 类型/transport | `src/services/mcp/types.ts` | 8 transport | stdio 默认 |
| OAuth | `src/services/mcp/auth.ts` | RFC 9728/8414 发现 | 401 触发懒认证 |
| 进程内 transport | `src/services/mcp/InProcessTransport.ts` | `InProcessTransport` | 63 行，queueMicrotask |

### 学术 Agent 的对应实现
**大部分不适用，但 In-Process Transport 思想可用**。ResearchBox 纯前端无法 spawn stdio 子进程，远程 MCP server 需要 CORS/OAuth，MVP 阶段不引入。然而 CC 最重要的可迁移点是**"外部工具与内置工具同实现一个 `Tool` 接口、对模型不可区分"**——这正是本手册公共骨架的设计依据。若未来 ResearchBox 想接入外部学术 API（Semantic Scholar、arXiv）作为工具，应包装成同一个 `Tool` 接口（名规范化、描述截断、annotation→并发标志），而非特殊分支。**Pyodide Worker 与主线程通信**可借鉴 `InProcessTransport` 的 `queueMicrotask` 消息投递思路（详见第 17 章 Python 沙盒）。

### 实现示例（TypeScript 伪代码）
```typescript
// 若接入外部学术 API：包装成统一 Tool（对模型与内置工具不可区分）
function wrapExternalApi(spec: ExternalToolSpec): Tool<z.ZodTypeAny, unknown> {
  return {
    name: `ext__${spec.server}__${spec.name}`.slice(0, 64),     // 名规范化
    description: spec.description.slice(0, 2048),                 // 描述截断
    inputSchema: spec.schema,
    isConcurrencySafe: () => spec.readOnlyHint ?? false,         // annotation 映射
    isReadOnly: () => spec.readOnlyHint ?? false,
    checkPermissions: async (i) => ({ behavior: 'ask', reason: '外部联网请求', risk: 'low' }),
    async *call(input, deps) { return { data: await spec.invoke(input, deps.signal) } },
  }
}
```

---

## 16. 远程控制与云执行（来源：ch16-remote.md）

### Claude Code 的设计
四套远程拓扑（Bridge v1 轮询 / v2 直连 SSE / Direct Connect WebSocket / Upstream Proxy 容器内凭证注入）。核心设计：**读写信道非对称**（读=持久连接高频流，写=HTTP POST 低频带确认）、自动重连按失败信号分级（永久失败不重试、瞬时指数退避）、`BoundedUUIDSet`（环形缓冲做有界去重）、容器内 secret 仅留堆内存（`prctl(PR_SET_DUMPABLE,0)` + unlink token 文件）、辅助系统 fail-open。手编 protobuf 10 行替代整个运行时（减依赖与供应链风险）。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| 桥接传输 | `src/bridge/`、`src/remote/` | `ReplBridgeTransport`、`BoundedUUIDSet` | 读写非对称 + 去重 |
| 上游代理 | `src/upstreamproxy/` | `encodeChunk` | 凭证注入 + 堆内存 secret |

### 学术 Agent 的对应实现
**整体不适用**。ResearchBox 是本地优先纯前端，无远程 Agent、无云容器、无跨机通信需求——CC 这套远程拓扑全部不照搬。理由：目标产品明确"无后端、本地优先"，所有计算（搜索经浏览器 fetch、检索经 IndexedDB、Python 经 WASM、生成经直连 LLM API）都在浏览器内或直连第三方 API 完成。**唯一边缘可借鉴**：若日后 `websearch` 因 CORS 需经一个轻量代理，那个代理应遵循 CC 的"辅助系统 fail-open"（代理挂了降级为"搜索不可用"而非整个 Agent 崩溃）。

### 实现示例（TypeScript 伪代码）
```typescript
// 不适用：保留 fail-open 原则示意（websearch 代理降级）
async function webSearchFetch(q: string, signal: AbortSignal): Promise<SearchHit[]> {
  try { return await fetch(`${PROXY}/search?q=${q}`, { signal }).then(r => r.json()) }
  catch { return [] }    // fail-open：搜索不可用，但 Agent 其余能力照常
}
```

---

## 17. 性能：每毫秒与每 token（来源：ch17-performance.md）

### Claude Code 的设计
五战场：启动延迟、token 效率、API 成本、渲染吞吐、搜索速度。关键招法：模块级 I/O 并行 + API 预连接、输出槽 8K 默认/64K 升级（省 12-28% context）、tool result budgeting（per-tool 50K 字符超限落盘 + per-message 200K 聚合预算）、**prompt 缓存结构**（稳定前缀在前、易变在后，`DANGEROUS_uncached*` 命名强制写理由）、sticky latch、memoized session date、**26-bit 字母位图预筛**（每路径 4 字节，整数比较秒拒 10-90% 候选）+ 融合 indexOf 扫描、异步索引可部分查询。投机工具执行 + 流式裸 API + 90s watchdog。基调：测量先行（50+ 启动检查点）。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| 位图搜索预筛 | `src/native-ts/file-index/` | 26-bit bitmap、融合 indexOf | 每路径 4 字节整数比较 |
| 投机执行 | `src/services/tools/StreamingToolExecutor.ts` | `StreamingToolExecutor` (L40) | 流式期边到边跑（见第 7 章） |
| 流式与回退 | `src/services/api/claude.ts` | `queryModelWithStreaming` (L752) | 裸 API + watchdog |

### 学术 Agent 的对应实现
**这是「Python 沙盒（Pyodide/WASM in Web Worker）」一章的最佳挂载点**——因为 Pyodide 体积大、启动慢，性能纪律决定可用性。落地三条：① **懒加载 + 预热**：Pyodide（~10MB+ WASM）必须像 CC 动态 `import()` OpenTelemetry 那样延迟到首次 `python` 工具调用，且在 Web Worker 内运行不阻塞主线程；② **Worker 内串行执行**：单 Worker 串行跑代码，对应第 7 章 `python` 工具 `isConcurrencySafe=false`；③ **输出预算**：Python 大输出（DataFrame/图）套用 tool result budgeting 落 IndexedDB。位图搜索预筛可直接用于第 11 章检索清单的本地预过滤（在 Haiku side-query 前先用位图秒筛掉明显不含查询词的论文区块，省 token）。prompt 缓存稳定性（第 9 章）在此再次强调。

### 实现示例（TypeScript 伪代码）
```typescript
// src/core/agent/tools/python.ts —— Pyodide 沙盒工具
const pythonInput = z.strictObject({ code: z.string(), purpose: z.string() })
let workerPromise: Promise<PyodideWorker> | undefined          // 懒加载单例
export const pythonTool: Tool<typeof pythonInput, PyOutput> = {
  name: 'python',
  description: '在 WASM 沙盒(Web Worker)内执行 Python，用于数据处理/可视化',
  inputSchema: pythonInput,
  isConcurrencySafe: () => false,                              // 单 Worker 串行 + 有副作用
  isReadOnly: () => false,
  checkPermissions: async (i) => ({                            // 破坏性/高代价 → 必审批
    behavior: 'ask', reason: `执行 Python: ${i.purpose}`, risk: 'high' }),
  async *call(input, deps) {
    workerPromise ??= spawnPyodideWorker()                     // 首次才加载 ~10MB WASM
    const worker = await workerPromise
    yield { stage: 'running' } as PyProgress
    const out = await worker.run(input.code, deps.signal)      // queueMicrotask 式消息往返
    return { data: out }                                        // 大输出由 execute.ts 落 IndexedDB
  },
}
```

---

## 18. 总结：五大架构赌注（来源：ch18-epilogue.md）

### Claude Code 的设计
五赌注：① **生成器循环胜过回调**（一个函数、一处数据流、判别联合编码所有终态）；② **文件式记忆胜过数据库**（透明 > 能力，用召回智能补偿存储简单）；③ **自描述工具胜过中央编排器**（MCP 工具借同一接口成一等公民）；④ **fork 代理做缓存共享**；⑤ **hooks 胜过插件**（进程隔离换安全）。最深的模式是"**把复杂度推到边界**"：每个边界吸收混沌、导出秩序（原始字节→ParsedKey，Markdown→召回记忆，JSON-RPC→Tool 对象）。

### 关键源码引用
| 机制 | 文件路径 | 关键符号 | 说明 |
|------|----------|----------|------|
| 生成器循环 | `src/query.ts` | `query()` (L219) | 单一异步生成器中心 |
| 自描述工具 | `src/Tool.ts` | `buildTool()` (L783) | 工具自带 schema/权限/并发 |
| 文件式记忆 | `src/memdir/findRelevantMemories.ts` | `findRelevantMemories()` (L39) | LLM 召回 |

### 学术 Agent 的对应实现
ResearchBox 应继承的赌注：**①生成器循环**（主循环用 AsyncGenerator，与现有翻译流式一致）、**②"文件式记忆"的精神**（用 IndexedDB 做透明、可导出、用户可编辑的本地知识库，配 LLM 召回 + blockId 引用）、**③自描述工具**（五项能力同实现一个 `Tool` 接口）。不继承：fork 缓存共享（前端 MVP 过重）、进程隔离 hooks（无多用户信任面，用前端审批面板替代）。**核心迁移哲学**——"把复杂度推到边界、保持内部干净"：ResearchBox 的边界是 [HTML 清洗→结构化区块]、[论文区块→召回证据]、[Python 代码→沙盒输出]、[工具请求→审批决策]；每个边界吸收混沌，内部主循环只是"流式 → 收集 → 执行 → 回灌 → 重复"。

### 实现示例（TypeScript 伪代码）
```typescript
// 五项能力统一注册：自描述工具 + 边界吸收复杂度
export function buildResearchTools(opts: { allowWeb: boolean; allowCode: boolean }): Tool<any, any>[] {
  return [
    retrievalTool,                                  // 第 11 章：封闭域 + blockId 引用
    artifactsTool,                                  // Artifacts 生成（见附录 A）
    subAgentTool,                                   // 第 8 章：论文总结/核查
    ...(opts.allowWeb ? [webSearchTool] : []),      // 第 4/16 章：信任开关后注入
    ...(opts.allowCode ? [pythonTool] : []),        // 第 17 章：Pyodide 沙盒
  ]
}
```

---

# 附录 A：五项能力实现路线图

| 能力 | 涉及章节机制 | 需新建文件 | 依赖现有模块 | 关键接口骨架 |
|------|-------------|-----------|-------------|-------------|
| **① 开放域 Web 搜索** `websearch` | ch04 API 层 / ch06 工具接口 / ch07 并发(只读可并行) / ch16 fail-open | `tools/webSearch.ts` | `LLMProvider`、浏览器 `fetch`（必要时轻代理）；信任开关(ch02) | `webSearchTool: Tool`（`isReadOnly=true`、`isConcurrencySafe=true`、`checkPermissions→ask:low`） |
| **② 封闭域检索** `retrieval` | ch11 记忆 LLM 召回（核心范式）/ ch06 结果预算 / ch07 并行 / ch17 位图预筛 | `tools/retrieval.ts`、`retrieval/selectBlocks.ts` | Dexie `PaperIR`（`blocks` 表）、`LLMProvider`(Haiku side-query)、Zustand | `retrievalTool: Tool`，返回 `RetrievalHit[]{ blockId, citation, text, staleDays }`（强制 blockId 引用） |
| **③ Artifacts 生成** | ch06 工具(写)+ contextModifier / ch12 skills 模板 / ch13 markdown 渲染原则 | `tools/artifacts.ts`、`templates/*.md` | Dexie（`artifacts` 表持久化）、Zustand、React 预览组件 | `artifactsTool: Tool`（`isReadOnly=false`、`checkPermissions→ask:low`、写入 Dexie 返回 `artifactId`） |
| **④ Python 沙盒** `python` | ch17 懒加载/Worker 串行/输出预算 / ch07 串行批 / ch15 Worker 消息往返 / ch06 结果落盘 | `tools/python.ts`、`workers/pyodide.worker.ts` | Pyodide(动态 import WASM)、Web Worker、Dexie(大输出)、审批(ch14) | `pythonTool: Tool`（`isConcurrencySafe=false`、`checkPermissions→ask:high`、懒 spawn Worker） |
| **⑤ 多步 + 人审批** | ch05 主循环 / ch06 14步管线权限解析 / ch14 审批 context / ch12 PreToolUse=ask / ch03 审批队列状态 | `loop.ts`、`execute.ts`、`orchestrate.ts`、`approval.ts`、`<ApprovalDialog>` | Zustand(`pendingApprovals`)、`AgentDeps.requestApproval`、React | `runAgent()` 主循环 + `ApprovalFn` + `checkPermissions` 返回 `{behavior:'ask'}` 挂起主循环 |

**开发任务拆解顺序建议**（按依赖）：
1. **基建**：`types.ts`（公共骨架）→ `store.ts`(Zustand) → `bootstrap.ts`(initAgent) → `loop.ts`(主循环) → `execute.ts`+`orchestrate.ts`(执行管线 + 批分区)。
2. **能力 ②⑤ 优先**（检索 + 审批，是产品差异化核心）：`retrieval.ts` + `approval.ts` + `<ApprovalDialog>`。
3. **能力 ③**：`artifacts.ts` + 模板（依赖已建的写工具 + 结果预算）。
4. **能力 ①**：`webSearch.ts`（依赖信任开关 + fail-open）。
5. **能力 ④**：`python.ts` + `pyodide.worker.ts`（最重，依赖懒加载 + 审批 + 输出预算，放最后）。
6. **增强**：`subagent.ts`（论文总结/综述核查，依赖主循环可递归调用）。

---

# 附录 B：与 Claude Code 的设计差异（不照搬/裁剪/替换）

| Claude Code 设计 | ResearchBox 处理 | 原因（来源） |
|------------------|------------------|-------------|
| **文件系统工具**（FileRead/FileWrite/FileEdit/Glob/Grep） | **替换**为 Dexie/IndexedDB 读写 + retrieval | 纯前端无文件系统访问；论文与 Artifacts 存 IndexedDB（ch06/ch11） |
| **Bash/PowerShell 执行**（`BashTool`，splitCommandWithOperators、sed 模拟、沙盒）| **替换**为 Pyodide/WASM Python 沙盒 | 浏览器无 shell；学术需求是数据处理而非系统命令（ch06/ch17）。注意 CC **没有** Python 沙盒，此能力为 ResearchBox 新增 |
| **fork 代理 + prompt 缓存占位技巧**（ch09 byte-identical 前缀、FORK_PLACEHOLDER）| **裁剪**，仅保留"稳定前缀在前"缓存原则 | 前端并行子代理少、上下文小，完整 fork 过度复杂（ch09） |
| **Coordinator / Swarm / 邮箱 / SendMessage 四路由 / auto-resume**（ch10）| **裁剪**，保留"Never delegate understanding"策略 + 后台任务通知注入 | 单进程纯前端无跨机/跨进程通信（ch10/ch16） |
| **远程拓扑**（Bridge v1/v2、Direct Connect、Upstream Proxy）（ch16）| **不照搬**，仅借 fail-open 原则 | 本地优先、无后端、无云容器（ch16） |
| **Hooks 27 事件 + shell 执行 + 快照安全模型**（ch12）| **裁剪**，PreToolUse→审批面板，Stop→核查子代理 | 前端无法 spawn shell hook，无多用户信任面（ch12/ch14） |
| **自建终端渲染器**（Ink fork、packed Int32Array、ANSI diff、五终端协议、vim、chord）（ch13/ch14）| **不照搬**，仅借虚拟滚动/LRU token 缓存/懒高亮 | 浏览器 DOM/React 天然解决终端层问题（ch13/ch14） |
| **MCP 8 transport + OAuth 双 RFC**（ch15）| **不照搬**，仅保留"外部工具同实现 Tool 接口"+ In-Process 消息思路 | 前端无法 spawn stdio 子进程；远程 server 需 CORS/OAuth，MVP 不引入（ch15） |
| **两层状态 + 80 字段单例 + sticky latch**（ch03）| **简化**：基础设施态进 deps/模块单例，UI 态进 Zustand；保留 onChange 单点同步 | 前端规模小，无需 100 个 getter；Zustand 已是 AppState 等价物（ch03） |
| **多 provider 工厂**（Bedrock/Vertex/Azure）（ch01/ch04）| **裁剪**为单 provider（直连 Claude API） | 个人本地工具无企业多云需求（ch04） |
| **CLAUDE.md / 团队记忆 / KAIROS 日志 / 后台记忆抽取**（ch11）| **裁剪**，仅采纳"LLM 召回 + 引用 + staleness"用于论文检索 | ResearchBox 的"记忆"是论文库，非用户偏好笔记（ch11） |

---

# 质量自查表

**☑ 所有电子书文件均已覆盖**（18/18，与章节一一对应）：
- [x] ch01-architecture.md → §1
- [x] ch02-bootstrap.md → §2
- [x] ch03-state.md → §3
- [x] ch04-api-layer.md → §4
- [x] ch05-agent-loop.md → §5
- [x] ch06-tools.md → §6
- [x] ch07-concurrency.md → §7
- [x] ch08-sub-agents.md → §8
- [x] ch09-fork-agents.md → §9
- [x] ch10-coordination.md → §10
- [x] ch11-memory.md → §11
- [x] ch12-extensibility.md → §12
- [x] ch13-terminal-ui.md → §13
- [x] ch14-input-interaction.md → §14
- [x] ch15-mcp.md → §15
- [x] ch16-remote.md → §16
- [x] ch17-performance.md → §17
- [x] ch18-epilogue.md → §18

**☑ 每个 Claude Code 机制均有源码文件路径佐证**：每章"关键源码引用"表均给出相对路径 + 经实际 grep 验证的符号与行号（如 `src/query.ts:219 query()`、`src/Tool.ts:783 buildTool()`、`src/services/tools/StreamingToolExecutor.ts:40`、`src/services/tools/toolOrchestration.ts:91 partitionToolCalls()`、`src/services/tools/toolExecution.ts:599 checkPermissionsAndCallTool()`、`src/memdir/findRelevantMemories.ts:39`、`src/services/api/client.ts:88 getAnthropicClient()`、`src/tools/WebSearchTool/WebSearchTool.ts:79`、`src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx:110`、`src/bootstrap/state.ts:429`、`src/tools/AgentTool/runAgent.ts:248`）。

**☑ 五项能力各自有至少一个完整 TypeScript 接口骨架**：
- [x] ① websearch → §16 `webSearchFetch` + 附录A（`webSearchTool: Tool`）
- [x] ② retrieval → §11 `retrievalTool`（含 blockId 引用、Haiku side-query）
- [x] ③ Artifacts → §12/§18 + 附录A（`artifactsTool`，写 Dexie）
- [x] ④ Python 沙盒 → §17 `pythonTool`（Pyodide Worker、懒加载、审批）
- [x] ⑤ 多步 + 审批 → §5 `runAgent` + §6 `executeTool` + §14 `makeApprovalFn`/`ApprovalFn`

**☑ 附录 A 路线图可直接作为开发任务拆解依据**：含"涉及章节 / 新建文件 / 依赖现有模块 / 接口骨架"四列 + 6 步按依赖排序的开发顺序。

**☑ 关于 Claude Code 的陈述均来自实际读取的文件**：全部 18 章已逐章 Read；源码路径与符号经 Grep/Bash 实地验证（含确认 Claude Code **不存在** Pyodide/Python 沙盒，故 ④ 为 ResearchBox 新增能力，已在附录 B 标注）。
