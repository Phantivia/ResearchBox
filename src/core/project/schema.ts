import { z } from "zod";

/**
 * Project — 顶层「项目 / 工作区」。
 * 一个项目是各功能（Paper Box 等）数据的隔离容器；项目本身只承载名称等元信息。
 * LLM Provider 与全局设置不归属项目（跨项目共享）。
 * id 全表唯一主键（创建时生成）。
 */
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Project = z.infer<typeof ProjectSchema>;
