# ResearchBox 开发手册

> 本文档由代码遍历自动生成，描述项目整体架构、各模块职责及关键接口。  
> 技术栈约定详见 `CLAUDE.md`；业务功能描述详见 `ResearchBox-技术手册.md`。

---

## 目录

1. [项目概览](#1-项目概览)
2. [技术栈与工具链](#2-技术栈与工具链)
3. [目录结构总览](#3-目录结构总览)
4. [核心层 `src/core/`](#4-核心层-srccore)
5. [数据库层 `src/db/`](#5-数据库层-srcdb)
6. [状态管理层 `src/store/`](#6-状态管理层-srcstore)
7. [UI 层 `src/ui/` 与页面 `src/pages/`](#7-ui-层-srcui-与页面-srcpages)
8. [PWA 层 `src/pwa/`](#8-pwa-层-srcpwa)
9. [国际化层 `src/i18n/`](#9-国际化层-srci18n)
10. [数据流与架构全图](#10-数据流与架构全图)
11. [关键数据类型速查](#11-关键数据类型速查)
12. [LLM Provider 接入](#12-llm-provider-接入)
13. [翻译流水线](#13-翻译流水线)
14. [调色盘与主题系统](#14-调色盘与主题系统)
15. [Research Agent（ChatBox）](#15-research-agentchatbox)
16. [测试约定](#16-测试约定)

---
## 0. 开发者寄语
Vibe Coding 太好用了，你们知道吗？
———— Phant (所有东西只有这一句话是我手写的)

## 1. 项目概览

ResearchBox 是一个运行在浏览器的 **arXiv 论文阅读 + AI 翻译 + 研究助手 PWA**。核心能力分两条主线：

**Paper Box（论文库）**  
用户粘贴 arXiv 论文 ID，应用自动抓取论文 HTML，解析成结构化 IR，再调用用户配置的 LLM Provider 批量翻译，最终以「原文 / 译文 / 双语」三种模式呈现。

**ChatBox（研究 Agent）**  
在项目上下文中与 LLM 对话，Agent 可检索 Paper Box 内论文、执行外部学术搜索、推荐论文入库、保存研究产出（Artifact），并在用户授权下执行 Web 搜索与 Python 代码（Pyodide WASM 沙箱）。

所有数据持久化在浏览器 IndexedDB，支持离线阅读。

核心价值主张：
- **本地优先**：数据存 IndexedDB，无需后端，可安装为 PWA。
- **Provider 自带**：用户填写自己的 API Key，选择 OpenAI / Anthropic / Gemini / DeepSeek / OpenRouter / SiliconFlow 等 Provider。
- **断点续传**：翻译中断后重启可从断点继续，而非重新翻译。
- **多项目隔离**：论文、标注、Agent 会话、Artifact 按「项目/工作区」隔离，互不影响。
- **采集 / 研究双模式**：ChatBox 支持「盒子打开」（可外部搜索 + 推荐入库）与「盒子关闭」（仅 Paper Box 内检索）两种边界。

---

## 2. 技术栈与工具链

| 层次 | 技术 |
|------|------|
| 框架 | React 19 + Vite 8 |
| 路由 | React Router v7（Hash 模式） |
| 状态 | Zustand v5 |
| 持久化 | Dexie.js v4（IndexedDB） |
| 样式 | Tailwind CSS v4（无运行时 CSS-in-JS） |
| 数据校验 | Zod v4 |
| 数学渲染 | KaTeX v0.17 |
| HTML 清洗 | DOMPurify v3 |
| 浮层/弹出 | @floating-ui/react |
| Markdown | react-markdown + remark-gfm |
| Python 沙箱 | Pyodide v3.14（Web Worker） |
| OCR | tesseract.js v6 |
| PWA | vite-plugin-pwa（Workbox） |
| 单测 | Vitest + @testing-library/react + fake-indexeddb |
| E2E | Playwright |
| TypeScript | v6，strict 模式 |

**命令速查**

```bash
npm run dev          # 启动开发服务器
npm run build        # 类型检查 + 生产构建
npm run build:pages  # GitHub Pages 构建（相对路径 base）
npm run typecheck    # tsc --noEmit
npm run test         # vitest run（单测）
npm run test:watch   # vitest（watch 模式）
npm run test:e2e     # playwright test
npm run test:e2e:install  # 安装 Playwright Chromium
```

---

## 3. 目录结构总览

```
ResearchBox/
├── src/
│   ├── main.tsx              # 入口：挂载 Root，初始化 PWA 和 StorageStore
│   ├── App.tsx               # 路由配置（HashRouter）
│   ├── index.css             # 全局样式（Tailwind 指令）
│   ├── test-setup.ts         # Vitest 全局配置
│   │
│   ├── core/                 # 框架无关纯 TypeScript（见第 4 节）
│   │   ├── agent/            # Research Agent 核心（见第 15 节）
│   │   ├── annotation/       # 标注数据结构 + range 工具
│   │   ├── brand/            # 品牌信息（Credits）
│   │   ├── cache/            # Service Worker 图片缓存
│   │   ├── citation/         # 引用管理（占位模块）
│   │   ├── cleaner/          # arXiv HTML → CleanResult
│   │   ├── colorPalette/     # 调色盘 schema + CSS 变量映射
│   │   ├── fetcher/          # 抓取论文 HTML
│   │   ├── i18n/             # 国际化工具函数
│   │   ├── ir/               # PaperIR schema（全项目数据事实来源）
│   │   ├── llm/              # LLM Provider 抽象
│   │   ├── math/             # TeX/MathML 处理
│   │   ├── media/            # 图片 URL 处理
│   │   ├── network/          # 离线检测
│   │   ├── paper/            # Paper（论文条目）schema
│   │   ├── pipeline/         # 端到端流水线（加载 + 翻译）
│   │   ├── project/          # Project（工作区）schema
│   │   ├── reader/           # 阅读器布局辅助
│   │   ├── settings/         # 全局设置 schema
│   │   ├── storage/          # 备份/恢复逻辑
│   │   ├── toc/              # 目录提取
│   │   └── transformer/      # CleanResult → PaperIR + 翻译引擎
│   │
│   ├── db/                   # Dexie 数据库封装（见第 5 节）
│   │   ├── index.ts          # 数据库定义 + 核心 CRUD
│   │   ├── annotations.ts    # 标注 CRUD
│   │   ├── paperEntries.ts   # Paper 条目 CRUD
│   │   ├── projects.ts       # Project CRUD
│   │   ├── agentSessions.ts  # Agent 会话 CRUD
│   │   └── backup.ts         # 导出/导入
│   │
│   ├── store/                # Zustand stores（见第 6 节）
│   │   ├── agentStore.ts     # ChatBox Agent UI 状态
│   │   ├── annotationStore.ts
│   │   ├── paperStore.ts
│   │   ├── projectStore.ts
│   │   ├── readerPanelWidth.ts
│   │   ├── readerStore.ts
│   │   ├── readerTocStore.ts
│   │   ├── settingsStore.ts
│   │   ├── storageStore.ts
│   │   ├── translationJobStore.ts
│   │   └── translationSmoothing.ts
│   │
│   ├── ui/                   # React 组件库（见第 7 节）
│   │   ├── ai-panel/         # ChatBox 聊天 UI
│   │   ├── brand/
│   │   ├── reader/           # 论文渲染组件
│   │   │   └── toc/          # 目录导航组件
│   │   ├── settings/         # 设置页面组件
│   │   └── shell/            # 应用外壳（Sidebar、AppShell 等）
│   │
│   ├── pages/                # 路由级页面
│   │   ├── Welcome.tsx       # 首页（未选项目）
│   │   ├── AgentChat.tsx     # ChatBox Agent 主页面
│   │   ├── ChatBoxArtifacts.tsx  # Artifact 浏览页
│   │   ├── PaperBox.tsx      # 论文列表页
│   │   ├── Reader.tsx        # 论文阅读/翻译页
│   │   ├── NoProject.tsx     # 无效项目 ID 提示页
│   │   └── Dummy.tsx         # 占位页
│   │
│   ├── workers/
│   │   └── pyodide.worker.ts # Pyodide Web Worker
│   │
│   ├── pwa/                  # PWA 注册与界面
│   └── i18n/                 # React hook + 组件（消费 core/i18n）
│
├── tests/                    # E2E 测试（Playwright）
├── scripts/                  # 性能基准脚本
├── public/                   # 静态资源（图标等）
├── index.html
├── vite.config.ts
├── tsconfig.json
└── playwright.config.ts
```

---

## 4. 核心层 `src/core/`

> 铁律：此目录下所有代码不得 import React，不得直接操作 DOM（`media` 模块除外），可被 Vitest 在 node/jsdom 中单独测试。

### 4.1 `core/ir` — 内部表示（IR）

**职责**：定义 `PaperIR`，全项目唯一的论文数据事实来源。

**导出**

| 名称 | 类型 | 说明 |
|------|------|------|
| `BlockTypeEnum` | `z.ZodEnum` | heading / paragraph / math / figure / table / list / codeblock / reference |
| `BlockSchema` | `z.ZodObject` | 最小结构化单元 |
| `PaperIRSchema` | `z.ZodObject` | 整篇论文 |
| `ReferenceSchema` | `z.ZodObject` | 参考文献条目 |
| `Block` | `type` | `z.infer<typeof BlockSchema>` |
| `PaperIR` | `type` | `z.infer<typeof PaperIRSchema>` |
| `Reference` | `type` | `z.infer<typeof ReferenceSchema>` |

**`Block` 关键字段**

```ts
{
  id: string;           // 全文唯一，由 Cleaner 生成，贯穿全生命周期
  type: BlockType;
  level?: number;       // heading 的层级（h1=1, h2=2 ...）
  content: string;      // 原文 HTML（figure 为完整图 HTML，含 img 标签）
  caption?: string;     // figure 专有：图注纯文本（翻译目标）
  translation?: string; // LLM 翻译结果
  math?: { tex: string; display: boolean }; // math block 额外信息
  meta?: Record<string, unknown>; // debug 指标等扩展字段
}
```

**`PaperIR` 关键字段**

```ts
{
  arxivId: string;
  version: string;      // "latest" | "v2" | ...
  title: string;
  abstract: string;     // 摘要原始 HTML
  abstractBlocks: Block[];  // 摘要结构化 blocks
  authors: string[];
  blocks: Block[];      // 正文 blocks
  references: Reference[];
  createdAt: number;
  modelUsed: string;    // 翻译时使用的模型标签
}
```

---

### 4.2 `core/paper` — 论文条目元数据

**职责**：描述一次「导入任务」的状态，与 IR 解耦。

**导出**

| 名称 | 说明 |
|------|------|
| `PaperSchema` | Paper Zod schema |
| `PaperStatusEnum` | `"ready" \| "processing" \| "done" \| "error"` |
| `Paper` | 类型 |
| `resolvePaperEntryStatus(ir)` | 根据 IR 推断 Paper 应有的状态 |
| `shouldShowPaperStatusBadge(paper, translationRunning)` | 是否在卡片上展示状态徽章 |

**复合主键**：`[projectId, routeId]`，同一篇论文可以同时存在于多个项目。

---

### 4.3 `core/project` — 工作区

**职责**：顶层项目/工作区的数据结构。

```ts
// ProjectSchema
{ id: string; name: string; createdAt: number; updatedAt: number }
```

---

### 4.4 `core/settings` — 全局设置

**导出**：`AppSettingsSchema`、`AppSettings` 类型、`DEFAULT_SETTINGS`、`ViewModeSchema`、`ViewMode`、`WebSearchProviderSchema`。

**`AppSettings` 字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| `activeProviderId` | `string \| null` | 当前选中的 LLM Provider |
| `viewMode` | `"original" \| "translation" \| "bilingual"` | 阅读视图模式 |
| `targetLang` | `string` | 翻译目标语言（默认 `"zh"`） |
| `debugMode` | `boolean` | 是否显示调试指标 |
| `uiLocale` | `"zh" \| "en"` | UI 界面语言 |
| `lastProjectId` | `string \| null` | 上次活跃项目 |
| `activePaletteId` | `string \| null` | 当前调色盘 ID |
| `customPalette` | `ColorPalette \| null` | 自定义调色盘（未保存） |
| `semanticScholarApiKey` | `string` | Semantic Scholar API Key |
| `openAlexApiKey` | `string` | OpenAlex API Key |
| `allowWeb` | `boolean` | 是否允许 Agent 使用 Web 搜索 |
| `allowCode` | `boolean` | 是否允许 Agent 执行 Python |
| `webSearchProvider` | `"tavily" \| "perplexity"` | Web 搜索后端 |
| `tavilyApiKey` | `string` | Tavily API Key |
| `perplexityApiKey` | `string` | Perplexity API Key |
| `permissionMode` | `"default" \| "ask"` | Agent 工具审批模式 |

---

### 4.5 `core/annotation` — 标注

**导出**

| 名称 | 说明 |
|------|------|
| `AnnotationSchema` | 标注 Zod schema |
| `TextAnchorSchema` | 文本锚点（blockId + 偏移） |
| `Annotation` / `TextAnchor` | 类型 |
| `makePaperId(arxivId, version)` | 生成 paperId 字符串（`arxivId:version`） |
| `range.ts` | 文本范围比较/合并辅助函数 |

---

### 4.6 `core/fetcher` — 抓取论文 HTML

**主函数**

```ts
fetchPaperHtml(
  id: string,
  version: string | null,
  deps?: { fetchFn?; caches?; cacheImages? }
): Promise<{ html: string; source: "arxiv" | "ar5iv"; resolvedUrl: string }>
```

逻辑：先请求 `arxiv.org/html/{id}{version}/`，失败则 fallback 到 `ar5iv.org/html/{id}/`。抓取成功后调用 `cachePaperImages` 缓存图片到 Service Worker Cache。抛出 `NoHtmlVersionError`（两端均失败时）。

**`parseArxivId(input)`**：解析论文 ID，接受 URL / 纯 ID / 带版本号格式，返回 `{ id, version: string | null } | null`。

---

### 4.7 `core/cleaner` — HTML 清洗

**主函数**

```ts
cleanArxivHtml(
  html: string,
  source: "arxiv" | "ar5iv",
  resolvedUrl: string
): CleanResult
```

**`CleanResult`**

```ts
{
  title: string;
  authors: string[];
  abstract: string;
  abstractBlocks: CleanBlock[];
  blocks: CleanBlock[];       // 正文 blocks，已去掉 boilerplate
  references: CleanReference[];
}
```

流程：DOMPurify → 删除导航/页眉/页脚 boilerplate → 递归 walk DOM 树 → 识别 block 类型（heading/paragraph/math/figure/table/list/codeblock/reference）→ 为每个 block 生成稳定 `id` → 绝对化图片 URL → 规范化 TeX → 剔除 MathML source annotation。

---

### 4.8 `core/transformer` — 翻译引擎

**主要导出**

| 名称 | 说明 |
|------|------|
| `transformToIR(cleaned, provider, opts)` | `CleanResult` → `AsyncGenerator<TransformProgress>`（新翻译） |
| `resumeTranslation(cachedIr, provider, opts)` | 从缓存 IR 续翻 |
| `applyTranslationToIr(ir, blockId, translation)` | 将单块译文写入 IR |
| `isPaperTranslationComplete(ir)` | 检查翻译是否全部完成 |
| `isTranslatableBlock(block)` | 是否需要翻译 |
| `hasCompleteTranslation(block)` | block 是否已有完整译文 |
| `stripTranslationsFromIr(ir)` | 清空所有 translation 字段 |
| `countTranslatableChars(ir)` | 可翻译字符总数（进度分母） |
| `countCompletedTranslationChars(ir)` | 已翻译字符数（进度分子） |

**`TransformProgress` 事件类型**

```ts
| { type: "structure"; ir: PaperIR }          // 结构解析完成，无翻译
| { type: "block-translated"; blockId; translation; partial?; debugMetrics? }
| { type: "done"; ir: PaperIR }               // 全部翻译完成
| { type: "degraded"; ir: PaperIR; reason }   // 部分翻译失败，降级展示
```

**内部子模块**

- `chunk.ts`：将 blocks 分片为 `TranslationUnit`，超长 block 按句子边界拆分为多 part。
- `prompts.ts`：构建系统/用户 Prompt JSON。
- `parseResponse.ts`：流式解析 LLM JSON 输出，边 stream 边 yield 已完成块。
- `debugMetrics.ts`：翻译性能指标（TTFT、Token 速度等）。
- `completion.ts`：完成度判定函数。
- `translationDisplay.ts`：译文展示辅助。

---

### 4.9 `core/pipeline` — 端到端流水线

**`loadPaperForDisplay(input, deps?)`**

只读加载（无翻译）：先查缓存，缓存缺失则 fetch + clean，返回 `{ kind: "cache" | "readonly"; ir: PaperIR }`。

**`loadPaperWithTranslation(input, provider, opts, deps?)`**

完整加载+翻译流水线，返回 `AsyncGenerator<LoadPaperWithTranslationProgress>`：

1. 检查 IndexedDB 缓存
2. 缓存命中且翻译完整 → yield `cache-hit`
3. 缓存命中但翻译不完整 → `resumeTranslation`
4. 缓存缺失 → fetch HTML → clean → `transformToIR`
5. 翻译进度通过 `persistDraft` 实时写入 IndexedDB（支持断点续传）

**`loadPaperReadonly(input, deps?)`**

只抓取+解析，不翻译，不写 IndexedDB，返回 `PaperIR`。

**错误类型**：`InvalidArxivIdError`、`OfflineUncachedError`、`NoHtmlVersionError`。

---

### 4.10 `core/llm` — LLM Provider 抽象

**核心接口**

```ts
interface LLMProvider {
  id: string;
  chat(opts: ChatOptions, deps?): AsyncIterable<ChatStreamChunk> | Promise<string>;
  runWithTools?(req, deps?): AsyncGenerator<StreamEvent, AssistantMessage>;
}

type ProviderConfig = {
  id: string;              // "openai" | "anthropic" | "gemini" | "deepseek" | "openrouter" | "siliconflow"
  apiKey: string;
  baseURL: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  translationReasoningEffort?: ReasoningEffort;
  subAgentModel?: string;
  subAgentReasoningEffort?: ReasoningEffort;
  openRouterMeta?: StoredOpenRouterModelMeta | null;
};
```

**`runWithTools`**（Agent 专用）：接收 `AgentMessage[]` + `ToolSchema[]`，流式返回 `StreamEvent`（text/thinking/tool_use），最终 yield `AssistantMessage`（含 `tool_use` content blocks）。

**`createProvider(config)`**：工厂函数，按 `config.id` 分发到对应 Provider 实现。

**其他导出**：`providerConfigForTranslation`、`providerConfigForSubAgent`、`testProviderConnection`、`parseSSEStream`、`listAvailableModels`、`openrouterModelMeta` 等。

---

### 4.11 `core/cache` — 图片缓存

**`cachePaperImages(html, baseUrl, deps?)`**：从论文 HTML 提取图片 URL，预请求并存入 Service Worker Cache（`paper-images-v1`）。

---

### 4.12 `core/colorPalette` — 调色盘

见[第 14 节](#14-调色盘与主题系统)。

---

### 4.13 `core/i18n` — 国际化

**Schema**：`UiLocaleSchema`（`"zh" | "en"`）、`DEFAULT_UI_LOCALE = "en"`。

**`translate(messages, locale, key, params?)`**：纯函数翻译，支持 `{placeholder}` 插值。

**`messages.ts`**：所有 UI 文案（中英文），`MessageKey` 类型供 TypeScript 校验键名。

---

### 4.14 `core/toc` — 目录提取

**`extractToc(paper)`**：从 `PaperIR.blocks` 中抽取 `heading` blocks，返回 `TocEntry[]`。

```ts
interface TocEntry { id: string; title: string; level: number; }
```

---

### 4.15 `core/storage` — 备份/恢复

**`serializeBackup(backup)`** / **`parseBackup(raw)`**：序列化/反序列化备份 JSON，Zod 全量校验。

**`BackupSchema`** 包含：`formatVersion`、`projects`、`paperEntries`、`papers`（IR）、`annotations`、`aiSessions`（legacy）、`settings`、`secrets`（可选）。

> **注意**：`agentSessions`、`artifacts`、`toolResults`、`palettes` 当前**未**纳入备份导出/导入。

---

### 4.16 `core/math` — 数学处理

- **`normalizeTex.ts`**：规范化 LaTeX。
- **`sanitizeMathml.ts`**：注册 DOMPurify hook，剔除 LaTeXML annotation 节点。
- **`layout.ts`**：`breakDisplayEquation(tex)` / `mathDisplayMode(tex)`。

---

### 4.17 `core/media` — 媒体 URL

**`resolveImageUrlsInHtml(html, baseUrl)`**：将 HTML 中的相对图片 URL 转为绝对 URL。

**`buildArxivPaperPageUrl(arxivId, version)`**：构造 arXiv 论文页面链接。

---

### 4.18 `core/network` — 网络状态

**`isOffline(probe?)`**：检测当前是否离线。

**`OfflineUncachedError`**：离线且无本地缓存时抛出的错误。

---

### 4.19 `core/reader` — 阅读器布局

**`readerRightPanelWidth(annotationPanelWidth)`**：计算右侧面板宽度。

**`panelLayout.ts`**：Panel 布局常量与计算逻辑。

---

### 4.20 `core/brand` — 品牌信息

**`credits.ts`**：项目 Credits 数据（作者、License 等）。

---

### 4.21 `core/agent` — Research Agent 核心

> 完整说明见[第 15 节](#15-research-agentchatbox)。此处列出子模块索引。

| 子目录/文件 | 职责 |
|------------|------|
| `types.ts` | `AgentMessage`、`ContentBlock`、`Tool`、`AgentDeps`、`PermissionMode` |
| `loop.ts` | `runAgent` — 多轮 LLM + 工具循环 |
| `orchestrate.ts` | `executeBatched` — 工具调用批处理（并发安全工具并行，上限 4） |
| `execute.ts` | `executeTool` — 单工具：校验 → 审批 → 调用 → 结果 |
| `systemPrompt.ts` | `buildAgentSystemPrompt` — 稳定段 + 动态段（盒子开/关） |
| `boundary.ts` | 盒子开/关边界规则与标记消息 |
| `subagent.ts` | `sub_agent` 工具 + `paper-summarizer` / `reviewer` 子 Agent |
| `session.ts` | `AgentSession` schema、标题推导、搜索排序 |
| `approval.ts` | `resolvePermission`、`makeApprovalFn` |
| `multimodal.ts` | 图片/OCR content blocks、LLM 投影 |
| `chatController.ts` | `runChat` — 无工具的流式聊天 |
| `contextSize.ts` | Token/字符估算、上下文分解 |
| `resultBudget.ts` | 超大工具结果 → IndexedDB + `fetch_result` 预览 |
| `provenance.ts` | `[来源: paperbox\|academic\|web]` 标记 |
| `inclusion.ts` | 推荐论文 → Paper Box 导入流水线 |
| `skills.ts` | 技能模板加载（lit-review / compare-table / outline） |
| `artifact/schema.ts` | `Artifact` Zod schema |
| `retrieval/` | 块检索：manifest → bitmap 预过滤 → LLM side-query |
| `search/` | 学术搜索（OpenAlex / Semantic Scholar）+ Web 搜索适配器 |
| `tools/` | 全部 Agent 工具实现 |
| `python/workerClient.ts` | Pyodide Worker 单例客户端 |
| `templates/*.md` | 文献综述 / 对比表 / 大纲模板 |

---

## 5. 数据库层 `src/db/`

使用 Dexie.js 封装 IndexedDB，数据库名为 `"researchbox"`，当前版本 **v7**。

### 5.1 数据库表结构

| 表名 | 主键 / 索引 | 存储内容 |
|------|------------|---------|
| `papers` | `[arxivId+version]` | `PaperIR`（论文 IR + 翻译） |
| `projects` | `id, updatedAt` | `Project` |
| `paperEntries` | `[projectId+routeId], projectId, status, updatedAt` | `Paper`（论文条目元数据） |
| `annotations` | `++id, [projectId+paperId], paperId, blockId` | `AnnotationRow` |
| `aiSessions` | `++id, paperId` | `AISessionRow`（legacy 划词问答） |
| `settings` | `key` | `SettingRow`（key=`"app"` 存全局设置） |
| `secrets` | `provider` | `SecretRow`（存 Provider 配置，含 API Key，当前为明文 JSON） |
| `palettes` | `id, createdAt` | `SavedPalette`（用户保存的自定义调色盘） |
| `artifacts` | `id, projectId, updatedAt, kind` | `Artifact`（Agent 审批后落库的研究产出） |
| `toolResults` | `id, createdAt` | `ToolResultRow`（超大工具输出全文） |
| `agentSessions` | `++id, projectId, updatedAt` | `AgentSession`（ChatBox 会话历史） |

### 5.2 核心 CRUD 导出

**论文 IR**（`index.ts`）：`savePaper`、`getPaper`、`getPaperCached`、`clearAllTranslationCache`

**Provider 配置**：`saveProviderConfig`、`getProviderConfig`、`listProviderConfigs`、`deleteProviderConfig`

**设置**：`getSettings`、`saveSettings`

**调色盘**：`putPalette`、`getPalette`、`listPalettes`、`deletePalette`

**Artifact**：`saveArtifact`、`getArtifact`、`listArtifacts`、`deleteArtifact`

**Tool Results**：`addToolResult`、`getToolResult`

**Agent Sessions**（`agentSessions.ts`）：`saveAgentSession`、`getAgentSession`、`listAgentSessions`、`deleteAgentSession`、`updateAgentSessionTitle`、`setAgentSessionPinned`

**再导出**：annotations、projects、paperEntries、backup 的函数。

### 5.3 版本迁移历史

- **v1**：初始版本（papers, annotations, aiSessions, settings, secrets）。
- **v2**：新增 projects 表（当时作为论文任务表）。
- **v3**：重构「项目」概念，projects 变为顶层工作区，新增 paperEntries，annotations 增 projectId，历史数据迁至「默认项目」。
- **v4**：新增 palettes 表。
- **v5**：新增 artifacts 表。
- **v6**：新增 toolResults 表。
- **v7**：新增 agentSessions 表（aiSessions 保留给 legacy）。

---

## 6. 状态管理层 `src/store/`

所有 Store 使用 Zustand `create()` 创建，从 `src/store/index.ts` 统一导出。

### 6.1 `useSettingsStore`

**状态**：`providers`, `activeProviderId`, `viewMode`, `targetLang`, `debugMode`, `uiLocale`, `activePaletteId`, `customPalette`, `semanticScholarApiKey`, `openAlexApiKey`, `allowWeb`, `allowCode`, `webSearchProvider`, `tavilyApiKey`, `perplexityApiKey`, `permissionMode`, `savedPalettes`, `loaded`

**主要 Actions**：`load`, `saveProvider`, `deleteProvider`, `setActiveProviderId`, `setViewMode`, `setTargetLang`, `setUiLocale`, `setActivePaletteId`, `setSemanticScholarApiKey`, `setOpenAlexApiKey`, `setAllowWeb`, `setAllowCode`, `setWebSearchProvider`, `setTavilyApiKey`, `setPerplexityApiKey`, `setPermissionMode`, `getEffectivePalette`, `getActiveProvider`, `hasActiveProvider`

---

### 6.2 `useProjectStore`

**状态**：`projects`, `activeProjectId`, `loaded`

**主要 Actions**：`load`, `create`, `rename`, `remove`（级联删 paperEntries + annotations）, `setActive`, `getActiveProject`

---

### 6.3 `usePaperStore`

**状态**：`projectId`, `papers`, `loaded`

**主要 Actions**：`loadForProject`, `addInput`, `remove`, `recordProcessing`, `recordPaper`, `recordError`

---

### 6.4 `useReaderStore`

阅读页核心状态机。

**状态**：`currentPaper`, `status`, `translationStatus`, `streamingDisplays`, `streamingTargets`, `streamingCompleteBlocks`

**`ReaderStatus`**：`"idle" | "loading" | "error" | "ready"`

**`TranslationStatus`**：`"none" | "cached" | "partial" | "translating" | "done" | "degraded"`

**主要 Actions**：`setLoading`, `setPaper`, `setPaperFromCache`, `setPaperStructure`, `setStreamingTarget`, `setPaperDone`, `setDegraded`, `reset`

---

### 6.5 `useTranslationJobStore`

后台翻译任务管理，与 `useReaderStore` 解耦。

**状态**：`jobs: Record<routeId, TranslationJob>`

**主要 Actions**：`startTranslation`, `cancelTranslation`, `cancelAllTranslations`, `subscribe`, `getJob`

---

### 6.6 `useAnnotationStore`

**状态**：`projectId`, `paperId`, `annotations`, `loading`

**Actions**：`loadForPaper`, `createHighlight`, `removeAnnotation`, `editNote`, `reset`

---

### 6.7 `useReaderTocStore`

**状态**：`entries`, `activeId`, `mobileOpen`, `annotationPanelWidth`

---

### 6.8 `useAgentStore`

ChatBox Agent UI 状态（唯一的 Agent 相关 Store）。

**状态**：`messages`, `currentSessionId`, `pendingApprovals`, `runningTools`, `streamingToolCalls`, `boxOpen`, `streamingText`, `streamingThinking`, `contextBreakdown`, `artifactsVersion`, `sessionsVersion`, `artifactPanel`, `recommendationSession`, `composerInputPrefix`, `agentRunning`, `agentStopping`

**主要 Actions**：

| Action | 说明 |
|--------|------|
| `append` / `updateMessageAtIndex` / `truncateMessages` | 消息 CRUD |
| `setStreaming` / `commitStreamingToMessage` | 流式输出缓冲 |
| `enqueueApproval` / `resolveApproval` | 工具审批队列 |
| `setRunningTool` / `clearRunningTool` | 进行中工具状态 |
| `openBox` / `closeBox` / `setBoxOpen` | 采集/研究模式切换 |
| `loadSession` / `startNewSession` / `bumpSessionsVersion` | 会话管理 |
| `openArtifactPanel` / `closeArtifactPanel` / `bumpArtifactsVersion` | Artifact UI |
| `openRecommendationSession` / `commitRecommendationOnSend` | 论文推荐入库 |
| `setAgentRunning` / `setAgentStopping` | 运行生命周期 |

Artifact 数据本身存 IndexedDB `artifacts` 表，UI 刷新由 `artifactsVersion` 驱动。

---

### 6.9 `useStorageStore`

初始化序列协调者：`init()` 依次初始化 settings → 调色盘 → 其他逻辑。在 `main.tsx` 中调用一次。

---

### 6.10 `translationSmoothing.ts`（非 Store）

翻译流光动效模块，通过 `requestAnimationFrame` 逐字符追赶流式 target 文本。

---

## 7. UI 层 `src/ui/` 与页面 `src/pages/`

### 7.1 路由结构

```
/ (AppShell)
├── /                              → Welcome
├── /settings                      → SettingsPage
└── /p/:projectId (ProjectScope)
    ├── (index)                    → redirect → chat-box
    ├── chat-box                   → AgentChat
    ├── chat-box/artifacts         → ChatBoxArtifacts
    ├── agent                      → redirect → chat-box（legacy）
    ├── paper-box                  → PaperBox
    ├── paper/:routeId             → Reader
    └── dummy                      → Dummy
```

`AppShell`：外层布局，包含 `Sidebar`、`LocaleSync`、`PaletteSync`、`PwaOverlays`。

`ProjectScope`：项目上下文路由守卫；无效 `projectId` 时渲染 `NoProject`。

**默认项目落地页为 `chat-box`**（非 paper-box）。

---

### 7.2 Sidebar 三 Dock 导航

Sidebar 按路由自动展开三个 Dock：

| Dock | 来源 | 内容 |
|------|------|------|
| **Chat Box** | `chatBoxNav.ts` | 「新对话」→ `/chat-box`；展开时嵌入 `HistorySearch`（会话列表） |
| **Features** | `featureNav.ts` | paper-box / dummy / chat-box-artifacts |
| **Settings** | `sections.ts` | 设置页各分区锚点导航 |

切换项目时自动导航到该项目的 `chat-box`。

---

### 7.3 页面一览

| 页面 | 路径 | 职责 |
|------|------|------|
| **Welcome** | `/` | 项目 hub：创建/重命名/删除项目 |
| **AgentChat** | `/p/:id/chat-box` | ChatBox 主页面：Agent 循环、会话持久化、OCR、工具执行 |
| **ChatBoxArtifacts** | `/p/:id/chat-box/artifacts` | Artifact 全页浏览 |
| **PaperBox** | `/p/:id/paper-box` | 论文库：导入/列表/删除 |
| **Reader** | `/p/:id/paper/:routeId` | 论文阅读/翻译/标注 |
| **Dummy** | `/p/:id/dummy` | 占位功能页 |
| **NoProject** | *(ProjectScope 内)* | 无效项目 ID 提示 |
| **SettingsPage** | `/settings` | 全局设置 |

---

### 7.4 `src/ui/ai-panel/` — ChatBox 聊天 UI

| 组件 | 说明 |
|------|------|
| `AgentChatPanel` | 聊天主壳：消息列表、流式状态、Composer、审批/推荐侧栏 |
| `ChatComposer` | 输入框：文本、图片粘贴/拖拽、OCR、ContextMeter、停止按钮 |
| `HistorySearch` | 侧边栏会话历史：搜索/加载/重命名/置顶/删除 |
| `ApprovalSheet` | 工具审批底部弹窗 |
| `BoxSwitch` | 采集/研究模式切换 |
| `ReasoningEffortSelector` | 会话级推理强度覆盖 |
| `ContextMeter` / `ContextDetailSheet` | Token 用量条 + 详情 |
| `ToolCallCard` | 已完成 tool_use + tool_result 卡片 |
| `StreamingPythonToolCard` | 流式 Python 代码卡片 |
| `PythonCodePanel` / `PythonHighlightedCode` | Python 语法高亮展示 |
| `ThinkingBlock` | 可折叠推理/thinking 块 |
| `ArtifactCard` / `ArtifactDetailPanel` / `ArtifactList` / `ArtifactListView` / `ArtifactPreview` / `ArtifactMarkdownContent` | Artifact 展示 |
| `SearchResultCard` / `ProvenanceBadge` | 学术/Web 搜索结果 |
| `RecommendationPanel` / `RecommendationSheet` / `RecommendationPaperItem` | 论文推荐入库 UI |
| `MarkdownContent` / `AssistantText` / `MessageBubble` / `UserMessageShell` | 消息渲染 |
| `ChatMessageActions` | 复制/重试/编辑 |
| `BoundaryNotice` | 盒子边界标记提示 |

**辅助模块**：`tesseractOcr.ts`（客户端 OCR）、`pythonHighlight.ts`、`imageAttachments.ts`、`artifactMarkdown.ts`

---

### 7.5 `src/ui/reader/` — 论文渲染组件

| 组件 | 说明 |
|------|------|
| `PaperRenderer` | 主渲染器，遍历 blocks，分发到各专用组件 |
| `AbstractSection` | 摘要区块 |
| `MathBlock` / `DisplayMath` / `MathSpotlight` | 数学公式（KaTeX） |
| `FigureBlock` / `ImageViewer` | 图片块 + 点击放大 |
| `TableContainer` / `OverflowContainer` | 溢出滚动 |
| `CitationPopover` | 引用悬停弹窗 |
| `AnnotationLayer` / `AnnotationSidebar` / `SelectionToolbar` | 标注系统 |
| `TranslationProgressRing` / `TranslationWaitingIndicator` | 翻译进度 |
| `ViewModeSwitcher` | 原文/译文/双语切换 |

**`flowBlocks.ts`**：将 IR blocks 分组为 `PaperRenderUnit`，减少 DOM 节点数。

---

### 7.6 `src/ui/reader/toc/` — 目录导航

| 文件 | 说明 |
|------|------|
| `TocRail` | 桌面左侧目录导轨 |
| `MobileTocPanel` | 移动端全屏目录浮层 |
| `useActiveHeading` | IntersectionObserver 追踪当前阅读位置 |
| `ReaderPanelResizeHandle` | 右侧面板拖拽调宽 |

---

### 7.7 `src/ui/settings/` — 设置页

| 组件 | 说明 |
|------|------|
| `SettingsPage` | 设置页主组件 |
| `AboutSection` | 关于/版本信息 |
| `ColorPaletteSection` / `ColorPalettePreview` | 调色盘 |
| `DataManagementSection` | 数据导出/导入/清除 |
| `OpenRouterMetaPanel` | OpenRouter 模型元数据 |
| `AcademicSearchSection` | Semantic Scholar + OpenAlex API Key |
| `AgentCapabilitiesSection` | allowWeb / allowCode + Web 搜索 Provider/Key |
| `ChatBoxSection` | Agent 审批模式（default / ask） |
| `sections.ts` | 设置分区定义 |

---

### 7.8 `src/ui/shell/` — 应用外壳

| 文件 | 说明 |
|------|------|
| `AppShell` | 顶层布局 |
| `Sidebar` | 三 Dock 侧边栏 |
| `ProjectScope` | 项目上下文路由守卫 |
| `LocaleSync` / `PaletteSync` | locale 与调色盘同步 |
| `featureNav.ts` / `chatBoxNav.ts` | 导航定义 |
| `featureIcons.tsx` | 功能图标 SVG |
| `useVisualViewportBox.ts` | 移动端 Visual Viewport 适配 |

---

## 8. PWA 层 `src/pwa/`

| 文件 | 说明 |
|------|------|
| `register.ts` | `initPwa()`：注册 Service Worker |
| `store.ts` | `usePwaStore`：安装提示和更新就绪状态 |
| `config.ts` | `PWA_MANIFEST` 和 Workbox 运行时缓存策略 |
| `InstallButton` | PWA 安装按钮 |
| `UpdatePrompt` | 新版本更新提示 |
| `OfflineBanner` | 离线状态横幅 |
| `PwaOverlays` | 组合 UpdatePrompt + OfflineBanner |

---

## 9. 国际化层 `src/i18n/`

```ts
const { t, locale } = useTranslation();
t("paperBox.title")
t("projects.updatedAt", { date })
```

`locale` 来自 `useSettingsStore().uiLocale`。

**`LanguageSwitcher.tsx`**：语言切换 UI 组件。

---

## 10. 数据流与架构全图

### 10.1 论文翻译流水线

```
用户输入 arXiv ID
        │
        ▼
[PaperBox] usePaperStore.addInput()
        │ 解析 ID，写 paperEntries（status=ready）
        │ navigate → /p/:projectId/paper/:routeId
        ▼
[Reader] 页面挂载
        │
        ├─ loadPaperForDisplay() ──────────────────────────────────┐
        │   ├─ DB 缓存命中 → setPaperFromCache(ir)                 │
        │   └─ DB 缺失 → fetchPaperHtml → cleanArxivHtml → setPaper │
        │                                                           │
        └─ 用户点击「开始翻译」                                      │
                │                                                   │
                ▼                                                   │
[translationJobStore].startTranslation()                           │
        │                                                           │
        ▼                                                           │
loadPaperWithTranslation()                                         │
        │                                                           │
        ├─ 缓存命中且完整 → yield cache-hit ──────────────────────►│
        ├─ 缓存命中不完整 → resumeTranslation()                    │
        └─ 缓存缺失 → fetchPaperHtml → cleanArxivHtml              │
                         → transformToIR()                          │
                              │                                     │
                         yield structure ─────────────────────────►│
                              │                                     │
                    [LLM Provider].chat()                           │
                              │ (streaming JSON)                    │
                    parseResponse → yield block-translated ─────►  │
                              │ (每块完成立即 persistDraft 到 DB)   │
                    yield done / degraded ────────────────────────►│
                                                                    │
                                        [readerStore] 更新 IR       │
                                        translationSmoothing 动效   │
                                        PaperRenderer 渲染          │
```

### 10.2 ChatBox Agent 流水线

```
[AgentChat] 用户发送消息
        │
        ▼
runAgent({ messages, tools, system }, deps, executeBatched)
        │
        ├─ llm.runWithTools() → StreamEvent (text/thinking/tool_use)
        ├─ yield assistant message
        └─ 若有 tool_use blocks:
              executeBatched(calls, tools, deps)
                ├─ 并发安全工具：并行（上限 4）
                ├─ 不安全工具（python/artifacts）：串行
                └─ executeTool 每条：
                     validate → resolvePermission → tool.call()
                     → tool_result + evidence messages
              yield batch messages → 下一 turn
        │
        ├─ terminal: completed | aborted | max_turns | approval_denied
        └─ 会话持久化 → agentSessions 表
```

---

## 11. 关键数据类型速查

```ts
// 核心 IR
type PaperIR = { arxivId, version, title, abstract, abstractBlocks, authors, blocks, references, createdAt, modelUsed }
type Block = { id, type, level?, content, caption?, translation?, math?, meta? }

// 论文条目（DB 元数据）
type Paper = { projectId, routeId, importMethod, arxivId, version, source, title, authors, status, error?, modelUsed?, createdAt, updatedAt }

// 项目
type Project = { id, name, createdAt, updatedAt }

// 设置
type AppSettings = { activeProviderId, viewMode, targetLang, debugMode, uiLocale, lastProjectId, activePaletteId, customPalette, semanticScholarApiKey, openAlexApiKey, allowWeb, allowCode, webSearchProvider, tavilyApiKey, perplexityApiKey, permissionMode }

// 标注
type Annotation = { id?, paperId, blockId, startOffset, endOffset, quote, note?, color?, createdAt }

// LLM
type ProviderConfig = { id, apiKey, baseURL, model, reasoningEffort?, translationReasoningEffort?, subAgentModel?, subAgentReasoningEffort?, openRouterMeta? }

// Agent
type AgentMessage = { role: "user" | "assistant", content: ContentBlock[], uiHidden?, llmHidden? }
type ContentBlock = text | image | ocr_text | thinking | tool_use | tool_result | artifact_card
type AgentSession = { id?, projectId, title, messages, createdAt, updatedAt, pinnedAt? }
type Artifact = { id, projectId, kind: "summary"|"compare-table"|"outline"|"note", title, content, sourceCitations[], createdAt, updatedAt }
type PermissionMode = "default" | "ask"

// 翻译进度
type TransformProgress = { type: "structure"; ir } | { type: "block-translated"; ... } | { type: "done"; ir } | { type: "degraded"; ir; reason }

// 调色盘
type ColorPalette = { sidebarBg, sidebarActive, primary, primaryHover, pageBg, cardBg, textPrimary, textSecondary, border, translation }

// 备份
type Backup = { formatVersion: 1, exportedAt, projects, paperEntries, papers, annotations, aiSessions, settings, secrets? }
```

---

## 12. LLM Provider 接入

### 12.1 支持的 Provider

| id | 类 | 协议 |
|----|-----|------|
| `openai` | `OpenAICompatibleProvider` | OpenAI Chat Completions API |
| `deepseek` | `OpenAICompatibleProvider` | OpenAI 兼容 |
| `openrouter` | `OpenAICompatibleProvider` | OpenAI 兼容（带模型元数据） |
| `siliconflow` | `OpenAICompatibleProvider` | OpenAI 兼容 |
| `anthropic` | `AnthropicProvider` | Anthropic Messages API（SSE） |
| `gemini` | `GeminiProvider` | Gemini generateContent API（SSE） |

### 12.2 Agent 专用能力

翻译使用 `provider.chat()`；Agent 使用 `provider.runWithTools()`（Anthropic / OpenAI 兼容 Provider 已实现）。子 Agent 通过 `providerConfigForSubAgent` 使用独立模型/推理强度配置。

### 12.3 Reasoning Effort

- `reasoningEffort`：通用调用（测试连接等），默认 `"low"`。
- `translationReasoningEffort`：翻译专用，默认 `"off"`。
- `subAgentReasoningEffort`：子 Agent 专用，默认 `"off"`。

---

## 13. 翻译流水线

### 13.1 分片策略（`chunk.ts`）

1. 遍历所有 `isTranslatableBlock` 的 blocks（排除 math、codeblock）。
2. figure block 翻译 `caption` 而非 `content`。
3. 超过 `DEFAULT_MAX_CHUNK_CHARS`（4000）字符的 block 按句子边界拆分。
4. 每个 block 生成一或多个 `TranslationUnit`。

### 13.2 流式解析（`parseResponse.ts`）

LLM 边 stream 边累积 JSON，`extractStreamingTranslationUpdates` 用正则从不完整 JSON 中提取已完成的 translation 字段。

### 13.3 断点续传（`persistDraft.ts`）

每收到一个完整 `block-translated` 事件，立即 `savePaper(ir)` 持久化到 IndexedDB。

---

## 14. 调色盘与主题系统

### 14.1 架构

调色盘通过 CSS 自定义属性（`--rb-*`）实现即时换肤。

| Token | CSS 变量 |
|-------|---------|
| `sidebarBg` | `--rb-sidebar-bg` |
| `primary` | `--rb-primary` |
| `translation` | `--rb-translation` |
| ... | ... |

侧边栏文字色由 `deriveSidebarText(sidebarBg)` 自动推导。

### 14.2 内置预设

`default` / `academic-green` / `dark-purple` / `warm-orange`

### 14.3 自定义调色盘

编辑中：`activePaletteId = "custom"`，存 `AppSettings.customPalette`。保存后写入 `palettes` 表。

---

## 15. Research Agent（ChatBox）

### 15.1 架构概览

```
AgentChat.tsx（UI 边界）
  └─ runAgent（loop.ts）
       ├─ buildAgentSystemPrompt（盒子开/关 + 项目名 + 日期）
       ├─ llm.runWithTools()
       └─ executeBatched → executeTool
            ├─ resolvePermission（approval.ts）
            └─ Tool.call() async generator
```

**`runController.ts`** 仅管理全局 `AbortController`（停止按钮），不参与编排。

### 15.2 盒子开/关（采集 vs 研究）

| 模式 | `boxOpen` | 系统 Prompt | 允许的工具 |
|------|-----------|------------|-----------|
| **采集阶段** | `true` | 允许外部搜索 | `academic_search`, `websearch`, `recommend_papers` + 全部 Paper Box 工具 |
| **研究阶段** | `false` | 仅 Paper Box 内检索 | `paperbox_*`, `retrieval`, `sub_agent`, `artifacts`, `fetch_result` |

关闭盒子时插入边界标记消息：`【盒子已关闭】...`（`boundary.ts`）。

### 15.3 Agent 工具一览

由 `buildResearchTools({ allowWeb, allowCode })` 组装：

| 工具 | 只读 | 并发安全 | 审批 | 说明 |
|------|------|---------|------|------|
| `paperbox_list` | ✓ | ✓ | allow | 列出项目内论文 |
| `paperbox_read` | ✓ | ✓ | allow | 读取论文 meta/abstract/outline/full |
| `paperbox_fetch` | ✓ | ✓ | allow | 全文紧凑纯文本（含 `paperId#blockId` 标记） |
| `fetch_result` | ✓ | ✓ | allow | 加载持久化的大工具输出 |
| `retrieval` | ✓ | ✓ | allow | 语义检索 Paper Box blocks |
| `academic_search` | ✓ | ✓ | allow | 外部学术搜索（OpenAlex → Semantic Scholar） |
| `recommend_papers` | ✓ | ✓ | allow | 展示论文推荐卡片供用户入库 |
| `artifacts` | ✗ | ✗ | ask (low) | 保存研究产出到 IndexedDB |
| `sub_agent` | ✓ | ✓ | allow | 启动子 Agent（summarizer / reviewer） |
| `websearch` *(allowWeb)* | ✓ | ✓ | ask (low) | Tavily / Perplexity Web 搜索 |
| `python` *(allowCode)* | ✗ | ✗ | ask (high) | Pyodide WASM 沙箱执行 Python |

**审批模式**（`permissionMode`）：
- `"default"`：`ask` 类工具自动放行。
- `"ask"`：所有 `ask` 类工具需用户确认。

### 15.4 检索系统（`retrieval`）

1. 加载项目全部 `PaperIR`
2. `buildBlockCandidates` — 所有 body blocks + heading 上下文 + 120 字预览
3. `bitmapPrefilter` — 字母位图与 query 词重叠预过滤
4. `capPoolForSideQuery` — 上限 100 blocks / 20k 字符
5. `selectRelevantBlocks` — 独立 LLM side-query（JSON `{ ids }`）
6. 失败时 fallback 到词频排序
7. 输出 `RetrievalHit[]` + `uiHidden` evidence 消息（含 `paperId#blockId` 引用格式）

### 15.5 学术搜索（`academic_search`）

**`runAcademicSearch`** 策略：
1. 有 OpenAlex Key → 先搜 OpenAlex
2. 无 Key 或零结果 → Semantic Scholar
3. 按 `arxivId` 去重，截取 `limit`
4. `fillMissingAbstracts` — 从 arXiv HTML 补全缺失摘要

结果仅 Agent 可见；需调用 `recommend_papers` 才能向用户展示入库卡片。

### 15.6 子 Agent（`sub_agent`）

| 类型 | 工具集 | Max turns |
|------|--------|-----------|
| `paper-summarizer` | paperbox_read, paperbox_fetch, retrieval | 8 |
| `reviewer` | paperbox_read, paperbox_fetch, paperbox_list, retrieval, fetch_result | 8 |

隔离内存 Store + `providerConfigForSubAgent`；子 Agent 内所有审批自动拒绝。

### 15.7 Artifact 系统

**Schema**（`artifact/schema.ts`）：

```ts
{ id, projectId, kind: "summary"|"compare-table"|"outline"|"note", title, content, sourceCitations[], createdAt, updatedAt }
```

**流程**：`artifacts` 工具 → 用户审批 → `saveArtifact()` → 聊天 UI 追加 `artifact_card` block → `bumpArtifactsVersion()`。

**技能模板**（`templates/*.md`）：lit-review / compare-table / outline，由 `skills.ts` 加载（尚未接入 ChatComposer 菜单）。

### 15.8 Python / Pyodide

```
python tool → workerClient.ts → pyodide.worker.ts
  └─ CDN 加载 Pyodide v3.14
  └─ loadPackagesFromImports → runPythonAsync
  └─ 串行队列，单 Worker，输出上限 30k 字符
```

### 15.9 超大工具结果（`resultBudget.ts`）

超过阈值的工具输出写入 `toolResults` 表，回话中只保留预览 + `resultId`；Agent 通过 `fetch_result` 工具加载全文。

### 15.10 多模态输入

- 用户消息支持 `image` content block（粘贴/拖拽）
- `tesseractOcr.ts` 客户端 OCR → `ocr_text` block
- `multimodal.ts` 将 blocks 投影为 LLM 可消费的格式

### 15.11 会话持久化

- 每轮对话结束后 `saveAgentSession()` 写入 `agentSessions` 表
- Sidebar `HistorySearch` 提供搜索/加载/重命名/置顶/删除
- `AgentChat.tsx` 挂载时自动恢复最近会话

### 15.12 Prompt 文档

完整 Prompt 清单见 `src/core/agent/current_prompts.md`。

---

## 16. 测试约定

### 16.1 单测（Vitest）

- 每个 `core/xxx` 模块配同名 `xxx.test.ts`（或 `.test.tsx`）。
- 使用 `fake-indexeddb` 模拟 IndexedDB。
- 测试 UI 组件使用 `@testing-library/react`。
- 配置文件：`src/test-setup.ts`。

**运行**：`npm run test` 或 `npm run test:watch`。

### 16.2 E2E（Playwright）

- 测试文件位于 `tests/e2e/`（如 `readonly-flow.spec.ts`）。
- Fixtures 位于 `tests/fixtures/`。
- **运行**：`npm run test:e2e`（需先 `npm run test:e2e:install`）。

### 16.3 每次交付必须

1. `npm run typecheck` —— 零 TypeScript 错误。
2. `npm run test` —— 所有单测通过。
3. 改动涉及多文件时，先列改动清单再写代码。
