import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export interface MathBlockProps {
  tex: string;
  display: boolean;
}

type RenderResult =
  | { kind: "katex"; html: string }
  | { kind: "fallback"; tex: string };

function renderMath(tex: string, display: boolean): RenderResult {
  try {
    const html = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      // Firefox mobile fails to clip KaTeX's default MathML accessibility layer.
      output: "html",
    });
    return { kind: "katex", html };
  } catch {
    // TODO(phase later): fallback to MathJax/MathML
    return { kind: "fallback", tex };
  }
}

export function MathBlock({ tex, display }: MathBlockProps) {
  const result = useMemo(() => renderMath(tex, display), [tex, display]);

  if (result.kind === "fallback") {
    const Tag = display ? "div" : "span";
    return <Tag className="math-fallback">{result.tex}</Tag>;
  }

  const Tag = display ? "div" : "span";
  return <Tag dangerouslySetInnerHTML={{ __html: result.html }} />;
}
