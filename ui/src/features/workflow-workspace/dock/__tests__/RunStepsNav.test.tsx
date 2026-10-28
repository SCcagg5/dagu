// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeStatus, Status } from '@/api/v1/schema';
import { node, run } from '../../data/__tests__/fixtures';
import { nodesByStep, NO_WAITING } from '../../data/runFacts';
import type { ApiDAGRunDetails, WorkspaceRunValue } from '../../data/types';
import { RunStepsNav } from '../RunStepsNav';

const h = vi.hoisted(() => ({
  run: null as unknown as WorkspaceRunValue,
  dock: {
    openStep: vi.fn(),
    openRunLog: vi.fn(),
    autoStep: null as { step: string; stream?: 'stderr' } | null,
  },
  revealStep: vi.fn(),
}));

vi.mock('../../data', () => ({ useWorkspaceRun: () => h.run }));
vi.mock('../DockContext', () => ({
  useDock: () => h.dock,
  useDockCommands: () => h.dock,
}));
vi.mock('../../canvas/WorkspaceEditorContext', () => ({
  useWorkspaceEditor: () => ({ handle: { revealStep: h.revealStep } }),
}));

function makeRun(details: ApiDAGRunDetails | null): WorkspaceRunValue {
  return {
    selection: 'latest',
    ref: details ? { name: details.name, runId: details.dagRunId } : null,
    details,
    hasRun: !!details,
    isLatest: true,
    isActive: false,
    notFound: false,
    latestRef: null,
    overlay: {},
    nodeByStep: nodesByStep(details),
    handlers: [],
    waiting: NO_WAITING,
    failedStep: null,
    select: vi.fn(),
    applyNodeStatus: vi.fn(),
    refresh: vi.fn(async () => {}),
  };
}

function renderNav(url = '/dags/demo/executions') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <RunStepsNav dag={{ name: 'demo' } as never} />
    </MemoryRouter>
  );
}

const rows = () =>
  Array.from(document.querySelectorAll('li[data-step]')).map((li) =>
    li.getAttribute('data-step')
  );

beforeEach(() => {
  h.run = makeRun(
    run('r1', [node('a'), node('b', NodeStatus.Failed)], Status.Failed)
  );
  h.dock.openStep.mockReset();
  h.dock.openRunLog.mockReset();
  h.dock.autoStep = null;
  h.revealStep.mockReset();
});

describe('RunStepsNav', () => {
  it('lists the summary row and the steps of the selected run', () => {
    renderNav();
    expect(screen.getByRole('list', { name: 'Run steps' })).toBeInTheDocument();
    expect(rows()).toEqual(['a', 'b']);
    expect(document.querySelector('li[data-summary]')).toHaveAttribute(
      'data-selected',
      'true'
    );
  });

  it('selects the step of ?step', () => {
    renderNav('/dags/demo/executions?step=b');
    expect(document.querySelector('li[data-step="b"]')).toHaveAttribute(
      'data-selected',
      'true'
    );
  });

  it('selects the step that the auto-open chose when ?step is empty', () => {
    h.dock.autoStep = { step: 'b', stream: 'stderr' };
    renderNav();
    expect(document.querySelector('li[data-step="b"]')).toHaveAttribute(
      'data-selected',
      'true'
    );
  });

  it('opens the log of a picked step and selects it on the canvas', () => {
    renderNav();
    fireEvent.click(document.querySelector('li[data-step="a"]')!);
    expect(h.dock.openStep).toHaveBeenCalledWith('a', { keepTab: true });
    expect(h.revealStep).toHaveBeenCalledWith('a');
  });

  it('opens the run log from the summary row', () => {
    renderNav('/dags/demo/executions?step=a');
    fireEvent.click(document.querySelector('li[data-summary]')!);
    expect(h.dock.openRunLog).toHaveBeenCalled();
    expect(h.dock.openStep).not.toHaveBeenCalled();
  });

  it('shows no rows for a workflow that never ran, and a note while the run loads', () => {
    h.run = makeRun(null);
    renderNav();
    expect(screen.queryByRole('list')).toBeNull();

    h.run = { ...makeRun(run('r1')), details: null };
    document.body.innerHTML = '';
    renderNav();
    expect(screen.getByText('Loading run...')).toBeInTheDocument();
  });
});
