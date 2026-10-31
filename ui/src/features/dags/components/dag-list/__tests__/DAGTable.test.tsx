// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NodeStatus,
  Status,
  ViewSortField,
  ViewSortOrder,
} from '@/api/v1/schema';
import { PanelWidthContext } from '@/components/SplitLayout';
import { AppBarContext } from '@/contexts/AppBarContext';
import { ConfigContext } from '@/contexts/ConfigContext';
import { UserPreferencesProvider } from '@/contexts/UserPreference';
import { I18nProvider } from '@/i18n/I18nProvider';
import { WorkspaceKind } from '@/lib/workspace';
import DAGTable from '../DAGTable';

const recentRuns = vi.hoisted(() => ({
  dagRuns: [] as unknown[],
}));

vi.mock('@/hooks/api', () => ({
  useClient: () => ({ POST: vi.fn() }),
  useQuery: (path: string) =>
    path === '/dags/{fileName}/dag-runs'
      ? { data: { dagRuns: recentRuns.dagRuns }, isLoading: false }
      : {
          data: {
            labels: ['team=ops'],
          },
        },
}));

vi.mock('@/features/dags/components/common/DAGActions', () => ({
  default: () => null,
}));

vi.mock('@/features/dags/components/common/LiveSwitch', () => ({
  default: () => null,
}));

vi.mock('@/features/dags/components/common', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  DAGPagination: () => null,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useCanWrite: () => true,
  useCanManageWebhooks: () => false,
}));

// Reads the locale from stored preferences, as the app does.
function I18nWrapper({ children }: { children: React.ReactNode }) {
  return (
    <UserPreferencesProvider>
      <I18nProvider>{children}</I18nProvider>
    </UserPreferencesProvider>
  );
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">{`${location.pathname}${location.search}`}</div>
  );
}

function renderTable(
  searchText = '',
  options: {
    dags?: React.ComponentProps<typeof DAGTable>['dags'];
    workflowViews?: React.ComponentProps<typeof DAGTable>['workflowViews'];
    activeWorkflowViewId?: string | null;
    activeOnly?: boolean;
    isAllWorkflowsView?: boolean;
    panelWidth?: number | null;
    canDeleteDAGs?: boolean;
    canRenameDAGs?: boolean;
    onDeleteDAGs?: React.ComponentProps<typeof DAGTable>['onDeleteDAGs'];
    onRenameDAG?: (fileName: string, newFileName: string) => Promise<void>;
    canPinDAG?: React.ComponentProps<typeof DAGTable>['canPinDAG'];
  } = {}
) {
  const onShowAllWorkflows = vi.fn();
  const handleActiveOnlyChange = vi.fn();
  const onDeleteDAGs =
    options.onDeleteDAGs ??
    vi
      .fn()
      .mockImplementation(async (fileNames: string[]) =>
        fileNames.map((fileName) => ({ fileName }))
      );
  const onRenameDAG =
    options.onRenameDAG ?? vi.fn().mockResolvedValue(undefined);
  const onSetDAGPinned = vi.fn().mockResolvedValue(undefined);
  const onSetDAGsPinned = vi.fn().mockResolvedValue(undefined);
  const result = render(
    <MemoryRouter initialEntries={['/dags']}>
      <LocationProbe />
      <ConfigContext.Provider value={{ basePath: '' } as never}>
        <AppBarContext.Provider
          value={
            {
              selectedRemoteNode: 'local',
              workspaceSelection: { kind: WorkspaceKind.all },
            } as never
          }
        >
          <PanelWidthContext.Provider value={options.panelWidth ?? null}>
            <DAGTable
              dags={
                options.dags ?? [
                  {
                    fileName: 'example.yaml',
                    dag: {
                      name: searchText || 'example',
                    },
                    latestDAGRun: {
                      status: Status.Success,
                      statusLabel: 'Success',
                    },
                    suspended: false,
                    errors: [],
                  } as never,
                ]
              }
              group=""
              refreshFn={vi.fn()}
              searchText={searchText}
              handleSearchTextChange={vi.fn()}
              searchLabels={[]}
              handleSearchLabelsChange={vi.fn()}
              activeOnly={options.activeOnly ?? false}
              handleActiveOnlyChange={handleActiveOnlyChange}
              sortField="name"
              sortOrder="asc"
              onSortChange={vi.fn()}
              workflowViews={options.workflowViews ?? []}
              activeWorkflowViewId={options.activeWorkflowViewId ?? null}
              isAllWorkflowsView={options.isAllWorkflowsView ?? true}
              isWorkflowViewEdited={false}
              areWorkflowFiltersSaved={false}
              canManageWorkflowViews={true}
              canDeleteDAGs={options.canDeleteDAGs ?? true}
              canRenameDAGs={options.canRenameDAGs ?? true}
              onSelectWorkflowView={vi.fn()}
              onShowAllWorkflows={onShowAllWorkflows}
              onResetWorkflowView={vi.fn()}
              onSaveWorkflowView={vi.fn()}
              onUpdateWorkflowView={vi.fn()}
              onSetDefaultWorkflowView={vi.fn()}
              onSetPinnedWorkflowView={vi.fn()}
              onDeleteWorkflowView={vi.fn()}
              onRenameWorkflowView={vi.fn()}
              onDeleteDAGs={onDeleteDAGs}
              onRenameDAG={onRenameDAG}
              canPinDAG={options.canPinDAG ?? (() => true)}
              onSetDAGPinned={onSetDAGPinned}
              onSetDAGsPinned={onSetDAGsPinned}
            />
          </PanelWidthContext.Provider>
        </AppBarContext.Provider>
      </ConfigContext.Provider>
    </MemoryRouter>,
    { wrapper: I18nWrapper }
  );
  return {
    ...result,
    handleActiveOnlyChange,
    onDeleteDAGs,
    onRenameDAG,
    onSetDAGPinned,
    onSetDAGsPinned,
    onShowAllWorkflows,
  };
}

function workflow({
  name,
  group,
  pinned = false,
  status = Status.Success,
}: {
  name: string;
  group?: string;
  pinned?: boolean;
  status?: Status;
}): React.ComponentProps<typeof DAGTable>['dags'][number] {
  return {
    fileName: `${name}.yaml`,
    dag: { name, group },
    latestDAGRun: { status, statusLabel: Status[status] },
    suspended: false,
    pinned,
    errors: [],
  } as never;
}

// Text of each body row, so tests can check the order rows appear in.
function bodyRowTexts(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent ?? '');
}

describe('DAGTable', () => {
  beforeEach(() => {
    vi.stubGlobal('getConfig', () => ({
      tz: 'UTC',
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('links workflow names to their canonical detail pages', () => {
    renderTable();

    for (const link of screen.getAllByRole('link', { name: 'example' })) {
      expect(link).toHaveAttribute(
        'href',
        '/dags/example.yaml?remoteNode=local'
      );
    }
  });

  it('uses the same control surface sizing as the executions page', () => {
    renderTable();

    const searchInput = screen.getByPlaceholderText(
      'Filter by workflow name...'
    );
    expect(searchInput.className).toContain('h-9');
    expect(searchInput.className).toContain('w-[180px]');

    const controlSurface = searchInput.closest(
      '[data-testid="workflow-controls"]'
    );
    expect(controlSurface?.className).toContain('mb-4');

    const labelInput = screen.getByRole('combobox', {
      name: 'Filter by labels...',
    });
    // The label filter has the same height as the other controls of the row:
    // its box grows from h-9 when chips wrap, inside the width bounds.
    const labelBox = labelInput.parentElement;
    expect(labelBox?.className).toContain('min-h-9');
    expect(labelBox?.className).toContain('bg-card');
    const labelWrapper = labelBox?.parentElement;
    expect(labelWrapper?.className).toContain('h-9');
    expect(labelWrapper?.className).toContain('min-w-[150px]');
    expect(labelWrapper?.className).toContain('max-w-[180px]');

    const activeOnly = screen
      .getByRole('switch', { name: 'Active only' })
      .closest('label');
    expect(activeOnly?.className).toContain('h-9');
    const group = screen
      .getByRole('switch', { name: 'Gather the workflows by group' })
      .closest('label');
    expect(group?.className).toContain('h-9');
  });

  it('links grep to the global DAG search with the current workflow keyword', () => {
    renderTable('daily backup');

    expect(screen.getByRole('link', { name: 'Grep' })).toHaveAttribute(
      'href',
      '/search?q=daily+backup&scope=dags'
    );
  });

  it('toggles the active workflow filter', () => {
    const { handleActiveOnlyChange, unmount } = renderTable();

    const activeOnlySwitch = screen.getByRole('switch', {
      name: 'Active only',
    });
    expect(activeOnlySwitch).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(activeOnlySwitch);
    expect(handleActiveOnlyChange).toHaveBeenCalledWith(true);

    unmount();
    renderTable('', { activeOnly: true });
    expect(screen.getByRole('switch', { name: 'Active only' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('hides workflow mutation controls without write permission', () => {
    renderTable('', { canDeleteDAGs: false, canRenameDAGs: false });

    const table = screen.getByRole('table');
    expect(
      within(table).queryByRole('checkbox', {
        name: 'Select all loaded workflows',
      })
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: 'Rename workflow example' })
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: 'Delete workflow example' })
    ).not.toBeInTheDocument();
  });

  it('selects only workflows visible through the client-side filter', async () => {
    renderTable('alpha', {
      dags: [
        {
          fileName: 'alpha.yaml',
          dag: { name: 'alpha' },
          latestDAGRun: {
            status: Status.Success,
            statusLabel: 'Success',
          },
          suspended: false,
          errors: [],
        } as never,
        {
          fileName: 'beta.yaml',
          dag: { name: 'beta' },
          latestDAGRun: {
            status: Status.Success,
            statusLabel: 'Success',
          },
          suspended: false,
          errors: [],
        } as never,
      ],
    });

    const table = screen.getByRole('table');
    await waitFor(() => {
      expect(within(table).queryByText('beta')).not.toBeInTheDocument();
    });
    fireEvent.click(
      within(table).getByRole('checkbox', {
        name: 'Select all loaded workflows',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete (1)' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('alpha.yaml');
    expect(dialog).not.toHaveTextContent('beta.yaml');
  });

  it('selects loaded workflows and deletes them after confirmation', async () => {
    const { onDeleteDAGs } = renderTable('', {
      dags: [
        {
          fileName: 'alpha.yaml',
          dag: { name: 'alpha' },
          latestDAGRun: {
            status: Status.Success,
            statusLabel: 'Success',
          },
          suspended: false,
          errors: [],
        } as never,
        {
          fileName: 'beta.yaml',
          dag: { name: 'beta' },
          latestDAGRun: {
            status: Status.Success,
            statusLabel: 'Success',
          },
          suspended: false,
          errors: [],
        } as never,
      ],
    });

    expect(
      screen.queryByRole('button', { name: /^Delete \(/ })
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('table')).getByRole('checkbox', {
        name: 'Select all loaded workflows',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete (2)' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Delete 2 workflows?');
    expect(dialog).toHaveTextContent('alpha.yaml');
    expect(dialog).toHaveTextContent('beta.yaml');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(onDeleteDAGs).toHaveBeenCalledWith(['alpha.yaml', 'beta.yaml']);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /^Delete \(/ })
    ).not.toBeInTheDocument();
  });

  it('keeps failed workflows selected with their individual errors', async () => {
    const onDeleteDAGs = vi
      .fn()
      .mockResolvedValue([
        { fileName: 'alpha.yaml' },
        { fileName: 'beta.yaml', error: 'permission denied' },
      ]);
    renderTable('', {
      dags: [
        {
          fileName: 'alpha.yaml',
          dag: { name: 'alpha' },
          latestDAGRun: {
            status: Status.Success,
            statusLabel: 'Success',
          },
          suspended: false,
          errors: [],
        } as never,
        {
          fileName: 'beta.yaml',
          dag: { name: 'beta' },
          latestDAGRun: {
            status: Status.Success,
            statusLabel: 'Success',
          },
          suspended: false,
          errors: [],
        } as never,
      ],
      onDeleteDAGs,
    });

    fireEvent.click(
      within(screen.getByRole('table')).getByRole('checkbox', {
        name: 'Select all loaded workflows',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete (2)' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' })
    );

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).not.toHaveTextContent('alpha.yaml');
      expect(dialog).toHaveTextContent('beta.yaml');
      expect(dialog).toHaveTextContent('permission denied');
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })
    );
    expect(screen.getByRole('button', { name: 'Delete (1)' })).toBeEnabled();
  });

  it('renames a workflow from the actions column', async () => {
    const { onRenameDAG } = renderTable();

    fireEvent.click(
      within(screen.getByRole('table')).getByRole('button', {
        name: 'Rename workflow example',
      })
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Rename workflow');
    const nameInput = within(dialog).getByLabelText('Workflow name');
    expect(nameInput).toHaveValue('example.yaml');
    fireEvent.change(nameInput, { target: { value: 'renamed.yaml' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));

    await waitFor(() => {
      expect(onRenameDAG).toHaveBeenCalledWith('example.yaml', 'renamed.yaml');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  // The row has no delete button: its checkbox and the "Delete (N)" button do it.
  it('deletes a workflow selected by its checkbox after confirmation', async () => {
    const { onDeleteDAGs } = renderTable();
    const table = screen.getByRole('table');

    expect(
      within(table).queryByRole('button', { name: 'Delete workflow example' })
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(table).getByRole('checkbox', { name: 'Select workflow example' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete (1)' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Delete workflow?');
    expect(dialog).toHaveTextContent('example.yaml');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(onDeleteDAGs).toHaveBeenCalledWith(['example.yaml']);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /^Delete \(/ })
    ).not.toBeInTheDocument();
  });

  // A group row holds its own checkbox, even when the group is folded.
  it('selects all the workflows of a group from its checkbox', async () => {
    const { onDeleteDAGs } = renderTable('', {
      dags: [
        workflow({ name: 'cleanup', group: 'nightly' }),
        workflow({ name: 'reports', group: 'nightly' }),
        workflow({ name: 'alpha' }),
      ],
    });
    const table = screen.getByRole('table');

    fireEvent.click(
      within(table).getByRole('checkbox', { name: 'Select group nightly' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete (2)' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('cleanup.yaml');
    expect(dialog).toHaveTextContent('reports.yaml');
    expect(dialog).not.toHaveTextContent('alpha.yaml');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(onDeleteDAGs).toHaveBeenCalledWith([
        'cleanup.yaml',
        'reports.yaml',
      ]);
    });
  });

  it('pins all the workflows of a group with one call', async () => {
    const { onSetDAGPinned, onSetDAGsPinned } = renderTable('', {
      dags: [
        workflow({ name: 'cleanup', group: 'nightly' }),
        workflow({ name: 'reports', group: 'nightly' }),
        workflow({ name: 'alpha' }),
      ],
    });

    fireEvent.click(
      within(screen.getByRole('table')).getByRole('button', {
        name: 'Pin group nightly',
      })
    );

    await waitFor(() => {
      expect(onSetDAGsPinned).toHaveBeenCalledTimes(1);
    });
    expect(onSetDAGsPinned).toHaveBeenCalledWith(
      ['cleanup.yaml', 'reports.yaml'],
      true
    );
    expect(onSetDAGPinned).not.toHaveBeenCalled();
  });

  // Gathered by group is the default; the switch lists the workflows flat.
  it('lists the workflows flat by group then name when the Group switch is off', () => {
    renderTable('', {
      dags: [
        workflow({ name: 'zeta', group: 'alpha' }),
        workflow({ name: 'beta', group: 'beta' }),
        workflow({ name: 'solo' }),
        workflow({ name: 'mid', group: 'alpha' }),
      ],
    });
    const table = screen.getByRole('table');
    expect(within(table).queryByTestId('dag-group-prefix')).toBeNull();

    fireEvent.click(
      screen.getByRole('switch', { name: 'Gather the workflows by group' })
    );

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.querySelector('a')?.textContent)).toEqual([
      'mid',
      'zeta',
      'beta',
      'solo',
    ]);
    // The group shows before the name, in the same cell.
    const prefixes = within(table).getAllByTestId('dag-group-prefix');
    expect(prefixes.map((prefix) => prefix.textContent)).toEqual([
      'alpha /',
      'alpha /',
      'beta /',
    ]);
    expect(prefixes[0]?.nextElementSibling).toHaveTextContent('mid');
  });

  it('invites creating the first workflow when none exist and no filters are set', () => {
    renderTable('', { dags: [] });

    expect(screen.getAllByText('No workflows yet').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Create your first workflow to get started.').length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('No workflows found')).not.toBeInTheDocument();
    // All workspaces, the default selection, still allows creating one.
    expect(
      screen.getAllByRole('button', { name: 'Create new DAG' }).length
    ).toBeGreaterThan(0);
  });

  it('translates the empty state', () => {
    localStorage.setItem('user_preferences', JSON.stringify({ locale: 'ja' }));

    renderTable('', { dags: [] });

    expect(
      screen.getAllByText('ワークフローはまだありません').length
    ).toBeGreaterThan(0);
  });

  it('explains an empty saved view and offers to show all workflows', () => {
    const { onShowAllWorkflows } = renderTable('', {
      dags: [],
      workflowViews: [
        {
          id: 'production',
          name: 'Production operations',
          pinned: false,
          filters: {
            searchText: '',
            searchLabels: ['env=prod'],
            activeOnly: false,
            sortField: ViewSortField.name,
            sortOrder: ViewSortOrder.asc,
          },
        },
      ],
      activeWorkflowViewId: 'production',
      isAllWorkflowsView: false,
      panelWidth: 600,
    });

    expect(screen.getAllByText('No workflows found').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/No workflows match the “Production operations” view/)
        .length
    ).toBeGreaterThan(0);

    const cardView = screen.getByTestId('workflow-card-view');
    expect(cardView.className).toContain('block');
    fireEvent.click(
      within(cardView).getByRole('button', { name: 'Show all workflows' })
    );
    expect(onShowAllWorkflows).toHaveBeenCalledOnce();
  });

  // A pinned workflow leaves its group so it stays visible at the top.
  it('lists pinned workflows first, with no section label', () => {
    renderTable('', {
      dags: [
        workflow({ name: 'reports', group: 'nightly', pinned: true }),
        workflow({ name: 'alpha' }),
        workflow({ name: 'cleanup', group: 'nightly' }),
      ],
    });

    const table = screen.getByRole('table');
    const texts = bodyRowTexts(table);
    const position = (text: string) =>
      texts.findIndex((rowText) => rowText.includes(text));
    expect(position('reports')).toBe(0);
    expect(texts.some((text) => text.includes('Pinned'))).toBe(false);
    expect(position('nightly')).toBeGreaterThan(position('reports'));
    expect(position('alpha')).toBeGreaterThan(position('nightly'));
    expect(
      within(table).getAllByRole('link', { name: 'reports' })
    ).toHaveLength(1);
  });

  it('shows the pin in its own column and no pinned row', () => {
    renderTable('', {
      dags: [
        workflow({ name: 'reports', pinned: true }),
        workflow({ name: 'alpha' }),
      ],
    });
    const table = screen.getByRole('table');

    expect(
      within(table).getByRole('columnheader', { name: 'Pinned' })
    ).toBeInTheDocument();
    expect(bodyRowTexts(table).some((text) => text.includes('Pinned'))).toBe(
      false
    );
  });

  // Ascending status order alone would put the failed workflow first.
  it('keeps pinned workflows on top when sorting by last run', () => {
    renderTable('', {
      dags: [
        workflow({ name: 'zeta', pinned: true, status: Status.Success }),
        workflow({ name: 'alpha', status: Status.Failed }),
      ],
    });
    const table = screen.getByRole('table');

    fireEvent.click(within(table).getByRole('button', { name: /^Last Run/ }));

    const texts = bodyRowTexts(table);
    expect(texts.findIndex((text) => text.includes('zeta'))).toBeLessThan(
      texts.findIndex((text) => text.includes('alpha'))
    );
  });

  it('pins and unpins workflows from their rows', () => {
    const { onSetDAGPinned } = renderTable('', {
      dags: [
        workflow({ name: 'reports', pinned: true }),
        workflow({ name: 'alpha' }),
      ],
    });
    const table = screen.getByRole('table');

    const pinAlpha = within(table).getByRole('button', {
      name: 'Pin workflow alpha',
    });
    expect(pinAlpha).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pinAlpha);
    fireEvent.click(
      within(table).getByRole('button', { name: 'Pin workflow reports' })
    );

    expect(onSetDAGPinned).toHaveBeenNthCalledWith(1, 'alpha.yaml', true);
    expect(onSetDAGPinned).toHaveBeenNthCalledWith(2, 'reports.yaml', false);
  });

  it('marks pinned workflows without a pin button for read-only users', () => {
    renderTable('', {
      canPinDAG: (dag) => dag.fileName === 'alpha.yaml',
      dags: [
        workflow({ name: 'reports', pinned: true }),
        workflow({ name: 'alpha' }),
      ],
    });
    const table = screen.getByRole('table');

    expect(within(table).getByRole('img', { name: 'Pinned' })).toBeVisible();
    expect(
      within(table).queryByRole('button', { name: 'Pin workflow reports' })
    ).not.toBeInTheDocument();
    expect(
      within(table).getByRole('button', { name: 'Pin workflow alpha' })
    ).toBeInTheDocument();
  });

  it('shows the pin buttons in the card view', () => {
    renderTable('', {
      panelWidth: 600,
      dags: [
        workflow({ name: 'reports', pinned: true }),
        workflow({ name: 'alpha' }),
      ],
    });
    const cards = screen.getByTestId('workflow-card-view');

    expect(within(cards).queryByText('Pinned')).not.toBeInTheDocument();
    expect(
      within(cards).getByRole('button', { name: 'Pin workflow reports' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(cards).getByRole('button', { name: 'Pin workflow alpha' })
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the workflow page when a row is clicked', () => {
    renderTable('', {
      dags: [workflow({ name: 'alpha' }), workflow({ name: 'reports' })],
    });
    const table = screen.getByRole('table');

    fireEvent.click(
      within(table).getByRole('link', { name: 'reports' }).closest('tr')!
    );

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/dags/reports.yaml?remoteNode=local'
    );
  });

  it('opens the workflow page when a card is clicked', () => {
    renderTable('', {
      panelWidth: 600,
      dags: [workflow({ name: 'alpha' }), workflow({ name: 'reports' })],
    });
    const cards = screen.getByTestId('workflow-card-view');

    fireEvent.click(
      within(cards)
        .getByRole('link', { name: 'alpha' })
        .closest('.card-obsidian')!
    );

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/dags/alpha.yaml?remoteNode=local'
    );
  });

  it('opens a new tab on Ctrl click and keeps the list', () => {
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderTable('', { dags: [workflow({ name: 'alpha' })] });
    const table = screen.getByRole('table');

    fireEvent.click(
      within(table).getByRole('link', { name: 'alpha' }).closest('tr')!,
      { ctrlKey: true }
    );

    expect(openMock).toHaveBeenCalledWith(
      '/dags/alpha.yaml?remoteNode=local',
      '_blank',
      'noopener'
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/dags');
    expect(screen.getByTestId('location')).not.toHaveTextContent('alpha');
    openMock.mockRestore();
  });
  describe('activity of the last 24 hours', () => {
    const HOUR = 3_600_000;
    function withActivity(runs: unknown[], truncated = false) {
      return {
        ...workflow({ name: 'alpha' }),
        activity: { runs, truncated },
      } as never;
    }
    // A workflow that has a run: only then does its row hold the chevron.
    function withLatestRun() {
      return {
        ...workflow({ name: 'alpha' }),
        latestDAGRun: {
          dagRunId: 'latest',
          status: Status.Success,
          statusLabel: 'Success',
        },
        activity: { runs: [], truncated: false },
      } as never;
    }
    function run(id: string, agoMs: number, status = Status.Success) {
      const start = Date.now() - agoMs;
      return {
        dagRunId: id,
        status,
        startedAt: new Date(start).toISOString(),
        finishedAt: new Date(start + 60_000).toISOString(),
      };
    }

    // jsdom has no layout: the observer of the strip tells it a width.
    class MeasuringObserver {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        if (target.getAttribute('data-testid') !== 'dag-activity') return;
        this.callback(
          [{ target, contentRect: { width: 300 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver
        );
      }
      unobserve() {}
      disconnect() {}
    }

    beforeEach(() => {
      recentRuns.dagRuns = [];
      vi.stubGlobal('ResizeObserver', MeasuringObserver);
    });

    it('draws a bar for each run of the window and tells how many', () => {
      renderTable('', {
        dags: [withActivity([run('r1', HOUR), run('r2', 2 * HOUR)])],
      });
      const table = screen.getByRole('table');

      const strip = within(table).getByTestId('dag-activity');
      expect(strip).toHaveAttribute(
        'aria-label',
        '2 runs in the last 24 hours'
      );
      expect(strip.querySelectorAll('[data-run-id]')).toHaveLength(2);
      // The time axis and the line of the greatest height frame the bars.
      expect(
        within(strip).getByTestId('dag-activity-axis')
      ).toBeInTheDocument();
      expect(
        within(strip).getByTestId('dag-activity-ceiling')
      ).toBeInTheDocument();
    });

    // The strip draws its bars once it knows its width, not at a default width.
    it('draws no bar until the strip has a width', () => {
      class SilentObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      vi.stubGlobal('ResizeObserver', SilentObserver);
      renderTable('', { dags: [withActivity([run('r1', HOUR)])] });

      const strip = within(screen.getByRole('table')).getByTestId(
        'dag-activity'
      );
      expect(strip).toHaveAttribute('aria-label', '1 run in the last 24 hours');
      expect(strip.querySelectorAll('[data-run-id]')).toHaveLength(0);
    });

    it('says when the window holds no run', () => {
      renderTable('', { dags: [withActivity([])] });
      expect(
        within(screen.getByRole('table')).getByTestId('dag-activity')
      ).toHaveAttribute('aria-label', 'No runs in the last 24 hours');
    });

    it('says when the list of runs of the window is cut', () => {
      renderTable('', {
        dags: [
          withActivity(
            Array.from({ length: 60 }, (_, i) => run(`r${i}`, HOUR)),
            true
          ),
        ],
      });
      expect(
        within(screen.getByRole('table')).getByTestId('dag-activity')
      ).toHaveAttribute('aria-label', '60+ runs in the last 24 hours');
    });

    it('opens the workflow on the run of a bar without opening the row', () => {
      renderTable('', { dags: [withActivity([run('r1', HOUR)])] });
      const bar = within(screen.getByRole('table'))
        .getByTestId('dag-activity')
        .querySelector('[data-run-id="r1"]')!;

      fireEvent.click(bar);

      expect(screen.getByTestId('location')).toHaveTextContent(
        '/dags/alpha.yaml?remoteNode=local&run=r1'
      );
    });

    it('has no chevron for a workflow without run', () => {
      renderTable('', { dags: [withActivity([])] });
      const table = screen.getByRole('table');

      expect(within(table).getByTestId('dag-activity')).toBeInTheDocument();
      expect(within(table).queryByTestId('dag-activity-toggle')).toBeNull();
    });

    it('has a chevron for a workflow whose window holds a run', () => {
      renderTable('', {
        dags: [
          {
            ...workflow({ name: 'alpha' }),
            activity: { runs: [run('r1', HOUR)], truncated: false },
          } as never,
        ],
      });

      expect(
        within(screen.getByRole('table')).getByTestId('dag-activity-toggle')
      ).toBeInTheDocument();
    });

    it('unfolds the recent runs under the row from the chevron', () => {
      recentRuns.dagRuns = [
        run('older', 3 * HOUR, Status.Failed),
        run('newer', HOUR),
      ];
      renderTable('', { dags: [withActivity([run('r1', HOUR)])] });
      const table = screen.getByRole('table');
      expect(within(table).queryByTestId('dag-recent-runs')).toBeNull();

      const toggle = within(table).getByTestId('dag-activity-toggle');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const panel = within(table).getByTestId('dag-recent-runs');
      expect(within(panel).getByText('older')).toBeInTheDocument();
      expect(within(panel).getByText('newer')).toBeInTheDocument();
      // The runs have no "Open the workflow" link: a line opens its run.
      expect(within(panel).queryByText('Open the workflow')).toBeNull();
      // The chevron neither opens the workflow nor selects the row.
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/dags$/);

      fireEvent.click(within(panel).getByText('older'));
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/dags/alpha.yaml?remoteNode=local&run=older'
      );

      fireEvent.click(toggle);
      expect(within(table).queryByTestId('dag-recent-runs')).toBeNull();
    });

    it('reads a continuous run as Healthy and its start as "3h ago"', () => {
      recentRuns.dagRuns = [
        {
          ...run('service', 3 * HOUR, Status.Running),
          nodes: [
            {
              step: {
                name: 'serve',
                repeatPolicy: { repeat: 'while', condition: 'true' },
              },
              status: NodeStatus.Running,
            },
          ],
        },
        run('plain', 5 * 60_000),
      ];
      renderTable('', { dags: [withLatestRun()] });
      const table = screen.getByRole('table');
      fireEvent.click(within(table).getByTestId('dag-activity-toggle'));

      const panel = within(table).getByTestId('dag-recent-runs');
      // The status is a dot alone: its name is the accessible label.
      expect(
        within(panel).getByRole('img', { name: 'Healthy' })
      ).toBeInTheDocument();
      expect(within(panel).queryByRole('img', { name: 'Running' })).toBeNull();
      expect(within(panel).queryByText('Healthy')).toBeNull();
      // A run without a scheduled time tells when it ended next to the dot:
      // one minute after its start, which rounds to the same "3h ago".
      expect(within(panel).getAllByText('3h ago')).toHaveLength(2);
      expect(within(panel).getByText('5m ago')).toBeInTheDocument();
      expect(within(panel).getByText('4m ago')).toBeInTheDocument();
      expect(within(panel).getAllByText('·')).toHaveLength(2);
    });

    it('tells the trigger, the cause of a failure, the labels and the queue wait', () => {
      recentRuns.dagRuns = [
        {
          ...run('broken', HOUR, Status.Failed),
          triggerType: 'scheduler',
          queuedAt: new Date(Date.now() - HOUR - 12_000).toISOString(),
          labels: ['env=prod', 'team=data', 'extra'],
          workerId: 'worker-7',
          nodes: [
            {
              step: { name: 'load' },
              status: NodeStatus.Failed,
              error: 'exit status 2\nmore',
            },
          ],
        },
        {
          ...run('param', 2 * HOUR),
          triggerType: 'manual',
          params: 'DATE=2026-10-29',
        },
      ];
      renderTable('', { dags: [withLatestRun()] });
      const table = screen.getByRole('table');
      fireEvent.click(within(table).getByTestId('dag-activity-toggle'));

      const panel = within(table).getByTestId('dag-recent-runs');
      expect(within(panel).getByText('Scheduled')).toBeInTheDocument();
      expect(within(panel).getByText('Manual')).toBeInTheDocument();
      expect(
        within(panel).getByText('load: exit status 2')
      ).toBeInTheDocument();
      expect(within(panel).getByText('DATE=2026-10-29')).toBeInTheDocument();
      expect(within(panel).getByText(/queued 1\ds/)).toBeInTheDocument();
      expect(within(panel).getByText('env=prod')).toBeInTheDocument();
      expect(within(panel).getByText('team=data')).toBeInTheDocument();
      expect(within(panel).getByText('+1')).toBeInTheDocument();
      expect(within(panel).getByText('worker-7')).toBeInTheDocument();
    });

    it('counts the cached time of a run in its time', () => {
      recentRuns.dagRuns = [
        {
          ...run('stepwise', HOUR),
          startedAt: '2026-10-29T12:00:00Z',
          finishedAt: '2026-10-29T12:00:05Z',
          reusedInputs: [
            {
              step: 'slow',
              runId: 'source',
              via: 'run',
              startedAt: '2026-10-29T11:00:00Z',
              finishedAt: '2026-10-29T11:00:55Z',
            },
          ],
        },
      ];
      renderTable('', { dags: [withLatestRun()] });
      const table = screen.getByRole('table');
      fireEvent.click(within(table).getByTestId('dag-activity-toggle'));

      // 5 s of its own and 55 s that it took from the earlier run.
      const panel = within(table).getByTestId('dag-recent-runs');
      expect(within(panel).getByText('1m').parentElement).toHaveAttribute(
        'title',
        'Total 1m = own 5s + cached 55s'
      );
      expect(within(panel).getByText(/5s \+ 55s cached/)).toBeInTheDocument();
    });
  });
});
