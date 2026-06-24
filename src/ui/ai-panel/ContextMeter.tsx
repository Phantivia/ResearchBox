export interface ContextMeterProps {
  tokens: number;
  contextWindow: number;
}

function resolveBarColor(percent: number): string {
  if (percent > 95) {
    return "bg-red-500";
  }
  if (percent > 80) {
    return "bg-orange-500";
  }
  return "bg-[var(--rb-primary)]";
}

export function ContextMeter({ tokens, contextWindow }: ContextMeterProps) {
  const safeWindow = Math.max(contextWindow, 1);
  const percent = Math.min(100, Math.round((tokens / safeWindow) * 100));
  const barColor = resolveBarColor(percent);

  return (
    <div className="border-b border-[var(--rb-border)] bg-[var(--rb-card-bg)] px-4 py-2">
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--rb-text-secondary)]">
        <span>
          上下文：{tokens.toLocaleString()} tokens（{percent}%）
        </span>
      </div>
      <div
        className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--rb-border)_40%,var(--rb-page-bg))]"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`上下文占用 ${percent}%`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
