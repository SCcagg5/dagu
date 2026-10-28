import React, { useSyncExternalStore } from 'react';

import { useClock } from '@/hooks/useClock';
import { cn } from '@/lib/utils';

type MatrixTextProps = {
  text: string;
  className?: string;
  glowSpeed?: number;
};

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches;
}

function MatrixText({ text, className, glowSpeed = 175 }: MatrixTextProps) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false
  );
  const textChars = text.split('');
  // The glow reads the shared clock: all chips glow in step, on one timer,
  // and none runs while the tab is hidden.
  const glowPosition = useClock(
    reducedMotion || textChars.length === 0 ? null : glowSpeed,
    (now) =>
      reducedMotion || textChars.length === 0
        ? 0
        : Math.floor(now / glowSpeed) % textChars.length
  );

  return (
    <span
      className={cn('inline-flex', className)}
      aria-label={text}
      role="status"
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {textChars.map((char, index) => (
          <span
            key={index}
            className="inline-block transition-colors duration-200"
            style={index === glowPosition ? { color: '#86efac' } : undefined}
          >
            {char}
          </span>
        ))}
      </span>
    </span>
  );
}

export type { MatrixTextProps };
export { MatrixText };
export default MatrixText;
