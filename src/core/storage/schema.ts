import { z } from "zod";
import { PaperIRSchema } from "@/core/ir";
import { PaperSchema } from "@/core/paper";
import { ProjectSchema } from "@/core/project";
import { AppSettingsSchema } from "@/core/settings";

/** 备份文件格式版本。结构不兼容变更时递增并在 parse 时拒绝旧/新版本。 */
export const BACKUP_FORMAT_VERSION = 1;

/**
 * 标注备份行 —— 对应 db 的 AnnotationRow（含 projectId 与自增 id）。
 * 标注非论文内容，IR 单一事实来源约束不适用；此处独立定义以便 Zod 校验导入。
 */
export const BackupAnnotationSchema = z.object({
  id: z.number().int().optional(),
  projectId: z.string(),
  paperId: z.string(),
  blockId: z.string(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  quote: z.string(),
  note: z.string(),
  color: z.string().optional(),
  createdAt: z.number(),
});

/** AI 会话备份行 —— 对应 db 的 AISessionRow。messages 形态由各功能自定，导入时不深校。 */
export const BackupAISessionSchema = z.object({
  id: z.number().int().optional(),
  paperId: z.string(),
  messages: z.array(z.unknown()),
  createdAt: z.number(),
});

/** Provider 凭据备份行 —— 对应 db 的 SecretRow（encryptedKey 当前为明文 JSON）。 */
export const BackupSecretSchema = z.object({
  provider: z.string(),
  encryptedKey: z.string(),
});

export const BackupSchema = z.object({
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  exportedAt: z.number(),
  projects: z.array(ProjectSchema),
  paperEntries: z.array(PaperSchema),
  papers: z.array(PaperIRSchema),
  annotations: z.array(BackupAnnotationSchema),
  aiSessions: z.array(BackupAISessionSchema),
  settings: AppSettingsSchema,
  secrets: z.array(BackupSecretSchema).optional(),
});

export type Backup = z.infer<typeof BackupSchema>;
export type BackupAnnotation = z.infer<typeof BackupAnnotationSchema>;
export type BackupAISession = z.infer<typeof BackupAISessionSchema>;
export type BackupSecret = z.infer<typeof BackupSecretSchema>;

/** 导入冲突策略：按主键覆盖已有行，或跳过已存在的行。 */
export type ImportStrategy = "overwrite" | "skip";
