import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";

type OverflowContainerProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "span" | "pre";
  children: ReactNode;
};

export function OverflowContainer({
  as: Tag = "div",
  className = "",
  children,
  ...rest
}: OverflowContainerProps) {
  const ref = useRef<HTMLElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      setScrollable(element.scrollWidth - element.clientWidth > 1);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => observer.disconnect();
  }, [children]);

  const overflowClass = scrollable ? "overflow-x-auto" : "overflow-x-clip";

  return (
    <Tag ref={ref as never} className={`max-w-full ${overflowClass} ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
