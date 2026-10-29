// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { Status } from '@/api/v1/schema';
import {
  ACTIVITY_BAR_MIN_PX,
  ACTIVITY_BAR_PX,
  ACTIVITY_HEIGHT_PX,
  ACTIVITY_WIDTH_PX,
  activityBars,
  type ActivityRun,
} from '../activityBars';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const HOUR = 3_600_000;

function run(
  id: string,
  agoMs: number,
  tookMs: number,
  extra: Partial<ActivityRun> = {}
): ActivityRun {
  const start = NOW - agoMs;
  return {
    dagRunId: id,
    status: Status.Success,
    startedAt: new Date(start).toISOString(),
    finishedAt: new Date(start + tookMs).toISOString(),
    ...extra,
  };
}

describe('activityBars', () => {
  it('places a run by its start in the window', () => {
    const [oldest, middle, newest] = activityBars(
      [run('a', 24 * HOUR, 1000), run('b', 12 * HOUR, 1000), run('c', 0, 1000)],
      NOW
    );
    const last = ACTIVITY_WIDTH_PX - ACTIVITY_BAR_PX;
    expect(oldest?.left).toBe(0);
    expect(middle?.left).toBe(Math.round(last / 2));
    expect(newest?.left).toBe(last);
  });

  it('keeps a run that started before the window at the left edge', () => {
    const [bar] = activityBars(
      [
        run('long', 30 * HOUR, 0, {
          status: Status.Running,
          finishedAt: undefined,
        }),
      ],
      NOW
    );
    expect(bar?.left).toBe(0);
  });

  it('gives the longest run the whole strip and no run less than the minimum', () => {
    const bars = activityBars(
      [run('quick', HOUR, 1), run('slow', 2 * HOUR, 60_000)],
      NOW
    );
    expect(bars[1]?.height).toBe(ACTIVITY_HEIGHT_PX);
    expect(bars[0]?.height).toBe(ACTIVITY_BAR_MIN_PX);
  });

  it('counts the cached time in the height and shows it as a foot', () => {
    const [own, cached] = activityBars(
      [
        run('own', HOUR, 10_000),
        run('cached', 2 * HOUR, 1_000, { cachedMs: 9_000 }),
      ],
      NOW
    );
    expect(own?.cachedPx).toBe(0);
    expect(cached?.cached).toBe(9_000);
    expect(cached?.cachedPx).toBeGreaterThan(0);
    // 1 s own + 9 s cached stands as tall as 10 s of own time.
    expect(cached?.height).toBe(own?.height);
  });

  it('draws a running run up to now', () => {
    const [bar] = activityBars(
      [
        run('live', 5 * 60_000, 0, {
          status: Status.Running,
          finishedAt: undefined,
        }),
      ],
      NOW
    );
    expect(bar?.own).toBe(5 * 60_000);
    expect(bar?.tone).toBe('running');
  });

  it('skips a run without a readable start', () => {
    expect(activityBars([run('bad', 0, 0, { startedAt: '-' })], NOW)).toEqual(
      []
    );
  });
});
