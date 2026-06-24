<div align="center">

<img src="./logo.svg" alt="ResearchBox" width="440" />

# ResearchBox

**为学术研究打造的 Agent 框架与工具集 · 纯前端 / 无后端 / 本地优先**

在项目上下文中与 AI 对话：检索论文库、外部学术搜索、推荐入库、保存研究产出，可选 Web 搜索与 Python 沙箱。  
配套 **Paper Box** 把 arXiv 论文变成可读、可译、可标注的结构化知识库——一切在浏览器里运行，数据留在你的设备上。

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)](https://vite.dev/)
[![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](#license)
[![Live Demo](https://img.shields.io/badge/在线体验-GitHub%20Pages-646cff)](https://phantivia.github.io/ResearchBox/)

**简体中文** · [English](#english)

🌐 **在线体验：** [https://phantivia.github.io/ResearchBox/](https://phantivia.github.io/ResearchBox/)

</div>

---

## 这是什么

ResearchBox 是一个**面向研究人员的纯前端 PWA**，核心卖点是 **ChatBox —— 一套为学术场景设计的 Research Agent 框架与工具集**：

- **Agent 引擎**：`runAgent` 多轮工具循环、流式推理、工具审批、子 Agent、超大结果分页加载——全部在 `src/core/agent/` 以框架无关的纯 TypeScript 实现，可单测、可复用。
- **学术工具集**：Paper Box 检索、语义 block 检索、OpenAlex / Semantic Scholar 搜索、论文推荐入库、Artifact 持久化、可选 Web 搜索与 Pyodide Python 沙箱。
- **采集 / 研究双模式**：「盒子打开」可向外搜索并推荐论文入库；「盒子关闭」后 Agent 仅在你已整理的 Paper Box 内工作，边界清晰、可审计。
- **自带 LLM**：OpenAI / Anthropic / Gemini / DeepSeek / OpenRouter / SiliconFlow 等，用户填写自己的 API Key，无厂商锁定。

Paper Box 提供 Agent 的**知识底座**：arXiv 论文抓取 → 清洗 → 结构化 IR → AI 批量翻译 → 原文/译文/双语阅读与标注。Agent 与阅读器共享同一套 `PaperIR`，引用格式统一为 `paperId#blockId`。

> 应用以 **项目（Project / 工作区）** 为顶层组织单位；进入项目后默认落地 **ChatBox**。

---

## ChatBox：Research Agent

ChatBox 不是通用聊天框，而是围绕**文献调研、论文精读、研究产出**设计的 Agent 运行时：

| 能力 | 说明 |
|------|------|
| **多轮工具循环** | LLM 调用工具 → 执行 → 结果回注 → 继续推理，支持并发安全工具并行（上限 4） |
| **流式体验** | 文本、thinking 块、Python 代码、工具卡片实时渲染；后台运行，切页不中断 |
| **工具审批** | Web 搜索、Python、Artifact 写入等敏感操作可配置自动放行或逐项确认 |
| **子 Agent** | `paper-summarizer` / `reviewer` 等专用子任务，独立模型与推理强度 |
| **多模态输入** | 粘贴/拖拽图片，客户端 OCR（tesseract.js）提取文字送入对话 |
| **会话持久化** | 历史搜索、重命名、置顶、删除；Artifact 独立浏览页 |
| **上下文计量** | Token 用量条与详情，帮助控制长对话成本 |

### Agent 工具一览

由 `buildResearchTools()` 组装，均围绕学术研究场景设计：

| 工具 | 用途 |
|------|------|
| `paperbox_list` | 列出当前项目已入库论文 |
| `paperbox_read` | 读取 meta / abstract / outline / full |
| `paperbox_fetch` | 全文紧凑纯文本（含 `paperId#blockId` 锚点） |
| `retrieval` | 对 Paper Box 内 blocks 做语义检索（位图预过滤 + LLM side-query） |
| `academic_search` | 外部学术搜索（OpenAlex → Semantic Scholar，可补全摘要） |
| `recommend_papers` | 向用户展示论文推荐卡片，确认后入库 |
| `artifacts` | 保存研究产出（summary / compare-table / outline / note）到 IndexedDB |
| `sub_agent` | 启动子 Agent 执行专项任务 |
| `fetch_result` | 加载超大工具结果的完整内容 |
| `websearch` * | Tavily / Perplexity Web 搜索（需开启 `allowWeb`） |
| `python` * | Pyodide WASM 沙箱执行 Python（需开启 `allowCode`） |

\* 可在设置中开关；涉及外部网络或代码执行的操作支持审批流程。

### 采集 vs 研究

```
┌─────────────────────────────────────────────────────────┐
│  盒子打开（采集）          │  盒子关闭（研究）            │
│  外部 academic_search      │  仅 Paper Box 内检索         │
│  Web 搜索 + 推荐入库       │  retrieval / read / fetch    │
│  扩充论文库                │  写 Artifact、跑 Python      │
└─────────────────────────────────────────────────────────┘
```

关闭盒子时插入边界标记，Agent 系统 Prompt 与可用工具集同步切换——适合「先广泛搜集，再聚焦已有文献」的研究节奏。

### 框架设计亮点

若你关心 **Agent 框架本身**（而不只是产品功能），ResearchBox 在 `src/core/agent/` 提供了可借鉴的实现：

- **纯 TS 核心**：Agent 循环、工具执行、审批、检索、结果预算均不依赖 React，UI 只是薄边界。
- **Zod 工具 Schema**：每个工具的输入/输出由 schema 约束，类型即契约。
- **Evidence 与溯源**：工具结果带 `paperId#blockId` 引用，UI 展示 Provenance 徽章。
- **Result Budget**：超大输出持久化到 IndexedDB，对话内只保留预览 + `resultId`。
- **Skills 模板**：文献综述、对比表、大纲等 Markdown 技能模板（`skills.ts`）。

开发细节见 [`PROJECT.md`](./PROJECT.md) 第 15 节 · 业务说明见 [`ResearchBox-技术手册.md`](./ResearchBox-技术手册.md)。

---

## Paper Box：论文阅读与翻译

Agent 的论文库建立在 **PaperIR**（Zod 定义的中央数据格式）之上：

- 📥 **一键导入 arXiv** — 支持 `arxiv.org/abs|pdf|html/...` 与裸 ID（含版本号），自动选源与回退。
- 🧼 **干净的正文** — 规则清洗 HTML，保留标题层级、公式、图表与引用；**零 LLM 成本**。
- 🌐 **原文 / 译文 / 双语** — 分块流式翻译，先出结构后补内容；**断点续传**，中断后可续翻。
- ∑ **KaTeX 数学渲染** — 公式密集页面也不抖动。
- ✍️ **划词标注** — 高亮与笔记持久化，跨会话保留。
- 🔗 **引用弹窗** — 点击文中引用原地查看参考文献。
- 🗂️ **多项目隔离** — 论文条目与标注按项目隔离；`PaperIR` 内容跨项目共享缓存，命中即秒开。

---

## 为什么选择 ResearchBox

| | ResearchBox |
|---|-------------|
| **定位** | 学术研究 Agent + 论文工具箱，而非通用 ChatGPT 壳 |
| **部署** | 纯静态 SPA，GitHub Pages / Cloudflare Pages / Vercel 即可 |
| **数据** | IndexedDB 本地持久化，论文、会话、Artifact 不上传 |
| **LLM** | 自带 API Key，多 Provider 统一抽象 |
| **可扩展** | `src/core/` 框架无关，Agent 工具、IR、流水线均可单测与二次开发 |

---

## 快速开始

> 需要 Node.js 18+ 与 npm。

```bash
npm install      # 安装依赖
npm run dev      # 启动开发服务器
npm run build    # 生产构建（含 typecheck）
npm run preview  # 本地预览构建产物
```

**上手路径：**

1. 设置页配置 LLM Provider（及可选的 Semantic Scholar / OpenAlex / Web 搜索 Key）。
2. 创建项目 → 默认进入 **ChatBox**，直接开始文献调研对话。
3. 切换到 **Paper Box** 粘贴 arXiv 链接导入论文；Agent 即可检索、精读已入库内容。
4. 在 ChatBox 开启「盒子」向外搜索并推荐论文；收集完成后关闭盒子，聚焦已有文献写 Artifact。

```bash
npm run typecheck  # 类型检查
npm run test       # Vitest 单测
npm run test:e2e   # Playwright E2E（需先 npm run test:e2e:install）
```

---

## 技术栈

React 19 · Vite · TypeScript strict · Zustand · Dexie (IndexedDB) · Zod · KaTeX · DOMPurify · Pyodide · tesseract.js · Tailwind CSS · Vitest · Playwright

约定与架构铁律见 [`CLAUDE.md`](./CLAUDE.md)。

---

## 路线图

- [x] **Phase 0** 骨架：项目、存储与 IR 数据模型
- [x] **Phase 1** Paper Box 只读链路：arXiv 导入 → 清洗 → 渲染 + 数学
- [x] **Phase 2** 翻译流水线：结构化 IR + 流式译文 + 断点续传 + 双语视图
- [x] **Phase 3** 阅读体验：标注持久化、引用弹窗
- [x] **Phase 4** **ChatBox Research Agent**：工具循环、学术搜索、检索、Artifact、子 Agent、Python 沙箱
- [ ] **Phase 5** 打磨与上架：离线体验优化、配额管理、安卓 TWA 打包
- [ ] **未来** PDF 导入管线、Skills 菜单接入、更多子 Agent 类型

---

## 文档

| 文档 | 内容 |
|------|------|
| [`ResearchBox-技术手册.md`](./ResearchBox-技术手册.md) | 产品定位、功能说明、用户向技术细节 |
| [`PROJECT.md`](./PROJECT.md) | 开发手册：目录结构、模块接口、Agent 架构 |
| [`CLAUDE.md`](./CLAUDE.md) | 贡献约定与技术栈铁律 |

---

## 作者

**PhantAIStudio 出品**

- **Author:** Phantivia
- **Contact:** [phantivia@gmail.com](mailto:phantivia@gmail.com)

---

## License

[MIT](./LICENSE) © ResearchBox

<div align="center">

[⬆ 回到顶部](#researchbox) · [English](#english)

</div>

---

<a id="english"></a>

<div align="center">

<img src="./logo.svg" alt="ResearchBox" width="440" />

# ResearchBox

**An agent framework & toolset built for academic research · Frontend-only / No backend / Local-first**

Chat with AI in project context: search your paper library, run external academic search, recommend papers for import, save research artifacts, and optionally use web search and a Python sandbox.  
**Paper Box** turns arXiv papers into a readable, translatable, annotatable structured knowledge base — everything runs in your browser, data stays on your device.

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)](https://vite.dev/)
[![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](#license-1)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-646cff)](https://phantivia.github.io/ResearchBox/)

[简体中文](#researchbox) · **English**

🌐 **Live demo:** [https://phantivia.github.io/ResearchBox/](https://phantivia.github.io/ResearchBox/)

</div>

---

## What is this

ResearchBox is a **frontend-only PWA for researchers**. Its headline feature is **ChatBox — a Research Agent framework and toolset designed for academic workflows**:

- **Agent engine** — multi-turn tool loop, streaming reasoning, tool approval, sub-agents, and paginated large-result loading — all implemented as framework-agnostic TypeScript in `src/core/agent/`, unit-testable and reusable.
- **Academic toolset** — Paper Box search, semantic block retrieval, OpenAlex / Semantic Scholar search, paper recommendation & import, Artifact persistence, optional web search and Pyodide Python sandbox.
- **Collect vs. research modes** — with the “box open”, the agent can search externally and recommend papers; with the “box closed”, it works only inside your curated Paper Box — clear, auditable boundaries.
- **Bring your own LLM** — OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, SiliconFlow, and more; you supply your own API keys.

**Paper Box** is the knowledge foundation: fetch arXiv HTML → clean → structured IR → AI batch translation → original / translation / bilingual reading with annotations. Agent and reader share the same `PaperIR`; citations use `paperId#blockId`.

> The app is organized around **Projects (workspaces)**; entering a project lands on **ChatBox** by default.

---

## ChatBox: Research Agent

ChatBox is not a generic chat UI — it is an agent runtime built around **literature survey, close reading, and research output**:

| Capability | Description |
|------------|-------------|
| **Multi-turn tool loop** | LLM calls tools → execute → feed results back → continue reasoning; concurrency-safe tools run in parallel (up to 4) |
| **Streaming UX** | Text, thinking blocks, Python code, and tool cards render in real time; runs continue in background when you navigate away |
| **Tool approval** | Sensitive ops (web search, Python, Artifact writes) can auto-approve or require confirmation per action |
| **Sub-agents** | Dedicated tasks like `paper-summarizer` / `reviewer` with separate model and reasoning settings |
| **Multimodal input** | Paste/drag images; client-side OCR (tesseract.js) extracts text for the conversation |
| **Session persistence** | Search history, rename, pin, delete; dedicated Artifact browse page |
| **Context meter** | Token usage bar and details to manage long-conversation cost |

### Agent tools

Assembled by `buildResearchTools()`, all tailored for academic research:

| Tool | Purpose |
|------|---------|
| `paperbox_list` | List papers in the current project |
| `paperbox_read` | Read meta / abstract / outline / full |
| `paperbox_fetch` | Compact full-text with `paperId#blockId` anchors |
| `retrieval` | Semantic search over Paper Box blocks (bitmap prefilter + LLM side-query) |
| `academic_search` | External search (OpenAlex → Semantic Scholar, with abstract backfill) |
| `recommend_papers` | Show recommendation cards; user confirms import |
| `artifacts` | Persist research output (summary / compare-table / outline / note) to IndexedDB |
| `sub_agent` | Spawn sub-agents for focused tasks |
| `fetch_result` | Load full content of oversized tool results |
| `websearch` * | Tavily / Perplexity web search (requires `allowWeb`) |
| `python` * | Pyodide WASM Python sandbox (requires `allowCode`) |

\* Toggle in settings; network/code operations support an approval flow.

### Collect vs. research

```
┌─────────────────────────────────────────────────────────┐
│  Box open (collect)        │  Box closed (research)     │
│  External academic_search  │  Paper Box retrieval only  │
│  Web search + recommend    │  read / fetch / artifacts  │
│  Grow the library          │  Python analysis           │
└─────────────────────────────────────────────────────────┘
```

Closing the box inserts a boundary marker; system prompt and available tools switch together — suited for “cast a wide net, then focus on curated papers.”

### Framework highlights

If you care about the **agent framework itself** (not just the product), `src/core/agent/` offers a reference implementation:

- **Pure TS core** — agent loop, tool execution, approval, retrieval, result budgeting — no React dependency.
- **Zod tool schemas** — typed inputs/outputs for every tool.
- **Evidence & provenance** — tool results carry `paperId#blockId` citations; UI shows provenance badges.
- **Result budget** — oversized outputs persist to IndexedDB; conversation keeps preview + `resultId`.
- **Skill templates** — literature review, comparison table, outline Markdown templates (`skills.ts`).

See [`PROJECT.md`](./PROJECT.md) §15 and [`ResearchBox-技术手册.md`](./ResearchBox-技术手册.md) for details.

---

## Paper Box: reading & translation

The agent’s paper library is built on **PaperIR** (Zod-defined central format):

- 📥 **One-click arXiv import** — links and bare IDs (with version), automatic source selection and fallback.
- 🧼 **Clean reading view** — rule-based HTML cleaning; headings, math, figures, citations preserved; **zero LLM cost**.
- 🌐 **Original / translation / bilingual** — chunked streaming translation; structure first, content after; **resume from checkpoint**.
- ∑ **KaTeX math** — no layout jitter on equation-heavy pages.
- ✍️ **Inline annotation** — highlights and notes persist across sessions.
- 🔗 **Citation popovers** — click a citation to view the reference in place.
- 🗂️ **Per-project isolation** — entries and annotations isolated per project; shared `PaperIR` cache for instant reopen.

---

## Why ResearchBox

| | ResearchBox |
|---|-------------|
| **Focus** | Academic research agent + paper toolbox, not a generic ChatGPT shell |
| **Deploy** | Static SPA — GitHub Pages / Cloudflare Pages / Vercel |
| **Data** | IndexedDB local persistence; papers, sessions, artifacts never uploaded |
| **LLM** | BYOK; unified multi-provider abstraction |
| **Extensible** | Framework-agnostic `src/core/`; agent tools, IR, and pipelines are unit-testable |

---

## Quick start

> Requires Node.js 18+ and npm.

```bash
npm install      # install dependencies
npm run dev      # start dev server
npm run build    # production build (includes typecheck)
npm run preview  # preview the build locally
```

**Getting started:**

1. Configure an LLM Provider in Settings (optional: Semantic Scholar / OpenAlex / web search keys).
2. Create a project → lands on **ChatBox** — start a literature survey conversation.
3. Switch to **Paper Box**, paste an arXiv link; the agent can then search and read imported papers.
4. Keep the box open to search externally and recommend papers; close it to focus on your library and write Artifacts.

```bash
npm run typecheck  # type check
npm run test       # Vitest unit tests
npm run test:e2e   # Playwright E2E (run npm run test:e2e:install first)
```

---

## Tech stack

React 19 · Vite · TypeScript strict · Zustand · Dexie (IndexedDB) · Zod · KaTeX · DOMPurify · Pyodide · tesseract.js · Tailwind CSS · Vitest · Playwright

Conventions: [`CLAUDE.md`](./CLAUDE.md).

---

## Roadmap

- [x] **Phase 0** Skeleton: projects, storage, IR data model
- [x] **Phase 1** Paper Box read path: arXiv import → cleaning → rendering + math
- [x] **Phase 2** Translation pipeline: structured IR + streaming translation + resume + bilingual views
- [x] **Phase 3** Reading UX: annotation persistence, citation popovers
- [x] **Phase 4** **ChatBox Research Agent**: tool loop, academic search, retrieval, Artifacts, sub-agents, Python sandbox
- [ ] **Phase 5** Polish & ship: offline UX, quota management, Android TWA packaging
- [ ] **Future** PDF import pipeline, Skills menu, more sub-agent types

---

## Documentation

| Doc | Contents |
|-----|----------|
| [`ResearchBox-技术手册.md`](./ResearchBox-技术手册.md) | Product positioning, features, user-facing technical details |
| [`PROJECT.md`](./PROJECT.md) | Developer handbook: structure, modules, agent architecture |
| [`CLAUDE.md`](./CLAUDE.md) | Contribution conventions and stack rules |

---

## A note from the developer

Vibe Coding is so good — did you know?

— Phant *(Translated by Composer2.5)*

---

## Author

**Made by PhantAIStudio**

- **Author:** Phantivia
- **Contact:** [phantivia@gmail.com](mailto:phantivia@gmail.com)

---

## License

[MIT](./LICENSE) © ResearchBox

<div align="center">

[⬆ Back to top](#english) · [简体中文](#researchbox)

</div>
