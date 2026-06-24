import { useEffect, useRef } from "react";
import { useTranslation } from "@/i18n";
import { PYTHON_TOKEN_CLASS, tokenizePython } from "./pythonHighlight";

export function PythonHighlightedCode({ code }: { code: string }) {
  const tokens = tokenizePython(code);
  return (
    <>
      {tokens.map((token, index) => (
        <span key={index} className={PYTHON_TOKEN_CLASS[token.kind]}>
          {token.text}
        </span>
      ))}
    </>
  );
}

export interface PythonCodePanelProps {
  code: string;
  purpose?: string;
  streaming?: boolean;
  maxHeightClass?: string;
  showHeader?: boolean;
}

export function PythonCodePanel({
  code,
  purpose,
  streaming = false,
  maxHeightClass = "max-h-80",
  showHeader = true,
}: PythonCodePanelProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!streaming) {
      return;
    }
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [code, streaming]);

  return (
    <div className="vscode-python-editor w-full min-w-0 overflow-hidden rounded-lg border border-[#3c3c3c]">
      {showHeader ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[#3c3c3c] bg-[#252526] px-3 py-2 text-sm">
          <span className="font-medium text-[#cccccc]">python</span>
          {streaming ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#858585]">
              {t("agent.tool.pythonWriting")}
              <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-[#858585]" />
            </span>
          ) : purpose ? (
            <span className="text-xs text-[#858585]">{purpose}</span>
          ) : null}
        </div>
      ) : null}
      <pre
        ref={scrollRef}
        className={`overflow-auto px-3 py-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words ${maxHeightClass}`}
      >
        <code>
          <PythonHighlightedCode code={code} />
          {streaming ? <span className="vscode-py-cursor">▍</span> : null}
        </code>
      </pre>
    </div>
  );
}
