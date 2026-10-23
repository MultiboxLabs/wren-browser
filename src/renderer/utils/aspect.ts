// The shapes the themes are laid out for: a box's, and the window's.

import { type RefObject, useLayoutEffect, useState, useSyncExternalStore } from "react";

/** A box's width over its height, as it is resized; 1 until it is laid out. */
export function useAspect(box: RefObject<HTMLElement | null>) {
  const [aspect, setAspect] = useState(1);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const { offsetWidth: width, offsetHeight: height } = element;
      if (width > 0 && height > 0) setAspect(width / height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [box]);
  return aspect;
}

const onResize = (listener: () => void) => {
  addEventListener("resize", listener);
  return () => removeEventListener("resize", listener);
};

/** The window's width over its height (the page's, which fills it), as it is resized. */
export const useWindowAspect = () => useSyncExternalStore(onResize, () => innerWidth / innerHeight);
