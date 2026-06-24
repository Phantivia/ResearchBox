import { z } from "zod";
import { saveArtifact } from "@/db";
import type { Artifact, ArtifactKind } from "@/core/agent/artifact/schema";
import type { AgentDeps, AgentMessage, Tool } from "../types";

export const artifactsInputSchema = z.strictObject({
  kind: z.enum(["summary", "compare-table", "outline", "note"]),
  title: z.string(),
  content: z.string(),
  sourceCitations: z.array(z.string()).default([]),
});

export type ArtifactsInput = z.infer<typeof artifactsInputSchema>;

export type ArtifactsOutput = {
  artifactId: string;
  title: string;
  kind: ArtifactKind;
  summary: string;
  /** Citations that did not match paperId#blockId; artifact is still saved. */
  invalidCitations?: string[];
};

function requireProjectId(deps: AgentDeps): string {
  if (!deps.projectId) {
    throw new Error("No active project: projectId was not provided in AgentDeps");
  }
  return deps.projectId;
}

function parseCitationId(id: string): { paperId: string; blockId: string } | null {
  const hashIndex = id.lastIndexOf("#");
  if (hashIndex <= 0) {
    return null;
  }
  const paperId = id.slice(0, hashIndex);
  const blockId = id.slice(hashIndex + 1);
  if (!paperId || !blockId) {
    return null;
  }
  return { paperId, blockId };
}

function partitionCitations(citations: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const citation of citations) {
    if (parseCitationId(citation)) {
      valid.push(citation);
    } else {
      invalid.push(citation);
    }
  }
  return { valid, invalid };
}

function buildSummary(
  title: string,
  kind: ArtifactKind,
  invalidCitations: string[],
): string {
  let summary = `Saved ${kind} artifact 「${title}」.`;
  if (invalidCitations.length > 0) {
    summary +=
      ` Warning: ${invalidCitations.length} sourceCitation(s) did not match paperId#blockId format` +
      ` (${invalidCitations.join(", ")}).`;
  }
  return summary;
}

function artifactSavedMessage(artifactId: string, title: string): AgentMessage {
  return {
    role: "user",
    uiHidden: true,
    content: [
      {
        type: "text",
        text: `已生成 artifact，id=${artifactId}，标题「${title}」`,
      },
    ],
  };
}

export const artifactsTool: Tool<typeof artifactsInputSchema, ArtifactsOutput> = {
  name: "artifacts",
  description: `Create a research artifact (summary, comparison table, outline, or note) and persist it to the project after user approval. Include sourceCitations as paperId#blockId references for traceability.

Use after retrieval/paperbox_read when you have enough evidence. Artifacts appear in the sidebar for the user to preview.`,
  inputSchema: artifactsInputSchema,
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  checkPermissions: async (input) => ({
    behavior: "ask",
    reason: `生成 Artifact: ${input.title}`,
    risk: "low",
  }),
  call: async function* (input, deps) {
    yield { stage: "saving artifact" };

    const projectId = requireProjectId(deps);
    const { invalid: invalidCitations } = partitionCitations(input.sourceCitations);
    const now = Date.now();
    const artifactId = crypto.randomUUID();

    const artifact: Artifact = {
      id: artifactId,
      projectId,
      kind: input.kind,
      title: input.title,
      content: input.content,
      sourceCitations: input.sourceCitations,
      createdAt: now,
      updatedAt: now,
    };

    await saveArtifact(artifact);

    const data: ArtifactsOutput = {
      artifactId,
      title: input.title,
      kind: input.kind,
      summary: buildSummary(input.title, input.kind, invalidCitations),
      ...(invalidCitations.length > 0 ? { invalidCitations } : {}),
    };

    return {
      data,
      newMessages: [artifactSavedMessage(artifactId, input.title)],
    };
  },
};
