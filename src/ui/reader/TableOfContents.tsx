import { useCallback, useEffect, useMemo, useState } from "react";
import type { Block } from "@/core/ir";
import { buildTocTree, type TocNode } from "@/core/reader/toc";
import { useTranslation } from "@/i18n";

export interface TableOfContentsProps {
  blocks: Block[];
  activeBlockId?: string | null;
  onJump: (blockId: string) => void;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 0 1 .02-1.06L10.94 10 7.23 6.29a.75.75 0 1 1 1.06-1.06l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-.02Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function TocBranch({
  node,
  depth,
  activeBlockId,
  expandedIds,
  onToggle,
  onJump,
}: {
  node: TocNode;
  depth: number;
  activeBlockId?: string | null;
  expandedIds: Set<string>;
  onToggle: (blockId: string) => void;
  onJump: (blockId: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.blockId);
  const isActive = activeBlockId === node.blockId;

  return (
    <li>
      <div
        className="flex min-w-0 items-start gap-1"
        style={{ paddingLeft: depth > 0 ? `${depth * 0.75}rem` : undefined }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.blockId)}
            className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--rb-text-secondary)] hover:bg-[var(--rb-page-bg)]"
            aria-expanded={expanded}
            aria-label={node.title}
          >
            <ChevronIcon expanded={expanded} />
          </button>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onJump(node.blockId)}
          className={[
            "min-w-0 flex-1 rounded px-1 py-0.5 text-left text-sm leading-snug hover:text-[var(--rb-primary)]",
            isActive
              ? "font-medium text-[var(--rb-primary)]"
              : "text-[var(--rb-text-primary)]",
          ].join(" ")}
        >
          <span className="break-words">{node.title}</span>
        </button>
      </div>
      {hasChildren && expanded && (
        <ul className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <TocBranch
              key={child.blockId}
              node={child}
              depth={depth + 1}
              activeBlockId={activeBlockId}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onJump={onJump}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function collectExpandableIds(nodes: TocNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: TocNode[]) => {
    for (const node of list) {
      if (node.children.length > 0) {
        ids.push(node.blockId);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

export function TableOfContents({
  blocks,
  activeBlockId,
  onJump,
}: TableOfContentsProps) {
  const { t } = useTranslation();
  const tree = useMemo(() => buildTocTree(blocks), [blocks]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpandedIds(new Set(collectExpandableIds(tree)));
  }, [tree]);

  const handleToggle = useCallback((blockId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

  if (tree.length === 0) {
    return null;
  }

  return (
    <aside
      className="sticky top-4 min-w-0 max-h-[40vh] overflow-y-auto rounded-lg border border-[var(--rb-border)] bg-[var(--rb-page-bg)] p-4"
      data-testid="reader-toc"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--rb-text-secondary)]">
        {t("reader.toc.title")}
      </h2>
      <ul className="mt-3 space-y-1">
        {tree.map((node) => (
          <TocBranch
            key={node.blockId}
            node={node}
            depth={0}
            activeBlockId={activeBlockId}
            expandedIds={expandedIds}
            onToggle={handleToggle}
            onJump={onJump}
          />
        ))}
      </ul>
    </aside>
  );
}
