export type Provenance = "paperbox" | "academic" | "web";

const PROVENANCE_PREFIX = /^\[来源:\s*(paperbox|academic|web)\]\n?/;

export function withProvenance(p: Provenance, body: string): string {
  return `[来源: ${p}]\n${body}`;
}

export function parseProvenanceFromContent(content: string): Provenance | null {
  const match = content.match(PROVENANCE_PREFIX);
  return match ? (match[1] as Provenance) : null;
}

export function stripProvenancePrefix(content: string): string {
  return content.replace(PROVENANCE_PREFIX, "");
}

export function provenanceForToolName(toolName: string): Provenance | null {
  if (
    toolName === "paperbox_list" ||
    toolName === "paperbox_read" ||
    toolName === "retrieval"
  ) {
    return "paperbox";
  }
  if (toolName === "academic_search") {
    return "academic";
  }
  if (toolName === "websearch") {
    return "web";
  }
  return null;
}
