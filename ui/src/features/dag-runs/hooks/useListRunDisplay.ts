// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { Status } from '@/api/v1/schema';
import { useRemoteNode } from '@/contexts/RemoteNodeContext';
import { useQuery } from '@/hooks/api';
import {
  hasContinuousStep,
  runDisplayStatus,
  summaryDisplayStatus,
  type RunDisplayStatus,
} from '@/lib/runDisplayStatus';

/** How often a running run of a list reads its steps again, in ms. */
const RUNNING_REFRESH_MS = 10_000;

/**
 * How long a list reuses the definition of a workflow, in ms: a row that
 * mounts later reads it again once this time has passed.
 */
const DEFINITION_TTL_MS = 5 * 60_000;

/**
 * The status that a list prints for a run. The summary of a run has no steps.
 * A running run can be "Healthy" only when its workflow has a continuous step,
 * so the hook reads the definition first (one request for each workflow name,
 * shared by all its rows). Only a continuous workflow, or a definition that
 * the name does not give (for example a name that differs from the file name),
 * reads the details of the run (once, and again every 10 s while it runs and
 * has a continuous step): runDisplayStatus then decides, with the failed
 * steps in view. Until the details are there, and for every run that is not
 * running, the API status stands. A definition edited after the run started
 * can hide a continuous step of that run until it ends.
 */
export function useListRunDisplay(
  name: string,
  dagRunId: string | undefined,
  status: Status | undefined
): RunDisplayStatus | undefined {
  const remoteNode = useRemoteNode();
  const running = status === Status.Running && !!dagRunId;
  const definition = useQuery(
    '/dags/{fileName}',
    running
      ? { params: { path: { fileName: name }, query: { remoteNode } } }
      : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: DEFINITION_TTL_MS,
    }
  );
  const enabled =
    running &&
    (definition.error !== undefined ||
      (definition.data !== undefined &&
        hasContinuousStep(definition.data.dag?.steps)));
  const { data } = useQuery(
    '/dag-runs/{name}/{dagRunId}',
    enabled
      ? {
          params: {
            path: { name, dagRunId: dagRunId! },
            query: { remoteNode },
          },
        }
      : null,
    {
      revalidateOnFocus: false,
      refreshInterval: (latest) =>
        hasContinuousStep(latest?.dagRunDetails.nodes?.map((node) => node.step))
          ? RUNNING_REFRESH_MS
          : 0,
    }
  );
  if (status === undefined) return undefined;
  const details = data?.dagRunDetails;
  return details && details.dagRunId === dagRunId
    ? runDisplayStatus(details)
    : summaryDisplayStatus(status, false);
}
