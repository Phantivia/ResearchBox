import { z } from "zod";

/**
 * 论文导入方式 — 当前仅支持从 arXiv HTML 导入，预留枚举以便未来新增（PDF2HTML 等）。
 */
export const PaperImportMethodEnum = z.enum(["arxiv-html"]);

/**
 * 论文处理状态。
 * - ready：正文已加载，尚未开始翻译
 * - processing：翻译进行中或部分完成
 * - done：翻译已完成（含缓存命中、降级）
 * - error：处理失败
 */
export const PaperStatusEnum = z.enum(["ready", "processing", "done", "error"]);

/**
 * Paper — Paper Box 内一篇「导入的论文」的元数据。
 * 归属某个项目（projectId）；与 PaperIR 解耦：PaperIR 是论文内容的唯一事实来源，
 * Paper 仅描述一次导入任务的状态。
 * routeId 为路由 id（arxivId 拼接版本字面量，如 "2401.12345" 或 "2401.12345v2"）；
 * 复合主键为 [projectId+routeId]，因此同一论文可分别存在于不同项目而互不影响。
 */
export const PaperSchema = z.object({
  projectId: z.string(),
  routeId: z.string(),
  importMethod: PaperImportMethodEnum.default("arxiv-html"),
  arxivId: z.string(),
  version: z.string(),
  source: z.string(),
  title: z.string().default(""),
  authors: z.array(z.string()).default([]),
  status: PaperStatusEnum,
  error: z.string().optional(),
  modelUsed: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type PaperImportMethod = z.infer<typeof PaperImportMethodEnum>;
export type PaperStatus = z.infer<typeof PaperStatusEnum>;
export type Paper = z.infer<typeof PaperSchema>;
