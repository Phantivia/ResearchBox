import Dexie, { type EntityTable, type Table } from "dexie";
import type { PaperIR } from "@/core/ir";
import type { Project } from "@/core/project";
import type { Paper } from "@/core/paper";
import type { ProviderConfig } from "@/core/llm";
import type { SavedPalette } from "@/core/colorPalette";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type ViewMode,
} from "@/core/settings";
import type { AgentSession } from "@/core/agent/session";
import type { Artifact } from "@/core/agent/artifact/schema";
import { stripTranslationsFromIr } from "@/core/transformer";

// ── Row types for non-IR tables (IR tables reuse core types) ──

export interface AnnotationRow {
  id?: number;
  projectId: string;
  paperId: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  quote: string;
  note: string;
  color?: string;
  createdAt: number;
}

export interface AISessionRow {
  id?: number;
  paperId: string;
  messages: unknown[];
  createdAt: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export interface SecretRow {
  provider: string;
  encryptedKey: string;
}

export interface ToolResultRow {
  id: string;
  content: string;
  createdAt: number;
}

export type AgentSessionRow = AgentSession;

export const SETTINGS_KEY = "app";

export const DEFAULT_PROJECT_ID = "default";

export { DEFAULT_SETTINGS };
export type { AppSettings, ViewMode };

// ── Database ──

const db = new Dexie("researchbox") as Dexie & {
  papers: EntityTable<PaperIR, "arxivId">;
  projects: EntityTable<Project, "id">;
  paperEntries: Table<Paper, [string, string]>;
  annotations: EntityTable<AnnotationRow, "id">;
  aiSessions: EntityTable<AISessionRow, "id">;
  settings: EntityTable<SettingRow, "key">;
  secrets: EntityTable<SecretRow, "provider">;
  palettes: EntityTable<SavedPalette, "id">;
  artifacts: EntityTable<Artifact, "id">;
  toolResults: EntityTable<ToolResultRow, "id">;
  agentSessions: EntityTable<AgentSessionRow, "id">;
};

db.version(1).stores({
  papers: "[arxivId+version]",
  annotations: "++id, paperId, blockId",
  aiSessions: "++id, paperId",
  settings: "key",
  secrets: "provider",
});

db.version(2).stores({
  projects: "id, feature, status, updatedAt",
});

// v3：重构「项目」概念。
// - projects 表由「论文任务」重定义为顶层项目（workspace）。
// - 新增 paperEntries 表承接原论文任务（复合主键 [projectId+routeId]）。
// - annotations 增加 projectId，按项目隔离。
// 升级时把历史数据迁入名为「默认项目」的 workspace；全新安装直接落在 v3，不触发升级回调。
db.version(3)
  .stores({
    projects: "id, updatedAt",
    paperEntries: "[projectId+routeId], projectId, status, updatedAt",
    annotations: "++id, [projectId+paperId], paperId, blockId",
  })
  .upgrade(async (tx) => {
    const now = Date.now();
    const paperEntries = tx.table("paperEntries");
    const seen = new Set<string>();

    const oldTasks = await tx.table("projects").toArray();
    for (const task of oldTasks) {
      const routeId = String(task.id);
      seen.add(routeId);
      await paperEntries.put({
        projectId: DEFAULT_PROJECT_ID,
        routeId,
        importMethod: "arxiv-html",
        arxivId: task.arxivId,
        version: task.version,
        source: task.source ?? routeId,
        title: task.title ?? "",
        authors: task.authors ?? [],
        status: task.status ?? "done",
        error: task.error,
        modelUsed: task.modelUsed,
        createdAt: task.createdAt ?? now,
        updatedAt: task.updatedAt ?? now,
      });
    }

    const papers = await tx.table("papers").toArray();
    for (const paper of papers) {
      const routeId =
        paper.version === "latest"
          ? paper.arxivId
          : `${paper.arxivId}${paper.version}`;
      if (seen.has(routeId)) {
        continue;
      }
      seen.add(routeId);
      await paperEntries.put({
        projectId: DEFAULT_PROJECT_ID,
        routeId,
        importMethod: "arxiv-html",
        arxivId: paper.arxivId,
        version: paper.version,
        source: routeId,
        title: paper.title ?? "",
        authors: paper.authors ?? [],
        status: "done",
        modelUsed: paper.modelUsed,
        createdAt: paper.createdAt ?? now,
        updatedAt: paper.createdAt ?? now,
      });
    }

    await tx
      .table("annotations")
      .toCollection()
      .modify((row: AnnotationRow) => {
        if (row.projectId === undefined) {
          row.projectId = DEFAULT_PROJECT_ID;
        }
      });

    await tx.table("projects").clear();
    if (seen.size > 0) {
      await tx.table("projects").put({
        id: DEFAULT_PROJECT_ID,
        name: "默认项目",
        createdAt: now,
        updatedAt: now,
      });
    }
  });

// v4：新增 palettes 表，存储用户保存的自定义调色盘方案（内置预设不入库）。
db.version(4).stores({
  palettes: "id, createdAt",
});

// v5：新增 artifacts 表，存储 Agent 经审批后落库的产出（摘要、对比表、大纲等）。
db.version(5).stores({
  artifacts: "id, projectId, updatedAt, kind",
});

// v6：新增 toolResults 表，存储超阈值工具输出的全文（回话只保留预览 + resultId）。
db.version(6).stores({
  toolResults: "id, createdAt",
});

// v7：新增 agentSessions 表，存储 ChatBox Agent 按项目隔离的会话历史。
// aiSessions 保留给 legacy 划词问答（paperId 维度，无 title/updatedAt），不复用。
db.version(7).stores({
  agentSessions: "++id, projectId, updatedAt",
});

// ── Helpers ──

export async function putPalette(palette: SavedPalette): Promise<void> {
  await db.palettes.put(palette);
}

export async function getPalette(id: string): Promise<SavedPalette | undefined> {
  return db.palettes.get(id);
}

export async function listPalettes(): Promise<SavedPalette[]> {
  return db.palettes.orderBy("createdAt").toArray();
}

export async function deletePalette(id: string): Promise<void> {
  await db.palettes.delete(id);
}

export async function saveArtifact(artifact: Artifact): Promise<void> {
  await db.artifacts.put(artifact);
}

export async function getArtifact(id: string): Promise<Artifact | undefined> {
  return db.artifacts.get(id);
}

export async function listArtifacts(projectId: string): Promise<Artifact[]> {
  return db.artifacts
    .where("projectId")
    .equals(projectId)
    .sortBy("updatedAt")
    .then((rows) => rows.reverse());
}

export async function deleteArtifact(id: string): Promise<void> {
  await db.artifacts.delete(id);
}

export async function addToolResult(args: { content: string }): Promise<string> {
  const id = crypto.randomUUID();
  await db.toolResults.put({
    id,
    content: args.content,
    createdAt: Date.now(),
  });
  return id;
}

export async function getToolResult(id: string): Promise<ToolResultRow | undefined> {
  return db.toolResults.get(id);
}

export async function savePaper(ir: PaperIR): Promise<void> {
  await db.papers.put(ir);
}

export async function clearAllTranslationCache(): Promise<number> {
  const papers = await db.papers.toArray();
  let updated = 0;

  for (const paper of papers) {
    const hasTranslation = [...paper.abstractBlocks, ...paper.blocks].some(
      (block) => Boolean(block.translation?.trim()),
    );
    if (!hasTranslation) {
      continue;
    }

    await db.papers.put(stripTranslationsFromIr(paper));
    updated += 1;
  }

  return updated;
}

export async function getPaper(
  arxivId: string,
  version: string,
): Promise<PaperIR | undefined> {
  return db.papers.get([arxivId, version]);
}

export async function getPaperCached(
  arxivId: string,
  version: string | null,
): Promise<PaperIR | undefined> {
  if (version) {
    return getPaper(arxivId, version);
  }

  const latest = await getPaper(arxivId, "latest");
  if (latest) {
    return latest;
  }

  const versions = await db.papers
    .where("[arxivId+version]")
    .between([arxivId, Dexie.minKey], [arxivId, Dexie.maxKey])
    .toArray();

  if (versions.length === 0) {
    return undefined;
  }

  return versions.sort((a, b) => b.createdAt - a.createdAt)[0];
}

function parseProviderConfig(row: SecretRow): ProviderConfig {
  return JSON.parse(row.encryptedKey) as ProviderConfig;
}

// TODO(phase4): encrypt apiKey via WebCrypto before persisting
export async function saveProviderConfig(config: ProviderConfig): Promise<void> {
  await db.secrets.put({
    provider: config.id,
    encryptedKey: JSON.stringify(config),
  });
}

export async function getProviderConfig(
  providerId: string,
): Promise<ProviderConfig | undefined> {
  const row = await db.secrets.get(providerId);
  if (!row) {
    return undefined;
  }
  return parseProviderConfig(row);
}

export async function listProviderConfigs(): Promise<ProviderConfig[]> {
  const rows = await db.secrets.toArray();
  return rows.map(parseProviderConfig);
}

export async function deleteProviderConfig(providerId: string): Promise<void> {
  await db.secrets.delete(providerId);
}

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get(SETTINGS_KEY);
  if (!row) {
    return DEFAULT_SETTINGS;
  }
  return { ...DEFAULT_SETTINGS, ...(row.value as Partial<AppSettings>) };
}

export async function saveSettings(
  partial: Partial<AppSettings>,
): Promise<AppSettings> {
  const next = { ...(await getSettings()), ...partial };
  await db.settings.put({ key: SETTINGS_KEY, value: next });
  return next;
}

export { db };
export type PaperIRDatabase = typeof db;
export {
  addAnnotation,
  deleteAnnotation,
  deleteAnnotationsForProject,
  listAnnotations,
  updateNote,
  type AnnotationInput,
} from "./annotations";
export {
  putProject,
  getProject,
  listProjects,
  deleteProject,
} from "./projects";
export {
  putPaperEntry,
  getPaperEntry,
  listPaperEntries,
  deletePaperEntry,
  deletePaperEntriesForProject,
} from "./paperEntries";
export {
  exportData,
  importData,
  deletePaperData,
  listCachedPapers,
  type ExportOptions,
  type ImportResult,
  type CachedPaperSummary,
} from "./backup";
export {
  saveAgentSession,
  getAgentSession,
  listAgentSessions,
  deleteAgentSession,
} from "./agentSessions";
