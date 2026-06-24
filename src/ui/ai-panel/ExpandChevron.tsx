export interface ExpandChevronProps {
  expanded: boolean;
  className?: string;
}

export function ExpandChevron({ expanded, className = "" }: ExpandChevronProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`h-3.5 w-3.5 shrink-0 text-[var(--rb-text-secondary)] transition-transform duration-200 ${
        expanded ? "rotate-90" : ""
      } ${className}`}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
