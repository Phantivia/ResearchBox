# ResearchBox 技术手册

> 面向研究人员的轻量级论文阅读与研究工具箱 · 纯前端 / 无后端 / 用户自带 LLM API Key  
> 顶层组织单位：**项目（Project）**；两大功能：**Paper Box**（论文阅读与翻译）+ **ChatBox**（研究 Agent）

---

## 1. 项目定位与约束

| 维度 | 决策 |
|------|------|
| 产品形态 | 纯前端 SPA + PWA，无服务端业务逻辑 |
| 部署 | 静态托管（GitHub Pages / Cloudflare Pages / Vercel 静态），CDN 即可 |
| 数据归属 | 全部本地化（IndexedDB + Cache API），用户自带 LLM API Key |
| 平台 | PC 浏览器 + 安卓（PWA 安装到桌面，可选 TWA 上架 Play 商店） |
| 开发模式 | 重度依赖 Coding Agent，技术栈必须「主流 + 文档充足 + 类型完备」以提升 Agent 生成正确率 |
| 网络前提 | 经实测，arXiv、各 LLM 厂商及主流学术搜索 API **均无 CORS 限制**，前端可直接 `fetch` |

这套约束决定了三条主线：**零后端**（一切在浏览器跑）、**本地优先**（offline-first）、**Agent 友好**（强类型、强约定、模块边界清晰）。

### 两大功能线

| 功能 | 定位 | 典型场景 |
|------|------|----------|
| **Paper Box** | arXiv HTML 论文阅读 + AI 批量翻译 | 导入论文 → 原文/译文/双语阅读 → 高亮标注 |
| **ChatBox** | 项目级研究 Agent | 检索已入库论文 → 外部学术搜索 → 推荐入库 → 保存研究产出（Artifact）→ 可选 Web 搜索与 Python 沙箱 |

ChatBox 与 Paper Box 共享同一套 LLM Provider 配置与 `PaperIR` 缓存，但在项目内数据（会话、Artifact、论文条目）上相互隔离。

---

## 2. 技术栈总览

| 层 | 选型 | 理由速记 |
|------|------|----------|
| 语言 | **TypeScript**（strict） | Agent 生成代码的护栏；类型即文档 |
| 框架 | **React 19 + Vite 8** | 生态最大、Agent 训练语料最多、出错率最低 |
| 构建 | **Vite 8** | HMR 快、PWA 插件成熟 |
| PWA | **vite-plugin-pwa**（基于 Workbox） | 一行配置生成 service worker + manifest |
| 路由 | **React Router v7** | SPA 内部路由，hash 模式适配静态托管 |
| 状态 | **Zustand v5** | 轻量、样板少、对 Agent 友好 |
| 本地存储 | **IndexedDB + Dexie.js v4** | 论文/标注/Agent 会话/Artifact 等结构化大数据 |
| 数学渲染 | **KaTeX v0.17** | 同步渲染、不 reflow、bundle 小，适配公式密集页面 |
| HTML 清洗 | **DOMPurify + 原生 DOMParser** | 安全清洗 + 结构化解析 |
| 样式 | **Tailwind CSS v4** | 约定式、Agent 极擅长、无运行时开销 |
| Markdown | **react-markdown + remark-gfm** | Artifact 与 Agent 回复渲染 |
| Python 沙箱 | **Pyodide v3.14**（Web Worker） | Agent 在用户授权下执行数据分析脚本 |
| OCR | **tesseract.js v6** | ChatBox 用户消息图片文字识别 |
| LLM 调用 | 各厂商 REST（fetch 直连，无 SDK 锁定） | 统一 Provider 抽象层；翻译用 `chat()`，Agent 用 `runWithTools()` |
| 测试 | **Vitest + Playwright** | 单测与端到端 |
| 安卓打包（可选上架） | **PWABuilder / Bubblewrap（TWA）** | 把 PWA 包成可上架的 APK/AAB |

> **为什么是 React 而不是 Svelte？**  
> 本项目的核心瓶颈不是框架运行时（论文渲染、LLM 网络、IndexedDB 才是大头），而是**开发速度与 Agent 正确率**。React 拥有数量级更大的训练语料和生态。轻量目标通过 Vite 代码分割 + 懒加载 + 严控依赖来达成。

---

## 3. 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                         UI 层 (React)                             │
│  ChatBox 聊天 · Paper Box 列表 · Reader 阅读 · 标注层 · 设置     │
├──────────────────────────────────────────────────────────────────┤
│                    应用 / 状态层 (Zustand)                         │
│  agentStore · readerStore · paperStore · projectStore · settings  │
├──────────────────────────────────────────────────────────────────┤
│                     核心服务层 (纯 TS 模块)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌─────────────────┐  │
│  │ Fetcher  │→│ Cleaner  │→│ Transformer  │ │ Cache (图片)    │  │
│  └──────────┘ └──────────┘ └──────────────┘ └─────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Agent 引擎：runAgent → executeBatched → Tools               │ │
│  │   paperbox · retrieval · academic_search · artifacts · …    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  LLM Provider 抽象层 · Annotation 引擎 · 备份/恢复               │
├──────────────────────────────────────────────────────────────────┤
│           持久层 (Dexie / IndexedDB v7 + Cache API)               │
└──────────────────────────────────────────────────────────────────┘
                              │
                    Pyodide Web Worker（按需加载）
```

核心原则：**服务层是与框架无关的纯 TypeScript 模块**（`src/core/`）。UI 用 React，但 Fetcher / Cleaner / Transformer / Agent 循环全是可单测的纯函数/类。详细模块索引见 `PROJECT.md`。

---

## 3.5 项目（Project）模型与数据隔离

应用以**项目（Project / 工作区）**为顶层组织单位。主界面即项目管理：新建、删除、重命名项目。

- **使用流程**：进入 App → 创建/选择项目 → 默认进入 **ChatBox**；也可切换到 Paper Box 等功能。
- **按项目隔离**：Paper Box 论文条目、标注、Agent 会话、Artifact。
- **跨项目共享**：LLM Provider、全局设置（界面语言、目标语言、视图模式、Agent 能力开关等）、论文内容缓存（`PaperIR`）。
- **内容缓存共享**：`papers` 表（键 `arxivId+version`）跨项目共享，避免对同一论文重复抓取/翻译；`paperEntries` 与 `annotations` 按项目隔离。

实体关系：

```
Project (工作区: id, name)
   ├─ 1:N ─ Paper (paperEntries: [projectId+routeId])
   │            ├─ 引用 ─ PaperIR (papers: arxivId+version, 跨项目共享)
   │            └─ 关联 ─ annotations ([projectId+paperId])
   ├─ 1:N ─ AgentSession (agentSessions: 按 projectId)
   └─ 1:N ─ Artifact (artifacts: 按 projectId)

全局共享：settings / secrets（LLM Provider + 全局偏好）
```

> **命名提示**：顶层工作区为 `Project`；Paper Box 内一篇导入论文的元数据为 `Paper`（`paperEntries` 表）；论文内容为 `PaperIR`（`papers` 表）。三者解耦。

### 路由（hash 模式）

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 项目管理首页 | 新建 / 重命名 / 删除 / 进入项目 |
| `/p/:projectId` | — | 默认重定向到 `chat-box` |
| `/p/:projectId/chat-box` | **ChatBox** | 研究 Agent 主界面（项目默认落地页） |
| `/p/:projectId/chat-box/artifacts` | Artifact 浏览 | 项目内研究产出列表 |
| `/p/:projectId/paper-box` | Paper Box | 论文列表 + 导入 |
| `/p/:projectId/paper/:routeId` | Reader | 阅读/翻译某论文 |
| `/p/:projectId/dummy` | Dummy | 占位功能页 |
| `/settings` | 设置 | 全局共享 |

`/p/:projectId/*` 由 `ProjectScope` 守卫：校验项目存在性，同步活动项目到 `settings.lastProjectId`；项目不存在时渲染「当前无项目」页。

Legacy：`/p/:projectId/agent` 重定向到 `chat-box`。

### Sidebar 导航（三 Dock）

| Dock | 内容 |
|------|------|
| **Chat Box** | 新对话 + 会话历史（`HistorySearch`） |
| **Features** | Paper Box · Dummy · Artifact 浏览 |
| **Settings** | 设置页各分区锚点 |

### 移动端布局

- 顶部条：左上角汉堡键展开抽屉式侧边栏，右上角 Logo。
- 抽屉编排与 PC 一致：项目切换、Home、三 Dock 导航。
- Reader 页：TOC 快捷入口在移动端 header 中。

---

## 4. Paper Box 核心流程

### 4.1 数据流水线

```
用户输入 URL / arXiv ID
        │
        ▼
  ① 解析 ID  ── 归一化为 arxiv id（含版本号）
        │
        ▼
  ② Fetcher  ── fetch arxiv.org/html/{id}，失败回退 ar5iv.org
        │
        ▼
  ③ Cleaner  ── 规则清洗：去脚本/样式/冗余包裹，保留语义结构
        │
        ▼
  ④ Transformer(LLM) ── 清洗后 HTML → IR + 译文，分块流式
        │                  （支持断点续传：每块完成即 persistDraft）
        ▼
  ⑤ Cache    ── IR 写入 IndexedDB（按 id+version 键）
        │
        ▼
  ⑥ Renderer ── 由 IR 渲染（原文/译文/双语 + 标注层 + 引用弹窗 + KaTeX）
```

**只读模式**：Reader 打开时可先加载结构（不翻译），用户手动触发翻译；翻译任务可在后台运行（Paper Box 列表显示进度环）。

### 4.2 各阶段技术要点

**① ID 解析**  
支持 `https://arxiv.org/abs/2401.12345`、`/pdf/...`、`/html/...`、裸 `2401.12345`、`2401.12345v2`。无版本号时查缓存取最新。

**② Fetcher**  
- 主源：`arxiv.org/html/{id}`；回退：`ar5iv.org/html/{id}`。  
- 无 CORS 限制，直接 `fetch`；404 → `NoHtmlVersionError`。  
- 图片预缓存到 Service Worker Cache（`paper-images-v1`），供离线查看。

**③ Cleaner**  
- `DOMParser` + `DOMPurify`；移除导航/页眉页脚等 boilerplate。  
- 识别 block 类型（heading/paragraph/math/figure/table/list/codeblock/reference），生成稳定 `id`。  
- 绝对化图片 URL、规范化 TeX、剔除 MathML source annotation。  
- **确定性、可单测、零 LLM 成本**。

**④ Transformer**  
- 按 block 分片（默认 4000 字符/片，超长按句子边界拆分）。  
- 流式 JSON 解析：边 stream 边渲染已完成块的译文。  
- Zod 校验 + 最多 2 次重试 + 降级（部分翻译失败仍展示）。  
- figure 翻译 `caption` 而非 `content`；math/codeblock 跳过。

**⑤ Cache**  
- IR 存 IndexedDB，主键 `[arxivId+version]`；命中缓存秒开。  
- 设置页提供「清除全部译文缓存」。

**⑥ Renderer**  
- `PaperRenderer` 遍历 IR blocks；`flowBlocks` 合并连续段落减少 DOM 节点。  
- KaTeX 渲染数学；`ImageViewer` 支持图片放大。  
- 三种视图模式：原文 / 译文 / 双语。

---

## 5. 内部表示（IR）设计

IR 是整个工具箱的「中央数据格式」，Paper Box 与 ChatBox 的 Paper Box 工具（`paperbox_read` / `paperbox_fetch` / `retrieval`）均围绕它构建。用 **Zod schema** 定义并导出 TS 类型（`src/core/ir/schema.ts`），作为单一事实来源。

```typescript
const Block = z.object({
  id: z.string(),                 // 稳定锚点，标注/引用/Agent 引用定位用
  type: z.enum(['heading','paragraph','math','figure',
                'table','list','codeblock','reference']),
  level: z.number().optional(),
  content: z.string(),            // 原文 HTML 片段
  caption: z.string().optional(), // figure 图注（翻译目标）
  translation: z.string().optional(),
  math: z.object({ tex: z.string(), display: z.boolean() }).optional(),
  meta: z.record(z.unknown()).optional(),
});

const PaperIR = z.object({
  arxivId: z.string(),
  version: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  abstract: z.string(),
  abstractBlocks: z.array(Block),
  blocks: z.array(Block),
  references: z.array(z.object({
    id: z.string(), label: z.string(), text: z.string(),
  })),
  createdAt: z.number(),
  modelUsed: z.string(),
});
```

设计要点：
- `id` 在 Cleaner 阶段生成并贯穿全程；ChatBox Agent 引用格式为 `paperId#blockId`（如 `2401.12345#b-abstract-0`）。
- `translation` 可选，支持「先结构后填充」的流式体验。
- 同一 IR 可渲染原文、译文、双语三种视图。

---

## 6. QOL 功能的技术实现

### 6.1 标注（高亮 + 笔记）

- 用 `window.getSelection()` + `Range` API 捕获选区。
- 用 **CSS Custom Highlight API**（`Highlight` / `::highlight()`）做高亮；不支持时降级为 `<mark>` 包裹（`highlights.ts`）。
- 选区映射回 IR 的 `block.id` + 字符偏移，持久化到 IndexedDB（`annotations` 表，按 `[projectId+paperId]` 隔离）。
- 标注侧栏（`AnnotationSidebar`）展示列表，支持编辑笔记、删除。

> **说明**：Reader 内暂无「划词问 AI」侧栏；AI 对话能力已迁移至 **ChatBox**。legacy `aiSessions` 表保留但无新 UI 入口。

### 6.2 引用点击弹窗

- Cleaner 阶段把 `<cite>` / 参考文献锚点关联到 `references[].id`。
- 点击引用 → `CitationPopover`（Floating UI 定位）在原地弹出参考文献内容，不整页跳转。

### 6.3 数学渲染

- 默认 **KaTeX**（同步、快、bundle 小）。
- arXiv HTML 自带 MathML；`sanitizeMathml.ts` 剔除 LaTeXML 的 TeX annotation，防止 Firefox 重复渲染裸 TeX。
- `MathSpotlight` 支持点击公式放大查看。

### 6.4 目录导航

- `extractToc` 从 heading blocks 抽取目录。
- 桌面：`TocRail` 固定左侧导轨 + IntersectionObserver 追踪当前位置。
- 移动端：`MobileTocPanel` 全屏浮层。

### 6.5 调色盘与主题

- 10 个颜色 token 映射到 CSS 变量（`--rb-*`），即时换肤。
- 4 个内置预设 + 用户自定义方案（存 `palettes` 表）。

---

## 7. ChatBox（研究 Agent）

ChatBox 是项目级多轮 Agent，在用户配置的 LLM Provider 上运行，通过工具调用访问 Paper Box 与外部资源。

### 7.1 采集 / 研究双模式（盒子开/关）

| 模式 | 用户操作 | Agent 行为 |
|------|----------|-----------|
| **采集阶段**（盒子打开） | `BoxSwitch` 切换 | 可外部学术搜索、Web 搜索、向用户推荐论文入库 |
| **研究阶段**（盒子关闭） | 关闭盒子 | 仅检索 Paper Box 内已入库论文；插入边界标记消息 |

关闭盒子后 Agent 不得再调用 `academic_search` / `websearch` / `recommend_papers`，专注已入库文献的深度分析。

### 7.2 Agent 工具能力

| 类别 | 工具 | 说明 |
|------|------|------|
| Paper Box 读取 | `paperbox_list` / `paperbox_read` / `paperbox_fetch` | 列出/分段/全文读取已入库论文 |
| 语义检索 | `retrieval` | 在项目全部论文 blocks 中 side-query 检索 |
| 外部搜索 | `academic_search` | OpenAlex → Semantic Scholar，结果仅 Agent 可见 |
| 论文推荐 | `recommend_papers` | 向用户展示入库卡片（用户确认后导入 Paper Box） |
| Web 搜索 | `websearch` | Tavily / Perplexity（需设置开启 + 用户审批） |
| 研究产出 | `artifacts` | 保存 summary / compare-table / outline / note 到 IndexedDB |
| 子 Agent | `sub_agent` | 启动 paper-summarizer 或 reviewer 子任务 |
| 代码执行 | `python` | Pyodide WASM 沙箱（需设置开启 + 高风险审批） |
| 大结果加载 | `fetch_result` | 加载持久化的超大工具输出 |

工具审批：`permissionMode` 为 `"default"` 时低风险工具自动放行；`"ask"` 时 Web 搜索、Artifact 保存、Python 执行均需用户确认。

### 7.3 会话与 Artifact

- **会话**：每轮对话持久化到 `agentSessions` 表；Sidebar `HistorySearch` 支持搜索/加载/重命名/置顶/删除。
- **Artifact**：Agent 经审批后保存 Markdown 研究产出；可在 ChatBox 内预览，或在 `/chat-box/artifacts` 全页浏览。
- **多模态**：用户消息支持图片粘贴/拖拽 + Tesseract OCR 识别文字。

### 7.4 Agent 循环

```
用户消息 → runAgent
  → llm.runWithTools（流式 text/thinking/tool_use）
  → executeBatched（并发安全工具并行，上限 4）
  → 工具结果 + evidence 消息 → 下一 turn
  → terminal: completed | aborted | approval_denied | max_turns
```

最大 30 轮；连续 3 次同工具失败触发熔断。详细实现见 `PROJECT.md` 第 15 节。

---

## 8. LLM Provider 抽象层

用户自带 Key，支持多厂商。统一接口屏蔽差异：

```typescript
interface LLMProvider {
  id: string;
  chat(opts: ChatOptions): AsyncIterable<ChatStreamChunk> | Promise<string>;
  runWithTools?(req: {
    messages: AgentMessage[];
    tools: ToolSchema[];
    system: string;
    signal?: AbortSignal;
  }): AsyncGenerator<StreamEvent, AssistantMessage>;
}
```

**已支持 Provider**：OpenAI、Anthropic、Gemini、DeepSeek、OpenRouter、SiliconFlow。

要点：
- **直连 REST，不绑 SDK**；Key 存 IndexedDB `secrets` 表（当前明文 JSON，计划 WebCrypto 加密）。
- 翻译调 `chat()` + `json:true`；ChatBox Agent 调 `runWithTools()`。
- 子 Agent 通过 `subAgentModel` / `subAgentReasoningEffort` 使用独立（通常更轻量）的模型配置。
- 推理强度：`reasoningEffort`（通用）、`translationReasoningEffort`（翻译，默认 off）、`subAgentReasoningEffort`（子 Agent，默认 off）。

> **安全提醒**：Key 仅存本地浏览器，「纯前端存 Key」无法做到服务端级防护，公用设备需谨慎。

---

## 9. 本地存储方案（Dexie / IndexedDB v7）

| 表 | 主键 / 索引 | 内容 |
|------|------------|------|
| `projects` | `id` | 顶层项目（工作区） |
| `paperEntries` | `[projectId+routeId]` | Paper Box 论文条目元数据 |
| `papers` | `[arxivId+version]` | PaperIR（跨项目共享） |
| `annotations` | `++id`；`[projectId+paperId]` | 标注（按项目隔离） |
| `aiSessions` | `++id` | legacy 划词问答（无新 UI） |
| `agentSessions` | `++id`；`projectId, updatedAt` | ChatBox 会话历史 |
| `artifacts` | `id`；`projectId, updatedAt, kind` | Agent 研究产出 |
| `toolResults` | `id` | 超大工具输出全文 |
| `palettes` | `id` | 用户自定义调色盘 |
| `settings` | key | 全局偏好（key=`"app"`） |
| `secrets` | provider | LLM Provider 配置（含 API Key） |

**版本迁移**：v1 初始 → v2 projects → v3 项目模型重构 → v4 palettes → v5 artifacts → v6 toolResults → v7 agentSessions。

**备份**：`exportData` / `importData` 覆盖 projects、paperEntries、papers、annotations、legacy aiSessions、settings、secrets。**尚未纳入备份**：agentSessions、artifacts、toolResults、palettes。

- 图片走 **Cache API**（service worker），不存 IndexedDB。
- `useStorageStore` 监控 `navigator.storage.estimate()` 配额。
- 调用 `navigator.storage.persist()` 申请持久化。

---

## 10. PWA 与安卓落地

1. **vite-plugin-pwa** 生成 manifest + service worker。
   - App Shell 走 precache；论文图片走运行时缓存（`paper-images-v1`）。
2. **离线优先**：已转换论文可离线阅读、标注；fetch 新论文与调 LLM 需网络。
3. **安卓桌面安装**：满足 installability 即可「添加到主屏幕」。
4. **上架 Play 商店（可选）**：PWABuilder / Bubblewrap → TWA APK/AAB。
5. PC 端同一份 PWA，或 Edge/Chrome「安装应用」。

---

## 11. 项目结构

```
researchbox/
├─ src/
│  ├─ core/                 # 框架无关纯 TS，独立可测
│  │  ├─ agent/             # ChatBox Agent 引擎 + 工具 + 检索 + 搜索
│  │  ├─ fetcher/ cleaner/ transformer/ ir/ llm/
│  │  ├─ project/ paper/ annotation/ settings/ storage/
│  │  ├─ colorPalette/ toc/ math/ media/ network/ cache/
│  │  └─ pipeline/          # 端到端加载 + 翻译流水线
│  ├─ db/                   # Dexie v7（含 agentSessions / artifacts）
│  ├─ store/                # Zustand（含 agentStore）
│  ├─ pages/                # Welcome / AgentChat / ChatBoxArtifacts / PaperBox / Reader
│  ├─ ui/
│  │  ├─ ai-panel/          # ChatBox 聊天 UI
│  │  ├─ shell/             # AppShell + Sidebar（三 Dock）+ ProjectScope
│  │  ├─ reader/            # 渲染器 + 标注 + TOC
│  │  └─ settings/          # 含 Academic Search / Agent Capabilities / ChatBox 分区
│  ├─ workers/pyodide.worker.ts
│  ├─ pwa/
│  └─ main.tsx
├─ tests/e2e/
├─ vite.config.ts
└─ playwright.config.ts
```

详细模块索引与 API 见 **`PROJECT.md`**（开发手册）。

---

## 12. 开发路线图

**Phase 0 — 骨架** ✅  
Vite + React + TS + Tailwind + PWA；Dexie + Zustand；IR Zod schema 定稿。

**Phase 1 — 只读链路** ✅  
ID 解析 → Fetcher → Cleaner → 清洗版渲染 → KaTeX。

**Phase 2 — LLM 翻译 + IR + 缓存** ✅  
Provider 抽象 → Transformer 产 IR + 译文 → IndexedDB 缓存 → 双语视图 → 断点续传。

**Phase 3 — QOL** ✅（部分）  
标注高亮 + 持久化 ✅ · 引用弹窗 ✅ · 目录导航 ✅ · 调色盘 ✅  
Reader 内划词问 AI → 已迁移为 ChatBox Agent。

**Phase 4 — 项目模型 + Paper Box** ✅  
多项目隔离 · paperEntries · 后台翻译任务 · 备份/恢复。

**Phase 5 — ChatBox 研究 Agent** ✅（持续迭代）  
Agent 循环 · 12 工具 · 采集/研究双模式 · 会话持久化 · Artifact · Pyodide · OCR · 学术/Web 搜索。

**Phase 6 — 打磨与上架**（进行中）  
备份扩展（agent 数据）· Key 加密 · 离线体验 · 安卓 TWA · 技能模板接入 Composer。

**未来 — PDF2HTML**  
复用 Provider 抽象与 IR：PDF → LLM → arXiv 风格 HTML/IR，接入现有渲染管线。

---

## 13. 关键风险与对策

| 风险 | 对策 |
|------|------|
| LLM 输出 JSON 不合规 | Zod 校验 + 修复重试 + 降级为纯清洗/部分翻译渲染 |
| 长论文超上下文 | 按 block 分片流式转换；Agent 侧 retrieval 预过滤 + side-query |
| arXiv 无 HTML 版 | 提示用户；ChatBox 学术搜索仅推荐有 HTML 版的 arXiv 论文 |
| KaTeX 公式不全支持 | MathML 兜底；sanitizeMathml 防重复渲染 |
| 本地存储被浏览器清除 | `persist()` + 配额监控 + 导出/备份 |
| 纯前端 Key 安全性有限 | UI 明确告知 + 计划 WebCrypto 加密 |
| Agent 工具误操作 | 审批系统（ask 模式）+ 盒子关闭边界 + Python 高风险审批 |
| Agent 改动破坏模块边界 | `core/` 强类型 + 单测覆盖 + IR 单一事实来源 |
| 备份不含 Agent 数据 | 已知 gap；Phase 6 扩展 BackupSchema |

---

## 14. 一句话总结

**TypeScript + React 19 + Vite 8 + Dexie(IndexedDB v7) + KaTeX + Pyodide + vite-plugin-pwa**，配框架无关的 `core/` 纯逻辑层、以 Zod 定义的 IR 中央数据格式、以及项目级 ChatBox 研究 Agent——既满足「轻量纯前端、本地优先、双端可装」，又提供从论文阅读翻译到文献检索分析的完整研究工作流。
