// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useSyncExternalStore } from 'react';
import type { components } from '@/api/v1/schema';
import { useQuery } from '@/hooks/api';
import { whenEnabled } from '@/hooks/queryUtils';
import { useDAGHistorySSE } from '@/hooks/useDAGHistorySSE';
import { sseFallbackOptions, useSSECacheSync } from '@/hooks/useSSECacheSync';
import { useWorkspaceData } from './context';
import type { ApiDAGRunDetails } from './types';

type DAGGridItem = components['schemas']['DAGGridItem'];

export interface RunHistory {
  /** The runs, newest first. With `includeEphemeral`, the test runs too. */
  runs: ApiDAGRunDetails[];
  gridData: DAGGridItem[];
  isLoading: boolean;
}

const NO_RUNS: ApiDAGRunDetails[] = [];
const NO_GRID: DAGGridItem[] = [];

/**
 * The test runs that this tab started, by workflow file. The timeline polls
 * the history while the set holds the workflow, as the SSE feed does not
 * carry test runs.
 */
const startedTestRuns = new Set<string>();
const startedListeners = new Set<() => void>();

/** Records that this tab started a test run of the workflow. */
export function noteTestRunStarted(fileName: string): void {
  if (startedTestRuns.has(fileName)) return;
  startedTestRuns.add(fileName);
  startedListeners.forEach((listener) => listener());
}

/** True when this tab started a test run of the workflow. */
export function useTestRunStarted(fileName: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      startedListeners.add(listener);
      return () => {
        startedListeners.delete(listener);
      };
    },
    () => startedTestRuns.has(fileName),
    () => false
  );
}

/** How often the history with test runs is read while a test run can change it. */
export const TEST_RUN_POLL_MS = 5000;

/**
 * The run history of the workflow. Without `includeEphemeral` it has the SWR
 * key of DAGExecutionHistory, so both share one cache entry. With it, the
 * server also lists the test runs (they leave no trace elsewhere): the query
 * has a key of its own and the SSE feed cannot fill it, so an event only
 * revalidates it. With `pollTestRuns`, the list is read again every
 * `TEST_RUN_POLL_MS` while it holds a test run or this tab started one, as
 * the server drops a test run without any event. Disabled, it makes no
 * request.
 */
export function useRunHistory({
  enabled,
  includeEphemeral = false,
  pollTestRuns = false,
}: {
  enabled: boolean;
  includeEphemeral?: boolean;
  pollTestRuns?: boolean;
}): RunHistory {
  const { fileName, remoteNode, registerHistory } =
    useWorkspaceData('useRunHistory');
  const active = enabled && fileName !== '';
  const historySSE = useDAGHistorySSE(fileName, active, remoteNode);
  const startedHere = useTestRunStarted(fileName);
  const base = sseFallbackOptions(historySSE);
  const { data, isLoading, mutate } = useQuery(
    '/dags/{fileName}/dag-runs',
    whenEnabled(active, {
      params: {
        query: includeEphemeral
          ? { remoteNode, includeEphemeral: true }
          : { remoteNode },
        path: { fileName },
      },
    }),
    {
      ...base,
      ...(includeEphemeral && pollTestRuns
        ? {
            refreshInterval: (latest?: { dagRuns?: ApiDAGRunDetails[] }) =>
              startedHere || latest?.dagRuns?.some((run) => run.ephemeral)
                ? TEST_RUN_POLL_MS
                : base.refreshInterval,
          }
        : {}),
    }
  );
  // The feed has no test run: it must not replace the list that has them.
  useSSECacheSync(
    historySSE,
    (includeEphemeral ? noSync : mutate) as typeof mutate
  );
  const events = historySSE.data;
  useEffect(() => {
    // An event of the feed means that the history changed: read it again.
    if (includeEphemeral && events != null) void mutate();
  }, [events, includeEphemeral, mutate]);

  useEffect(() => {
    if (!active) return;
    return registerHistory(() => mutate());
  }, [active, mutate, registerHistory]);

  return {
    runs: data?.dagRuns ?? NO_RUNS,
    gridData: data?.gridData ?? NO_GRID,
    isLoading: active && isLoading,
  };
}

// A mutator that does nothing, for a query that the SSE feed cannot fill.
const noSync = () => Promise.resolve(undefined);
