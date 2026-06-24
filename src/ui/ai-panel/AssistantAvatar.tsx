import { MiniLogo } from "@/ui/brand/MiniLogo";

export function AssistantAvatar() {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--rb-border)] bg-[var(--rb-card-bg)] text-[var(--rb-primary)]"
      aria-hidden
    >
      <MiniLogo className="h-5 w-5" />
    </div>
  );
}
