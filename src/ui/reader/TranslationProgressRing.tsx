interface TranslationProgressRingProps {
  completed: number;
  total: number;
  size?: number;
  className?: string;
}

export function TranslationProgressRing({
  completed,
  total,
  size = 36,
  className = "",
}: TranslationProgressRingProps) {
  if (total <= 0) {
    return null;
  }

  const progress = Math.min(Math.max(completed / total, 0), 1);
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);
  const percent = Math.round(progress * 100);

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      role="progressbar"
      aria-valuenow={completed}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${percent}%`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#2563eb"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
      <span className="absolute text-[10px] font-medium leading-none text-gray-600">
        {percent}%
      </span>
    </div>
  );
}
