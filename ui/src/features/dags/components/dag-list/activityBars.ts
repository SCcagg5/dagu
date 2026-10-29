// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { Status, type components } from '@/api/v1/schema';
import {
  barHeights,
  barTone,
  BAR_MAX_PX,
  cachedBarPx,
  durationAxis,
  type BarTone,
} from '@/features/workflow-workspace/dock/runTimelineModel';

export type ActivityRun = components['schemas']['DAGListActivityRun'];

/** The window of the activity that the list asks for, in seconds. */
export const ACTIVITY_WINDOW_SECONDS = 24 * 60 * 60;
/** The width of the strip of bars, in pixels. */
export const ACTIVITY_WIDTH_PX = 112;
/** The height of the strip of bars, in pixels. */
export const ACTIVITY_HEIGHT_PX = 20;
/** The width of one bar. */
export const ACTIVITY_BAR_PX = 3;
/** The height of the shortest bar, so that an instant run stays visible. */
export const ACTIVITY_BAR_MIN_PX = 3;

/** One bar of the strip. */
export interface ActivityBar {
  id: string;
  status: Status;
  tone: BarTone;
  /** The pixel of the left edge of the bar in the strip. */
  left: number;
  height: number;
  /** The height of the cached part at the foot of the bar; 0 for none. */
  cachedPx: number;
  startedAt: string;
  finishedAt?: string;
  /** The own time of the run, in ms. */
  own: number;
  /** The cached time of the run, in ms; 0 for none. */
  cached: number;
}

function time(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The bars of the runs in the window that ends at `now`. A bar stands at the
 * start of its run; a run that started before the window stands at the left
 * edge. The height follows the total time of the run, its own time plus the
 * cached time that it took from other runs, on the scale of the timeline of
 * the workflow page.
 */
export function activityBars(
  runs: readonly ActivityRun[],
  now: number,
  windowSeconds: number = ACTIVITY_WINDOW_SECONDS
): ActivityBar[] {
  const windowMs = windowSeconds * 1000;
  const spanPx = ACTIVITY_WIDTH_PX - ACTIVITY_BAR_PX;
  const parts = runs.flatMap((run) => {
    const start = time(run.startedAt);
    if (start === null) return [];
    const finish = time(run.finishedAt);
    const running = run.status === Status.Running && finish === null;
    const own = Math.max(0, (running ? now : (finish ?? start)) - start);
    const cached = Math.max(0, run.cachedMs ?? 0);
    return [{ run, start, own, cached, total: own + cached }];
  });
  const totals = parts.map((p) => p.total);
  const heights = barHeights(totals, durationAxis(totals));
  return parts.map((p, i) => {
    const height = Math.max(
      ACTIVITY_BAR_MIN_PX,
      Math.round(((heights[i] ?? 0) * ACTIVITY_HEIGHT_PX) / BAR_MAX_PX)
    );
    const left = ((p.start - (now - windowMs)) / windowMs) * spanPx;
    return {
      id: p.run.dagRunId,
      status: p.run.status,
      tone: barTone(p.run.status),
      left: Math.min(spanPx, Math.max(0, Math.round(left))),
      height,
      cachedPx: cachedBarPx(height, {
        own: p.own,
        cached: p.cached,
        total: p.total,
      }),
      startedAt: p.run.startedAt,
      finishedAt: p.run.finishedAt,
      own: p.own,
      cached: p.cached,
    };
  });
}
