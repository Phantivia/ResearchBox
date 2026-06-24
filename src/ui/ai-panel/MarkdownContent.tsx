import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMemo } from "react";
import { useTranslation } from "@/i18n";
import { MathBlock } from "@/ui/reader/MathBlock";
import { linkifyArtifactCitations, splitMarkdownWithMath } from "./artifactMarkdown";

const PROSE_CLASS =
  "prose prose-sm max-w-none text-[var(--rb-text-primary)] prose-headings:text-[var(--rb-text-primary)] prose-p:text-[var(--rb-text-primary)] prose-strong:text-[var(--rb-text-primary)] prose-table:text-[var(--rb-text-primary)] prose-a:text-[var(--rb-primary)]";

export interface MarkdownContentProps {
  content: string;
  enableCitations?: boolean;
  className?: string;
}

export function MarkdownContent({
  content,
  enableCitations = false,
  className,
}: MarkdownContentProps) {
  const { t } = useTranslation();

  const segments = useMemo(() => {
    const source = enableCitations ? linkifyArtifactCitations(content) : content;
    return splitMarkdownWithMath(source);
  }, [content, enableCitations]);

  const components: Components = useMemo(
    () => ({
      a: ({ href, children }) => {
        if (href?.startsWith("cite:")) {
          const citationId = decodeURIComponent(href.slice(5));
          return (
            <button
              type="button"
              title={t("agent.artifact.citationHint", { id: citationId })}
              className="mx-0.5 inline rounded bg-[color-mix(in_srgb,var(--rb-primary)_12%,transparent)] px-1 py-0.5 font-mono text-xs text-[var(--rb-primary)] hover:underline"
              onClick={() => {
                // Navigation to reader block can be wired here later.
              }}
            >
              {children}
            </button>
          );
        }

        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {children}
          </a>
        );
      },
      table: ({ children }) => (
        <div className="rb-table-wrap my-4 max-w-full overflow-x-auto">
          <table>{children}</table>
        </div>
      ),
    }),
    [t],
  );

  return (
    <div className={["rb-markdown", PROSE_CLASS, className].filter(Boolean).join(" ")}>
      {segments.map((segment, index) => {
        if (segment.kind === "math") {
          return segment.display ? (
            <div key={index} className="my-4 overflow-x-auto">
              <MathBlock tex={segment.tex} display />
            </div>
          ) : (
            <span key={index} className="inline-math">
              <MathBlock tex={segment.tex} display={false} />
            </span>
          );
        }

        return (
          <Markdown key={index} remarkPlugins={[remarkGfm]} components={components}>
            {segment.value}
          </Markdown>
        );
      })}
    </div>
  );
}
