// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  inputLabel,
  OUTPUTS_FROM_PREFIX,
  type InputProvenance,
} from './inputProvenance';

export { outputsFromRunId } from './inputProvenance';

// Label that marks every run started from the visual editor.
export const EDITOR_RUN_LABEL = 'dagu.source=editor';

export interface StepRunOptions {
  /** Server names of the steps to run, in order. */
  steps: string[];
  /** The main source: the server carries the outputs and the work directory from it. */
  outputsFromRunId?: string;
  /**
   * The run of each reused previous step that has one of its own, by step
   * name (`outputsFromRuns`). The server reads the outputs from that run. The
   * browser never sends a value: no `outputs` key is ever in a request.
   */
  outputsFromRuns?: Readonly<Record<string, string>>;
  /**
   * The reused previous steps and where their outputs come from. The server
   * keeps the source of each one (`reusedInputs`); only a step that changed
   * since its source run is written as a `dagu.input` label (see
   * `inputLabel`), which the record of the server lacks.
   */
  reused?: readonly InputProvenance[];
  /** The run leaves no trace. The server allows it only with `steps`. */
  ephemeral?: boolean;
}

export function buildStartBody(step?: StepRunOptions) {
  return {
    ...stepFields(step),
    labels: runLabels(step),
  };
}

export function buildDraftBody(
  spec: string,
  name: string,
  step?: StepRunOptions
) {
  return {
    spec,
    name,
    ...stepFields(step),
    labels: runLabels(step),
  };
}

// An absent reuse run id, no run of a step and a false ephemeral flag must
// leave no key in the body.
function stepFields(step?: StepRunOptions) {
  if (!step) return {};
  return {
    steps: step.steps,
    ...(step.outputsFromRunId
      ? { outputsFromRunId: step.outputsFromRunId }
      : {}),
    ...(step.outputsFromRuns && Object.keys(step.outputsFromRuns).length > 0
      ? { outputsFromRuns: { ...step.outputsFromRuns } }
      : {}),
    ...(step.ephemeral ? { ephemeral: true } : {}),
  };
}

function runLabels(step?: StepRunOptions): string[] {
  return [
    EDITOR_RUN_LABEL,
    ...(step?.outputsFromRunId
      ? [`${OUTPUTS_FROM_PREFIX}${step.outputsFromRunId}`]
      : []),
    ...(step?.reused ?? [])
      .filter((reused) => reused.stale)
      .flatMap((reused) => inputLabel(reused) ?? []),
  ];
}
