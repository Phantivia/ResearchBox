import { Logo } from "./Logo";

export function LogoWatermark() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="rb-logo-emboss absolute top-1/2 left-1/2 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 text-[var(--rb-text-primary)]">
        <Logo className="h-full w-full" />
      </div>
    </div>
  );
}
