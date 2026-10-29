// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { components } from '@/api/v1/schema';
import RelativeTime from '@/components/ui/relative-time';
import StatusChip from '@/components/ui/status-chip';
import { useRemoteNode } from '@/contexts/RemoteNodeContext';
import { buildDAGPageURL } from '@/features/dag-runs/lib/dagRunUrls';
import { useOpenPage } from '@/features/dag-runs/lib/useOpenPage';
import {
  cachedMsOf,
  runDurationMs,
} from '@/features/workflow-workspace/dock/runTimelineModel';
import { useQuery } from '@/hooks/api';
import { I18nText } from '@/i18n/I18nText';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDurationMs } from '@/lib/formatDuration';
import { runStatusText } from '@/lib/status-utils';

type Run = components['schemas']['DAGRunDetails'];

/** The runs that the list under a workflow shows. */
export const RECENT_RUNS_SHOWN = 10;
const REFRESH_MS = 15_000;

/**
 * The latest runs of a workflow, under its row in the list. It reads the
 * history of the workflow when it mounts, so a collapsed row costs nothing.
 */
export function DAGRecentRuns({ fileName }: { fileName: string }) {
  const { ts } = useI18n();
  const remoteNode = useRemoteNode();
  const openPage = useOpenPage();
  const { data, error, isLoading } = useQuery(
    '/dags/{fileName}/dag-runs',
    { params: { query: { remoteNode }, path: { fileName } } },
    { refreshInterval: REFRESH_MS, revalidateOnFocus: false }
  );
  const runs = useMemo(
    () => (data?.dagRuns ?? []).slice(0, RECENT_RUNS_SHOWN),
    [data]
  );
  const open = (run: string, event?: React.MouseEvent) =>
    openPage(buildDAGPageURL({ fileName, remoteNode, run }), event);

  return (
    <div
      role="region"
      aria-label={ts('Recent runs of {name}', { name: fileName })}
      data-testid="dag-recent-runs"
      className="border-l-2 border-border/60 py-1 pl-3 text-xs"
    >
      {error ? (
        <p role="alert" className="py-1 text-destructive">
          <I18nText text={'Could not load the recent runs'} />
        </p>
      ) : isLoading ? (
        <p className="py-1 text-muted-foreground">
          <I18nText text={'Loading...'} />
        </p>
      ) : runs.length === 0 ? (
        <p className="py-1 text-muted-foreground">
          <I18nText text={'No runs'} />
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {runs.map((run) => (
            <RunLine key={run.dagRunId} run={run} onOpen={open} />
          ))}
        </ul>
      )}
      <Link
        to={buildDAGPageURL({ fileName, remoteNode })}
        className="inline-block pt-1 text-muted-foreground hover:text-foreground hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        <I18nText text={'Open the workflow'} />
      </Link>
    </div>
  );
}

function RunLine({
  run,
  onOpen,
}: {
  run: Run;
  onOpen(runId: string, event?: React.MouseEvent): void;
}) {
  const { ts } = useI18n();
  // The time counts the cached time that the run took from other runs.
  const own = runDurationMs(run, Date.now());
  const cached = cachedMsOf(run);
  const total = own === null ? null : own + cached;
  return (
    <li>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(run.dagRunId, event);
        }}
        className="flex w-full items-center gap-3 rounded-sm px-1 py-1 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="w-28 shrink-0">
          <StatusChip status={run.status} size="xs">
            {ts(runStatusText(run.status))}
          </StatusChip>
        </span>
        <span className="w-32 shrink-0 text-foreground/80">
          <RelativeTime timestamp={run.startedAt} absolute={run.startedAt} />
        </span>
        <span
          className="w-24 shrink-0 text-muted-foreground"
          title={
            own !== null && cached > 0
              ? ts('Total {total} = own {own} + cached {cached}', {
                  total: formatDurationMs(own + cached),
                  own: formatDurationMs(own),
                  cached: formatDurationMs(cached),
                })
              : undefined
          }
        >
          {total === null ? '-' : formatDurationMs(total)}
        </span>
        <span className="min-w-0 truncate font-mono text-muted-foreground">
          {run.dagRunId}
        </span>
      </button>
    </li>
  );
}
