// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import type { FieldProps } from '@rjsf/utils';
import { Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/I18nProvider';
import { I18nText } from '@/i18n/I18nText';

export interface KeyValueEditorProps {
  value: Record<string, string>;
  readOnly: boolean;
  onChange(next: Record<string, string>): void;
  /** Accessible name of the editor, for example the field label. */
  label?: string;
}

interface Row {
  key: string;
  value: string;
}

function toRows(value: Record<string, string>): Row[] {
  return Object.entries(value).map(([key, item]) => ({
    key,
    value: String(item ?? ''),
  }));
}

function toObject(rows: Row[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key && !(key in result)) {
      result[key] = row.value;
    }
  }
  return result;
}

function sameObject(
  a: Record<string, string>,
  b: Record<string, string>
): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key, index) => Object.keys(b)[index] === key && a[key] === b[key]
    )
  );
}

/**
 * Rows of key and value inputs. A change is sent when an input loses the
 * focus, or at once when a row is removed. Rows with an empty key are kept
 * on screen but not sent. The rows reset when `value` changes from outside.
 */
export function KeyValueEditor({
  value,
  readOnly,
  onChange,
  label,
}: KeyValueEditorProps): ReactElement {
  const { ts } = useI18n();
  const [rows, setRows] = useState<Row[]>(() => toRows(value));
  const lastSent = useRef(value);

  useEffect(() => {
    if (!sameObject(value, lastSent.current)) {
      lastSent.current = value;
      setRows(toRows(value));
    }
  }, [value]);

  const commit = (next: Row[]) => {
    const object = toObject(next);
    if (!sameObject(object, lastSent.current)) {
      lastSent.current = object;
      onChange(object);
    }
  };

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );

  return (
    <div className="space-y-1" role="group" aria-label={label}>
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-1">
          <Input
            className="h-7 flex-1 px-2 text-xs"
            value={row.key}
            placeholder={ts('Key')}
            aria-label={ts('Key')}
            disabled={readOnly}
            onChange={(event) => update(index, { key: event.target.value })}
            onBlur={() => commit(rows)}
          />
          <Input
            className="h-7 flex-[2] px-2 text-xs"
            value={row.value}
            placeholder={ts('Value')}
            aria-label={ts('Value')}
            disabled={readOnly}
            onChange={(event) => update(index, { value: event.target.value })}
            onBlur={() => commit(rows)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={ts('Remove')}
            disabled={readOnly}
            onClick={() => {
              const next = rows.filter((_, i) => i !== index);
              setRows(next);
              commit(next);
            }}
          >
            <X />
          </Button>
        </div>
      ))}
      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() =>
            setRows((current) => [...current, { key: '', value: '' }])
          }
        >
          <Plus />
          <I18nText text="Add entry" />
        </Button>
      )}
    </div>
  );
}

function stringMap(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = typeof item === 'string' ? item : JSON.stringify(item);
  }
  return result;
}

/**
 * rjsf field for a map of strings (`additionalProperties: {type: string}`),
 * such as HTTP headers. A removed row removes its key.
 */
export function KeyValueField(props: FieldProps): ReactElement {
  const {
    formData,
    onChange,
    fieldPathId,
    disabled,
    readonly,
    schema,
    name,
    required,
  } = props;
  const label = schema.title ?? name;
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </div>
      {schema.description ? (
        <p className="text-xs text-muted-foreground">{schema.description}</p>
      ) : null}
      <KeyValueEditor
        label={label}
        value={stringMap(formData)}
        readOnly={Boolean(disabled || readonly)}
        onChange={(next) =>
          onChange(
            Object.keys(next).length > 0 ? next : undefined,
            fieldPathId.path
          )
        }
      />
    </div>
  );
}
