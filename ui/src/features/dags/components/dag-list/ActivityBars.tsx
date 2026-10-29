// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { memo, useMemo } from 'react';
import type { components } from '@/api/v1/schema';
import { CACHED_WASH } from '@/features/workflow-workspace/dock/runTimelineModel';
import { useClock } from '@/hooks/useClock';
import { useI18n } from '@/i18n/I18nProvider';
import { formatAbsoluteTime } from '@/lib/dagRunTiming';
import { formatDurationMs } from '@/lib/formatDuration';
import { runStatusText } from '@/lib/status-utils';
import { toneClasses } from '@/lib/statusPalette';
import { cn } from '@/lib/utils';
import {
  ACTIVITY_BAR_PX,
  ACTIVITY_HEIGHT_PX,
  ACTIVITY_WIDTH_PX,
  activityBars,
  type ActivityBar,
} from './activityBars';

type Activity = components['schemas']['DAGListActivity'];

// The bars stand again at each minute: a pixel of the strip is 13 minutes.
const REFRESH_MS = 60_000;

interface ActivityBarsProps {
  activity?: Activity;
  /** Called when the user clicks the bar of a run. */
  onOpenRun?(runId: string, event: React.MouseEvent): void;
  className?: string;
}

/**
 * The runs of a workflow in the last 24 hours as one thin vertical bar for
 * each run, at the time that it started. The height of a bar is the total
 * time of its run, with the cached time as a pale foot, as in the timeline of
 * the workflow page. The strip is cheap on purpose: a list shows hundreds of
 * them, so a bar is a plain element with a native tooltip.
 */
function ActivityBars({ activity, onOpenRun, className }: ActivityBarsProps) {
  const { ts } = useI18n();
  const minute = useClock(activity?.runs.length ? REFRESH_MS : null, (now) =>
    Math.floor(now / REFRESH_MS)
  );
  const runs = activity?.runs;
  const bars = useMemo(
    () => (runs ? activityBars(runs, minute * REFRESH_MS) : []),
    [runs, minute]
  );
  if (!activity) {
    return <div style={{ width: ACTIVITY_WIDTH_PX }} className={className} />;
  }
  const count = activity.runs.length;
  // A list that the server cut stops at its oldest run: the time before it is
  // not known, and the strip says so instead of showing it as empty.
  const unseenPx =
    activity.truncated && bars.length > 0
      ? Math.min(...bars.map((bar) => bar.left))
      : 0;
  const summary = activity.truncated
    ? ts('{count}+ runs in the last 24 hours', { count })
    : count === 0
      ? ts('No runs in the last 24 hours')
      : count === 1
        ? ts('1 run in the last 24 hours')
        : ts('{count} runs in the last 24 hours', { count });
  return (
    <div
      role="img"
      aria-label={summary}
      title={summary}
      data-testid="dag-activity"
      data-runs={count}
      style={{ width: ACTIVITY_WIDTH_PX, height: ACTIVITY_HEIGHT_PX }}
      className={cn('relative shrink-0', className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 bottom-0 border-b',
          count === 0 ? 'border-dashed border-border' : 'border-border/60'
        )}
      />
      {unseenPx > 0 && (
        <span
          aria-hidden="true"
          data-testid="dag-activity-unseen"
          title={ts('Only the last {n} runs are loaded', { n: count })}
          style={{ width: unseenPx }}
          className="absolute inset-y-0 left-0 rounded-sm bg-muted/70"
        />
      )}
      {bars.map((bar) => (
        <Bar
          key={bar.id}
          bar={bar}
          title={barTitle(bar, ts)}
          onOpenRun={onOpenRun}
        />
      ))}
    </div>
  );
}

function barTitle(bar: ActivityBar, ts: ReturnType<typeof useI18n>['ts']) {
  const parts = [
    formatAbsoluteTime(bar.startedAt),
    ts(runStatusText(bar.status)),
    bar.cached > 0
      ? ts('Total {total} = own {own} + cached {cached}', {
          total: formatDurationMs(bar.own + bar.cached),
          own: formatDurationMs(bar.own),
          cached: formatDurationMs(bar.cached),
        })
      : formatDurationMs(bar.own),
  ];
  return parts.filter(Boolean).join(' · ');
}

function Bar({
  bar,
  title,
  onOpenRun,
}: {
  bar: ActivityBar;
  title: string;
  onOpenRun?(runId: string, event: React.MouseEvent): void;
}) {
  return (
    <span
      title={title}
      data-run-id={bar.id}
      data-tone={bar.tone}
      onClick={
        onOpenRun
          ? (event) => {
              event.stopPropagation();
              onOpenRun(bar.id, event);
            }
          : undefined
      }
      style={{
        left: bar.left,
        width: ACTIVITY_BAR_PX,
        height: bar.height,
        backgroundImage:
          bar.tone === 'partial'
            ? 'linear-gradient(to top, var(--status-success) 50%, var(--status-warning) 50%)'
            : undefined,
      }}
      className={cn(
        'absolute bottom-0 block rounded-t-[1px] opacity-80 hover:opacity-100',
        bar.tone !== 'partial' && toneClasses(bar.tone).dot,
        onOpenRun && 'cursor-pointer'
      )}
    >
      {bar.cachedPx > 0 && (
        <span
          aria-hidden="true"
          style={{
            height: bar.cachedPx,
            backgroundColor: CACHED_WASH,
          }}
          className="absolute inset-x-0 bottom-0 block"
        />
      )}
    </span>
  );
}

export default memo(ActivityBars);
