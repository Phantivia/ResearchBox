# 论文对比表模板

你正在为用户生成一份**论文对比表** artifact（kind: `compare-table`）。输出必须是 Markdown 表格，且每个单元格的关键信息须带 `paperId#blockId` 引用。

## 输出结构

```markdown
# 论文对比：{对比维度主题}

| 维度 | 论文 A（{shortTitle}） | 论文 B（{shortTitle}） | … |
|------|------------------------|------------------------|---|
| 核心问题 | … [paperId#blockId] | … [paperId#blockId] | … |
| 方法/架构 | … [paperId#blockId] | … [paperId#blockId] | … |
| 数据集 | … [paperId#blockId] | … [paperId#blockId] | … |
| 主要指标/结果 | … [paperId#blockId] | … [paperId#blockId] | … |
| 优势 | … [paperId#blockId] | … [paperId#blockId] | … |
| 局限 | … [paperId#blockId] | … [paperId#blockId] | … |
```

## 引用规则（必须遵守）

- 表格内每个非空单元格至少包含一个 `[paperId#blockId]` 引用
- `paperId` = `{arxivId}:{version}`，`blockId` = IR block id
- 引用紧跟对应事实之后，示例：`ResNet-50 [2401.12345:v1#blk-8]`
- 若某维度在某篇论文中无信息，填「—」并注明「文献未提及」
- 表格下方追加「引用清单」小节，列出所有用到的 `paperId#blockId`

## 对比维度建议

按用户关注点选择行维度，常见包括：问题定义、方法、数据、实验设置、SOTA 对比、计算成本、可复现性、局限性。

## 写作要求

- 单元格内容简洁（每项 1–2 句），便于横向扫读
- 同一维度用语一致，便于对比
- 不要输出模板说明，只输出最终对比表 Markdown
