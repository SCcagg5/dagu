// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatAbsoluteTime } from '@/lib/dagRunTiming';
import type { ScheduleView } from '../../doc';
import { CronLauncherPanel } from '../LauncherPanel';

// UTC+14 without daylight saving: unlikely to be the zone of the test host.
const SCHEDULER_TZ = 'Etc/GMT-14';

vi.mock('@/contexts/ConfigContext', () => ({
  useConfig: () => ({ tz: SCHEDULER_TZ }),
}));

function renderPanel(
  expressions: string[],
  onChange: (expressions: string[]) => void = () => undefined
) {
  const schedule: ScheduleView = { present: true, expressions, others: 0 };
  render(
    <CronLauncherPanel
      schedule={schedule}
      editable
      onChange={onChange}
      onClose={() => undefined}
    />
  );
}

describe('CronLauncherPanel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses an edit to an expression of another row', () => {
    const onChange = vi.fn();
    renderPanel(['0 * * * *', '@daily'], onChange);
    const second = screen.getAllByLabelText('Cron expression')[1]!;
    fireEvent.change(second, { target: { value: '0 * * * *' } });
    fireEvent.blur(second);
    expect(onChange).not.toHaveBeenCalled();
    expect(second).toHaveValue('@daily');
  });

  // The scheduler fires in its own time zone, whatever the zone of the
  // browser.
  it('previews the next runs in the time zone of the scheduler', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T00:00:00Z'));
    renderPanel(['0 9 * * *']);
    const runs = [
      '2026-10-30T19:00:00Z',
      '2026-10-31T19:00:00Z',
      '2026-11-01T19:00:00Z',
    ].map((iso) => formatAbsoluteTime(iso, { seconds: false }));
    expect(screen.getByTestId('ve-launcher-next-runs')).toHaveTextContent(
      `Next runs: ${runs.join(', ')}`
    );
  });
});
