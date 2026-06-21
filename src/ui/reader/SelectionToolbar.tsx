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
import { useTranslation } from "@/i18n";

export interface SelectionToolbarProps {
  anchor: Range;
  open: boolean;
  onHighlight: () => void;
  onAddNote: () => void;
  onClose: () => void;
}

function rangeToVirtualElement(range: Range): { getBoundingClientRect: () => DOMRect } {
  return {
    getBoundingClientRect: () => range.getBoundingClientRect(),
  };
}

export function SelectionToolbar({
  anchor,
  open,
  onHighlight,
  onAddNote,
  onClose,
}: SelectionToolbarProps) {
  const { t } = useTranslation();
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) {
        onClose();
      }
    },
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    refs.setReference(rangeToVirtualElement(anchor));
  }, [anchor, refs]);

  const dismiss = useDismiss(context, { escapeKey: true, outsidePress: true });
  const role = useRole(context, { role: "dialog" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  if (!open) {
    return null;
  }

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        {...getFloatingProps()}
        className="z-50 flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
        data-testid="selection-toolbar"
      >
        <button
          type="button"
          onClick={onHighlight}
          className="rounded px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-yellow-100"
        >
          {t("annotation.highlight")}
        </button>
        <button
          type="button"
          onClick={onAddNote}
          className="rounded px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100"
        >
          {t("annotation.addNote")}
        </button>
      </div>
    </FloatingPortal>
  );
}
