import { z } from "zod";

/**
 * IR Block 类型枚举 — 论文内容的结构化单元类型。
 */
export const BlockTypeEnum = z.enum([
  "heading",
  "paragraph",
  "math",
  "figure",
  "table",
  "list",
  "codeblock",
  "reference",
]);

/**
 * 数学公式附加信息。
 */
export const MathSchema = z.object({
  tex: z.string(),
  display: z.boolean(),
});

/**
 * IR Block — 论文内容的最小结构化单元。
 * id 在 Cleaner 阶段生成并贯穿全程，是标注与引用跳转的锚。
 */
export const BlockSchema = z.object({
  id: z.string(),
  type: BlockTypeEnum,
  level: z.number().optional(),
  content: z.string(),
  // figure 的图注文本（HTML 片段）。figure 的 translation 存的是图注译文，content 始终保留含原图注的整图 HTML。
  caption: z.string().optional(),
  translation: z.string().optional(),
  math: MathSchema.optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/**
 * 参考文献条目 — 供引用弹窗使用。
 */
export const ReferenceSchema = z.object({
  id: z.string(),
  label: z.string(),
  text: z.string(),
});

/**
 * PaperIR — 整篇论文的内部表示，全项目唯一数据事实来源。
 * 所有读写论文数据的代码都从此 schema 导出的类型走。
 */
export const PaperIRSchema = z.object({
  arxivId: z.string(),
  version: z.string(),
  title: z.string(),
  abstract: z.string(),
  abstractBlocks: z.array(BlockSchema).default([]),
  authors: z.array(z.string()),
  blocks: z.array(BlockSchema),
  references: z.array(ReferenceSchema),
  createdAt: z.number(),
  modelUsed: z.string(),
});

export type Block = z.infer<typeof BlockSchema>;
export type Reference = z.infer<typeof ReferenceSchema>;
export type PaperIR = z.infer<typeof PaperIRSchema>;
