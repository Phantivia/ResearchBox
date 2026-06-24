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
15. [测试约定](#15-测试约定)

---

## 1. 项目概览

ResearchBox 是一个运行在浏览器的 **arXiv 论文阅读 + AI 翻译 PWA**。用户粘贴 arXiv 论文 ID，应用自动抓取论文 HTML，解析成结构化 IR，再调用用户配置的 LLM Provider 批量翻译，最终以「原文 / 译文 / 双语」三种模式呈现。所有数据持久化在浏览器 IndexedDB，支持离线阅读。

核心价值主张：
- **本地优先**：数据存 IndexedDB，无需后端，可安装为 PWA。
- **Provider 自带**：用户填写自己的 API Key，选择 OpenAI / Anthropic / Gemini / DeepSeek / OpenRouter / SiliconFlow 等 Provider。
- **断点续传**：翻译中断后重启可从断点继续，而非重新翻译。
- **多项目隔离**：论文、标注按「项目/工作区」隔离，互不影响。

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
| Markdown | react-markdown |
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
│   │   ├── annotation/       # 标注数据结构
│   │   ├── brand/            # 品牌信息（Credits）
│   │   ├── cache/            # Service Worker 图片缓存
│   │   ├── citation/         # 引用跳转辅助
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
│   │   ├── backup.ts         # 导出/导入
│   │   └── settings.ts       # 设置（已合并进 index.ts）
│   │
│   ├── store/                # Zustand stores（见第 6 节）
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
│   │   ├── ai-panel/
│   │   ├── brand/
│   │   ├── reader/           # 论文渲染组件
│   │   │   └── toc/          # 目录导航组件
│   │   ├── settings/         # 设置页面组件
│   │   └── shell/            # 应用外壳（Sidebar、AppShell 等）
│   │
│   ├── pages/                # 路由级页面
│   │   ├── Welcome.tsx       # 首页（未选项目）
│   │   ├── PaperBox.tsx      # 论文列表页
│   │   ├── Reader.tsx        # 论文阅读/翻译页
│   │   └── Dummy.tsx         # 占位页
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

**导出**：`AppSettingsSchema`、`AppSettings` 类型、`DEFAULT_SETTINGS`、`ViewModeSchema`、`ViewMode`。

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

---

### 4.5 `core/annotation` — 标注

**导出**

| 名称 | 说明 |
|------|------|
| `AnnotationSchema` | 标注 Zod schema |
| `TextAnchorSchema` | 文本锚点（blockId + 偏移） |
| `Annotation` / `TextAnchor` | 类型 |
| `makePaperId(arxivId, version)` | 生成 paperId 字符串（`arxivId:version`） |

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

**`TransformOpts`**

```ts
{ targetLang: string; modelLabel: string; arxivId?; version?; debugMode?; signal?: AbortSignal }
```

**内部子模块**

- `chunk.ts`：将 blocks 分片为 `TranslationUnit`，超长 block 按句子边界拆分为多 part；`buildFullTranslationPayload` / `buildResumeTranslationPayload`。
- `prompts.ts`：构建系统/用户 Prompt JSON；`buildTranslationSystemPrompt` / `buildContinueTranslationSystemPrompt` 等。
- `parseResponse.ts`：流式解析 LLM JSON 输出，边 stream 边 yield 已完成块；`extractStreamingTranslationUpdates`。
- `debugMetrics.ts`：翻译性能指标（TTFT、Token 速度等），debug 模式下写入 block.meta。
- `completion.ts`：`isPaperTranslationComplete`、`hasCompleteTranslation` 等完成度判定函数。
- `translationDisplay.ts`：译文展示辅助（`getTranslationDebugMetrics`、`withTranslationDebugMetrics`）。

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

**错误类型**：`InvalidArxivIdError`（ID 格式错误）、`OfflineUncachedError`（离线且无缓存）、`NoHtmlVersionError`（arXiv 无 HTML 版本）。

---

### 4.10 `core/llm` — LLM Provider 抽象

**核心接口**

```ts
interface LLMProvider {
  id: string;
  chat(opts: ChatOptions, deps?): AsyncIterable<string> | Promise<string>;
}

type ChatOptions = {
  system: string;
  messages: Message[];
  stream?: boolean;
  json?: boolean;
  signal?: AbortSignal;
};

type ProviderConfig = {
  id: string;              // "openai" | "anthropic" | "gemini" | "deepseek" | "openrouter" | "siliconflow"
  apiKey: string;
  baseURL: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  translationReasoningEffort?: ReasoningEffort;
  openRouterMeta?: StoredOpenRouterModelMeta | null;
};
```

**`createProvider(config: ProviderConfig): LLMProvider`**

工厂函数，按 `config.id` 分发到对应 Provider 实现：
- `anthropic` → `AnthropicProvider`
- `gemini` → `GeminiProvider`
- `openai` / `deepseek` / `openrouter` / `siliconflow` → `OpenAICompatibleProvider`

**`providerConfigForTranslation(config)`**：将通用 `reasoningEffort` 替换为 `translationReasoningEffort`，得到翻译专用配置。

**`testConnection(provider)`**：发一条测试消息验证 API Key 可用。

**`measureTranslationLatency(provider, opts)`**：测量 TTFT。

**`openrouterModelMeta.ts`**：获取/缓存 OpenRouter 模型元数据（context 长度、定价等）。

**`sse.ts`**：服务端发送事件（SSE）流解析工具函数。

**`providerReasoning.ts`**：`ReasoningEffort` 枚举与各 Provider 参数映射。

---

### 4.11 `core/cache` — 图片缓存

**`cachePaperImages(html, baseUrl, deps?)`**：从论文 HTML 提取图片 URL，预请求并存入 Service Worker Cache（`paper-images-v1`），实现离线图片访问。

**常量** `PAPER_IMAGES_CACHE_NAME = "paper-images-v1"`（在 PWA Workbox 配置中同步）。

---

### 4.12 `core/colorPalette` — 调色盘

见[第 14 节](#14-调色盘与主题系统)。

---

### 4.13 `core/i18n` — 国际化

**Schema**：`UiLocaleSchema`（`"zh" | "en"`）、`DEFAULT_UI_LOCALE = "en"`。

**`translate(messages, locale, key, params?)`**：纯函数翻译，支持 `{placeholder}` 插值。

**`resolveUiLocaleFromLanguages(langs)`**：从浏览器 `navigator.languages` 解析 UI locale。

**`messages.ts`**：所有 UI 文案（中英文），`MessageKey` 类型供 TypeScript 校验键名。

**`htmlLang.ts`**：按 locale 设置 `<html lang="...">` 属性。

---

### 4.14 `core/toc` — 目录提取

**`extractToc(paper)`**：从 `PaperIR.blocks` 中抽取 `heading` blocks，返回 `TocEntry[]`。

```ts
interface TocEntry { id: string; title: string; level: number; }
```

---

### 4.15 `core/storage` — 备份/恢复

**`serializeBackup(backup)`** / **`parseBackup(raw)`**：序列化/反序列化备份 JSON，Zod 全量校验。

**`selectRowsToWrite(rows, keyOf, existingKeys, strategy)`**：按 `"overwrite" | "skip"` 策略过滤需写入的行。

**`BackupSchema`** 包含：`formatVersion`、`projects`、`paperEntries`、`papers`（IR）、`annotations`、`aiSessions`、`settings`、`secrets`（可选）。

---

### 4.16 `core/math` — 数学处理

- **`normalizeTex.ts`**：规范化 LaTeX，处理 `\(…\)` / `\[…\]` 围栏与特殊字符转义。
- **`sanitizeMathml.ts`**：注册 DOMPurify hook，剔除 LaTeXML 的 `<annotation encoding="application/x-tex">` 节点，防止 Firefox 重复渲染裸 TeX。
- **`layout.ts`**：`breakDisplayEquation(tex)` / `mathDisplayMode(tex)` 辅助判断是行内还是展示数学。

---

### 4.17 `core/media` — 媒体 URL

**`resolveImageUrlsInHtml(html, baseUrl)`**：将 HTML 中的相对图片 URL 转为绝对 URL。

**`absolutizeImageUrlsInDocument(doc, baseUrl)`**：对 DOM Document 操作（在 Cleaner 中调用）。

**`buildArxivPaperPageUrl(arxivId, version)`**：构造 arXiv 论文页面链接（用于跳转）。

---

### 4.18 `core/network` — 网络状态

**`isOffline(probe?)`**：检测当前是否离线（`!navigator.onLine` 或自定义探测函数）。

**`OfflineUncachedError`**：离线且无本地缓存时抛出的错误。

**`OnlineProbe`** 类型：`() => boolean`，可注入 mock 用于测试。

---

### 4.19 `core/reader` — 阅读器布局

**`readerRightPanelWidth(annotationPanelWidth)`**：计算右侧面板（标注栏）宽度。

**`panelLayout.ts`**：Panel 布局常量与计算逻辑。

---

### 4.20 `core/brand` — 品牌信息

**`credits.ts`**：项目 Credits 数据（作者、License 等），无副作用，可单测。

---

## 5. 数据库层 `src/db/`

使用 Dexie.js 封装 IndexedDB，数据库名为 `"researchbox"`，当前版本 **v4**。

### 5.1 数据库表结构

| 表名 | 主键 / 索引 | 存储内容 |
|------|------------|---------|
| `papers` | `[arxivId+version]` | `PaperIR`（论文 IR + 翻译） |
| `projects` | `id, updatedAt` | `Project` |
| `paperEntries` | `[projectId+routeId], projectId, status, updatedAt` | `Paper`（论文条目元数据） |
| `annotations` | `++id, [projectId+paperId], paperId, blockId` | `AnnotationRow` |
| `aiSessions` | `++id, paperId` | `AISessionRow` |
| `settings` | `key` | `SettingRow`（key=`"app"` 存全局设置） |
| `secrets` | `provider` | `SecretRow`（存 Provider 配置，含 API Key，当前为明文 JSON） |
| `palettes` | `id, createdAt` | `SavedPalette`（用户保存的自定义调色盘） |

### 5.2 核心 CRUD 导出（`src/db/index.ts`）

**论文 IR**

| 函数 | 说明 |
|------|------|
| `savePaper(ir)` | upsert PaperIR |
| `getPaper(arxivId, version)` | 精确查询 |
| `getPaperCached(arxivId, version \| null)` | 先查 latest，再按时间取最新版本 |
| `clearAllTranslationCache()` | 清空所有 IR 的 translation 字段 |

**Provider 配置**

| 函数 | 说明 |
|------|------|
| `saveProviderConfig(config)` | 写入 secrets 表 |
| `getProviderConfig(providerId)` | 读取单个 |
| `listProviderConfigs()` | 读取全部 |
| `deleteProviderConfig(providerId)` | 删除 |

**设置**

| 函数 | 说明 |
|------|------|
| `getSettings()` | 读取，自动合并默认值 |
| `saveSettings(partial)` | merge + 写入，返回最终值 |

**调色盘**：`putPalette`、`getPalette`、`listPalettes`、`deletePalette`

**再导出**：annotations（`addAnnotation` / `deleteAnnotation` / `listAnnotations` / `updateNote`）、projects、paperEntries、backup 的函数。

### 5.3 版本迁移历史

- **v1**：初始版本（papers, annotations, aiSessions, settings, secrets）。
- **v2**：新增 projects 表（当时作为论文任务表）。
- **v3**：重构「项目」概念，projects 变为顶层工作区，新增 paperEntries，annotations 增 projectId，历史数据迁至「默认项目」。
- **v4**：新增 palettes 表。

---

## 6. 状态管理层 `src/store/`

所有 Store 使用 Zustand `create()` 创建，从 `src/store/index.ts` 统一导出。

### 6.1 `useSettingsStore`

**状态**：`providers`, `activeProviderId`, `viewMode`, `targetLang`, `debugMode`, `uiLocale`, `activePaletteId`, `customPalette`, `savedPalettes`, `loaded`

**主要 Actions**

| Action | 说明 |
|--------|------|
| `load()` | 从 DB 加载所有设置和 Provider 列表 |
| `saveProvider(config)` | 新增/更新 Provider |
| `deleteProvider(id)` | 删除 Provider，若为 active 则清空 activeProviderId |
| `setActiveProviderId(id)` | 切换 Provider |
| `setViewMode(mode)` | 切换视图模式（同步 DB） |
| `setTargetLang(lang)` | 切换目标语言 |
| `setUiLocale(locale)` | 切换 UI 语言（同步 localStorage） |
| `setActivePaletteId(id)` | 切换调色盘（立即调用 `applyPalette`） |
| `getEffectivePalette()` | 返回当前生效调色盘 |
| `getActiveProvider()` | 返回当前 Provider 配置 |
| `hasActiveProvider()` | 是否有配置完整的 Provider |

---

### 6.2 `useProjectStore`

**状态**：`projects`, `activeProjectId`, `loaded`

**主要 Actions**：`load`、`create(name)`、`rename(id, name)`、`remove(id)`（级联删 paperEntries + annotations）、`setActive(id)`、`getActiveProject()`

---

### 6.3 `usePaperStore`

管理当前项目的论文条目列表。

**状态**：`papers: Paper[]`, `loaded`

**主要 Actions**

| Action | 说明 |
|--------|------|
| `loadForProject(projectId)` | 从 DB 加载该项目所有论文 |
| `addInput(projectId, input)` | 解析 arXiv ID 后写入 DB，返回 routeId |
| `remove(projectId, routeId)` | 从 DB 删除，同步状态 |
| `recordProcessing(projectId, routeId)` | 更新状态为 processing |
| `recordPaper(projectId, routeId, ir, status)` | 更新标题/作者/状态 |
| `recordError(projectId, routeId, error)` | 更新状态为 error |

---

### 6.4 `useReaderStore`

阅读页核心状态机，管理当前论文和翻译进度。

**状态**：`currentPaper: PaperIR | null`, `status: ReaderStatus`, `translationStatus: TranslationStatus`, `streamingDisplays`, `streamingTargets`, `streamingCompleteBlocks`

**`ReaderStatus`**：`"idle" | "loading" | "error" | "ready"`

**`TranslationStatus`**：`"none" | "cached" | "partial" | "translating" | "done" | "degraded"`

**主要 Actions**

| Action | 说明 |
|--------|------|
| `setLoading()` | 切换到加载状态 |
| `setPaper(ir)` | 设置论文（只读模式，无翻译） |
| `setPaperFromCache(ir)` | 从缓存设置，自动推断 translationStatus |
| `setPaperStructure(ir)` | 翻译开始时先设置无翻译 IR |
| `setStreamingTarget(blockId, text, complete?, metrics?)` | 流式更新：complete=false 仅更新 smoothing target；complete=true 写入 currentPaper.translation |
| `setPaperDone(ir)` | 翻译完成 |
| `setDegraded(ir, reason)` | 翻译降级 |
| `reset()` | 重置所有状态 |

---

### 6.5 `useTranslationJobStore`

在后台管理翻译任务，与 `useReaderStore` 解耦，支持多任务并发（PaperBox 中列表项的进度环）。

**状态**：`jobs: Record<routeId, TranslationJob>`

**`TranslationJob`**

```ts
{
  routeId: string;
  projectId: string;
  status: "running" | "done" | "error" | "cancelled";
  totalBlocks: number;     // 可翻译总字符数（权重）
  completedBlocks: number; // 已翻译字符数
  error?: string;
}
```

**主要 Actions**

| Action | 说明 |
|--------|------|
| `startTranslation(opts)` | 启动翻译任务（防重复），在后台运行 `runTranslationJob` |
| `cancelTranslation(routeId)` | 发送 AbortSignal，更新状态为 cancelled |
| `cancelAllTranslations()` | 取消所有进行中的任务 |
| `subscribe(routeId, listener)` | 订阅翻译事件（`LoadPaperWithTranslationProgress`），返回取消订阅函数 |
| `getJob(routeId)` | 读取任务状态 |

---

### 6.6 `useAnnotationStore`

**状态**：`projectId`, `paperId`, `annotations: Annotation[]`, `loading`

**Actions**：`loadForPaper`、`createHighlight(projectId, paperId, anchor, note?)`、`removeAnnotation(id)`、`editNote(id, note)`、`reset()`

---

### 6.7 `useReaderTocStore`

**状态**：`entries: TocEntry[]`, `activeId: string | null`, `open: boolean`（移动端目录面板）, `annotationPanelWidth: number`

---

### 6.8 `useStorageStore`

初始化序列协调者：`init()` 依次初始化 `settingsStore.load()` → 应用调色盘 → 其他初始化逻辑。在 `main.tsx` 中 `useEffect` 内调用一次。

---

### 6.9 `translationSmoothing.ts`（非 Store）

翻译流光动效模块。注册一个宿主（`registerTranslationSmoothingHost`），通过 `requestAnimationFrame` 逐字符「追赶」流式 target 文本，写入 `streamingDisplays`，实现平滑打字机效果。

---

## 7. UI 层 `src/ui/` 与页面 `src/pages/`

### 7.1 路由结构

```
/ (AppShell)
├── /                    → Welcome
├── /settings            → SettingsPage
└── /p/:projectId (ProjectScope)
    ├── (index)          → redirect to paper-box
    ├── paper-box        → PaperBox
    ├── paper/:routeId   → Reader
    └── dummy            → Dummy
```

`AppShell`：外层布局，包含 `Sidebar`、`LocaleSync`（设置 `<html lang>`）、`PaletteSync`（应用调色盘 CSS 变量）、`PwaOverlays`。

`ProjectScope`：在 URL 中带 `projectId` 的子路由守卫，无项目时重定向到 `NoProject` 页。

---

### 7.2 `src/pages/Welcome.tsx`

首页，引导用户创建/选择项目。

---

### 7.3 `src/pages/PaperBox.tsx`

论文列表页。
- 从 URL 取 `projectId`，调用 `usePaperStore.loadForProject`。
- 支持添加论文（arXiv ID / URL 输入）、删除论文。
- 每张卡片显示翻译状态徽章和进度环（来自 `useTranslationJobStore`）。

---

### 7.4 `src/pages/Reader.tsx`

论文阅读/翻译核心页面（约 580 行）。

**职责**：
1. 从 URL 取 `projectId` + `routeId`。
2. 调用 `loadPaperForDisplay` 加载论文到 `useReaderStore`。
3. 订阅 `useTranslationJobStore` 翻译事件，调用 `applyTranslationEvent` 更新 `useReaderStore`。
4. 渲染：标题栏（状态/按钮）→ `AbstractSection` → `ViewModeSwitcher` → `AnnotationLayer` wrapping `PaperRenderer`。
5. 目录：`TocRail`（桌面侧边）、`MobileTocPanel`（移动端浮层）、`TocFloatingButton`。

---

### 7.5 `src/ui/reader/` — 论文渲染组件

| 组件 | 说明 |
|------|------|
| `PaperRenderer` | 主渲染器，遍历 blocks，分发到各专用组件；管理 `StreamingDisplaysContext` |
| `AbstractSection` | 摘要区块，支持折叠 |
| `MathBlock` | 行内 / 展示数学（KaTeX） |
| `DisplayMath` | 展示级数学公式，带溢出处理 |
| `FigureBlock` | 图片块（图注双语） |
| `TableContainer` | 表格溢出滚动容器 |
| `OverflowContainer` | 通用横向溢出容器 |
| `MathSpotlight` | 数学公式点击放大 |
| `CitationPopover` | 引用弹窗（悬停显示参考文献） |
| `AnnotationLayer` | 文本选中 → 创建高亮标注 |
| `AnnotationSidebar` | 标注列表侧栏 |
| `SelectionToolbar` | 选中文本时弹出的操作工具条 |
| `TranslationProgressRing` | SVG 圆形进度环 |
| `TranslationWaitingIndicator` | 等待翻译时的 loading 占位 |
| `ViewModeSwitcher` | 切换原文/译文/双语 |

**`flowBlocks.ts`**：将 IR blocks 分组为 `PaperRenderUnit`，把连续的翻译/原文段落合并为一个「流式」单元，减少 DOM 节点数。

**`highlights.ts`**：文本高亮渲染辅助函数。

---

### 7.6 `src/ui/reader/toc/` — 目录导航

| 文件 | 说明 |
|------|------|
| `TocRail` | 桌面左侧目录导轨（固定定位，带 tick 标记） |
| `TocTick` | 目录刻度尺 tick 元素 |
| `MobileTocPanel` | 移动端全屏目录浮层 |
| `ReaderPanelResizeHandle` | 右侧面板拖拽调宽手柄 |
| `scrollToHeading.ts` | 滚动到指定 heading |
| `useActiveHeading.ts` | IntersectionObserver 追踪当前阅读位置 |
| `mobileTocLayout.ts` | 计算移动端目录布局 |
| `mobileTocVisual.ts` | 移动端目录视觉样式辅助 |

---

### 7.7 `src/ui/settings/` — 设置页

| 组件 | 说明 |
|------|------|
| `SettingsPage` | 设置页主组件，分区段展示 |
| `AboutSection` | 关于/版本信息 |
| `ColorPaletteSection` | 调色盘选择与编辑 |
| `ColorPalettePreview` | 调色盘预览卡片 |
| `DataManagementSection` | 数据导出/导入/清除 |
| `OpenRouterMetaPanel` | OpenRouter 模型元数据展示 |
| `sections.ts` | 设置分区定义 |

---

### 7.8 `src/ui/shell/` — 应用外壳

| 文件 | 说明 |
|------|------|
| `AppShell` | 顶层布局（侧边栏 + 内容区） |
| `Sidebar` | 左侧导航侧边栏（项目列表 + 功能导航） |
| `ProjectScope` | 项目上下文路由守卫 |
| `LocaleSync` | 同步 `<html lang>` 属性 |
| `PaletteSync` | 首次加载时应用调色盘 CSS 变量 |
| `CurrentProjectLabel` | 顶部显示当前项目名 |
| `PageFooter` | 页脚 |
| `featureNav.ts` | 功能导航菜单定义 |
| `featureIcons.tsx` | 功能图标 SVG |
| `useVisualViewportBox.ts` | 移动端 Visual Viewport 适配 |

---

### 7.9 `src/ui/brand/`

Logo、LogoWatermark、MiniLogo、CreditsDialog、BrandCreditsTrigger 等品牌相关组件。

---

## 8. PWA 层 `src/pwa/`

| 文件 | 说明 |
|------|------|
| `register.ts` | `initPwa()`：注册 Service Worker；`applyPwaUpdate()`：立即激活等待中的 SW |
| `store.ts` | `usePwaStore`：管理安装提示事件和更新就绪状态 |
| `config.ts` | `PWA_MANIFEST`（Web App Manifest 内容）和 `PWA_WORKBOX_RUNTIME_CACHING`（图片缓存策略） |
| `InstallButton` | PWA 安装按钮 |
| `UpdatePrompt` | 检测到新版本时的更新提示 |
| `OfflineBanner` | 离线状态横幅 |
| `PwaOverlays` | 组合 UpdatePrompt + OfflineBanner |

---

## 9. 国际化层 `src/i18n/`

**`src/i18n/index.ts`** 和 **`src/i18n/useTranslation.ts`**：

```ts
// React hook，消费 core/i18n/messages
const { t, locale } = useTranslation();
t("paperBox.title")           // 普通翻译
t("projects.updatedAt", { date }) // 带参数插值
```

`locale` 来自 `useSettingsStore().uiLocale`，store 变化时 hook 自动响应。

**`LanguageSwitcher.tsx`**：语言切换 UI 组件。

---

## 10. 数据流与架构全图

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

---

## 11. 关键数据类型速查

```ts
// 核心 IR
type PaperIR = { arxivId, version, title, abstract, abstractBlocks, authors, blocks, references, createdAt, modelUsed }
type Block = { id, type, level?, content, caption?, translation?, math?, meta? }
type Reference = { id, label, text }

// 论文条目（DB 元数据）
type Paper = { projectId, routeId, importMethod, arxivId, version, source, title, authors, status, error?, modelUsed?, createdAt, updatedAt }

// 项目
type Project = { id, name, createdAt, updatedAt }

// 设置
type AppSettings = { activeProviderId, viewMode, targetLang, debugMode, uiLocale, lastProjectId, activePaletteId, customPalette }
type ViewMode = "original" | "translation" | "bilingual"

// 标注
type Annotation = { id?, paperId, blockId, startOffset, endOffset, quote, note?, color?, createdAt }
type TextAnchor = { blockId, startOffset, endOffset, quote }

// LLM
type ProviderConfig = { id, apiKey, baseURL, model, reasoningEffort?, translationReasoningEffort?, openRouterMeta? }
interface LLMProvider { id: string; chat(opts, deps?): AsyncIterable<string> | Promise<string> }

// 翻译进度
type TransformProgress = { type: "structure"; ir } | { type: "block-translated"; blockId; translation; partial?; debugMetrics? } | { type: "done"; ir } | { type: "degraded"; ir; reason }

// 调色盘
type ColorPalette = { sidebarBg, sidebarActive, primary, primaryHover, pageBg, cardBg, textPrimary, textSecondary, border, translation }

// 目录
interface TocEntry { id: string; title: string; level: number; }

// 备份
type Backup = { formatVersion: 1, exportedAt, projects, paperEntries, papers, annotations, aiSessions, settings, secrets? }
type ImportStrategy = "overwrite" | "skip"
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

### 12.2 新增 Provider 步骤

1. 在 `src/core/llm/providers/` 下实现 `class XxxProvider implements LLMProvider`（`id` 字段、`chat` 方法）。
2. 在 `createProvider.ts` 的 switch 里新增 case。
3. 在设置页 `SettingsPage` 中添加对应的 id 选项和表单字段（baseURL 默认值等）。
4. 添加 `providers/xxx.test.ts` 单测。

### 12.3 Reasoning Effort

部分 Provider（OpenAI o 系列、DeepSeek R 系列、Anthropic Claude 3.7+）支持推理强度控制。`ProviderConfig` 中：
- `reasoningEffort`：通用调用（测试连接等）的推理强度，默认 `"low"`。
- `translationReasoningEffort`：翻译专用，默认 `"off"`（翻译任务不需推理，off 最快最省）。

`providerReasoning.ts` 中定义各 Provider 的参数映射（如 OpenAI 用 `reasoning_effort`，Anthropic 用 `thinking.budget_tokens`）。

---

## 13. 翻译流水线

### 13.1 分片策略（`chunk.ts`）

1. 遍历所有 `isTranslatableBlock` 的 blocks（排除 math、codeblock）。
2. figure block 翻译 `caption` 而非 `content`。
3. 超过 `DEFAULT_MAX_CHUNK_CHARS`（4000）字符的 block 按「句子边界」拆分为多 `part`，各 part 独立发送，最终拼合。
4. 每个 block 生成一或多个 `TranslationUnit`，prompt ID 为 `blockId`（单 part）或 `blockId__part0`（多 part）。

### 13.2 Prompt 格式

**System**（新翻译）：

```
You are a precise academic translator.
Translate ALL given content blocks into {targetLang} in a single response.
Rules:
- Output ONLY valid JSON. ...
- Schema: { "translations": [ { "id": "...", "translation": "..." } ] }
- ...（保留 HTML 标签、专业术语等规则）
```

**User**：

```json
{ "blocks": [ { "id": "b1", "content": "..." }, ... ] }
```

**续翻（resume）User**：

```json
{ "completed": [ { "id": "b0", "source": "...", "translation": "..." } ], "blocks": [ { "id": "b1", ... } ] }
```

### 13.3 流式解析（`parseResponse.ts`）

LLM 边 stream 边累积 JSON，`extractStreamingTranslationUpdates` 用正则从不完整 JSON 中提取已完成的 translation 字段，实现「先到先渲染」效果，无需等待整个批次完成。

### 13.4 重试机制

最多重试 2 次（`MAX_RETRIES = 2`）。重试时在 User 消息末尾附上上次的非法输出，让 LLM 自我修正。

### 13.5 断点续传（`persistDraft.ts`）

每收到一个 `block-translated`（完整，非 partial）事件，立即调用 `savePaper(ir)` 将当前进度持久化到 IndexedDB。翻译被中断后，再次打开论文时通过 `resumeTranslation` 仅翻译未完成的 blocks。

---

## 14. 调色盘与主题系统

### 14.1 架构

调色盘系统通过 CSS 自定义属性（`--rb-*`）实现即时换肤，无需重新渲染组件树。

**颜色 token → CSS 变量映射**（`PALETTE_CSS_VARS`）：

| Token | CSS 变量 |
|-------|---------|
| `sidebarBg` | `--rb-sidebar-bg` |
| `sidebarActive` | `--rb-sidebar-active` |
| `primary` | `--rb-primary` |
| `primaryHover` | `--rb-primary-hover` |
| `pageBg` | `--rb-page-bg` |
| `cardBg` | `--rb-card-bg` |
| `textPrimary` | `--rb-text-primary` |
| `textSecondary` | `--rb-text-secondary` |
| `border` | `--rb-border` |
| `translation` | `--rb-translation` |

侧边栏文字色（`--rb-sidebar-text`、`--rb-sidebar-text-muted`）由 `deriveSidebarText(sidebarBg)` 根据背景亮度自动推导，用户无需手动维护对比度。

### 14.2 内置预设

| id | 名称 |
|----|------|
| `default` | 默认蓝 |
| `academic-green` | 学院绿 |
| `dark-purple` | 暗夜紫 |
| `warm-orange` | 暖橙 |

### 14.3 自定义调色盘

- 用户可通过设置页编辑 10 个颜色 token，实时预览。
- 编辑中的未保存状态：`activePaletteId = "custom"`，数据存 `AppSettings.customPalette`。
- 保存后写入 IndexedDB `palettes` 表，生成唯一 `id`。
- 调用 `applyPalette(palette)` 将变量写入 `:root`。

---

## 15. 测试约定

### 15.1 单测（Vitest）

- 每个 `core/xxx` 模块配同名 `xxx.test.ts`（或 `.test.tsx`）。
- 使用 `fake-indexeddb` 模拟 IndexedDB，无需真实浏览器。
- 测试 UI 组件使用 `@testing-library/react`。
- 配置文件：`src/test-setup.ts`（全局 jest-dom matcher）。

**运行**：`npm run test`（单次）或 `npm run test:watch`（交互式）。

### 15.2 E2E（Playwright）

- 测试文件位于 `tests/e2e/`，fixtures 位于 `tests/fixtures/`。
- 配置文件：`playwright.config.ts`。
- **运行**：`npm run test:e2e`（需先 `npm run test:e2e:install`）。

### 15.3 每次交付必须

1. `npm run typecheck` ——零 TypeScript 错误。
2. `npm run test` ——所有单测通过，贴出结果。
3. 改动涉及多文件时，先列改动清单再写代码。
