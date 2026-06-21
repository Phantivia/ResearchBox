import { makePaperId } from "@/core/annotation";
import { deletePaperImages } from "@/core/cache";
import {
  BACKUP_FORMAT_VERSION,
  BackupSchema,
  selectRowsToWrite,
  type Backup,
  type ImportStrategy,
} from "@/core/storage";
import {
  db,
  getSettings,
  SETTINGS_KEY,
  type AnnotationRow,
  type AISessionRow,
} from "./index";

export type ExportOptions = {
  /** 包含 secrets 表（含明文 API Key）。默认 false。 */
  includeSecrets?: boolean;
};

export type ImportResult = {
  projects: number;
  paperEntries: number;
  papers: number;
  annotations: number;
  aiSessions: number;
  secrets: number;
  settings: boolean;
};

export type CachedPaperSummary = {
  arxivId: string;
  version: string;
  title: string;
};

export async function exportData(opts: ExportOptions = {}): Promise<Backup> {
  const [projects, paperEntries, papers, annotations, aiSessions, settings] =
    await Promise.all([
      db.projects.toArray(),
      db.paperEntries.toArray(),
      db.papers.toArray(),
      db.annotations.toArray(),
      db.aiSessions.toArray(),
      getSettings(),
    ]);

  const secrets = opts.includeSecrets ? await db.secrets.toArray() : undefined;

  return BackupSchema.parse({
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: Date.now(),
    projects,
    paperEntries,
    papers,
    annotations,
    aiSessions,
    settings,
    ...(secrets ? { secrets } : {}),
  });
}

function keySet(keys: unknown[]): Set<string> {
  return new Set(keys.map((key) => JSON.stringify(key)));
}

export async function importData(
  backup: Backup,
  strategy: ImportStrategy,
): Promise<ImportResult> {
  const tables = [
    db.projects,
    db.paperEntries,
    db.papers,
    db.annotations,
    db.aiSessions,
    db.settings,
    ...(backup.secrets ? [db.secrets] : []),
  ];

  return db.transaction("rw", tables, async () => {
    const [
      projectKeys,
      paperEntryKeys,
      paperKeys,
      annotationKeys,
      aiSessionKeys,
      secretKeys,
      existingSettings,
    ] = await Promise.all([
      db.projects.toCollection().primaryKeys(),
      db.paperEntries.toCollection().primaryKeys(),
      db.papers.toCollection().primaryKeys(),
      db.annotations.toCollection().primaryKeys(),
      db.aiSessions.toCollection().primaryKeys(),
      backup.secrets ? db.secrets.toCollection().primaryKeys() : Promise.resolve([]),
      db.settings.get(SETTINGS_KEY),
    ]);

    const projects = selectRowsToWrite(
      backup.projects,
      (row) => JSON.stringify(row.id),
      keySet(projectKeys),
      strategy,
    );
    const paperEntries = selectRowsToWrite(
      backup.paperEntries,
      (row) => JSON.stringify([row.projectId, row.routeId]),
      keySet(paperEntryKeys),
      strategy,
    );
    const papers = selectRowsToWrite(
      backup.papers,
      (row) => JSON.stringify([row.arxivId, row.version]),
      keySet(paperKeys),
      strategy,
    );
    const annotations = selectRowsToWrite(
      backup.annotations,
      (row) => JSON.stringify(row.id),
      keySet(annotationKeys),
      strategy,
    );
    const aiSessions = selectRowsToWrite(
      backup.aiSessions,
      (row) => JSON.stringify(row.id),
      keySet(aiSessionKeys),
      strategy,
    );
    const secrets = backup.secrets
      ? selectRowsToWrite(
          backup.secrets,
          (row) => JSON.stringify(row.provider),
          keySet(secretKeys),
          strategy,
        )
      : [];

    await db.projects.bulkPut(projects);
    await db.paperEntries.bulkPut(paperEntries);
    await db.papers.bulkPut(papers);
    await db.annotations.bulkPut(annotations as AnnotationRow[]);
    await db.aiSessions.bulkPut(aiSessions as AISessionRow[]);
    if (secrets.length > 0) {
      await db.secrets.bulkPut(secrets);
    }

    const writeSettings = strategy === "overwrite" || !existingSettings;
    if (writeSettings) {
      await db.settings.put({ key: SETTINGS_KEY, value: backup.settings });
    }

    return {
      projects: projects.length,
      paperEntries: paperEntries.length,
      papers: papers.length,
      annotations: annotations.length,
      aiSessions: aiSessions.length,
      secrets: secrets.length,
      settings: writeSettings,
    };
  });
}

export async function listCachedPapers(): Promise<CachedPaperSummary[]> {
  const papers = await db.papers.toArray();
  return papers
    .map((paper) => ({
      arxivId: paper.arxivId,
      version: paper.version,
      title: paper.title,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * 删除一篇论文的全部本地数据：IR + 关联标注（跨项目）+ AI 会话 + Cache 图片。
 * Cache API 在 IndexedDB 事务外清理（不同存储后端）。
 */
export async function deletePaperData(
  arxivId: string,
  version: string,
): Promise<void> {
  const paperId = makePaperId(arxivId, version);

  await db.transaction("rw", [db.papers, db.annotations, db.aiSessions], async () => {
    await db.papers
      .where("[arxivId+version]")
      .equals([arxivId, version])
      .delete();
    await db.annotations.where("paperId").equals(paperId).delete();
    await db.aiSessions.where("paperId").equals(paperId).delete();
  });

  await deletePaperImages(arxivId);
}
