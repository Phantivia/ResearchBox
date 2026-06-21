import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addAnnotation,
  deleteAnnotation,
  deleteAnnotationsForProject,
  listAnnotations,
  updateNote,
  db,
} from "./index";

const PROJECT_ID = "p-1";
const PAPER_ID = "2401.12345:v1";

beforeEach(async () => {
  await db.annotations.clear();
});

describe("annotations helpers", () => {
  it("adds and lists annotations for a paper", async () => {
    const created = await addAnnotation({
      projectId: PROJECT_ID,
      paperId: PAPER_ID,
      blockId: "blk-1",
      startOffset: 0,
      endOffset: 5,
      quote: "Hello",
    });

    expect(created.id).toBeDefined();
    expect(created.createdAt).toBeTypeOf("number");

    const listed = await listAnnotations(PROJECT_ID, PAPER_ID);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      blockId: "blk-1",
      startOffset: 0,
      endOffset: 5,
      quote: "Hello",
    });
  });

  it("updates note and deletes annotation", async () => {
    const created = await addAnnotation({
      projectId: PROJECT_ID,
      paperId: PAPER_ID,
      blockId: "blk-2",
      startOffset: 2,
      endOffset: 8,
      quote: "sample",
      note: "first",
    });

    const updated = await updateNote(created.id!, "updated note");
    expect(updated?.note).toBe("updated note");

    const listed = await listAnnotations(PROJECT_ID, PAPER_ID);
    expect(listed[0]?.note).toBe("updated note");

    await deleteAnnotation(created.id!);
    expect(await listAnnotations(PROJECT_ID, PAPER_ID)).toHaveLength(0);
  });

  it("returns undefined when updating a missing annotation", async () => {
    expect(await updateNote(9999, "nope")).toBeUndefined();
  });

  it("isolates annotations by project and paperId", async () => {
    await addAnnotation({
      projectId: PROJECT_ID,
      paperId: PAPER_ID,
      blockId: "a",
      startOffset: 0,
      endOffset: 1,
      quote: "A",
    });
    await addAnnotation({
      projectId: PROJECT_ID,
      paperId: "other:v1",
      blockId: "b",
      startOffset: 0,
      endOffset: 1,
      quote: "B",
    });
    await addAnnotation({
      projectId: "p-2",
      paperId: PAPER_ID,
      blockId: "c",
      startOffset: 0,
      endOffset: 1,
      quote: "C",
    });

    expect(await listAnnotations(PROJECT_ID, PAPER_ID)).toHaveLength(1);
    expect(await listAnnotations(PROJECT_ID, "other:v1")).toHaveLength(1);
    expect(await listAnnotations("p-2", PAPER_ID)).toHaveLength(1);
  });

  it("removes all annotations for a project", async () => {
    await addAnnotation({
      projectId: PROJECT_ID,
      paperId: PAPER_ID,
      blockId: "a",
      startOffset: 0,
      endOffset: 1,
      quote: "A",
    });
    await addAnnotation({
      projectId: "p-2",
      paperId: PAPER_ID,
      blockId: "b",
      startOffset: 0,
      endOffset: 1,
      quote: "B",
    });

    await deleteAnnotationsForProject(PROJECT_ID);
    expect(await listAnnotations(PROJECT_ID, PAPER_ID)).toHaveLength(0);
    expect(await listAnnotations("p-2", PAPER_ID)).toHaveLength(1);
  });
});
