import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function TableContainer({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const update = () => {
      const maxScroll = element.scrollWidth - element.clientWidth;
      setEdges({
        left: element.scrollLeft > 1,
        right: maxScroll - element.scrollLeft > 1,
      });
    };

    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [children]);

  return (
    <div className="rb-table-wrap" data-pinned={edges.left} data-overflow-right={edges.right}>
      <div ref={scrollRef} className="rb-table-scroll max-w-full min-w-0 overflow-x-auto">
        {children}
      </div>
      <div className="rb-table-edge rb-table-edge--right" aria-hidden="true" />
    </div>
  );
}
