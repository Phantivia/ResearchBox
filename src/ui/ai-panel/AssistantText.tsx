import { MarkdownContent } from "./MarkdownContent";

export interface AssistantTextProps {
  content: string;
}

export function AssistantText({ content }: AssistantTextProps) {
  return (
    <div className="min-w-0 max-w-none">
      <MarkdownContent content={content} />
    </div>
  );
}
