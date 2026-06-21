import { useRef, type ReactNode } from "react";
import { useScrollableWidth } from "./OverflowContainer";

export function TableContainer({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollable = useScrollableWidth(ref, children);

  const overflowClass = scrollable ? "overflow-x-auto" : "overflow-x-clip";
  const shadowClass = scrollable ? "rb-table-scroll--scrollable" : "";

  return (
    <div
      ref={ref}
      className={`rb-table-scroll max-w-full min-w-0 ${overflowClass} ${shadowClass}`.trim()}
    >
      {children}
    </div>
  );
}
