const TICK_WIDTH: Record<number, number> = { 1: 28, 2: 20, 3: 14 };

function tickWidth(level: number): number {
  return TICK_WIDTH[level] ?? 9;
}

export interface TocTickProps {
  title: string;
  level: number;
  active: boolean;
  scale: number;
  opacity: number;
  variant: "rail" | "panel";
  motion?: boolean;
  onClick: () => void;
}

/**
 * 目录刻度尺的单个刻度：左侧短横线（长度随层级变化，形似尺子刻度）+ 标题。
 * scale / opacity 由外层依据「距当前 section 的距离」计算，实现中间放大、远端缩小淡出。
 */
export function TocTick({
  title,
  level,
  active,
  scale,
  opacity,
  variant,
  motion = true,
  onClick,
}: TocTickProps) {
  const isPanel = variant === "panel";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        transform: isPanel ? undefined : `scale(${scale})`,
        opacity: isPanel ? undefined : opacity,
        transformOrigin: isPanel ? undefined : "left center",
        paddingLeft: isPanel ? (level - 1) * 12 : undefined,
      }}
      className={[
        "flex items-center gap-2 bg-transparent text-left",
        isPanel ? "h-full min-w-0" : "w-full",
        !isPanel && motion ? "transition-[transform,opacity] duration-300 ease-out" : "",
      ].join(" ")}
    >
      {!isPanel && (
        <span
          aria-hidden
          className={[
            "shrink-0 rounded-full transition-colors",
            "h-[2px]",
            active ? "bg-[var(--rb-primary)]" : "bg-[var(--rb-border)]",
          ].join(" ")}
          style={{ width: tickWidth(level) }}
        />
      )}
      <span
        className={[
          "min-w-0 text-left transition-colors",
          isPanel ? "truncate text-[15px]" : "flex-1 truncate text-[13px]",
          active
            ? "font-semibold text-[var(--rb-text-primary)]"
            : "text-[var(--rb-text-secondary)]",
        ].join(" ")}
      >
        {title}
      </span>
      {isPanel && (
        <span
          aria-hidden
          className={[
            "shrink-0 rounded-full transition-colors",
            "h-[3px]",
            active ? "bg-[var(--rb-primary)]" : "bg-[var(--rb-border)]",
          ].join(" ")}
          style={{ width: tickWidth(level) }}
        />
      )}
    </button>
  );
}
