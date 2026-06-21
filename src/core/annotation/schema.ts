import { z } from "zod";

export const AnnotationSchema = z.object({
  id: z.number().optional(),
  paperId: z.string(),
  blockId: z.string(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  quote: z.string(),
  note: z.string().optional(),
  color: z.string().optional(),
  createdAt: z.number(),
});

export type Annotation = z.infer<typeof AnnotationSchema>;

export const TextAnchorSchema = z.object({
  blockId: z.string(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  quote: z.string(),
});

export type TextAnchor = z.infer<typeof TextAnchorSchema>;

export function makePaperId(arxivId: string, version: string): string {
  return `${arxivId}:${version}`;
}
