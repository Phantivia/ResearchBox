import type { Paper } from "@/core/paper";
import { db } from "./index";

export async function putPaperEntry(paper: Paper): Promise<void> {
  await db.paperEntries.put(paper);
}

export async function getPaperEntry(
  projectId: string,
  routeId: string,
): Promise<Paper | undefined> {
  return db.paperEntries.get([projectId, routeId]);
}

export async function listPaperEntries(projectId: string): Promise<Paper[]> {
  const all = await db.paperEntries
    .where("projectId")
    .equals(projectId)
    .toArray();
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deletePaperEntry(
  projectId: string,
  routeId: string,
): Promise<void> {
  await db.paperEntries.delete([projectId, routeId]);
}

export async function deletePaperEntriesForProject(
  projectId: string,
): Promise<void> {
  await db.paperEntries.where("projectId").equals(projectId).delete();
}
