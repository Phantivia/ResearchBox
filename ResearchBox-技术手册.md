# ResearchBox 技术手册

> 面向研究人员的轻量级论文阅读工具箱 · 纯前端 / 无后端 / 用户自带 LLM API Key
> 顶层组织单位：**项目（Project）**；首发功能：**Paper Box**（前身为 Better Arxiv HTML）

---

## 1. 项目定位与约束

| 维度 | 决策 |
|------|------|
| 产品形态 | 纯前端 SPA + PWA，无服务端业务逻辑 |
| 部署 | 静态托管（GitHub Pages / Cloudflare Pages / Vercel 静态），CDN 即可 |
| 数据归属 | 全部本地化（IndexedDB + Cache API），用户自带 LLM API Key |
| 平台 | PC 浏览器 + 安卓（PWA 安装到桌面，可选 TWA 上架 Play 商店） |
| 开发模式 | 重度依赖 Coding Agent，技术栈必须「主流 + 文档充足 + 类型完备」以提升 Agent 生成正确率 |
| 网络前提 | 经实测，arXiv 与各 LLM 厂商 **均无 CORS 限制**，前端可直接 `fetch` |

这套约束决定了三条主线：**零后端**（一切在浏览器跑）、**本地优先**（offline-first）、**Agent 友好**（强类型、强约定、模块边界清晰）。

---

## 2. 技术栈总览

| 层 | 选型 | 理由速记 |
|------|------|----------|
| 语言 | **TypeScript**（strict） | Agent 生成代码的护栏；类型即文档 |
| 框架 | **React 19 + Vite 6** | 生态最大、Agent 训练语料最多、出错率最低 |
| 构建 | **Vite 6** | 现已是 React/Svelte/Nuxt 的事实标准打包器，HMR 快、PWA 插件成熟 |
| PWA | **vite-plugin-pwa**（基于 Workbox） | 一行配置生成 service worker + manifest |
| 路由 | **React Router** | SPA 内部路由，hash 模式适配静态托管 |
| 状态 | **Zustand** | 轻量、样板少、对 Agent 友好；避免 Redux 的冗长 |
| 本地存储 | **IndexedDB + Dexie.js** | 论文/标注/缓存是结构化大数据，localStorage 的 ~5MB 完全不够 |
| 数学渲染 | **KaTeX**（默认）+ MathJax 兜底 | 同步渲染、不 reflow、bundle 小，适配公式密集页面 |
| HTML 清洗 | **DOMPurify + linkedom/原生 DOMParser** | 安全清洗 + 结构化解析 |
| 样式 | **Tailwind CSS** | 约定式、Agent 极擅长、无运行时开销 |
| Markdown/富文本（标注笔记） | **react-markdown + remark/rehype** | 笔记与 AI 回复渲染 |
| LLM 调用 | 各厂商 REST（fetch 直连，无 SDK 锁定） | 统一 Provider 抽象层，避免 SDK 体积与耦合 |
| 测试 | **Vitest + Playwright** | 单测与端到端 |
| 安卓打包（可选上架） | **PWABuilder / Bubblewrap（TWA）** | 把 PWA 包成可上架的 APK/AAB |

> **为什么是 React 而不是 Svelte？**
> Svelte 5 bundle 更小、性能略优，对「极致轻量」有吸引力。但本项目的核心瓶颈不是框架运行时（论文渲染、LLM 网络、IndexedDB 才是大头），而是**开发速度与 Agent 正确率**。React 拥有数量级更大的训练语料和生态，Coding Agent 在 React 上的产出质量与可维护性显著更稳。轻量目标通过 Vite 代码分割 + 懒加载 + 严控依赖来达成，而非靠换框架。

---

## 3. 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      UI 层 (React)                        │
│   Reader 视图 · 标注层 · 引用弹窗 · AI 侧栏 · 设置        │
├─────────────────────────────────────────────────────────┤
│                   应用 / 状态层 (Zustand)                 │
│   当前论文状态 · 标注状态 · AI 会话 · 用户设置            │
├─────────────────────────────────────────────────────────┤
│                      核心服务层 (纯 TS 模块)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ Fetcher  │→│ Cleaner  │→│ Transformer (LLM) │ Cache │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │
│       │             │            │              │         │
│  LLM Provider 抽象层   ·   Annotation 引擎   ·  Citation  │
├─────────────────────────────────────────────────────────┤
│              持久层 (Dexie / IndexedDB + Cache API)       │
└─────────────────────────────────────────────────────────┘
```

核心原则：**服务层是与框架无关的纯 TypeScript 模块**。UI 用 React，但 Fetcher / Cleaner / Transformer / Provider 全是可单测的纯函数/类。这样 Agent 可以独立开发、独立测试每个模块，也为未来换 UI 框架留后路。

---

## 3.5 项目（Project）模型与数据隔离

应用以**项目（Project / 工作区）**为顶层组织单位。主界面即项目管理：新建、删除、重命名（仅项目名）项目。

- **使用流程**：进入 App → 创建第一个项目 → 进入该项目使用其中的功能。未进入任何项目时访问子功能，显示「当前无项目」提示，引导回主界面创建/选择。
- **数据隔离**：每个项目的**各功能数据相互隔离**（如 Paper Box 的论文列表、标注按项目独立）。
- **共享数据**：**LLM Provider 与全局设置**（界面语言、目标语言、视图模式、Debug 等）**跨项目共享**，不随项目隔离。
- **内容缓存共享**：论文正文/译文（`PaperIR`，`papers` 表，键 `arxivId+version`）跨项目按内容共享，避免对同一论文重复抓取/翻译；而「该论文归属哪个项目」的条目（`paperEntries`）与标注（`annotations`）按项目隔离。

实体关系：

```
Project (工作区: id, name)
   └─ 1:N ─ Paper (paperEntries: 复合主键 [projectId+routeId])
                 ├─ 引用 ─ PaperIR (papers: arxivId+version, 跨项目共享)
                 └─ 关联 ─ annotations (按 [projectId+paperId] 隔离)
全局共享：settings / secrets（LLM Provider）
```

> **命名提示**：代码中顶层「项目」实体为 `Project`（`src/core/project/`）；Paper Box 内一篇导入论文的元数据实体为 `Paper`（`src/core/paper/`，`paperEntries` 表）。两者与论文内容 `PaperIR` 三者解耦。

### 路由（hash 模式）

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 项目管理首页 | 新建 / 重命名 / 删除 / 进入项目 |
| `/p/:projectId/paper-box` | Paper Box | 项目内论文列表 + Add Paper |
| `/p/:projectId/dummy` | Dummy | 占位功能页（暂无具体能力） |
| `/p/:projectId/paper/:routeId` | Reader | 阅读某论文 |
| `/settings` | 设置 | 全局共享（Provider、阅读偏好等） |

`/p/:projectId/*` 由 `ProjectScope` 守卫：校验项目存在性，并把当前路由项目同步为活动项目（持久化到 `settings.lastProjectId`，刷新后恢复）；项目不存在时渲染「当前无项目」。

### 移动端布局

- 顶部条：**左上角汉堡键**展开左侧抽屉式侧边栏，**右上角放 Logo**。
- 抽屉侧边栏的编排与 PC 端一致：**顶部显示当前项目名 + 下拉切换项目**、**Home 按钮**（返回主界面）、功能区（Paper Box、Dummy 等占位功能）、底部设置。

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
  ④ Transformer(LLM) ── 清洗后 HTML → 内部表示(IR) + 译文，分块流式
        │
        ▼
  ⑤ Cache    ── IR 写入 IndexedDB（按 id+version 键）
        │
        ▼
  ⑥ Renderer ── 由 IR 渲染本地视图（含标注层、引用弹窗、KaTeX）
```

### 4.2 各阶段技术要点

**① ID 解析**
支持 `https://arxiv.org/abs/2401.12345`、`/pdf/...`、`/html/...`、裸 `2401.12345`、`2401.12345v2`。统一正则归一化，无版本号时默认取最新（渲染后再读取页面真实版本号回填）。

**② Fetcher（数据获取）**
- 主源：`https://arxiv.org/html/{id}`（官方 HTML，2023-12 起新论文默认提供）。
- 回退源：`https://ar5iv.org/html/{id}`（LaTeXML 转换，覆盖至 2021 年前存量，仅 v1）。
- 无 CORS 限制（已实测），直接 `fetch`。仍要处理 404（论文无 HTML 版 → 提示用户走未来的 PDF2HTML）。
- 同时抓取并缓存论文内引用的图片资源（写入 Cache API，供离线查看）。

**③ Cleaner（规则清洗，不调用 LLM）**
- 用原生 `DOMParser` 解析，`DOMPurify` 安全净化。
- 移除：`<script>`、内联样式、arXiv 页面的导航/页眉页脚/广告性包裹。
- 保留：标题层级、段落、公式节点（arXiv HTML 内含 MathML / TeX 注释）、图表、表格、引用锚点 `<cite>` 与参考文献列表、章节 id。
- 输出：一棵「干净 DOM」，节点上保留稳定的 `data-*` 锚点 id（供标注与引用跳转定位）。
- 这一步**确定性、可单测、零成本**，尽量把活干完，给 LLM 减负。

**④ Transformer（LLM 转换为内部表示）**
- 输入：清洗后 HTML（按章节分块，避免超长上下文）。
- 输出：**内部表示 IR**（见 §5）+ 对应**译文**字段。
- 流式处理：逐块调用，UI 渐进渲染（先出结构，译文异步填充）。
- 这一步是「后续小功能的地基」：IR 里预留 `summary`、`keyTerms`、`figureCaption` 等可选字段，未来的「划词问 AI」「整段总结」直接复用同一结构。
- 关键工程点：要求 LLM 输出**严格 JSON**（在 system prompt 中强约束，不要 Markdown 包裹），前端做 schema 校验（Zod）+ 解析失败重试/降级（降级为「仅清洗版渲染，不带译文」）。

**⑤ Cache（缓存）**
- IR JSON 存 IndexedDB（Dexie 表），主键 `arxivId + version`。
- 命中缓存直接渲染，跳过②③④，秒开。
- 提供「重新转换」按钮（换模型/换 prompt 时）。

**⑥ Renderer（渲染）**
- 遍历 IR 生成 React 组件树。
- 数学节点交给 KaTeX 同步渲染。
- 叠加标注层、引用弹窗（见 §6）。

---

## 5. 内部表示（IR）设计

IR 是整个工具箱的「中央数据格式」，所有当前与未来功能围绕它构建。建议用 **Zod schema** 定义并导出 TS 类型，让 Agent 在生成代码时有单一事实来源。

```typescript
// 概念示意，非最终实现
const Block = z.object({
  id: z.string(),                 // 稳定锚点，标注/引用定位用
  type: z.enum(['heading','paragraph','math','figure',
                'table','list','codeblock','reference']),
  level: z.number().optional(),   // heading 层级
  content: z.string(),            // 原文（HTML 片段或纯文本）
  translation: z.string().optional(), // 译文，异步填充
  math: z.object({ tex: z.string(), display: z.boolean() }).optional(),
  meta: z.record(z.unknown()).optional(), // summary/keyTerms 等扩展位
});

const PaperIR = z.object({
  arxivId: z.string(),
  version: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  abstract: z.string(),
  blocks: z.array(Block),
  references: z.array(z.object({   // 供引用弹窗
    id: z.string(), label: z.string(), text: z.string(),
  })),
  createdAt: z.number(),
  modelUsed: z.string(),
});
```

设计要点：
- `id` 在 Cleaner 阶段就生成并贯穿全程，是标注与引用跳转的锚。
- `translation` 与 `meta` 可选，支持「先结构后填充」的流式体验。
- IR 与渲染解耦——同一 IR 可渲染原文视图、译文视图、双语对照视图。

---

## 6. QOL 功能的技术实现

### 6.1 标注 / 框选问 AI
- 用 `window.getSelection()` + `Range` API 捕获选区。
- 用 **CSS Custom Highlight API**（`Highlight` / `::highlight()`）做高亮，避免侵入 DOM 破坏结构；老浏览器降级为 `<mark>` 包裹。
- 选区映射回 IR 的 `block.id` + 字符偏移，持久化到 IndexedDB（标注独立于 IR 存储，便于增删）。
- 「框选问 AI」：取选区文本 + 所在 block 上下文 → 调 LLM → 结果显示在 AI 侧栏。

### 6.2 引用点击弹窗（不整页跳转）
- Cleaner 阶段把 `<cite>` / 参考文献锚点关联到 `references[].id`。
- 点击引用 → 读取对应 reference → 用浮层组件（**Floating UI** 定位）在原地弹出，不滚动页面。
- 同理可用于公式编号交叉引用、图表引用。

### 6.3 数学渲染
- 默认 **KaTeX**（同步、快、bundle 小、不 reflow，适合公式密集论文）。
- KaTeX 不支持的少数命令（如 `\label`/`\eqref` 交叉引用）→ 标记并回退 **MathJax** 渲染该节点。
- arXiv HTML 自带 MathML，可作为 KaTeX 失败时的二级兜底。

---

## 7. LLM Provider 抽象层

用户自带 Key，需支持多厂商。设计一个统一接口，屏蔽差异：

```typescript
interface LLMProvider {
  id: string;                         // 'anthropic' | 'openai' | 'gemini' | ...
  chat(opts: {
    system: string;
    messages: Message[];
    stream?: boolean;
    json?: boolean;                   // 强制 JSON 输出
  }): AsyncIterable<string> | Promise<string>;
}
```

要点：
- **直连 REST，不绑 SDK**：减少 bundle 体积、避免厂商 SDK 互相打架，且 Agent 易于按文档实现。
- Key 存 IndexedDB（可加一层 WebCrypto 加密 + 用户口令），**绝不上传**。
- 统一处理流式 SSE 解析、错误重试、JSON 修复。
- Transformer 调 `json:true`，划词问答调普通 `stream:true`。
- 在设置页让用户配置 baseURL（兼容自建/代理/兼容 OpenAI 协议的第三方）。

> **安全提醒**：在文档与 UI 中明确告知用户——Key 仅存本地浏览器，但「纯前端存 Key」无法做到服务端级别的防护，公用设备需谨慎。这点务必对用户透明。

---

## 8. 本地存储方案（Dexie / IndexedDB）

| 表 | 主键 | 内容 |
|------|------|------|
| `projects` | `id` | 顶层项目（工作区）：`{ id, name, createdAt, updatedAt }` |
| `paperEntries` | `[projectId+routeId]` | Paper Box 内一篇导入论文的元数据（含归属 projectId、状态、导入方式等） |
| `papers` | `[arxivId+version]` | PaperIR JSON（论文内容，跨项目共享） |
| `annotations` | 自增 id；索引 `[projectId+paperId]` | 标注（关联 projectId + paperId + blockId + 选区 + 笔记，按项目隔离） |
| `aiSessions` | 自增 id | 划词问答 / 总结的会话记录 |
| `settings` | 单例 key | 用户偏好、模型配置、`lastProjectId`（全局共享） |
| `secrets` | provider id | 加密后的 API Key（全局共享） |

> 数据库版本 v3 引入上述结构：升级时把历史「论文任务」迁入名为「默认项目」的 workspace（旧 `papers` 缓存一并补建为该项目下的 `paperEntries`，旧标注补 `projectId`）；全新安装直接落在 v3，由用户创建首个项目。

- 图片等二进制资源走 **Cache API**（service worker 管理），不塞进 IndexedDB。
- 用 `navigator.storage.estimate()` 监控配额，>80% 提示用户清理。
- 调用 `navigator.storage.persist()` 申请持久化，降低被浏览器自动清除的风险（Safari 尤其会在空间紧张时清 IndexedDB）。

---

## 9. PWA 与安卓落地

1. **vite-plugin-pwa** 生成 manifest + service worker。
   - App Shell（HTML/CSS/JS）走 precache（Workbox `precaching`）。
   - 论文 IR 与图片走运行时缓存策略（已存 IndexedDB / Cache）。
2. **离线优先**：已转换过的论文完全可离线阅读、标注；仅 fetch 新论文与调 LLM 需要网络。
3. **安卓桌面安装**：PWA 满足 installability 即可「添加到主屏幕」。
4. **上架 Play 商店（可选）**：用 **PWABuilder** 或 **Bubblewrap** 把 PWA 包成 TWA（Trusted Web Activity）APK/AAB。需准备 `assetlinks.json` 做域名校验。
5. PC 端同一份 PWA 直接浏览器用，或 Edge/Chrome 「安装应用」。

---

## 10. 项目结构建议

```
researchbox/
├─ src/
│  ├─ core/                 # 框架无关纯 TS，独立可测
│  │  ├─ fetcher/           # ② 获取 + 回退
│  │  ├─ cleaner/           # ③ 规则清洗
│  │  ├─ transformer/       # ④ LLM 转 IR
│  │  ├─ ir/                # IR schema (Zod) + 类型
│  │  ├─ project/           # 顶层项目（工作区）schema
│  │  ├─ paper/             # Paper Box 论文条目 schema
│  │  ├─ llm/               # Provider 抽象 + 各厂商实现
│  │  ├─ annotation/        # 选区 ↔ IR 映射
│  │  └─ citation/          # 引用解析
│  ├─ db/                   # Dexie 表定义与访问（projects / paperEntries / papers / annotations …）
│  ├─ store/                # Zustand（projectStore / paperStore / readerStore / …）
│  ├─ pages/                # 页面（项目首页 Welcome / PaperBox / Reader / NoProject）
│  ├─ ui/
│  │  ├─ shell/             # AppShell + Sidebar（含项目切换/移动端抽屉）+ ProjectScope 守卫
│  │  ├─ reader/            # 渲染器 + 标注层 + 引用弹窗
│  │  ├─ ai-panel/
│  │  └─ settings/
│  ├─ pwa/                  # service worker 配置
│  └─ main.tsx
├─ tests/                   # Vitest + Playwright
├─ vite.config.ts
└─ tailwind.config.ts
```

---

## 11. 开发路线图（建议给 Agent 的分阶段任务）

**Phase 0 — 骨架**
Vite + React + TS + Tailwind + PWA 脚手架；Dexie 表与 Zustand store 起好；IR 的 Zod schema 先定稿（这是地基，最先冻结）。

**Phase 1 — 只读链路打通**
ID 解析 → Fetcher(含 ar5iv 回退) → Cleaner → 直接渲染清洗版（先不接 LLM、不翻译）→ KaTeX 数学渲染。先让「能看论文」跑起来。

**Phase 2 — LLM 转换 + IR + 缓存**
接 Provider 抽象层 → Transformer 产 IR + 译文 → IndexedDB 缓存 → 双语视图。

**Phase 3 — QOL**
标注高亮 + 持久化 → 引用点击弹窗 → 划词问 AI 侧栏。

**Phase 4 — 打磨与上架**
离线体验、配额管理、Key 加密、安卓 TWA 打包。

**未来 — PDF2HTML**
复用 Provider 抽象层与 IR：PDF → LLM → arXiv 风格 HTML/IR，无缝接入现有渲染管线。

---

## 12. 关键风险与对策

| 风险 | 对策 |
|------|------|
| LLM 输出 JSON 不合规 | Zod 校验 + 修复重试 + 降级为纯清洗渲染 |
| 长论文超上下文 | 按章节分块流式转换 |
| arXiv 无 HTML 版的论文 | 提示用户，留给未来 PDF2HTML |
| KaTeX 公式不全支持 | 逐节点 MathJax / MathML 兜底 |
| 本地存储被浏览器清除 | `persist()` + 配额监控 + 导出/备份功能 |
| 纯前端 Key 安全性有限 | UI 明确告知 + WebCrypto 加密 + 公用设备警示 |
| Agent 改动破坏模块边界 | core 层强类型 + 单测覆盖 + IR 单一事实来源 |

---

## 13. 一句话总结

**TypeScript + React 19 + Vite 6 + Dexie(IndexedDB) + KaTeX + vite-plugin-pwa**，配一个框架无关的 `core/` 纯逻辑层和以 Zod 定义的 IR 中央数据格式——既满足「轻量纯前端、本地优先、双端可装」，又最大化 Coding Agent 的产出质量与可维护性。
