import type { Annotation } from "@/core/annotation";
import { db, type AnnotationRow } from "./index";

export type AnnotationInput = Omit<Annotation, "id" | "createdAt"> & {
  projectId: string;
  createdAt?: number;
};

function toAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    paperId: row.paperId,
    blockId: row.blockId,
    startOffset: row.startOffset,
    endOffset: row.endOffset,
    quote: row.quote,
    note: row.note || undefined,
    color: row.color,
    createdAt: row.createdAt,
  };
}

export async function addAnnotation(input: AnnotationInput): Promise<Annotation> {
  const row: AnnotationRow = {
    projectId: input.projectId,
    paperId: input.paperId,
    blockId: input.blockId,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    quote: input.quote,
    note: input.note ?? "",
    color: input.color,
    createdAt: input.createdAt ?? Date.now(),
  };
  const id = await db.annotations.add(row);
  return toAnnotation({ ...row, id });
}

export async function listAnnotations(
  projectId: string,
  paperId: string,
): Promise<Annotation[]> {
  const rows = await db.annotations
    .where("[projectId+paperId]")
    .equals([projectId, paperId])
    .toArray();
  return rows.map(toAnnotation).sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteAnnotation(id: number): Promise<void> {
  await db.annotations.delete(id);
}

export async function deleteAnnotationsForProject(
  projectId: string,
): Promise<void> {
  await db.annotations.where("projectId").equals(projectId).delete();
}

export async function updateNote(
  id: number,
  note: string,
): Promise<Annotation | undefined> {
  const existing = await db.annotations.get(id);
  if (!existing) {
    return undefined;
  }
  await db.annotations.update(id, { note });
  return toAnnotation({ ...existing, note });
}
