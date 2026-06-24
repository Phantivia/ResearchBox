import { isBoundaryMarker } from "../boundary";
import type { AgentMessage } from "../types";

export const RECOMMEND_INCLUDE_PREFIX = "【已纳入推荐】";
export const RECOMMEND_IGNORE_PREFIX = "【已忽略推荐】";
export const RECOMMEND_COMPOSER_PREFIX = "【论文选择备忘】";

export type RecommendationDecision = "included" | "ignored";

export function buildIncludeMarker(arxivId: string): AgentMessage {
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: `${RECOMMEND_INCLUDE_PREFIX}${arxivId}`,
      },
    ],
  };
}

export function buildIgnoreMarker(arxivId: string): AgentMessage {
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: `${RECOMMEND_IGNORE_PREFIX}${arxivId}`,
      },
    ],
  };
}

export function parseRecommendationMarker(
  text: string,
): { decision: RecommendationDecision; arxivId: string } | null {
  if (text.startsWith(RECOMMEND_INCLUDE_PREFIX)) {
    const arxivId = text.slice(RECOMMEND_INCLUDE_PREFIX.length).trim();
    return arxivId ? { decision: "included", arxivId } : null;
  }
  if (text.startsWith(RECOMMEND_IGNORE_PREFIX)) {
    const arxivId = text.slice(RECOMMEND_IGNORE_PREFIX.length).trim();
    return arxivId ? { decision: "ignored", arxivId } : null;
  }
  return null;
}

export function isRecommendationMarker(message: AgentMessage): boolean {
  if (message.role !== "user") {
    return false;
  }
  const textBlock = message.content.find(
    (block): block is Extract<(typeof message.content)[number], { type: "text" }> =>
      block.type === "text",
  );
  if (!textBlock) {
    return false;
  }
  return parseRecommendationMarker(textBlock.text) !== null;
}

function markerText(message: AgentMessage): string | null {
  const textBlock = message.content.find(
    (block): block is Extract<(typeof message.content)[number], { type: "text" }> =>
      block.type === "text",
  );
  return textBlock?.text ?? null;
}

export function lastCommittedUserMessageIndex(messages: AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") {
      continue;
    }
    if (isRecommendationMarker(message) || isBoundaryMarker(message)) {
      continue;
    }
    return index;
  }
  return -1;
}

export function editableRecommendationMarkerIndices(messages: AgentMessage[]): number[] {
  const afterIndex = lastCommittedUserMessageIndex(messages);
  const indices: number[] = [];
  for (let index = afterIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message && isRecommendationMarker(message)) {
      indices.push(index);
    }
  }
  return indices;
}

export function removeEditableMarkersForArxiv(
  messages: AgentMessage[],
  arxivId: string,
): AgentMessage[] {
  const editable = new Set(editableRecommendationMarkerIndices(messages));
  return messages.filter((message, index) => {
    if (!editable.has(index)) {
      return true;
    }
    const text = markerText(message);
    if (!text) {
      return true;
    }
    const parsed = parseRecommendationMarker(text);
    return parsed?.arxivId !== arxivId;
  });
}

export function buildComposerPrefix(
  decisions: Record<string, RecommendationDecision>,
): string {
  const included = Object.entries(decisions)
    .filter(([, decision]) => decision === "included")
    .map(([arxivId]) => arxivId);
  const ignored = Object.entries(decisions)
    .filter(([, decision]) => decision === "ignored")
    .map(([arxivId]) => arxivId);

  if (included.length === 0 && ignored.length === 0) {
    return "";
  }

  const parts: string[] = [];
  if (included.length > 0) {
    parts.push(`已纳入：${included.join("、")}`);
  }
  if (ignored.length > 0) {
    parts.push(`已忽略：${ignored.join("、")}`);
  }
  return `${RECOMMEND_COMPOSER_PREFIX}${parts.join("；")}。 `;
}

export function stripComposerPrefix(text: string): string {
  if (!text.startsWith(RECOMMEND_COMPOSER_PREFIX)) {
    return text;
  }
  const rest = text.slice(RECOMMEND_COMPOSER_PREFIX.length);
  const end = rest.indexOf("。 ");
  if (end === -1) {
    return text;
  }
  return rest.slice(end + 2);
}
