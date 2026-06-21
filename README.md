<div align="center">

<img src="./logo.svg" alt="ResearchBox" width="440" />

# ResearchBox

**面向研究人员的轻量级论文阅读工具箱 · 纯前端 / 无后端 / 本地优先**

抓取 arXiv 论文 → 清洗 → 转译为结构化内容 → 本地渲染、标注、问答。
一切在浏览器里运行，论文与设置全部留在你自己的设备上。

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

ResearchBox 是一个**纯前端单页应用（SPA）+ PWA**，帮你把一篇 arXiv 论文变成可读、可译、可标注、可问答的本地阅读环境：

- **零后端**：没有服务端业务逻辑，静态托管即可（GitHub Pages / Cloudflare Pages / Vercel）。
- **本地优先**：论文内容、标注、设置全部存在浏览器，转换过的论文可完全离线阅读。
- **隐私友好**：数据不离开你的设备。

> 应用以 **项目（Project / 工作区）** 为顶层组织单位，首发功能是 **Paper Box**（arXiv 论文阅读器）。

---

## 核心特性

- 📥 **一键导入 arXiv 论文** — 支持 `arxiv.org/abs|pdf|html/...` 链接与裸 ID（含版本号），自动选源与回退。
- 🧼 **干净的正文** — 去除脚本 / 导航 / 广告等噪声，保留标题层级、公式、图表与引用。
- 🌐 **原文 / 译文 / 双语对照** — 同一篇论文三种视图自由切换，译文异步填充，先出结构后补内容。
- ∑ **数学渲染** — 公式即时渲染，密集页面也不抖动。
- ✍️ **划词标注** — 选区高亮与笔记持久化，下次打开依然在（划词问 AI 规划中）。
- 🔗 **引用点击弹窗** — 点击文中引用即可原地浮层查看参考文献，不整页跳转。
- 🗂️ **多项目数据隔离** — 各项目论文与标注互不干扰；论文内容跨项目共享缓存，命中即秒开。
- 📦 **离线 PWA** — 可安装到桌面 / 主屏，已转换论文离线可读。
- 🌍 **中英双语界面** — 默认中文，可一键切换英文。

---

## 快速开始

> 需要 Node.js 18+ 与 npm。

```bash
npm install      # 安装依赖
npm run dev      # 启动开发服务器
npm run build    # 生产构建
npm run preview  # 本地预览构建产物
```

启动后在设置页配置一个 LLM Provider（OpenAI / Anthropic / Gemini / DeepSeek / 任意 OpenAI 兼容协议），创建一个项目，进入 **Paper Box** 粘贴 arXiv 链接即可开始。

---

## 路线图

- [x] **Phase 0** 骨架：项目、存储与内部数据模型冻结
- [x] **Phase 1** 只读链路：导入 arXiv → 清洗 → 渲染 + 数学公式
- [x] **Phase 2** 转译：结构化内容 + 译文 + 缓存 + 双语视图
- [x] **Phase 3** 体验增强：标注高亮与持久化、引用弹窗
- [ ] **Phase 4** 打磨与上架：离线体验、配额管理、安卓打包
- [ ] **未来** 划词问 AI、PDF → 渲染管线

---

## 作者

**PhantAIStudio出品**

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

**A lightweight paper-reading toolbox for researchers · Frontend-only / No backend / Local-first**

Fetch an arXiv paper → clean it → transform into structured content → read, translate, annotate and ask, all locally.
Everything runs in your browser; your papers and settings stay on your own device.

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

ResearchBox is a **frontend-only single-page app (SPA) + PWA** that turns an arXiv paper into a readable, translatable, annotatable and question-friendly local reading environment:

- **Zero backend** — no server-side business logic; host it statically (GitHub Pages / Cloudflare Pages / Vercel).
- **Local-first** — paper content, annotations and settings all live in your browser; converted papers are fully readable offline.
- **Privacy-friendly** — your data never leaves your device.

> The app is organized around **Projects (workspaces)** as the top-level unit. The first feature is **Paper Box**, an arXiv reader.

---

## Features

- 📥 **One-click arXiv import** — accepts `arxiv.org/abs|pdf|html/...` links and bare IDs (with version), with automatic source selection and fallback.
- 🧼 **Clean reading view** — strips scripts / navigation / ads while preserving heading hierarchy, formulas, figures and citations.
- 🌐 **Original / Translation / Bilingual** — switch freely between three views of the same paper; translation streams in, structure first, content after.
- ∑ **Math rendering** — formulas render instantly, no layout jitter even on equation-heavy pages.
- ✍️ **Inline annotation** — highlights and notes persist across sessions (Ask-AI-on-selection planned).
- 🔗 **Citation popovers** — click a citation in the text to view the reference in place, no full-page jump.
- 🗂️ **Per-project isolation** — papers and annotations are isolated per project; paper content is cached across projects for instant reopen.
- 📦 **Offline PWA** — installable to desktop / home screen; converted papers readable offline.
- 🌍 **Bilingual UI** — Chinese by default, switch to English with one click.

---

## Quick Start

> Requires Node.js 18+ and npm.

```bash
npm install      # install dependencies
npm run dev      # start dev server
npm run build    # production build
npm run preview  # preview the build locally
```

After launch, configure an LLM Provider in Settings (OpenAI / Anthropic / Gemini / DeepSeek / any OpenAI-compatible endpoint), create a project, open **Paper Box**, and paste an arXiv link to begin.

---

## Roadmap

- [x] **Phase 0** Skeleton: projects, storage and internal data model frozen
- [x] **Phase 1** Read-only path: arXiv import → cleaning → rendering + math
- [x] **Phase 2** Transformation: structured content + translation + caching + bilingual views
- [x] **Phase 3** Quality of life: annotation highlights with persistence, citation popovers
- [ ] **Phase 4** Polish & ship: offline experience, quota management, Android packaging
- [ ] **Future** Ask-AI-on-selection, PDF → rendering pipeline

---

## Author

**Made in PhantAIStudio**

- **Author:** Phantivia
- **Contact:** [phantivia@gmail.com](mailto:phantivia@gmail.com)

---

## License

[MIT](./LICENSE) © ResearchBox

<div align="center">

[⬆ Back to top](#english) · [简体中文](#researchbox)

</div>
