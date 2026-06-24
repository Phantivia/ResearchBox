import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import { useTranslation } from "@/i18n";
import { MathBlock } from "@/ui/reader/MathBlock";
import { linkifyArtifactCitations, splitMarkdownWithMath } from "./artifactMarkdown";

export function ArtifactMarkdownContent({ content }: { content: string }) {
  const { t } = useTranslation();
  const segments = splitMarkdownWithMath(linkifyArtifactCitations(content));

  const components: Components = {
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
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--rb-primary)] hover:underline"
        >
          {children}
        </a>
      );
    },
  };

  return (
    <div className="prose prose-sm max-w-none text-[var(--rb-text-primary)] prose-headings:text-[var(--rb-text-primary)] prose-p:text-[var(--rb-text-primary)] prose-strong:text-[var(--rb-text-primary)] prose-code:text-[var(--rb-text-primary)] prose-table:text-[var(--rb-text-primary)]">
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
          <Markdown key={index} components={components}>
            {segment.value}
          </Markdown>
        );
      })}
    </div>
  );
}
