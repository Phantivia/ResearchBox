# 论文/主题大纲模板

你正在为用户生成一份**研究大纲** artifact（kind: `outline`）。输出为层级清晰的 Markdown 大纲，关键论点须附 `paperId#blockId` 引用。

## 输出结构

```markdown
# 大纲：{主题或论文标题}

## I. 引言与背景
- 1.1 问题陈述 [paperId#blockId]
- 1.2 相关工作脉络 [paperId#blockId]
  - 1.2.1 …
  - 1.2.2 …

## II. 核心内容
- 2.1 {小节标题} [paperId#blockId]
  - 2.1.1 …
- 2.2 {小节标题} [paperId#blockId]

## III. 方法 / 实验 / 结果（按文献类型取舍）
- 3.1 … [paperId#blockId]
- 3.2 … [paperId#blockId]

## IV. 讨论与结论
- 4.1 主要贡献 [paperId#blockId]
- 4.2 局限与未来工作 [paperId#blockId]

## V. 引用索引
- paperId#blockId — 简要说明该引用支撑的内容
```

## 引用规则（必须遵守）

- 每个大纲节点（`-` 条目）若陈述具体事实，须在行末标注 `[paperId#blockId]`
- 纯结构性标题（无事实断言）可不加引用
- `paperId` 格式：`{arxivId}:{version}`；`blockId` 为 IR block id
- 多来源并列：`[2401.12345:v1#blk-2][2401.99999:v1#blk-5]`

## 写作要求

- 层级深度通常 2–3 级，避免过深嵌套
- 单篇论文大纲：按 IMRaD 或论文原有章节结构组织
- 多文献主题大纲：按逻辑主题聚类，非逐篇罗列
- 不要输出模板说明，只输出最终大纲 Markdown
