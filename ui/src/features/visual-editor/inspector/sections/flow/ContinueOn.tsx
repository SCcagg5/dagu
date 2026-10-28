// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ReactElement } from 'react';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n/I18nProvider';
import { I18nText } from '@/i18n/I18nText';
import { FieldIssues } from '../../FieldIssues';
import type { SectionProps } from '../../types';

const SWITCHES = [
  ['failure', 'Continue on failure'],
  ['skipped', 'Continue when skipped'],
  ['mark_success', 'Mark as success'],
] as const;

/** Object form of `continue_on`; the shorthand `failed`/`skipped` becomes its object. */
export function continueOnObject(value: unknown): Record<string, unknown> {
  if (value === 'failed') {
    return { failure: true };
  }
  if (value === 'skipped') {
    return { skipped: true };
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Switches of `continue_on`. On the object form each switch sets or
 * removes its key. On the string shorthand a change replaces the value
 * with the equivalent object.
 */
export function ContinueOn({
  step,
  readOnly,
  onEdit,
  fieldIssues,
}: SectionProps): ReactElement {
  const { ts } = useI18n();
  const value = step.value.continue_on;
  const object = continueOnObject(value);
  const toggle = (key: string, checked: boolean) => {
    if (typeof value === 'string') {
      const next = { ...object, [key]: checked || undefined };
      Object.keys(next).forEach((k) => next[k] === undefined && delete next[k]);
      onEdit({
        kind: 'setStepField',
        step: step.key,
        path: ['continue_on'],
        value: Object.keys(next).length > 0 ? next : undefined,
      });
      return;
    }
    onEdit({
      kind: 'setStepField',
      step: step.key,
      path: ['continue_on', key],
      value: checked ? true : undefined,
    });
  };
  return (
    <div className="space-y-1" data-field-path="continue_on">
      {SWITCHES.map(([key, label]) => (
        <label
          key={key}
          className="flex items-center justify-between gap-2 text-xs"
        >
          <I18nText text={label} />
          <Switch
            aria-label={ts(label)}
            checked={object[key] === true}
            disabled={readOnly}
            onCheckedChange={(checked) => toggle(key, checked)}
          />
        </label>
      ))}
      <FieldIssues issues={fieldIssues.continue_on} />
    </div>
  );
}
