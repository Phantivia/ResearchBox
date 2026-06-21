# ResearchBox 项目约定（所有改动必须遵守）

## 技术栈（不得擅自替换）
- TypeScript strict 模式
- React 19 + Vite 6
- Tailwind CSS（不写运行时 CSS-in-JS）
- Zustand 状态管理（不引入 Redux）
- Dexie.js 操作 IndexedDB
- React Router（hash 模式）
- KaTeX 数学渲染，DOMPurify 清洗 HTML
- Zod 定义所有数据 schema
- 测试：Vitest（单测）+ Playwright（E2E）

## 架构铁律
1. `src/core/` 下全部是「框架无关的纯 TypeScript」：不 import react、不碰 DOM 全局副作用（除非该模块本就是 DOM 处理），可被 Vitest 在 node/jsdom 单测。
2. UI 只能调用 core 暴露的函数/类，反向依赖（core 引用 UI）禁止。
3. IR（内部表示）的 Zod schema 是唯一事实来源；任何读写论文数据的代码都从它导出的类型走，不得另立 interface。
4. 不引入未在技术栈列出的依赖；如确需新依赖，先在回复里说明理由并等我确认。

## 编码风格
- 函数小而纯，副作用集中在边界（fetch / IndexedDB / DOM）。
- 每个 core 模块配同名 `.test.ts`。
- 不写注释解释「做了什么」，只在非显然处解释「为什么」。
- 导出用 named export，不用 default（除 React 组件页面级可用）。

## 你（Agent）每次交付时必须
- 跑通 `npm run typecheck` 和 `npm run test`，贴出结果。
- 改动涉及多个文件时，先列改动清单再写代码。
- 不确定的地方停下来问，不要猜接口。