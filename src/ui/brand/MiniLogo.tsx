import type { SVGProps } from "react";

export function MiniLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="117.91 122.96 262.9 258.14"
      fill="none"
      className={className}
      aria-hidden={props["aria-label"] ? undefined : true}
      {...props}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={12}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 222.85 198.48 L 222.85 149.67 L 205.18 149.67 L 205.18 128.96 L 293.53 128.96 L 293.53 149.67 L 275.86 149.67 L 275.86 198.48 L 360.67 329.10 C 374.81 351.10 360.67 375.10 335.94 375.10 L 162.78 375.10 C 138.04 375.10 123.91 351.10 138.04 329.10 Z" />
        <g transform="matrix(1.113899, -0.298469, 0.277787, 1.036716, 253.41, 299.90)">
          <path d="M -36 -45 L 9 -45 L 36 -18 L 36 45 L -36 45 L -36 -45 Z" />
          <path d="M 9 -45 L 9 -18 L 36 -18" />
          <line x1="-14" y1="0" x2="14" y2="0" />
          <line x1="-14" y1="20" x2="2" y2="20" />
        </g>
      </g>
    </svg>
  );
}
