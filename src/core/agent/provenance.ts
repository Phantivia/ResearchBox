export type Provenance = "paperbox" | "academic" | "web";

export function withProvenance(p: Provenance, body: string): string {
  return `[来源: ${p}]\n${body}`;
}
