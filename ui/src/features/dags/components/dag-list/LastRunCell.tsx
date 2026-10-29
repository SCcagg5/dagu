// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import type { components } from '@/api/v1/schema';
import RelativeTime from '@/components/ui/relative-time';
import { StatusDot } from '@/components/ui/status-dot';
import { useListRunDisplay } from '@/features/dag-runs/hooks/useListRunDisplay';
import { I18nText } from '@/i18n/I18nText';
import { readableToneText } from '@/lib/statusPalette';
import { cn } from '@/lib/utils';

type DAGFile = components['schemas']['DAGFile'];

/**
 * The last run of a workflow in the list: the dot of its status and the time
 * since it started, in the compact form of the workflow header ("3d ago").
 * A heartbeat, a run that is meant to run for ever and has no failed step,
 * has no time to tell: it reads "Healthy" with its calm dot.
 */
export function LastRunCell({ dag }: { dag: DAGFile }) {
  const run = dag.latestDAGRun;
  const display = useListRunDisplay(dag.dag.name, run?.dagRunId, run?.status);
  if (!run?.startedAt || run.startedAt === '-') {
    return <span className="font-normal text-muted-foreground">-</span>;
  }
  const healthy = display?.healthy ?? false;
  return (
    <span
      data-testid="dag-last-run"
      data-healthy={healthy ? 'true' : undefined}
      className="flex min-w-0 items-center gap-1.5 text-xs"
    >
      <StatusDot kind="run" status={run.status} healthy={healthy} />
      {healthy ? (
        <span
          title={run.startedAt}
          className={cn('truncate', readableToneText('success'))}
        >
          <I18nText text={'Healthy'} />
        </span>
      ) : (
        <span className="truncate text-foreground/70">
          <RelativeTime
            timestamp={run.startedAt}
            absolute={run.startedAt}
            compact
            ago
          />
        </span>
      )}
    </span>
  );
}

/** True when the latest run of a workflow is a heartbeat that runs well. */
export function useIsHeartbeat(dag: DAGFile): boolean {
  const run = dag.latestDAGRun;
  return (
    useListRunDisplay(dag.dag.name, run?.dagRunId, run?.status)?.healthy ??
    false
  );
}
