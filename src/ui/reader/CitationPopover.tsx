import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { useEffect } from "react";
import type { Reference } from "@/core/ir";

/** Popover target kinds — reference only for now. */
export type CitationPopoverKind = "reference";
// TODO: extend with "equation" | "figure" | "table" for numbered cross-refs

export interface CitationPopoverProps {
  reference: Reference;
  anchor: HTMLElement;
  open: boolean;
  onClose: () => void;
}

export function CitationPopover({
  reference,
  anchor,
  open,
  onClose,
}: CitationPopoverProps) {
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) onClose();
    },
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    refs.setReference(anchor);
  }, [anchor, refs]);

  const dismiss = useDismiss(context, { escapeKey: true, outsidePress: true });
  const role = useRole(context, { role: "dialog" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  if (!open) return null;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        {...getFloatingProps()}
        className="z-50 max-w-sm rounded-lg border-2 border-slate-300 bg-white p-3 text-sm leading-relaxed shadow-xl ring-1 ring-slate-200/50"
        data-testid="citation-popover"
      >
        <span className="mr-2 font-medium text-gray-900">{reference.label}</span>
        <span className="text-gray-700">{reference.text}</span>
      </div>
    </FloatingPortal>
  );
}
