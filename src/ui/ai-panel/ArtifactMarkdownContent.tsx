import { MarkdownContent } from "./MarkdownContent";

export function ArtifactMarkdownContent({ content }: { content: string }) {
  return <MarkdownContent content={content} enableCitations />;
}
