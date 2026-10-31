// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CronLauncherPanel } from '../LauncherPanel';

describe('CronLauncherPanel', () => {
  it('refuses an edit to an expression of another row', () => {
    const onChange = vi.fn();
    render(
      <CronLauncherPanel
        schedule={{
          present: true,
          expressions: ['0 * * * *', '@daily'],
          others: 0,
        }}
        editable
        onChange={onChange}
        onClose={() => undefined}
      />
    );
    const second = screen.getAllByLabelText('Cron expression')[1]!;
    fireEvent.change(second, { target: { value: '0 * * * *' } });
    fireEvent.blur(second);
    expect(onChange).not.toHaveBeenCalled();
    expect(second).toHaveValue('@daily');
  });
});
