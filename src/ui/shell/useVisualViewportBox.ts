import { useEffect, useState } from "react";

export interface VisualViewportBox {
  offsetTop: number;
  offsetLeft: number;
  width: number;
  height: number;
}

function readVisualViewportBox(): VisualViewportBox {
  const vv = window.visualViewport;
  if (!vv) {
    return {
      offsetTop: 0,
      offsetLeft: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }
  return {
    offsetTop: vv.offsetTop,
    offsetLeft: vv.offsetLeft,
    width: vv.width,
    height: vv.height,
  };
}

/** 跟踪 visualViewport，在移动端地址栏显隐时同步 fixed 层位置与高度。 */
export function useVisualViewportBox(): VisualViewportBox {
  const [box, setBox] = useState(readVisualViewportBox);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) {
      return;
    }
    const sync = () => setBox(readVisualViewportBox());
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  return box;
}
