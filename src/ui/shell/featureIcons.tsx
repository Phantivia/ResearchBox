export type FeatureIconId = "paper-box" | "dummy";

interface FeatureIconProps {
  id: FeatureIconId;
  className?: string;
}

export function FeatureIcon({ id, className = "h-4 w-4" }: FeatureIconProps) {
  switch (id) {
    case "paper-box":
      return <PaperBoxIcon className={className} />;
    case "dummy":
      return <DummyIcon className={className} />;
  }
}

function PaperBoxIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function DummyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M9 9h6v6H9z" />
    </svg>
  );
}
