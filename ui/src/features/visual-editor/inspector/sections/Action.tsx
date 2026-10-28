// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/I18nProvider';
import { I18nText } from '@/i18n/I18nText';
import type { ActionCatalogEntry, DagEditOp, StepView } from '../../contracts';
import { ActionPicker } from '../ActionPicker';
import { FieldIssues } from '../FieldIssues';
import type { SectionProps } from '../types';
import { RunEditor } from './RunEditor';

export interface ActionSectionProps extends SectionProps {
  catalog: ActionCatalogEntry[];
}

/** True when the step runs a shell command (`run:`), not an action. */
export function isRunStep(step: StepView): boolean {
  return (
    step.kind === 'run' || ('run' in step.value && !('action' in step.value))
  );
}

type Plan = { ops: DagEditOp[]; confirm: boolean; keepOps?: DagEditOp[] };

/**
 * Operations of a change of the step action. With `with` present, the user
 * confirms the removal of the parameters: `ops` apply on "Remove",
 * `keepOps` on "Keep" (no `keepOps`: "Keep" cancels the change).
 *
 * - Action A to action B: `['action'] = B`; on "Remove" also
 *   `['with'] = undefined`, then `['with'] = template.with` when the
 *   template has one. "Keep" changes the action only.
 * - Command to action B: `['run'] = undefined`, `['shell'] = undefined`
 *   when set, `['action'] = B`, `['with'] = template.with` when set.
 * - Action to command: `['action'] = undefined`, `['with'] = undefined`
 *   when set, `['run'] = ''`. "Keep" cancels.
 */
export function planActionChange(
  step: StepView,
  entry: ActionCatalogEntry
): Plan | null {
  const key = step.key;
  const set = (path: string[], value: unknown): DagEditOp => ({
    kind: 'setStepField',
    step: key,
    path,
    value,
  });
  const hasWith = step.value.with !== undefined;
  const runStep = isRunStep(step);
  const current = runStep
    ? 'run'
    : String(step.value.action ?? step.action ?? '');
  if (entry.name === current) {
    return null;
  }
  const templateWith = entry.template.with;

  if (entry.name === 'run') {
    const ops = [set(['action'], undefined)];
    if (hasWith) {
      ops.push(set(['with'], undefined));
    }
    ops.push(set(['run'], entry.template.run ?? ''));
    return { ops, confirm: hasWith };
  }
  if (runStep) {
    const ops = [set(['run'], undefined)];
    if (step.value.shell !== undefined) {
      ops.push(set(['shell'], undefined));
    }
    ops.push(set(['action'], entry.name));
    if (templateWith && !hasWith) {
      ops.push(set(['with'], templateWith));
    }
    return { ops, confirm: false };
  }
  const change = set(['action'], entry.name);
  if (!hasWith) {
    return {
      ops: templateWith ? [change, set(['with'], templateWith)] : [change],
      confirm: false,
    };
  }
  const ops = [change, set(['with'], undefined)];
  if (templateWith) {
    ops.push(set(['with'], templateWith));
  }
  return { ops, confirm: true, keepOps: [change] };
}

/**
 * "What it does" section: the action picker, and the command editor for a
 * step that runs a shell command. A step with neither an action nor a
 * command (sub-DAG call, parallel group) is edited in the YAML section.
 */
export function ActionSection(props: ActionSectionProps): ReactElement {
  const { step, readOnly, onEdit, catalog, fieldIssues } = props;
  const { ts } = useI18n();
  const [pending, setPending] = useState<Plan | null>(null);
  const runStep = isRunStep(step);
  const current = runStep
    ? 'run'
    : String(step.value.action ?? step.action ?? '');

  const apply = (ops: DagEditOp[] | undefined) => {
    setPending(null);
    if (!readOnly) {
      ops?.forEach((op) => onEdit(op));
    }
  };

  if (!runStep && !current) {
    // A sub-DAG call, a parallel group or a legacy step: a change of kind
    // here would leave the old fields in place.
    return (
      <p className="text-xs text-muted-foreground">
        <I18nText text="Edit the kind of this step in the YAML section." />
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div data-field-path="action">
        <ActionPicker
          catalog={catalog}
          current={current}
          disabled={readOnly}
          onPick={(entry) => {
            const plan = planActionChange(step, entry);
            if (!plan) {
              return;
            }
            if (plan.confirm) {
              setPending(plan);
            } else {
              apply(plan.ops);
            }
          }}
        />
        <FieldIssues issues={fieldIssues.action} />
      </div>
      {pending && (
        <div
          role="alertdialog"
          aria-label={ts('Remove the current parameters?')}
          className="flex flex-wrap items-center gap-2 rounded border border-border bg-muted/40 p-2 text-xs"
        >
          <span className="flex-1">
            <I18nText text="Remove the current parameters?" />
          </span>
          <Button
            type="button"
            size="xs"
            variant="destructive"
            onClick={() => apply(pending.ops)}
          >
            <I18nText text="Remove" />
          </Button>
          <Button
            type="button"
            size="xs"
            onClick={() => apply(pending.keepOps)}
          >
            <I18nText text="Keep" />
          </Button>
        </div>
      )}
      {runStep && <RunEditor {...props} />}
    </div>
  );
}
