import { useEffect, useMemo, useRef, useState } from "react";
import type { Block } from "@/core/ir";
import {
  buildTocTree,
  flattenToc,
  truncateTitle,
  type TocNode,
} from "@/core/reader/toc";
import { useTranslation } from "@/i18n";

const MOBILE_TITLE_MAX = 28;

export interface MobileSectionNavProps {
  blocks: Block[];
  containerRef: React.RefObject<HTMLElement | null>;
  onJump: (blockId: string) => void;
}

function flattenWithDepth(nodes: TocNode[], depth = 0): Array<TocNode & { depth: number }> {
  const result: Array<TocNode & { depth: number }> = [];
  const walk = (list: TocNode[], currentDepth: number) => {
    for (const node of list) {
      result.push({ ...node, depth: currentDepth });
      walk(node.children, currentDepth + 1);
    }
  };
  walk(nodes, depth);
  return result;
}

export function useActiveSection(
  containerRef: React.RefObject<HTMLElement | null>,
  blockIds: string[],
): string | null {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(blockIds[0] ?? null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || blockIds.length === 0) {
      setActiveBlockId(null);
      return;
    }

    const elements = blockIds
      .map((blockId) => container.querySelector(`[data-block-id="${blockId}"]`))
      .filter((element): element is HTMLElement => element instanceof HTMLElement);

    if (elements.length === 0) {
      return;
    }

    const visible = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const blockId = entry.target.getAttribute("data-block-id");
          if (!blockId) {
            continue;
          }
          if (entry.isIntersecting) {
            visible.set(blockId, entry.intersectionRatio);
          } else {
            visible.delete(blockId);
          }
        }

        if (visible.size === 0) {
          return;
        }

        let bestId: string | null = null;
        let bestTop = Number.POSITIVE_INFINITY;

        for (const [blockId] of visible) {
          const element = container.querySelector(`[data-block-id="${blockId}"]`);
          if (!(element instanceof HTMLElement)) {
            continue;
          }
          const top = element.getBoundingClientRect().top;
          if (top <= 120 && top >= bestTop - 200) {
            bestTop = top;
            bestId = blockId;
          }
        }

        if (!bestId) {
          const firstVisible = [...visible.keys()][0];
          bestId = firstVisible ?? null;
        }

        if (bestId) {
          setActiveBlockId(bestId);
        }
      },
      {
        root: null,
        rootMargin: "-10% 0px -70% 0px",
        threshold: [0, 0.1, 0.25, 0.5, 1],
      },
    );

    for (const element of elements) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [containerRef, blockIds]);

  return activeBlockId;
}

export function MobileSectionNav({
  blocks,
  containerRef,
  onJump,
}: MobileSectionNavProps) {
  const { t } = useTranslation();
  const tree = useMemo(() => buildTocTree(blocks), [blocks]);
  const flat = useMemo(() => flattenToc(tree), [tree]);
  const flatWithDepth = useMemo(() => flattenWithDepth(tree), [tree]);
  const blockIds = useMemo(() => flat.map((node) => node.blockId), [flat]);
  const activeBlockId = useActiveSection(containerRef, blockIds);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeTitle =
    flat.find((node) => node.blockId === activeBlockId)?.title ??
    flat[0]?.title ??
    t("reader.toc.title");

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  if (tree.length === 0) {
    return null;
  }

  return (
    <div ref={menuRef} className="relative z-20 mb-4 flex justify-end lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-full items-center gap-1 rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] px-3 py-1.5 text-sm shadow-sm"
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid="mobile-section-nav"
      >
        <span className="truncate text-[var(--rb-text-primary)]">
          {truncateTitle(activeTitle, MOBILE_TITLE_MAX)}
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 shrink-0 text-[var(--rb-text-secondary)] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 max-h-[60vh] w-[min(100vw-2rem,18rem)] overflow-y-auto rounded-lg border border-[var(--rb-border)] bg-[var(--rb-card-bg)] py-1 shadow-lg"
          role="listbox"
          data-testid="mobile-section-menu"
        >
          {flatWithDepth.map((node) => (
            <button
              key={node.blockId}
              type="button"
              role="option"
              aria-selected={node.blockId === activeBlockId}
              onClick={() => {
                onJump(node.blockId);
                setOpen(false);
              }}
              className={[
                "block w-full px-3 py-2 text-left text-sm hover:bg-[var(--rb-page-bg)]",
                node.blockId === activeBlockId
                  ? "font-medium text-[var(--rb-primary)]"
                  : "text-[var(--rb-text-primary)]",
              ].join(" ")}
              style={{ paddingLeft: `${0.75 + node.depth * 0.75}rem` }}
            >
              <span className="break-words">{node.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
