import { z } from "zod";

export const OpenRouterReasoningMetaSchema = z.object({
  mandatory: z.boolean().optional(),
  default_enabled: z.boolean().optional(),
  supported_efforts: z.array(z.string()).optional(),
  default_effort: z.string().optional(),
});

export const OpenRouterModelApiSchema = z.object({
  id: z.string(),
  canonical_slug: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  context_length: z.number().nullable().optional(),
  architecture: z
    .object({
      modality: z.string().optional(),
      input_modalities: z.array(z.string()).optional(),
      output_modalities: z.array(z.string()).optional(),
    })
    .optional(),
  pricing: z.record(z.string(), z.string()).optional(),
  supported_parameters: z.array(z.string()).optional(),
  top_provider: z
    .object({
      context_length: z.number().nullable().optional(),
      max_completion_tokens: z.number().nullable().optional(),
      is_moderated: z.boolean().optional(),
    })
    .optional(),
  reasoning: OpenRouterReasoningMetaSchema.nullable().optional(),
});

export const OpenRouterModelsApiResponseSchema = z.object({
  data: z.array(OpenRouterModelApiSchema),
});

export const StoredOpenRouterModelMetaSchema = z.object({
  source: z.literal("openrouter"),
  fetchedAt: z.number(),
  openRouterId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  contextLength: z.number().nullable(),
  modality: z.string().optional(),
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()),
  pricing: z.record(z.string(), z.string()).optional(),
  supportedParameters: z.array(z.string()),
  maxCompletionTokens: z.number().nullable().optional(),
  isModerated: z.boolean().optional(),
  reasoning: OpenRouterReasoningMetaSchema.nullable().optional(),
});

export type OpenRouterModelApi = z.infer<typeof OpenRouterModelApiSchema>;
export type StoredOpenRouterModelMeta = z.infer<
  typeof StoredOpenRouterModelMetaSchema
>;
