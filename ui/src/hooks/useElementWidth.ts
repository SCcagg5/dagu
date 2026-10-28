// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * The width of the element, current while it resizes. null before the first
 * measure and where the element has no layout (jsdom).
 */
export function useElementWidth(
  ref: RefObject<HTMLElement | null>
): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const read = (next: number) => setWidth(next > 0 ? next : null);
    read(element.getBoundingClientRect().width);
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      read(entry ? entry.contentRect.width : element.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
