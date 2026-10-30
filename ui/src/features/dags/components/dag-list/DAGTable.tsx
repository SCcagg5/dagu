// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Column,
  ColumnFiltersState,
  createColumnHelper,
  ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  Row,
  RowData,
  Updater,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  PencilLine,
  Search,
  Trash2,
} from 'lucide-react';
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { DAGNameInputModal } from '@/components/DAGNameInputModal';
import { components, Status } from '../../../../api/v1/schema';
import RelativeTime from '@/components/ui/relative-time';
import { RunStatusChip } from '@/features/dag-runs/components/common/RunStatusChip';
import { CreateDAGButton, DAGPagination } from '../common';
import DAGActions from '../common/DAGActions';
import LiveSwitch from '../common/LiveSwitch';
import ActivityBars from './ActivityBars';
import { DAGRecentRuns } from './DAGRecentRuns';
import { LastRunCell, useIsHeartbeat } from './LastRunCell';
import { ScheduleLine } from './ScheduleSummary';
import { ScheduleCell, WebhookCell } from './ActiveCell';
import PinToggle from '../common/PinToggle';

// Import shadcn/ui components
import { PanelWidthContext } from '../../../../components/SplitLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LabelCombobox } from '@/components/ui/label-combobox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AppBarContext } from '../../../../contexts/AppBarContext';
import { useRemoteNode } from '../../../../contexts/RemoteNodeContext';
import { buildDAGPageURL } from '../../../dag-runs/lib/dagRunUrls';
import { useOpenPage } from '../../../dag-runs/lib/useOpenPage';
import type { WorkflowFilterView } from './workflowViews';
import { useQuery } from '../../../../hooks/api';
import { parseLabelParts } from '../../../../lib/utils';
import {
  isWorkspaceLabel,
  withoutWorkspaceLabels,
} from '../../../../lib/workspace';
import { ViewSelector } from '@/features/views/ViewSelector';
import { I18nText } from '@/i18n/I18nText';
import { I18nProps } from '@/i18n/I18nProps';
import { useI18n } from '@/i18n/I18nProvider';

// Threshold in pixels below which we switch to card view
// Set higher than table's comfortable minimum width (~700px for all columns)
const CARD_VIEW_THRESHOLD = 700;
// The strip of the activity needs room: below this width of the table, or below
// the xl breakpoint of the page, the column is left out and the cards show it.
const ACTIVITY_COLUMN_MIN_WIDTH = 1100;

/** The name of a workflow: a real link, so a middle click or a Ctrl click opens a new tab. */
function DAGNameLink({
  fileName,
  children,
}: {
  fileName: string;
  children: React.ReactNode;
}) {
  const remoteNode = useRemoteNode();
  return (
    <Link
      to={buildDAGPageURL({ fileName, remoteNode })}
      className="block truncate text-sm font-medium text-foreground hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </Link>
  );
}

// Reusable DAG Card component for mobile and narrow panel views
interface DAGCardProps {
  dag: components['schemas']['DAGFile'];
  /** The workflow page: the name link and a click on the card open it. */
  href: string;
  onOpen: (event: React.MouseEvent) => void;
  onLabelClick: (label: string) => void;
  refreshFn: () => void;
  canDeleteDAGs: boolean;
  isDeleteSelected: boolean;
  onToggleDeleteSelection: (fileName: string) => void;
  canRenameDAGs: boolean;
  onRenameDAG: (dag: components['schemas']['DAGFile']) => void;
  canPin: boolean;
  isPinPending: boolean;
  onTogglePin: (dag: components['schemas']['DAGFile']) => void;
  className?: string;
}

function RenameDAGButton({
  dag,
  onRename,
}: {
  dag: components['schemas']['DAGFile'];
  onRename: (dag: components['schemas']['DAGFile']) => void;
}) {
  return (
    <I18nProps>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Rename workflow ${dag.dag.name}`}
        title="Rename workflow"
        onClick={() => onRename(dag)}
      >
        <PencilLine className="h-4 w-4" />
      </Button>
    </I18nProps>
  );
}

/** The strip of the activity of a workflow; a heartbeat draws its run as a band. */
function HeartbeatAwareActivity({
  dag,
  onOpenRun,
}: {
  dag: components['schemas']['DAGFile'];
  onOpenRun: (runId: string, event: React.MouseEvent) => void;
}) {
  return (
    <ActivityBars
      activity={dag.activity}
      healthy={useIsHeartbeat(dag)}
      fluid
      onOpenRun={onOpenRun}
    />
  );
}

/** The chevron that unfolds the recent runs under the row of a workflow. */
function ActivityToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const { ts } = useI18n();
  const label = ts(expanded ? 'Hide recent runs' : 'Show recent runs');
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      data-testid="dag-activity-toggle"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {expanded ? (
        <ChevronDown className="h-4 w-4" />
      ) : (
        <ChevronRight className="h-4 w-4" />
      )}
    </button>
  );
}

function DAGCard({
  dag,
  href,
  onOpen,
  onLabelClick,
  refreshFn,
  canDeleteDAGs,
  isDeleteSelected,
  onToggleDeleteSelection,
  canRenameDAGs,
  onRenameDAG,
  canPin,
  isPinPending,
  onTogglePin,
  className = '',
}: DAGCardProps) {
  const fileName = dag.fileName;
  const title = dag.dag.name;
  const status = dag.latestDAGRun?.status;
  const statusLabel = dag.latestDAGRun?.statusLabel;
  const labels = withoutWorkspaceLabels(dag.dag.labels ?? dag.dag.tags ?? []);
  const description = dag.dag.description;
  const hasSchedule = (dag.dag.schedule ?? []).length > 0;

  return (
    <div
      className={`card-obsidian p-2.5 cursor-pointer hover:bg-white/[0.05] transition-colors duration-300 ${status === Status.Running ? 'animate-running-row' : ''} ${className}`}
      onClick={onOpen}
    >
      {/* Header: Name + Status */}
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {canDeleteDAGs && (
            <div
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center"
              onClick={(event) => event.stopPropagation()}
            >
              <Checkbox
                aria-label={`Select workflow ${title}`}
                checked={isDeleteSelected}
                onCheckedChange={() => onToggleDeleteSelection(fileName)}
              />
            </div>
          )}
          <Link
            to={href}
            className="font-medium text-xs truncate flex-1 min-w-0 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {title}
          </Link>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <PinToggle
            name={title}
            pinned={dag.pinned}
            canToggle={canPin}
            pending={isPinPending}
            onToggle={() => onTogglePin(dag)}
            className="size-6"
          />
          <RunStatusChip
            name={title}
            dagRunId={dag.latestDAGRun?.dagRunId}
            status={status}
            size="xs"
          >
            {statusLabel}
          </RunStatusChip>
        </div>
      </div>

      {/* Description */}
      {description && (
        <div className="text-xs text-muted-foreground mb-1.5 line-clamp-1">
          {description}
        </div>
      )}

      {/* Schedule & Last Run */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
        <ScheduleLine dag={dag} emptyLabel={false} />
        {dag.latestDAGRun.startedAt && dag.latestDAGRun.startedAt !== '-' && (
          <span className="flex items-center gap-0.5">
            <Calendar className="h-2.5 w-2.5" />
            <RelativeTime
              className="text-xs"
              timestamp={dag.latestDAGRun.startedAt}
              absolute={dag.latestDAGRun.startedAt}
            />
          </span>
        )}
      </div>

      {dag.activity && (
        <ActivityBars activity={dag.activity} className="mb-1.5" />
      )}

      {/* Labels */}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mb-1.5">
          {[...labels]
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
            .map((label) => (
              <Badge
                key={label}
                variant="outline"
                className="h-[18px] rounded border-transparent bg-muted px-1.5 py-0 text-[11px] font-normal text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onLabelClick(label);
                }}
              >
                {label}
              </Badge>
            ))}
        </div>
      )}

      {/* Actions row: LiveSwitch + DAGActions */}
      <div className="flex flex-wrap items-center justify-between gap-1 pt-1.5 border-t border-border/50 min-w-0">
        <div
          className="flex items-center gap-1 flex-shrink-0 min-w-0"
          onClick={(e) => e.stopPropagation()}
        >
          {hasSchedule && <LiveSwitch dag={dag} refresh={refreshFn} />}
          <span className="text-xs text-muted-foreground truncate">
            {dag.suspended ? (
              <I18nText text={'Suspended'} />
            ) : hasSchedule ? (
              <I18nText text={'Live'} />
            ) : (
              <I18nText text={'No schedule'} />
            )}
          </span>
        </div>
        <div
          className="flex flex-shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <DAGActions
            dag={dag.dag}
            status={dag.latestDAGRun}
            fileName={fileName}
            label={false}
            refresh={refreshFn}
            retryInPlaceOfStop
          />
          {canRenameDAGs && (
            <RenameDAGButton dag={dag} onRename={onRenameDAG} />
          )}
        </div>
      </div>
    </div>
  );
}

// Pinned DAGs lead the rows; the card view puts a divider after them.
function countLeadingPinnedRows(rows: Row<Data>[]): number {
  let count = 0;
  for (const row of rows) {
    if (
      row.depth !== 0 ||
      row.original.kind !== ItemKind.DAG ||
      !(row.original as DAGRow).dag.pinned
    ) {
      break;
    }
    count++;
  }
  return count;
}

/**
 * Props for the DAGTable component
 */
type Props = {
  /** List of DAG files to display */
  dags: components['schemas']['DAGFile'][];
  /** Current group filter */
  group: string;
  /** Function to refresh the data */
  refreshFn: () => void;
  /** Current search text */
  searchText: string;
  /** Handler for search text changes */
  handleSearchTextChange: (searchText: string) => void;
  /** Current label filter (multi-select) */
  searchLabels: string[];
  /** Handler for label filter changes */
  handleSearchLabelsChange: (labels: string[]) => void;
  /** Whether only scheduled, unsuspended workflows are shown */
  activeOnly: boolean;
  /** Handler for the active workflow filter */
  handleActiveOnlyChange: (activeOnly: boolean) => void;
  /** Loading state */
  isLoading?: boolean;
  /** Pagination props */
  pagination?: {
    /** Total number of pages */
    totalPages: number;
    /** Current page number */
    page: number;
    /** Number of items per page */
    pageLimit: number;
    /** Callback for page change */
    pageChange: (page: number) => void;
    /** Callback for page limit change */
    onPageLimitChange: (pageLimit: number) => void;
  };
  /** Current sort field */
  sortField?: string;
  /** Current sort order */
  sortOrder?: string;
  /** Handler for sort changes */
  onSortChange?: (field: string, order: string) => void;
  /** Saved filter views available in the current context */
  workflowViews: WorkflowFilterView[];
  /** Selected saved view, if any */
  activeWorkflowViewId: string | null;
  /** Saved view that opens by default */
  defaultWorkflowViewId?: string;
  /** Whether the built-in unfiltered view is selected */
  isAllWorkflowsView: boolean;
  /** Whether the selected saved view differs from its stored filters */
  isWorkflowViewEdited: boolean;
  areWorkflowFiltersSaved: boolean;
  /** Whether the current user can mutate shared views in this scope */
  canManageWorkflowViews: boolean;
  /** Whether the current user can delete workflows in this scope */
  canDeleteDAGs: boolean;
  /** Whether the current user can rename workflows in this scope */
  canRenameDAGs: boolean;
  /** Latest shared-view mutation error */
  workflowViewError?: string | null;
  onSelectWorkflowView: (viewId: string) => void;
  onShowAllWorkflows: () => void;
  onResetWorkflowView: () => void;
  onSaveWorkflowView: (
    name: string,
    makeDefault: boolean,
    pinned: boolean
  ) => Promise<void>;
  onUpdateWorkflowView: () => Promise<void>;
  onSetDefaultWorkflowView: (viewId: string | undefined) => Promise<void>;
  onSetPinnedWorkflowView: (viewId: string, pinned: boolean) => Promise<void>;
  onDeleteWorkflowView: (viewId: string) => Promise<void>;
  onRenameWorkflowView: (viewId: string, name: string) => Promise<void>;
  onDeleteDAGs: (fileNames: string[]) => Promise<DAGDeleteResult[]>;
  onRenameDAG: (fileName: string, newFileName: string) => Promise<void>;
  /** Whether the current user can pin a workflow for everyone */
  canPinDAG: (dag: components['schemas']['DAGFile']) => boolean;
  /** Pins or unpins a workflow for all users */
  onSetDAGPinned: (fileName: string, pinned: boolean) => Promise<void>;
};

export type DAGDeleteResult = {
  fileName: string;
  error?: string;
};

/**
 * Types for table rows
 */
type RowItem = DAGRow | GroupRow;
type DAGRow = {
  kind: ItemKind;
  name: string;
  dag: components['schemas']['DAGFile'];
};
type GroupRow = {
  kind: ItemKind.Group;
  name: string;
};
enum ItemKind {
  DAG = 0,
  Group,
}
type Data = RowItem & { subRows?: RowItem[] };

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData extends RowData> {
    group: string;
    refreshFn: () => void;
    // Add label click handler to meta for direct access in cell
    onLabelClick?: (label: string) => void;
    getDeleteSelectionState?: () => boolean | 'indeterminate';
    isDeleteSelected?: (fileName: string) => boolean;
    onToggleDeleteSelection?: (fileName: string) => void;
    onToggleAllDeleteSelection?: (checked: boolean) => void;
    canRenameDAGs?: boolean;
    onOpenRenameDAG?: (dag: components['schemas']['DAGFile']) => void;
    canDeleteDAGs?: boolean;
    canPinDAG?: (dag: components['schemas']['DAGFile']) => boolean;
    onToggleGroupPin?: (dags: components['schemas']['DAGFile'][]) => void;
    isPinPending?: (fileName: string) => boolean;
    onTogglePin?: (dag: components['schemas']['DAGFile']) => void;
    isActivityExpanded?: (fileName: string) => boolean;
    onToggleActivity?: (fileName: string) => void;
    onOpenRun?: (
      fileName: string,
      runId: string,
      event: React.MouseEvent
    ) => void;
  }
}

const columnHelper = createColumnHelper<Data>();
// --- End Helper Functions ---

const deleteSelectionColumn = columnHelper.display({
  id: 'Select',
  size: 24,
  minSize: 24,
  maxSize: 24,
  header: ({ table }) => (
    <div className="flex h-8 items-center justify-center">
      <I18nProps>
        <Checkbox
          className="size-3.5"
          aria-label="Select all loaded workflows"
          checked={table.options.meta?.getDeleteSelectionState?.() ?? false}
          onCheckedChange={(checked) =>
            table.options.meta?.onToggleAllDeleteSelection?.(checked === true)
          }
        />
      </I18nProps>
    </div>
  ),
  cell: ({ row, table }) => {
    const data = row.original;
    if (data.kind !== ItemKind.DAG) {
      return null;
    }
    const fileName = data.dag.fileName;
    return (
      <div
        className="flex h-8 items-center justify-center"
        onClick={(event) => event.stopPropagation()}
      >
        <Checkbox
          className="size-3.5"
          aria-label={`Select workflow ${data.dag.dag.name}`}
          checked={table.options.meta?.isDeleteSelected?.(fileName) ?? false}
          onCheckedChange={() =>
            table.options.meta?.onToggleDeleteSelection?.(fileName)
          }
        />
      </div>
    );
  },
});

const defaultColumns = [
  columnHelper.display({
    id: 'Pin',
    size: 24,
    minSize: 24,
    maxSize: 24,
    header: () => (
      <span className="sr-only">
        <I18nText text={'Pinned'} />
      </span>
    ),
    cell: ({ row, table }) => {
      const meta = table.options.meta;
      if (row.original.kind === ItemKind.Group) {
        const members = (row.original.subRows ?? [])
          .filter((item): item is DAGRow => item.kind === ItemKind.DAG)
          .map((item) => item.dag);
        if (members.length === 0) {
          return null;
        }
        return (
          <div className="flex min-h-[2.5rem] items-center justify-center">
            <PinToggle
              name={row.original.name}
              subject="group"
              pinned={members.every((dag) => dag.pinned)}
              canToggle={members.every((dag) => meta?.canPinDAG?.(dag))}
              pending={members.some((dag) =>
                meta?.isPinPending?.(dag.fileName)
              )}
              revealOnHover
              className="size-5"
              onToggle={() => meta?.onToggleGroupPin?.(members)}
            />
          </div>
        );
      }
      const dag = (row.original as DAGRow).dag;
      return (
        <div className="flex min-h-[2.5rem] items-center justify-center">
          <PinToggle
            name={dag.dag.name}
            pinned={dag.pinned}
            canToggle={meta?.canPinDAG?.(dag) ?? false}
            pending={meta?.isPinPending?.(dag.fileName)}
            revealOnHover
            className="size-5"
            onToggle={() => meta?.onTogglePin?.(dag)}
          />
        </div>
      );
    },
  }),
  columnHelper.accessor('name', {
    id: 'Name',
    header: () => (
      <span className="text-xs">
        <I18nText text={'Name'} />
      </span>
    ),
    cell: ({ row, getValue, table }) => {
      const data = row.original!;

      if (data.kind === ItemKind.Group) {
        // The chevron that unfolds the group sits in the name cell of its row,
        // so that the rows of the workflows give no width to it.
        return (
          <div
            role="button"
            tabIndex={0}
            aria-expanded={row.getIsExpanded()}
            onClick={(e) => {
              e.stopPropagation();
              row.toggleExpanded();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                e.preventDefault();
                row.toggleExpanded();
              }
            }}
            className="flex min-h-[2.5rem] cursor-pointer items-center gap-1 rounded text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {row.getIsExpanded() ? (
              <ChevronUp className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate font-normal">{getValue()}</span>
          </div>
        );
      } else {
        // DAG Row: Render link with description and labels below
        const labels = withoutWorkspaceLabels(
          data.dag.dag.labels ?? data.dag.dag.tags ?? []
        );
        const description = data.dag.dag.description;

        return (
          <div
            style={{ paddingLeft: `${row.depth * 1.5}rem` }}
            className="space-y-0.5 min-w-0"
          >
            <DAGNameLink fileName={data.dag.fileName}>{getValue()}</DAGNameLink>

            {description && (
              <div
                title={description}
                className="truncate text-xs text-muted-foreground leading-tight"
              >
                {description}
              </div>
            )}

            {labels.length > 0 && (
              <div className="flex flex-wrap gap-0.5">
                {[...labels]
                  .sort((a, b) =>
                    a.toLowerCase().localeCompare(b.toLowerCase())
                  )
                  .map((label) => {
                    const { key, value } = parseLabelParts(label);
                    return (
                      <Badge
                        key={label}
                        variant="outline"
                        className="h-[18px] gap-0.5 rounded border-transparent bg-muted px-1.5 py-0 text-[11px] font-normal text-muted-foreground transition-colors duration-150 cursor-pointer whitespace-normal break-words hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            const handleLabelClick =
                              table.options.meta?.onLabelClick;
                            if (handleLabelClick) handleLabelClick(label);
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const handleLabelClick =
                            table.options.meta?.onLabelClick;
                          if (handleLabelClick) handleLabelClick(label);
                        }}
                      >
                        {value !== null ? (
                          <>
                            <span className="font-medium text-foreground/80">
                              {key}
                            </span>
                            <span className="opacity-60">=</span>
                            <span>{value}</span>
                          </>
                        ) : (
                          key
                        )}
                      </Badge>
                    );
                  })}
              </div>
            )}
          </div>
        );
      }
    },
    filterFn: (row, _, filterValue) => {
      // Use row instead of props
      const data = row.original!;
      if (data.kind === ItemKind.Group) {
        return true; // Always show group rows during filtering
      }
      if (data.kind === ItemKind.DAG) {
        const name = data.dag.dag.name.toLowerCase();
        const fileName = data.dag.fileName.toLowerCase();
        const description = (data.dag.dag.description || '').toLowerCase();
        const filterObject =
          typeof filterValue === 'object' &&
          filterValue !== null &&
          !Array.isArray(filterValue)
            ? (filterValue as { searchText?: string; labels?: string[] })
            : undefined;
        const searchValue = filterObject
          ? (filterObject.searchText ?? '').toLowerCase()
          : Array.isArray(filterValue)
            ? ''
            : String(filterValue ?? '').toLowerCase();

        const labelFilters = (
          filterObject?.labels ??
          (Array.isArray(filterValue) ? filterValue : [])
        ).map((label) => label.toLowerCase());

        const labels = withoutWorkspaceLabels(
          data.dag.dag.labels ?? data.dag.dag.tags ?? []
        );
        const rowLabels = labels.map((label) => label.toLowerCase());

        const matchesText =
          searchValue === '' ||
          fileName.includes(searchValue) ||
          name.includes(searchValue) ||
          description.includes(searchValue) ||
          rowLabels.some((label) => label.includes(searchValue));
        const matchesLabels =
          labelFilters.length === 0 ||
          labelFilters.every((label) => rowLabels.includes(label));

        return matchesText && matchesLabels;
      }
      return false;
    },
  }),
  // Labels column removed as labels are now displayed under the name
  // The filter functionality is preserved in the Name column
  // Removed Started At and Finished At columns
  columnHelper.accessor('kind', {
    id: 'LastRun',
    size: 88,
    minSize: 76,
    header: () => (
      <span className="text-xs">
        <I18nText text={'Last Run'} />
      </span>
    ),
    cell: ({ row }) => {
      const data = row.original!;
      if (data.kind !== ItemKind.DAG) {
        return null;
      }
      return <LastRunCell dag={data.dag} />;
    },
  }),
  columnHelper.accessor('kind', {
    id: 'Activity',
    size: 244,
    minSize: 244,
    header: () => (
      <span className="block text-center text-xs">
        <I18nText text={'Activity'} />
      </span>
    ),
    cell: ({ row, table }) => {
      const data = row.original!;
      if (data.kind !== ItemKind.DAG) {
        return null;
      }
      const meta = table.options.meta;
      const fileName = data.dag.fileName;
      return (
        <div className="flex items-center gap-1">
          <HeartbeatAwareActivity
            dag={data.dag}
            onOpenRun={(runId, event) =>
              meta?.onOpenRun?.(fileName, runId, event)
            }
          />
          <ActivityToggle
            expanded={meta?.isActivityExpanded?.(fileName) ?? false}
            onToggle={() => meta?.onToggleActivity?.(fileName)}
          />
        </div>
      );
    },
  }),
  columnHelper.accessor('kind', {
    id: 'Schedule',
    size: 220,
    minSize: 180,
    header: () => (
      <span className="text-xs">
        <I18nText text={'Schedule'} />
      </span>
    ),
    cell: ({ row, table }) => {
      const data = row.original!;
      if (data.kind !== ItemKind.DAG) {
        return null;
      }
      return (
        <ScheduleCell dag={data.dag} refresh={table.options.meta?.refreshFn} />
      );
    },
  }),
  columnHelper.accessor('kind', {
    id: 'Webhook',
    size: 88,
    minSize: 88,
    header: () => (
      <span className="text-xs">
        <I18nText text={'Webhook'} />
      </span>
    ),
    cell: ({ row }) => {
      const data = row.original!;
      if (data.kind !== ItemKind.DAG) {
        return null;
      }
      return <WebhookCell dag={data.dag} />;
    },
  }),
  columnHelper.display({
    id: 'Actions',
    size: 160,
    minSize: 160,
    maxSize: 160,
    header: () => (
      <span className="sr-only">
        <I18nText text={'Actions'} />
      </span>
    ),
    cell: ({ row, table }) => {
      // Use row and table
      const data = row.original!;
      if (data.kind === ItemKind.Group) {
        return null;
      }
      // Assuming DAGActions is refactored or compatible
      return (
        // Wrap DAGActions in a div and stop propagation on its click
        <div
          className="flex items-center justify-end gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <DAGActions
            dag={data.dag.dag}
            status={data.dag.latestDAGRun}
            fileName={data.dag.fileName}
            label={false}
            refresh={table.options.meta?.refreshFn}
            retryInPlaceOfStop
          />
          {table.options.meta?.canRenameDAGs && (
            <RenameDAGButton
              dag={data.dag}
              onRename={(dag) => table.options.meta?.onOpenRenameDAG?.(dag)}
            />
          )}
        </div>
      );
    },
  }),
];

// Mapping between column IDs and backend sort fields
const columnToSortField: Record<string, string> = {
  Name: 'name',
  ScheduleAndNextRun: 'nextRun',
};

// Client-side sortable columns
const clientSortableColumns = ['LastRun'];

const cardSortOptions = [
  { value: 'name', label: 'Name' },
  { value: 'nextRun', label: 'Next run' },
] as const;

function getCardSortLabel(sort: string): string {
  return (
    cardSortOptions.find((option) => option.value === sort)?.label ?? 'Name'
  );
}

function getDefaultSortOrder(field: string): string {
  if (field === 'nextRun') {
    return 'asc';
  }
  return 'asc';
}

function WorkflowsEmptyState({
  icon,
  heading,
  description,
  descriptionValues,
  showAllButton,
  onShowAllWorkflows,
}: {
  icon: string;
  heading: string;
  description: string;
  descriptionValues?: Record<string, string>;
  showAllButton: boolean;
  onShowAllWorkflows?: () => void;
}) {
  return (
    <>
      <div className="text-6xl mb-4">{icon}</div>
      <h3 className="text-lg font-medium text-foreground mb-2">
        <I18nText text={heading} />
      </h3>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-4 whitespace-normal break-words">
        <I18nText text={description} values={descriptionValues} />
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {showAllButton && (
          <Button type="button" variant="outline" onClick={onShowAllWorkflows}>
            <I18nText text={'Show all workflows'} />
          </Button>
        )}
        <CreateDAGButton />
      </div>
    </>
  );
}

function buildGrepSearchUrl(searchText: string): string {
  const params = new URLSearchParams();
  const query = searchText.trim();

  if (query) {
    params.set('q', query);
    params.set('scope', 'dags');
    return `/search?${params.toString()}`;
  }

  return '/search';
}

// --- Header Component for both Server-side and Client-side Sorting ---
const SortableHeader = ({
  column,
  children,
  currentSort,
  currentOrder,
  onSort,
  clientSort,
  clientOrder,
  onClientSort,
}: {
  column: Column<Data, unknown>;
  children: React.ReactNode;
  currentSort?: string;
  currentOrder?: string;
  onSort?: (field: string, order: string) => void;
  clientSort?: string;
  clientOrder?: string;
  onClientSort?: (field: string, order: string) => void;
}) => {
  const serverSortField = columnToSortField[column.id];
  const isClientSortable = clientSortableColumns.includes(column.id);

  // Check if this column is currently sorted (either server or client)
  const isServerActive = serverSortField && currentSort === serverSortField;
  const isClientActive = isClientSortable && clientSort === column.id;
  const isActive = isServerActive || isClientActive;

  // Determine if column is sortable at all
  const isSortable =
    (serverSortField && onSort) || (isClientSortable && onClientSort);

  if (!isSortable) {
    return <>{children}</>;
  }

  const handleClick = () => {
    if (serverSortField && onSort) {
      // Server-side sorting
      const newOrder =
        isServerActive && currentOrder === 'asc' ? 'desc' : 'asc';
      onSort(serverSortField, newOrder);
      // Clear client sort when server sort is applied
      if (onClientSort) {
        onClientSort('', '');
      }
    } else if (isClientSortable && onClientSort) {
      // Client-side sorting
      const newOrder = isClientActive && clientOrder === 'asc' ? 'desc' : 'asc';
      onClientSort(column.id, newOrder);
    }
  };

  // Determine which order to show
  function getDisplayOrder(): string {
    if (isServerActive) return currentOrder || '';
    if (isClientActive) return clientOrder || '';
    return '';
  }
  const displayOrder = getDisplayOrder();

  const button = (
    <Button
      variant="ghost"
      onClick={handleClick}
      className="-ml-4 h-8 cursor-pointer" // Adjust spacing
    >
      {children}
      {isActive && displayOrder === 'asc' && (
        <ArrowUp className="ml-2 h-4 w-4" />
      )}
      {isActive && displayOrder === 'desc' && (
        <ArrowDown className="ml-2 h-4 w-4" />
      )}
    </Button>
  );

  // Wrap client-sortable columns with tooltip
  if (isClientSortable) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent className="bg-muted text-muted-foreground border">
          <p className="text-xs">
            <I18nText text={'Sorts current page only'} />
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
};

/**
 * DAGTable component displays a table of DAGs with filtering, sorting, and grouping capabilities
 */
function DAGTable({
  dags = [],
  group = '', // Keep group prop if needed for external filtering/logic
  refreshFn,
  searchText,
  handleSearchTextChange,
  searchLabels,
  handleSearchLabelsChange,
  activeOnly,
  handleActiveOnlyChange,
  isLoading = false,
  pagination,
  sortField = 'name',
  sortOrder = 'asc',
  onSortChange,
  workflowViews,
  activeWorkflowViewId,
  defaultWorkflowViewId,
  isAllWorkflowsView,
  isWorkflowViewEdited,
  areWorkflowFiltersSaved,
  canManageWorkflowViews,
  canDeleteDAGs,
  canRenameDAGs,
  workflowViewError,
  onSelectWorkflowView,
  onShowAllWorkflows,
  onResetWorkflowView,
  onSaveWorkflowView,
  onUpdateWorkflowView,
  onSetDefaultWorkflowView,
  onSetPinnedWorkflowView,
  onDeleteWorkflowView,
  onRenameWorkflowView,
  onDeleteDAGs,
  onRenameDAG,
  canPinDAG,
  onSetDAGPinned,
}: Props) {
  const { ts } = useI18n();
  const remoteNode = useRemoteNode();
  const openPage = useOpenPage();
  // A row opens the workflow page.
  const dagURL = (fileName: string) =>
    buildDAGPageURL({ fileName, remoteNode });
  const columns = useMemo(
    () =>
      canDeleteDAGs
        ? [deleteSelectionColumn, ...defaultColumns]
        : defaultColumns,
    [canDeleteDAGs]
  );
  const tableInstanceRef = useRef<ReturnType<typeof useReactTable> | null>(
    null
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [deleteSelection, setDeleteSelection] = useState<Set<string>>(
    () => new Set()
  );
  // The workflows whose recent runs are unfolded under their row.
  const [expandedActivity, setExpandedActivity] = useState<Set<string>>(
    () => new Set()
  );
  const toggleActivity = useCallback((fileName: string) => {
    setExpandedActivity((current) => {
      const next = new Set(current);
      if (!next.delete(fileName)) next.add(fileName);
      return next;
    });
  }, []);
  const openRun = (fileName: string, run: string, event: React.MouseEvent) =>
    openPage(buildDAGPageURL({ fileName, remoteNode, run }), event);
  const [deleteTargets, setDeleteTargets] = useState<
    components['schemas']['DAGFile'][] | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteFailures, setDeleteFailures] = useState<Record<string, string>>(
    {}
  );
  const [renameTarget, setRenameTarget] = useState<
    components['schemas']['DAGFile'] | null
  >(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [pendingPins, setPendingPins] = useState<Set<string>>(() => new Set());

  const togglePin = useCallback(
    async (dag: components['schemas']['DAGFile']) => {
      const { fileName } = dag;
      setPendingPins((current) => new Set(current).add(fileName));
      try {
        await onSetDAGPinned(fileName, !dag.pinned);
      } finally {
        setPendingPins((current) => {
          const next = new Set(current);
          next.delete(fileName);
          return next;
        });
      }
    },
    [onSetDAGPinned]
  );
  // A group is pinned when every workflow of it is: pinning it pins them all,
  // one after the other, and unpinning it unpins them all.
  const toggleGroupPin = useCallback(
    async (members: components['schemas']['DAGFile'][]) => {
      const pin = !members.every((dag) => dag.pinned);
      for (const dag of members) {
        if (dag.pinned === pin) continue;
        await togglePin(dag);
      }
    },
    [togglePin]
  );
  const [expanded, setExpanded] = useState<ExpandedState>(() => {
    try {
      const saved = localStorage.getItem('dagu_dag_table_expanded');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleExpandedChange = useCallback(
    (updater: Updater<ExpandedState>) => {
      setExpanded((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        localStorage.setItem('dagu_dag_table_expanded', JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const [clientSort, setClientSort] = useState<string>('');
  const [clientOrder, setClientOrder] = useState<string>('asc');

  useEffect(() => {
    const loadedFileNames = new Set(dags.map((dag) => dag.fileName));
    setDeleteSelection((current) => {
      const next = new Set(
        [...current].filter((fileName) => loadedFileNames.has(fileName))
      );
      return next.size === current.size ? current : next;
    });
  }, [dags]);

  const toggleDeleteSelection = useCallback((fileName: string) => {
    setDeleteSelection((current) => {
      const next = new Set(current);
      if (next.has(fileName)) {
        next.delete(fileName);
      } else {
        next.add(fileName);
      }
      return next;
    });
  }, []);

  const getFilteredDAGFileNames = useCallback(
    () =>
      (tableInstanceRef.current?.getFilteredRowModel().flatRows ?? [])
        .filter((row) => (row.original as Data).kind === ItemKind.DAG)
        .map((row) => (row.original as DAGRow).dag.fileName),
    []
  );

  const toggleAllDeleteSelection = useCallback(
    (checked: boolean) => {
      const filteredFileNames = getFilteredDAGFileNames();
      setDeleteSelection((current) => {
        const next = new Set(current);
        filteredFileNames.forEach((fileName) => {
          if (checked) {
            next.add(fileName);
          } else {
            next.delete(fileName);
          }
        });
        return next;
      });
    },
    [getFilteredDAGFileNames]
  );

  const getDeleteSelectionState = useCallback((): boolean | 'indeterminate' => {
    const filteredFileNames = getFilteredDAGFileNames();
    const selectedCount = filteredFileNames.filter((fileName) =>
      deleteSelection.has(fileName)
    ).length;
    if (selectedCount === 0) {
      return false;
    }
    return selectedCount === filteredFileNames.length ? true : 'indeterminate';
  }, [deleteSelection, getFilteredDAGFileNames]);

  const handleDeleteSubmit = useCallback(async () => {
    if (!deleteTargets || deleteTargets.length === 0) {
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    setDeleteFailures({});
    try {
      const results = await onDeleteDAGs(
        deleteTargets.map((dag) => dag.fileName)
      );
      const failedFileNames = new Set(
        results
          .filter((result) => result.error)
          .map((result) => result.fileName)
      );
      const deletedFileNames = new Set(
        results
          .filter((result) => !result.error)
          .map((result) => result.fileName)
      );
      setDeleteSelection(
        (current) =>
          new Set(
            [...current].filter((fileName) => !deletedFileNames.has(fileName))
          )
      );
      if (failedFileNames.size > 0) {
        setDeleteTargets(
          deleteTargets.filter((dag) => failedFileNames.has(dag.fileName))
        );
        setDeleteFailures(
          Object.fromEntries(
            results.flatMap((result) =>
              result.error ? [[result.fileName, result.error]] : []
            )
          )
        );
        setDeleteError(
          failedFileNames.size === 1
            ? 'The workflow could not be deleted. Review the error below and retry.'
            : 'Some workflows could not be deleted. Review the errors below and retry.'
        );
      } else {
        setDeleteTargets(null);
      }
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'Failed to delete workflows'
      );
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTargets, onDeleteDAGs]);

  const openRenameDAG = useCallback((dag: components['schemas']['DAGFile']) => {
    setRenameError(null);
    setRenameTarget(dag);
  }, []);

  const closeRenameDAG = useCallback(() => {
    if (isRenaming) {
      return;
    }
    setRenameTarget(null);
    setRenameError(null);
  }, [isRenaming]);

  const handleRenameSubmit = useCallback(
    async (newFileName: string) => {
      if (!renameTarget) {
        return;
      }
      setIsRenaming(true);
      setRenameError(null);
      try {
        await onRenameDAG(renameTarget.fileName, newFileName);
        setRenameTarget(null);
      } catch (error) {
        setRenameError(
          error instanceof Error ? error.message : 'Failed to rename workflow'
        );
      } finally {
        setIsRenaming(false);
      }
    },
    [onRenameDAG, renameTarget]
  );

  // Handler for client-side sorting
  const handleClientSort = (field: string, order: string) => {
    setClientSort(field);
    setClientOrder(order);
  };

  useEffect(() => {
    const nameFilter = columnFilters.find((f) => f.id === 'Name');

    // Combine searchText and searchLabels for the Name filter
    const combinedFilter =
      searchText || searchLabels.length > 0
        ? { searchText, labels: searchLabels }
        : '';
    const currentValue = nameFilter?.value || '';
    const currentFilterKey = JSON.stringify(currentValue);
    const combinedFilterKey = JSON.stringify(combinedFilter);

    let updated = false;
    const newFilters = [...columnFilters];

    if (combinedFilterKey !== currentFilterKey) {
      const idx = newFilters.findIndex((f) => f.id === 'Name');
      if (combinedFilter) {
        if (idx > -1) newFilters[idx] = { id: 'Name', value: combinedFilter };
        else newFilters.push({ id: 'Name', value: combinedFilter });
      } else if (idx > -1) {
        newFilters.splice(idx, 1);
      }
      updated = true;
    }

    if (updated) {
      setColumnFilters(newFilters);
    }
  }, [searchText, searchLabels, columnFilters]);

  // Handler for clicking a label to add it to the filter
  const handleLabelClick = useCallback(
    (label: string) => {
      const normalizedLabel = label.toLowerCase();
      if (isWorkspaceLabel(normalizedLabel)) {
        return;
      }
      if (!searchLabels.includes(normalizedLabel)) {
        handleSearchLabelsChange([...searchLabels, normalizedLabel]);
      }
    },
    [searchLabels, handleSearchLabelsChange]
  );

  // Helper function for client-side sorting comparison
  const getSortValue = useCallback(
    (
      dag: components['schemas']['DAGFile']
    ): string | components['schemas']['Status'] => {
      if (clientSort === 'LastRun') {
        return dag.latestDAGRun?.startedAt || '';
      }
      return '';
    },
    [clientSort]
  );

  const compareDags = useCallback(
    (
      a: components['schemas']['DAGFile'],
      b: components['schemas']['DAGFile']
    ): number => {
      let aValue = getSortValue(a);
      let bValue = getSortValue(b);

      if (clientOrder === 'desc') {
        [aValue, bValue] = [bValue, aValue];
      }

      if (aValue < bValue) return -1;
      if (aValue > bValue) return 1;
      return 0;
    },
    [getSortValue, clientOrder]
  );

  // Transform the flat list of DAGs into a hierarchical structure with groups.
  // Pinned DAGs lead as flat rows, unless their whole group is pinned.
  const data = useMemo(() => {
    const sortedDags = [...dags];

    if (clientSort) {
      sortedDags.sort(compareDags);
    }

    // A group whose workflows are all pinned stays a group, and leads the
    // list; any other pinned workflow leads as a flat row.
    const membersOf: { [key: string]: typeof sortedDags } = {};
    sortedDags.forEach((dag) => {
      const groupName = dag.dag.group;
      if (groupName) (membersOf[groupName] ??= []).push(dag);
    });
    const pinnedGroupNames = new Set(
      Object.entries(membersOf)
        .filter(([, members]) => members.every((dag) => dag.pinned))
        .map(([name]) => name)
    );
    const inPinnedGroup = (dag: (typeof sortedDags)[number]) =>
      !!dag.dag.group && pinnedGroupNames.has(dag.dag.group);

    const pinnedRows: Data[] = sortedDags
      .filter((dag) => dag.pinned && !inPinnedGroup(dag))
      .map((dag) => ({ kind: ItemKind.DAG, name: dag.dag.name, dag }));
    const unpinnedDags = sortedDags.filter(
      (dag) => !dag.pinned || inPinnedGroup(dag)
    );

    const groups: { [key: string]: Data } = {};
    unpinnedDags.forEach((dag) => {
      const groupName = dag.dag.group;
      if (groupName) {
        if (!groups[groupName]) {
          groups[groupName] = {
            kind: ItemKind.Group,
            name: groupName,
            subRows: [],
          };
        }
        groups[groupName].subRows!.push({
          kind: ItemKind.DAG,
          name: dag.dag.name,
          dag: dag,
        });
      }
    });

    // Sort sub-rows within groups if client sorting is active
    if (clientSort) {
      Object.values(groups).forEach((group) => {
        if (group.subRows) {
          group.subRows.sort((a, b) => {
            const aDag = (a as DAGRow).dag;
            const bDag = (b as DAGRow).dag;
            return compareDags(aDag, bDag);
          });
        }
      });
    }

    const groupRows = Object.values(groups);
    const hierarchicalData: Data[] = [
      ...pinnedRows,
      ...groupRows.filter((group) => pinnedGroupNames.has(group.name)),
      ...groupRows.filter((group) => !pinnedGroupNames.has(group.name)),
    ];
    // Add DAGs without a group
    unpinnedDags
      .filter((dag) => !dag.dag.group)
      .forEach((dag) => {
        hierarchicalData.push({
          kind: ItemKind.DAG,
          name: dag.dag.name,
          dag: dag,
        });
      });
    return hierarchicalData;
  }, [dags, clientSort, compareDags]);

  const instance = useReactTable<Data>({
    data,
    columns,
    // Use stable IDs for persistence
    getRowId: (row) =>
      row.kind === ItemKind.Group
        ? `group:${row.name}`
        : `dag:${(row as DAGRow).dag.fileName}`,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel<Data>(),
    manualSorting: true,
    getFilteredRowModel: getFilteredRowModel<Data>(),
    onColumnFiltersChange: setColumnFilters,
    getExpandedRowModel: getExpandedRowModel<Data>(),
    autoResetExpanded: false,
    state: {
      expanded,
      columnFilters,
    },
    onExpandedChange: handleExpandedChange,
    meta: {
      group,
      refreshFn,
      onLabelClick: handleLabelClick,
      getDeleteSelectionState,
      isDeleteSelected: (fileName) => deleteSelection.has(fileName),
      onToggleDeleteSelection: toggleDeleteSelection,
      onToggleAllDeleteSelection: toggleAllDeleteSelection,
      canRenameDAGs,
      onOpenRenameDAG: openRenameDAG,
      canDeleteDAGs,
      canPinDAG,
      isPinPending: (fileName) => pendingPins.has(fileName),
      onTogglePin: (dag) => void togglePin(dag),
      onToggleGroupPin: (dags) => void toggleGroupPin(dags),
      isActivityExpanded: (fileName) => expandedActivity.has(fileName),
      onToggleActivity: toggleActivity,
      onOpenRun: openRun,
    },
  });

  tableInstanceRef.current = instance as ReturnType<typeof useReactTable>;
  const pinnedRowCount = countLeadingPinnedRows(instance.getRowModel().rows);
  const filteredDAGFileNames = new Set(getFilteredDAGFileNames());
  const selectedDAGsForDelete = dags.filter(
    (dag) =>
      filteredDAGFileNames.has(dag.fileName) &&
      deleteSelection.has(dag.fileName)
  );

  const appBarContext = useContext(AppBarContext);
  const panelWidth = useContext(PanelWidthContext);

  const useCardView = panelWidth !== null && panelWidth < CARD_VIEW_THRESHOLD;
  // Whole class names, so that the style sheet keeps them.
  const activityColumn =
    panelWidth === null
      ? { cell: 'hidden xl:table-cell', col: 'hidden xl:table-column' }
      : panelWidth >= ACTIVITY_COLUMN_MIN_WIDTH
        ? { cell: '', col: '' }
        : { cell: 'hidden', col: 'hidden' };

  const { data: uniqueLabels } = useQuery('/dags/labels', {
    params: {
      query: {
        remoteNode: appBarContext?.selectedRemoteNode || 'local',
      },
    },
  });
  const availableLabels = withoutWorkspaceLabels(uniqueLabels?.labels ?? []);
  const activeWorkflowViewName = workflowViews.find(
    (view) => view.id === activeWorkflowViewId
  )?.name;
  const isPristineAllView =
    isAllWorkflowsView &&
    !searchText &&
    searchLabels.length === 0 &&
    !activeOnly;
  const emptyState = activeWorkflowViewName
    ? {
        icon: '🔍',
        heading: 'No workflows found',
        description:
          'No workflows match the “{view}” view. Try adjusting its filters or show all workflows.',
        descriptionValues: { view: activeWorkflowViewName },
      }
    : isPristineAllView
      ? {
          icon: '🌱',
          heading: 'No workflows yet',
          description: 'Create your first workflow to get started.',
        }
      : {
          icon: '🔍',
          heading: 'No workflows found',
          description:
            'There are no workflows matching your current filters. Try adjusting your search criteria or labels.',
        };

  return (
    <div className="space-y-2">
      {/* Search, Filter and Pagination Controls */}
      <div
        data-testid="workflow-controls"
        className={`mb-4 space-y-2 ${
          isLoading ? 'opacity-70 pointer-events-none' : ''
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <ViewSelector
            kind="workflow"
            views={workflowViews}
            activeViewId={activeWorkflowViewId}
            defaultViewId={defaultWorkflowViewId}
            isAllView={isAllWorkflowsView}
            isActiveViewEdited={isWorkflowViewEdited}
            filtersAlreadySaved={areWorkflowFiltersSaved}
            canManageViews={canManageWorkflowViews}
            error={workflowViewError}
            onSelectView={onSelectWorkflowView}
            onShowAll={onShowAllWorkflows}
            onResetView={onResetWorkflowView}
            onSaveView={onSaveWorkflowView}
            onUpdateView={onUpdateWorkflowView}
            onSetDefault={onSetDefaultWorkflowView}
            onSetPinned={onSetPinnedWorkflowView}
            onDeleteView={onDeleteWorkflowView}
            onRenameView={onRenameWorkflowView}
          />

          {/* Search input */}
          <I18nProps>
            <Input
              type="text"
              placeholder="Filter by workflow name..."
              value={searchText}
              onChange={(e) => handleSearchTextChange(e.target.value)}
              className="w-[200px]"
            />
          </I18nProps>
          <Button asChild variant="outline" className="px-4 font-medium">
            <Link to={buildGrepSearchUrl(searchText)}>
              <Search className="mr-1.5 h-4 w-4" />
              <I18nText text={'Grep'} />
            </Link>
          </Button>

          {/* Label filter */}
          <I18nProps>
            <LabelCombobox
              selectedLabels={searchLabels}
              onLabelsChange={handleSearchLabelsChange}
              availableLabels={availableLabels}
              placeholder="Filter by labels..."
              className="h-9 min-w-[170px] max-w-[220px]"
            />
          </I18nProps>

          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-border-strong hover:bg-muted">
            <span>
              <I18nText text={'Active only'} />
            </span>
            <I18nProps>
              <Switch
                checked={activeOnly}
                onCheckedChange={handleActiveOnlyChange}
                aria-label="Active only"
                className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
            </I18nProps>
          </label>

          {canDeleteDAGs && selectedDAGsForDelete.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => {
                setDeleteError(null);
                setDeleteFailures({});
                setDeleteTargets(selectedDAGsForDelete);
              }}
            >
              <Trash2 className="h-4 w-4" />
              <I18nText text={'Delete ('} />
              {selectedDAGsForDelete.length})
            </Button>
          )}

          {/* Pagination - pushed to right */}
          {pagination && (
            <div className="flex-shrink-0 ml-auto">
              <DAGPagination
                totalPages={pagination.totalPages}
                page={pagination.page}
                pageChange={pagination.pageChange}
                onPageLimitChange={pagination.onPageLimitChange}
                pageLimit={pagination.pageLimit}
              />
            </div>
          )}
        </div>

        {workflowViewError && (
          <p role="alert" className="text-xs text-destructive">
            {workflowViewError}
          </p>
        )}

        {useCardView && onSortChange && (
          <div className="flex flex-wrap items-center gap-2 pt-1 pl-1">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                <I18nText text={'Sort'} />
              </span>
              <Select
                value={sortField}
                onValueChange={(value) =>
                  onSortChange(
                    value,
                    value === sortField ? sortOrder : getDefaultSortOrder(value)
                  )
                }
              >
                <I18nProps>
                  <SelectTrigger
                    className="h-8 min-w-[132px] max-w-full text-xs"
                    aria-label="Sort DAG cards"
                  >
                    <I18nProps>
                      <SelectValue placeholder="Sort by">
                        <I18nText text={getCardSortLabel(sortField)} />
                      </SelectValue>
                    </I18nProps>
                  </SelectTrigger>
                </I18nProps>
                <SelectContent>
                  {cardSortOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-xs"
                    >
                      <I18nText text={option.label} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs shrink-0"
                onClick={() =>
                  onSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc')
                }
                aria-label={ts(
                  sortOrder === 'asc'
                    ? 'Switch to descending sort'
                    : 'Switch to ascending sort'
                )}
              >
                {sortOrder === 'asc' ? (
                  <ArrowUp className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5" />
                )}
                <span className="ml-1">
                  {sortOrder === 'asc' ? (
                    <I18nText text={'Asc'} />
                  ) : (
                    <I18nText text={'Desc'} />
                  )}
                </span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Table View - Hidden on mobile or when panel is narrow */}
      <div
        className={`w-full overflow-hidden ${useCardView ? 'hidden' : 'hidden md:block'}`}
      >
        <Table
          className={`w-full text-xs ${isLoading ? 'opacity-70' : ''}`}
          style={{ tableLayout: 'fixed' }}
        >
          {/* Column widths: Select 40px, Expand 32px, Name 28%, LastRun 88px, Activity auto, Schedule 220px, Actions 160px */}
          <colgroup>
            {canDeleteDAGs && <col style={{ width: '24px' }} />}
            <col style={{ width: '24px' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '88px' }} />
            <col className={activityColumn.col} />
            <col style={{ width: '220px' }} />
            <col style={{ width: '88px' }} />
            <col style={{ width: '160px' }} />
          </colgroup>
          <TableHeader>
            {instance.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={`py-1 text-muted-foreground text-xs overflow-hidden ${header.column.id === 'Select' || header.column.id === 'Pin' ? 'px-0' : header.column.id === 'Name' ? 'pl-1 pr-2' : 'px-2'} ${header.column.id === 'Activity' ? activityColumn.cell : ''}`}
                  >
                    {header.isPlaceholder ? null : (
                      <div>
                        {' '}
                        {/* Wrap header content */}
                        {columnToSortField[header.column.id] ||
                        clientSortableColumns.includes(header.column.id) ? (
                          <SortableHeader
                            column={header.column}
                            currentSort={sortField}
                            currentOrder={sortOrder}
                            onSort={onSortChange}
                            clientSort={clientSort}
                            clientOrder={clientOrder}
                            onClientSort={handleClientSort}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                          </SortableHeader>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )
                        )}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {instance.getRowModel().rows.length ? (
              instance.getRowModel().rows.map((row) => {
                // For DAG rows, make the entire row clickable
                const isDAGRow = row.original?.kind === ItemKind.DAG;
                const isDeleteSelected =
                  isDAGRow &&
                  'dag' in row.original &&
                  deleteSelection.has((row.original as DAGRow).dag.fileName);
                // Type guard to ensure we only access dag property when it exists

                const recentRunsOf =
                  isDAGRow &&
                  'dag' in row.original &&
                  expandedActivity.has((row.original as DAGRow).dag.fileName)
                    ? (row.original as DAGRow).dag.fileName
                    : null;

                return (
                  <React.Fragment key={row.id}>
                    <TableRow
                      data-state={isDeleteSelected ? 'selected' : undefined}
                      className={`text-[0.8125rem] ${
                        row.original?.kind === ItemKind.Group
                          ? 'bg-muted/50 font-semibold cursor-pointer hover:bg-muted/70'
                          : 'cursor-pointer hover:bg-muted/50'
                      } ${isDAGRow && 'dag' in row.original && (row.original as DAGRow).dag.latestDAGRun?.status === Status.Running ? 'animate-running-row' : ''} ${isDAGRow ? 'group/row' : ''}`}
                      onClick={(e) => {
                        // Handle group row clicks - toggle expanded state
                        if ((row.original as Data)?.kind === ItemKind.Group) {
                          row.toggleExpanded();
                        }
                        // Handle DAG row clicks - open the workflow page, or a new tab with Cmd/Ctrl
                        else if (isDAGRow && 'dag' in row.original) {
                          const dagRow = row.original as DAGRow;
                          openPage(dagURL(dagRow.dag.fileName), e);
                        }
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={`py-1 align-middle overflow-hidden truncate ${cell.column.id === 'Select' || cell.column.id === 'Pin' ? 'px-0' : cell.column.id === 'Name' ? 'pl-1 pr-2' : 'px-2'} ${cell.column.id === 'Activity' ? activityColumn.cell : ''}`}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                    {recentRunsOf !== null && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell
                          colSpan={instance.getVisibleLeafColumns().length}
                          className="px-2 py-1 pl-12"
                        >
                          <DAGRecentRuns fileName={recentRunsOf} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={instance.getVisibleLeafColumns().length}
                  className="h-64 text-center"
                >
                  <div className="flex flex-col items-center justify-center py-8">
                    <WorkflowsEmptyState
                      {...emptyState}
                      showAllButton={!isAllWorkflowsView}
                      onShowAllWorkflows={onShowAllWorkflows}
                    />
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Card View - Visible on mobile or when panel is narrow */}
      <div
        data-testid="workflow-card-view"
        className={`space-y-2 ${useCardView ? 'block' : 'md:hidden'}`}
      >
        {instance.getRowModel().rows.length ? (
          instance.getRowModel().rows.map((row, index) => {
            // Render group rows with collapsible header
            if (row.original?.kind === ItemKind.Group) {
              const groupRow = row.original as GroupRow;
              const isExpanded = row.getIsExpanded();

              return (
                <div key={row.id} className="space-y-1.5">
                  {/* Group Header */}
                  <div
                    className="flex items-center justify-between px-3 py-2 bg-muted/70 rounded-md border border-muted-foreground/20 cursor-pointer active:bg-muted"
                    onClick={() => row.toggleExpanded()}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex-shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground truncate">
                        {groupRow.name}
                      </span>
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-xs px-1.5 py-0 h-4 flex-shrink-0"
                    >
                      {row.subRows?.length || 0}
                    </Badge>
                  </div>

                  {/* Group Members - only shown when expanded */}
                  {isExpanded && row.subRows && row.subRows.length > 0 && (
                    <div className="space-y-1.5 pl-2 border-l-2 border-muted-foreground/20 ml-3">
                      {row.subRows.map((subRow) => {
                        if (
                          subRow.original?.kind === ItemKind.DAG &&
                          'dag' in subRow.original
                        ) {
                          const dagRow = subRow.original as DAGRow;
                          return (
                            <DAGCard
                              key={subRow.id}
                              dag={dagRow.dag}
                              href={dagURL(dagRow.dag.fileName)}
                              onOpen={(e) =>
                                openPage(dagURL(dagRow.dag.fileName), e)
                              }
                              onLabelClick={handleLabelClick}
                              refreshFn={refreshFn}
                              canDeleteDAGs={canDeleteDAGs}
                              isDeleteSelected={deleteSelection.has(
                                dagRow.dag.fileName
                              )}
                              onToggleDeleteSelection={toggleDeleteSelection}
                              canRenameDAGs={canRenameDAGs}
                              onRenameDAG={openRenameDAG}
                              canPin={canPinDAG(dagRow.dag)}
                              isPinPending={pendingPins.has(
                                dagRow.dag.fileName
                              )}
                              onTogglePin={(dag) => void togglePin(dag)}
                              className="ml-2"
                            />
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Render standalone DAG rows (not in a group)
            // Skip if this row has a parent (it's already rendered within a group)
            if (
              row.original?.kind === ItemKind.DAG &&
              'dag' in row.original &&
              row.depth === 0
            ) {
              const dagRow = row.original as DAGRow;
              const endsPinnedSection =
                index === pinnedRowCount - 1 &&
                index < instance.getRowModel().rows.length - 1;
              return (
                <React.Fragment key={row.id}>
                  <DAGCard
                    dag={dagRow.dag}
                    href={dagURL(dagRow.dag.fileName)}
                    onOpen={(e) => openPage(dagURL(dagRow.dag.fileName), e)}
                    onLabelClick={handleLabelClick}
                    refreshFn={refreshFn}
                    canDeleteDAGs={canDeleteDAGs}
                    isDeleteSelected={deleteSelection.has(dagRow.dag.fileName)}
                    onToggleDeleteSelection={toggleDeleteSelection}
                    canRenameDAGs={canRenameDAGs}
                    onRenameDAG={openRenameDAG}
                    canPin={canPinDAG(dagRow.dag)}
                    isPinPending={pendingPins.has(dagRow.dag.fileName)}
                    onTogglePin={(dag) => void togglePin(dag)}
                  />
                  {endsPinnedSection && (
                    <div className="border-t-2 border-border" />
                  )}
                </React.Fragment>
              );
            }

            return null;
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4 border rounded-md bg-card">
            <WorkflowsEmptyState
              {...emptyState}
              showAllButton={!isAllWorkflowsView}
              onShowAllWorkflows={onShowAllWorkflows}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        title={
          deleteTargets?.length === 1
            ? ts('Delete workflow?')
            : ts('Delete {count} workflows?', {
                count: deleteTargets?.length ?? 0,
              })
        }
        buttonText={ts(isDeleting ? 'Deleting...' : 'Delete')}
        visible={deleteTargets !== null}
        dismissModal={() => {
          if (!isDeleting) {
            setDeleteTargets(null);
            setDeleteError(null);
            setDeleteFailures({});
          }
        }}
        submitDisabled={isDeleting}
        onSubmit={() => void handleDeleteSubmit()}
      >
        <div className="space-y-3 text-sm">
          <p>
            {deleteTargets?.length === 1 ? (
              <I18nText
                text={'The workflow definition file will be removed.'}
              />
            ) : (
              <I18nText
                text={'The selected workflow definition files will be removed.'}
              />
            )}{' '}
            <I18nText
              text={
                'Past run history will be kept. This action cannot be undone.'
              }
            />
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2">
            {(deleteTargets ?? []).map((dag) => (
              <li key={dag.fileName} className="min-w-0">
                <div className="truncate font-medium">{dag.dag.name}</div>
                {dag.dag.name !== dag.fileName && (
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {dag.fileName}
                  </div>
                )}
                {deleteFailures[dag.fileName] && (
                  <div className="text-xs text-destructive">
                    {deleteFailures[dag.fileName]}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
        </div>
      </ConfirmDialog>

      <DAGNameInputModal
        isOpen={renameTarget !== null}
        onClose={closeRenameDAG}
        onSubmit={(newFileName) => void handleRenameSubmit(newFileName)}
        mode="rename"
        initialValue={renameTarget?.fileName ?? ''}
        isLoading={isRenaming}
        externalError={renameError}
      />
    </div>
  );
}

export default DAGTable;
