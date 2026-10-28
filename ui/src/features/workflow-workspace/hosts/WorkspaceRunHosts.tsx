// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  SubRunOpenProvider,
  SubRunStackModal,
  type SubRunStackEntry,
} from '@/features/dags/components/common/SubRunStackModal';
import { RootDAGRunContext } from '@/features/dags/contexts/RootDAGRunContext';
import { WorkspaceDataContext } from '../data/context';
import type { WorkspaceRunValue } from '../data/types';

const noop = () => undefined;

/**
 * Hosts the sub-run stack and the RootDAGRunContext of the selected run for
 * the whole workspace, as DAGStatus and the page do in classic mode. Without
 * WorkspaceDataProvider it renders the children unchanged.
 */
export function WorkspaceRunHosts({ children }: { children: ReactNode }) {
  const data = useContext(WorkspaceDataContext);
  if (!data) return <>{children}</>;
  return <RunHosts run={data.run}>{children}</RunHosts>;
}

function RunHosts({
  run,
  children,
}: {
  run: WorkspaceRunValue;
  children: ReactNode;
}) {
  const runId = run.ref?.runId ?? null;
  const [stack, setStack] = useState<SubRunStackEntry[]>([]);
  const [stackRunId, setStackRunId] = useState(runId);
  // A child run belongs to the run it was opened from.
  if (stackRunId !== runId) {
    setStackRunId(runId);
    setStack([]);
  }

  const open = useCallback((entry: SubRunStackEntry) => {
    setStack((prev) => [...prev, entry]);
  }, []);

  const details = run.details;
  // The URL owns the selection, so consumers cannot change it.
  const root = useMemo(
    () => ({ data: details ?? undefined, setData: noop }),
    [details]
  );

  return (
    <RootDAGRunContext.Provider value={root}>
      <SubRunOpenProvider value={open}>
        {children}
        {details && stack.length > 0 && (
          <SubRunStackModal
            rootName={details.rootDAGRunName || details.name}
            rootDAGRunId={details.rootDAGRunId || details.dagRunId}
            rootLabel={details.name}
            stack={stack}
            onChange={setStack}
          />
        )}
      </SubRunOpenProvider>
    </RootDAGRunContext.Provider>
  );
}
