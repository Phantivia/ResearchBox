import { z } from "zod";

export const ArtifactKindSchema = z.enum([
  "summary",
  "compare-table",
  "outline",
  "note",
]);

export const ArtifactSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  kind: ArtifactKindSchema,
  title: z.string(),
  content: z.string(),
  sourceCitations: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
