import { BackupSchema, type Backup, type ImportStrategy } from "./schema";

export class BackupParseError extends Error {
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "BackupParseError";
    this.cause = options?.cause;
  }
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(BackupSchema.parse(backup), null, 2);
}

/**
 * 解析并校验备份字符串。任何非法 JSON 或结构不符都抛 BackupParseError，绝不落库未校验数据。
 */
export function parseBackup(raw: string): Backup {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new BackupParseError("Backup is not valid JSON.", { cause: error });
  }

  const result = BackupSchema.safeParse(json);
  if (!result.success) {
    const summary = result.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    throw new BackupParseError(`Backup structure is invalid: ${summary}`, {
      cause: result.error,
    });
  }
  return result.data;
}

/**
 * 按冲突策略筛选需要写入的行（纯函数）。
 * - overwrite：全部写入（按主键覆盖）。
 * - skip：仅写入主键不存在于 existingKeys 的行。
 */
export function selectRowsToWrite<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  existingKeys: ReadonlySet<string>,
  strategy: ImportStrategy,
): T[] {
  if (strategy === "overwrite") {
    return [...rows];
  }
  return rows.filter((row) => !existingKeys.has(keyOf(row)));
}
