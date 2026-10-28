// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContinueOn, continueOnObject } from '../sections/flow/ContinueOn';
import { runStep } from './fixtures';
import { fieldOp, renderPart } from './flowHarness';

describe('continueOnObject', () => {
  it.each<[unknown, Record<string, unknown>]>([
    ['failed', { failure: true }],
    ['skipped', { skipped: true }],
    [
      { failure: true, exit_code: [1] },
      { failure: true, exit_code: [1] },
    ],
    [undefined, {}],
    [['x'], {}],
  ])('%j gives %j', (value, expected) => {
    expect(continueOnObject(value)).toEqual(expected);
  });
});

describe('ContinueOn', () => {
  it('sets one key of the object form', () => {
    const { onEdit } = renderPart(ContinueOn, {
      ...runStep,
      value: { continue_on: { failure: true } },
    });
    expect(
      screen.getByRole('switch', { name: 'Continue on failure' })
    ).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(
      screen.getByRole('switch', { name: 'Continue when skipped' })
    );
    expect(onEdit).toHaveBeenCalledWith(
      fieldOp(['continue_on', 'skipped'], true)
    );
    fireEvent.click(
      screen.getByRole('switch', { name: 'Continue on failure' })
    );
    expect(onEdit).toHaveBeenLastCalledWith(
      fieldOp(['continue_on', 'failure'], undefined)
    );
  });

  it('creates the key when the step has no continue_on', () => {
    const { onEdit } = renderPart(ContinueOn, runStep);
    fireEvent.click(screen.getByRole('switch', { name: 'Mark as success' }));
    expect(onEdit).toHaveBeenCalledWith(
      fieldOp(['continue_on', 'mark_success'], true)
    );
  });

  it('replaces the shorthand with its object', () => {
    const { onEdit } = renderPart(ContinueOn, {
      ...runStep,
      value: { continue_on: 'failed' },
    });
    fireEvent.click(
      screen.getByRole('switch', { name: 'Continue when skipped' })
    );
    expect(onEdit).toHaveBeenCalledWith(
      fieldOp(['continue_on'], { failure: true, skipped: true })
    );
  });

  it('removes the shorthand when its switch goes off', () => {
    const { onEdit } = renderPart(ContinueOn, {
      ...runStep,
      value: { continue_on: 'skipped' },
    });
    fireEvent.click(
      screen.getByRole('switch', { name: 'Continue when skipped' })
    );
    expect(onEdit).toHaveBeenCalledWith(fieldOp(['continue_on'], undefined));
  });

  it('emits nothing when read-only', () => {
    const { onEdit } = renderPart(ContinueOn, runStep, { readOnly: true });
    fireEvent.click(screen.getByRole('switch', { name: 'Mark as success' }));
    expect(onEdit).not.toHaveBeenCalled();
  });
});
