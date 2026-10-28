// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppBarContext } from '@/contexts/AppBarContext';
import { LayoutChromeProvider } from '@/contexts/LayoutChromeContext';
import { WorkflowWorkspace } from '@/features/workflow-workspace';
import { LogPopoutPage } from '@/features/workflow-workspace/popout/LogPopoutPage';
import { useQuery } from '@/hooks/api';
import { WorkspaceKind } from '@/lib/workspace';
import DAGDetails from '..';

vi.mock('@/features/workflow-workspace', async () => {
  const { useRemoteNode } = await import('@/contexts/RemoteNodeContext');
  function Workspace() {
    return <div data-testid="workflow-workspace">{useRemoteNode()}</div>;
  }
  return { WorkflowWorkspace: vi.fn(() => <Workspace />) };
});

vi.mock('@/features/workflow-workspace/popout/LogPopoutPage', async () => {
  const { useRemoteNode } = await import('@/contexts/RemoteNodeContext');
  function Popout() {
    return <div data-testid="log-popout">{useRemoteNode()}</div>;
  }
  return { LogPopoutPage: vi.fn(() => <Popout />) };
});

vi.mock('@/hooks/api', () => ({
  useQuery: vi.fn(),
}));

vi.mock('@/hooks/useDAGSSE', () => ({
  useDAGSSE: vi.fn(() => ({})),
}));

vi.mock('@/hooks/useDAGRunSSE', () => ({
  useDAGRunSSE: vi.fn(() => ({})),
}));

vi.mock('@/hooks/useSubDAGRunSSE', () => ({
  useSubDAGRunSSE: vi.fn(() => ({})),
}));

vi.mock('@/hooks/useSSECacheSync', () => ({
  sseFallbackOptions: vi.fn(() => ({})),
  useSSECacheSync: vi.fn(),
}));

const useQueryMock = useQuery as unknown as {
  mockImplementation: (fn: (path: string) => unknown) => void;
};

const appBarValue = {
  selectedRemoteNode: 'local',
  setTitle: vi.fn(),
  workspaceSelection: { kind: WorkspaceKind.all },
} as never;

const dagData = {
  dag: {
    name: 'release-notes',
    artifacts: { enabled: true },
  },
  latestDAGRun: {
    name: 'release-notes',
    dagRunId: 'run-1',
    artifactsAvailable: true,
  },
  localDags: [],
};

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">{location.pathname + location.search}</span>
  );
}

const claimFullBleed = vi.fn(() => () => undefined);
const claimHideBreadcrumb = vi.fn(() => () => undefined);

function renderPage(initialEntry = '/dags/release-notes') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LayoutChromeProvider value={{ claimFullBleed, claimHideBreadcrumb }}>
        <AppBarContext.Provider value={appBarValue}>
          <LocationProbe />
          <Routes>
            <Route path="/dags/:fileName" element={<DAGDetails />} />
            <Route path="/dags/:fileName/:tab" element={<DAGDetails />} />
            <Route path="*" element={null} />
          </Routes>
        </AppBarContext.Provider>
      </LayoutChromeProvider>
    </MemoryRouter>
  );
}

// parity:test-dag-page-index
// parity:shell-route-dag-page
describe('DAGDetails page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useQueryMock.mockImplementation((path) => {
      if (path === '/dags/{fileName}') {
        return {
          data: dagData,
          mutate: vi.fn(),
        } as never;
      }

      return {
        data: undefined,
        mutate: vi.fn(),
      } as never;
    });
  });

  // The workspace is the only body of the page, with the states, scope and
  // providers around it. Redirects run before it mounts.
  // parity:page-workspace-mismatch
  // parity:shell-workspace-scope
  // parity:shell-not-found
  // parity:shell-load-error
  // parity:shell-page-loading
  // parity:shell-remote-node
  // parity:shell-page-title
  describe('workspace', () => {
    const workspaceMock = vi.mocked(WorkflowWorkspace);

    function lastWorkspaceProps() {
      return workspaceMock.mock.lastCall?.[0];
    }

    it('renders the workspace with full bleed', () => {
      const mutateDag = vi.fn();
      useQueryMock.mockImplementation(
        (path) =>
          ({
            data: path === '/dags/{fileName}' ? dagData : undefined,
            mutate: path === '/dags/{fileName}' ? mutateDag : vi.fn(),
          }) as never
      );

      renderPage('/dags/release-notes');

      expect(screen.getByTestId('workflow-workspace')).toBeVisible();
      const props = lastWorkspaceProps();
      expect(props).toMatchObject({
        fileName: 'release-notes',
        tab: undefined,
        dagData,
        workspaceName: null,
        legacyHistoryIdx: null,
      });
      expect(props?.refreshDag).toBe(mutateDag);
      expect(claimFullBleed).toHaveBeenCalledTimes(1);
      // The workspace bar is the first row: no breadcrumb strip above it.
      expect(claimHideBreadcrumb).toHaveBeenCalledTimes(1);
      expect(
        (appBarValue as unknown as { setTitle: () => void }).setTitle
      ).toHaveBeenCalledWith('release-notes');
      expect(screen.getByTestId('location')).toHaveTextContent(
        /^\/dags\/release-notes$/
      );
    });

    // Old links and a stored choice of the classic page still load the
    // workspace, and the URL stays as it is.
    it.each(['classic', 'workspace', 'modern'])(
      'ignores ?ui=%s and a stored page choice',
      (ui) => {
        localStorage.setItem(
          'user_preferences',
          JSON.stringify({ workflowPage: 'classic' })
        );

        renderPage(`/dags/release-notes?ui=${ui}`);

        expect(screen.getByTestId('workflow-workspace')).toBeVisible();
        expect(screen.getByTestId('location')).toHaveTextContent(
          `/dags/release-notes?ui=${ui}`
        );
      }
    );

    it('gives the workspace its name from the labels', () => {
      useQueryMock.mockImplementation(
        (path) =>
          ({
            data:
              path === '/dags/{fileName}'
                ? {
                    ...dagData,
                    dag: { ...dagData.dag, labels: ['workspace=w'] },
                  }
                : undefined,
            mutate: vi.fn(),
          }) as never
      );

      renderPage('/dags/release-notes?workspace=w');

      expect(lastWorkspaceProps()?.workspaceName).toBe('w');
    });

    it('explains when the workflow does not exist', () => {
      useQueryMock.mockImplementation(
        () =>
          ({
            data: undefined,
            error: { code: 'not_found', message: 'DAG is not found' },
            mutate: vi.fn(),
          }) as never
      );

      renderPage('/dags/missing-flow');

      expect(
        screen.getByRole('heading', { name: 'Workflow not found' })
      ).toBeVisible();
      expect(screen.getByText('missing-flow')).toBeVisible();
      expect(
        screen.getByRole('link', { name: 'Back to Workflows' })
      ).toHaveAttribute('href', '/dags');
      expect(workspaceMock).not.toHaveBeenCalled();
      expect(claimFullBleed).not.toHaveBeenCalled();
      expect(claimHideBreadcrumb).not.toHaveBeenCalled();
    });

    it('reports a failed load with the server message and a retry', () => {
      const mutate = vi.fn();
      useQueryMock.mockImplementation(
        () =>
          ({
            data: undefined,
            error: { code: 'internal_error', message: 'disk is full' },
            mutate,
          }) as never
      );

      renderPage('/dags/release-notes');

      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't load this workflow"
      );
      expect(screen.getByText('disk is full')).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(mutate).toHaveBeenCalled();
      expect(workspaceMock).not.toHaveBeenCalled();
    });

    it('shows a loading state while the workflow loads', () => {
      useQueryMock.mockImplementation(
        () => ({ data: undefined, mutate: vi.fn() }) as never
      );

      renderPage('/dags/release-notes');

      expect(screen.getByRole('status', { name: 'Loading...' })).toBeVisible();
      expect(workspaceMock).not.toHaveBeenCalled();
    });

    it('explains a workflow outside the selected workspace', () => {
      renderPage('/dags/release-notes?workspace=other&remoteNode=edge');

      expect(
        screen.getByText('This workflow is not in the selected workspace.')
      ).toBeVisible();
      // Both ways out keep the remote node; only one of them leaves the scope.
      const back = screen.getByRole('link', { name: 'Back to Workflows' });
      expect(back.getAttribute('href')).toContain('/dags?');
      expect(back.getAttribute('href')).toContain('remoteNode=edge');
      const all = screen.getByRole('link', { name: 'Show in all workspaces' });
      expect(all.getAttribute('href')).toContain('/dags/release-notes?');
      expect(all.getAttribute('href')).toContain('remoteNode=edge');
      expect(all.getAttribute('href')).not.toContain('workspace=');
      expect(workspaceMock).not.toHaveBeenCalled();
      expect(claimFullBleed).not.toHaveBeenCalled();
      expect(claimHideBreadcrumb).not.toHaveBeenCalled();
    });

    it('scopes the workspace to the remote node of the URL', () => {
      renderPage('/dags/release-notes?remoteNode=edge');

      expect(screen.getByTestId('workflow-workspace')).toHaveTextContent(
        'edge'
      );
      expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
        '/dags/{fileName}',
        {
          params: {
            query: { remoteNode: 'edge' },
            path: { fileName: 'release-notes' },
          },
        },
        expect.anything()
      );
    });

    // parity:actions-retry
    it('hands a history index to the workspace and keeps the URL', () => {
      renderPage('/dags/release-notes/history?idx=1');

      expect(lastWorkspaceProps()).toMatchObject({
        tab: 'executions',
        legacyHistoryIdx: 1,
      });
      expect(screen.getByTestId('location')).toHaveTextContent(
        /^\/dags\/release-notes\/history\?idx=1$/
      );
    });

    it('opens the run of a history link on the workflow page', async () => {
      renderPage('/dags/release-notes/history?dagRunId=run-7');

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent(
          /^\/dags\/release-notes\?run=run-7$/
        );
      });
      expect(lastWorkspaceProps()?.tab).toBeUndefined();
      expect(
        workspaceMock.mock.calls.every(([props]) => props.tab !== 'history')
      ).toBe(true);
    });

    // The Executions route is the workflow page: it redirects with every key.
    it('redirects an executions link to the workflow page', async () => {
      renderPage('/dags/release-notes/executions?run=run-7&step=merge');

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent(
          /^\/dags\/release-notes\?run=run-7&step=merge$/
        );
      });
      expect(lastWorkspaceProps()?.tab).toBeUndefined();
    });

    it('hands an executions index to the workspace and keeps the URL', () => {
      renderPage('/dags/release-notes/executions?idx=1');

      expect(lastWorkspaceProps()).toMatchObject({
        tab: 'executions',
        legacyHistoryIdx: 1,
      });
    });
  });

  // A run is selected with ?run on the workflow page; older links that name
  // a run with ?dagRunId land there instead.
  // parity:test-e2e-run-page-links
  // parity:run-page-route
  // parity:shell-run-redirect
  // parity:overview-legacy-run-redirect
  it('sends a run named on the workflow page to the run of its root', async () => {
    renderPage(
      '/dags/release-notes?dagRunId=run-7&subDAGRunId=child-2&dagRunName=release-notes&step=deploy'
    );

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/dags/release-notes?remoteNode=local&run=run-7&step=deploy'
      );
    });
    // The redirect target is this page: the body mounts once it is there.
    await waitFor(() => {
      expect(vi.mocked(WorkflowWorkspace)).toHaveBeenCalled();
    });
  });

  // parity:shell-docs-redirect
  // parity:page-legacy-docs-redirect
  it('redirects the legacy docs tab without a body first', async () => {
    renderPage('/dags/release-notes/docs?remoteNode=edge');

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        /^\/dags\/release-notes\?remoteNode=edge&panel=workflow&wtab=wiki$/
      );
    });
    expect(
      vi
        .mocked(WorkflowWorkspace)
        .mock.calls.every(([props]) => props.tab !== 'docs')
    ).toBe(true);
  });

  // The log tabs are full-page logs, not the workspace.
  describe('workspace pop-out logs', () => {
    const popoutMock = vi.mocked(LogPopoutPage);
    const pinnedRun = { name: 'release-notes', dagRunId: 'run-7' };
    const subRun = { name: 'child', dagRunId: 'sub-3', rootDAGRunId: 'run-7' };

    function lastPopoutProps() {
      return popoutMock.mock.lastCall?.[0];
    }

    function mockRuns() {
      useQueryMock.mockImplementation(
        (path) =>
          ({
            data:
              path === '/dags/{fileName}'
                ? {
                    ...dagData,
                    dag: { ...dagData.dag, labels: ['workspace=w'] },
                  }
                : path === '/dag-runs/{name}/{dagRunId}'
                  ? { dagRunDetails: pinnedRun }
                  : path ===
                      '/dag-runs/{name}/{dagRunId}/sub-dag-runs/{subDAGRunId}'
                    ? { dagRunDetails: subRun }
                    : undefined,
            mutate: vi.fn(),
          }) as never
      );
    }

    beforeEach(() => {
      localStorage.clear();
      mockRuns();
    });

    it.each(['log', 'dagRun-log'])(
      'renders the pop-out on /%s and keeps the URL',
      (tab) => {
        const url = `/dags/release-notes/${tab}?dagRunId=run-7&step=build&remoteNode=edge&workspace=w`;
        renderPage(url);

        expect(screen.getByTestId('log-popout')).toHaveTextContent('edge');
        expect(vi.mocked(WorkflowWorkspace)).not.toHaveBeenCalled();
        expect(lastPopoutProps()).toMatchObject({
          fileName: 'release-notes',
          tab,
          dagRun: pinnedRun,
          runLoading: false,
        });
        expect(screen.getByTestId('location')).toHaveTextContent(url);
        expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
          '/dag-runs/{name}/{dagRunId}',
          {
            params: {
              path: { name: 'release-notes', dagRunId: 'run-7' },
              query: { remoteNode: 'edge' },
            },
          },
          expect.anything()
        );
      }
    );

    it('passes the sub-run of the URL', () => {
      renderPage(
        '/dags/release-notes/log?dagRunId=run-7&dagRunName=root-flow&subDAGRunId=sub-3&step=compile'
      );

      expect(lastPopoutProps()?.dagRun).toEqual(subRun);
      expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
        '/dag-runs/{name}/{dagRunId}/sub-dag-runs/{subDAGRunId}',
        {
          params: {
            path: {
              name: 'root-flow',
              dagRunId: 'run-7',
              subDAGRunId: 'sub-3',
            },
            query: { remoteNode: 'local' },
          },
        },
        expect.anything()
      );
    });

    it('passes the latest run without a dagRunId', () => {
      renderPage('/dags/release-notes/log?step=build');

      expect(lastPopoutProps()).toMatchObject({
        dagRun: dagData.latestDAGRun,
        runLoading: false,
      });
    });

    it('waits for the named run while it loads', () => {
      useQueryMock.mockImplementation(
        (path) =>
          ({
            data: path === '/dags/{fileName}' ? dagData : undefined,
            mutate: vi.fn(),
          }) as never
      );

      renderPage('/dags/release-notes/log?dagRunId=run-7&step=b');

      expect(lastPopoutProps()).toMatchObject({
        dagRun: undefined,
        runLoading: true,
      });
    });

    it('falls back to the latest run when the named run fails to load', () => {
      useQueryMock.mockImplementation(
        (path) =>
          ({
            data: path === '/dags/{fileName}' ? dagData : undefined,
            error:
              path === '/dag-runs/{name}/{dagRunId}'
                ? { code: 'not_found', message: 'gone' }
                : undefined,
            mutate: vi.fn(),
          }) as never
      );

      renderPage('/dags/release-notes/log?dagRunId=gone&step=b');

      expect(lastPopoutProps()).toMatchObject({
        dagRun: undefined,
        runLoading: false,
      });
    });

    it('does not read a run for the workspace body', () => {
      renderPage('/dags/release-notes?step=build');

      expect(screen.getByTestId('workflow-workspace')).toBeVisible();
      const { calls } = (
        useQuery as unknown as { mock: { calls: [string, unknown][] } }
      ).mock;
      const runReads = calls.filter(
        ([path]) => path === '/dag-runs/{name}/{dagRunId}'
      );
      expect(runReads.length).toBeGreaterThan(0);
      expect(runReads.every(([, init]) => init === null)).toBe(true);
    });
  });
});
