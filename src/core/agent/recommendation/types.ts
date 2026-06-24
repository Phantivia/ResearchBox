import { z } from "zod";

export const paperRecommendationSchema = z.strictObject({
  arxivId: z.string(),
  abstract: z.string(),
  reason: z.string(),
});

export const recommendPapersInputSchema = z.strictObject({
  papers: z.array(paperRecommendationSchema).min(1),
});

export type PaperRecommendation = z.infer<typeof paperRecommendationSchema>;
export type RecommendPapersInput = z.infer<typeof recommendPapersInputSchema>;

export function parsePaperRecommendations(result: string): PaperRecommendation[] | null {
  const trimmed = result.trim();
  if (!trimmed.startsWith("[")) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return null;
    }
    if (parsed.length === 0) {
      return [];
    }
    const validated = z.array(paperRecommendationSchema).safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}
