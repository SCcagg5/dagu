// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from 'react';
import { useRemoteNode } from '@/contexts/RemoteNodeContext';
import { useQuery } from '@/hooks/api';
import { subscribeClock } from '@/hooks/useClock';

/** The step that the panel reads, in a root run. */
export interface ContinuousTarget {
  name: string;
  runId: string;
  step: string;
}

/** The polling period of a window that ends now, while the run is active. */
export const POLL_MS = 10_000;

const iso = (ms: number) => new Date(ms).toISOString();

function pathOf(target: ContinuousTarget) {
  return {
    name: target.name,
    dagRunId: target.runId,
    stepName: target.step,
  };
}

/**
 * The clock of the windows that end now. It ticks every `pollMs`; with null it
 * stays where it is, so a long range keeps one query key and is never fetched
 * again. `reset` sets it to the clock, when the user picks a window.
 */
export function useWindowClock(pollMs: number | null): {
  now: number;
  reset(): void;
} {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (pollMs === null) return;
    return subscribeClock(pollMs, () => setNow(Date.now()));
  }, [pollMs]);
  const reset = useCallback(() => setNow(Date.now()), []);
  return { now, reset };
}

/** The availability and the streak of the step. Polled while `poll` is set. */
export function useStepAvailability(target: ContinuousTarget, poll: boolean) {
  const remoteNode = useRemoteNode();
  return useQuery(
    '/dag-runs/{name}/{dagRunId}/steps/{stepName}/availability',
    { params: { path: pathOf(target), query: { remoteNode } } },
    { refreshInterval: poll ? POLL_MS : 0 }
  );
}

/**
 * The buckets of a window. A live window gets a new `from` and `to` from the
 * clock, so the key changes and the old buckets stay on the screen until the
 * new ones come.
 */
export function useStepSamples(
  target: ContinuousTarget,
  window: { from: number; to: number },
  points: number
) {
  const remoteNode = useRemoteNode();
  return useQuery(
    '/dag-runs/{name}/{dagRunId}/steps/{stepName}/samples',
    {
      params: {
        path: pathOf(target),
        query: {
          remoteNode,
          from: iso(window.from),
          to: iso(window.to),
          points,
        },
      },
    },
    { keepPreviousData: true }
  );
}

/** One page of events. `before` is the cursor of the page before; `window` limits the times. */
export function useStepEventsPage(
  target: ContinuousTarget,
  page: {
    before?: string;
    window: { from: number; to: number } | null;
    limit: number;
  },
  poll: boolean
) {
  const remoteNode = useRemoteNode();
  return useQuery(
    '/dag-runs/{name}/{dagRunId}/steps/{stepName}/events',
    {
      params: {
        path: pathOf(target),
        query: {
          remoteNode,
          limit: page.limit,
          ...(page.before ? { before: page.before } : {}),
          ...(page.window
            ? { from: iso(page.window.from), to: iso(page.window.to) }
            : {}),
        },
      },
    },
    { refreshInterval: poll && !page.before ? POLL_MS : 0 }
  );
}
