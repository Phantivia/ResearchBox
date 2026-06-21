import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

export interface ImageViewerProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 10;
const ZOOM_STEP = 1.25;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

interface DragState {
  pointerX: number;
  pointerY: number;
  originX: number;
  originY: number;
}

export function ImageViewer({ src, alt, onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  const zoom = useCallback((factor: number) => {
    setScale((current) => clampScale(current * factor));
  }, []);

  const rotate = useCallback(() => {
    setRotation((current) => current + 90);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "+" || event.key === "=") zoom(ZOOM_STEP);
      else if (event.key === "-" || event.key === "_") zoom(1 / ZOOM_STEP);
      else if (event.key.toLowerCase() === "r") rotate();
      else if (event.key === "0") reset();
    };
    window.addEventListener("keydown", onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, zoom, rotate, reset]);

  // React 的 onWheel 走被动监听，preventDefault 不生效，改用原生非被动监听。
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setScale((current) => clampScale(current * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLImageElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: drag.originX + (event.clientX - drag.pointerX),
      y: drag.originY + (event.clientY - drag.pointerY),
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  return createPortal(
    <div
      ref={stageRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt || "图片查看器"}
      data-testid="image-viewer"
    >
      <img
        src={src}
        alt={alt ?? ""}
        draggable={false}
        className="max-h-[90vh] max-w-[92vw] cursor-grab touch-none select-none active:cursor-grabbing"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
          transition: dragRef.current ? "none" : "transform 0.12s ease-out",
        }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />

      <div
        className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2 py-1.5 text-white shadow-lg backdrop-blur"
        onClick={(event) => event.stopPropagation()}
      >
        <ToolbarButton label="缩小" onClick={() => zoom(1 / ZOOM_STEP)}>
          <MinusIcon />
        </ToolbarButton>
        <button
          type="button"
          onClick={reset}
          className="min-w-12 rounded-full px-2 py-1 text-xs font-medium tabular-nums hover:bg-white/15"
          aria-label="重置缩放"
        >
          {Math.round(scale * 100)}%
        </button>
        <ToolbarButton label="放大" onClick={() => zoom(ZOOM_STEP)}>
          <PlusIcon />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-white/15" />
        <ToolbarButton label="旋转" onClick={rotate}>
          <RotateIcon />
        </ToolbarButton>
        <ToolbarButton label="关闭" onClick={onClose}>
          <CloseIcon />
        </ToolbarButton>
      </div>
    </div>,
    document.body,
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15"
    >
      {children}
    </button>
  );
}

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function PlusIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  );
}

function RotateIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
