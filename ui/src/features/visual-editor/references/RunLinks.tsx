// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { createContext, useContext, useEffect, useState } from 'react';

/**
 * What a host gives to the marks of a reused input so that the run that the
 * outputs came from is a link: it selects the run when the history holds it,
 * and it says that the run is gone when the server does not know it any more.
 */
export interface RunLinks {
  /** Selects the run in the host. */
  select(runId: string): void;
  /**
   * The id that the history holds for a run id of any letter case (a label
   * writes it in lower case), or null when the history does not hold it.
   */
  resolve(runId: string): string | null;
  /** Asks whether the server still has the run. */
  exists(runId: string): Promise<boolean>;
  /**
   * Called by a mark that shows a source run: the host starts to read the
   * history only then, so that a page with no reused step makes no request.
   */
  activate?(): void;
}

export const RunLinksContext = createContext<RunLinks | null>(null);

export function useRunLinks(): RunLinks | null {
  const links = useContext(RunLinksContext);
  const activate = links?.activate;
  useEffect(() => {
    activate?.();
  }, [activate]);
  return links;
}

/** What is known of a source run: in the history, gone, or not asked yet. */
export type RunAvailability =
  | { state: 'unknown' }
  | { state: 'checking' }
  | { state: 'available'; runId: string }
  | { state: 'gone' };

// The answers of the server, by run id, for the life of the page: a run that
// is gone stays gone.
const asked = new Map<string, boolean>();

/**
 * Whether the run named by `runId` can be selected. The history answers
 * first; when it does not hold the run (it lists the newest runs only), the
 * server is asked once, and only while `enabled` (the tooltip is open).
 */
export function useRunAvailability(
  runId: string | undefined,
  enabled: boolean
): RunAvailability {
  const links = useRunLinks();
  const resolved = runId && links ? links.resolve(runId) : null;
  const [answer, setAnswer] = useState<boolean | undefined>(() =>
    runId ? asked.get(runId) : undefined
  );
  useEffect(() => {
    if (!enabled || !runId || !links || resolved !== null) return;
    const known = asked.get(runId);
    if (known !== undefined) {
      setAnswer(known);
      return;
    }
    let cancelled = false;
    void links.exists(runId).then(
      (found) => {
        asked.set(runId, found);
        if (!cancelled) setAnswer(found);
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, runId, links, resolved]);
  if (!runId || !links) return { state: 'unknown' };
  if (resolved !== null) return { state: 'available', runId: resolved };
  if (answer === undefined) {
    return { state: enabled ? 'checking' : 'unknown' };
  }
  return answer ? { state: 'available', runId } : { state: 'gone' };
}

/** Forgets the answers of the server (for tests). */
export function resetRunAvailability(): void {
  asked.clear();
}
