// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { isMap, parseDocument } from 'yaml';
import type { DagDocModel, StepView } from '../contracts';

/**
 * YAML text of one step at column 0: the text of `step.range`, with the
 * indent of the entry (`startColumn - 1` spaces) removed from each line
 * after the first. Lines with less indent (blank lines) lose their spaces.
 */
export function stepYamlFromModel(model: DagDocModel, step: StepView): string {
  const text = model.text.slice(step.range.from, step.range.to);
  const indent = Math.max(0, step.range.startColumn - 1);
  return text
    .split('\n')
    .map((line, index) => {
      if (index === 0 || indent === 0) {
        return line;
      }
      let cut = 0;
      while (cut < indent && line[cut] === ' ') {
        cut += 1;
      }
      return line.slice(cut);
    })
    .join('\n');
}

export interface StepYamlCheck {
  ok: boolean;
  /** The parsed step when `ok`. */
  value?: Record<string, unknown>;
  /** Syntax error, with the 1-based line and column when known. */
  error?: { message: string; line?: number; column?: number };
}

/** Parses the YAML of one step; the text must hold one mapping. */
export function parseStepYaml(text: string): StepYamlCheck {
  const doc = parseDocument(text);
  const [first] = doc.errors;
  if (first) {
    const pos = first.linePos?.[0];
    // The message ends with " at line L, column C:" and a code frame.
    const message = first.message
      .split('\n')[0]!
      .replace(/ at line \d+, column \d+:?$/, '');
    return {
      ok: false,
      error: { message, line: pos?.line, column: pos?.col },
    };
  }
  if (!isMap(doc.contents)) {
    return {
      ok: false,
      error: { message: 'The step must be a YAML mapping.' },
    };
  }
  return { ok: true, value: doc.toJS() as Record<string, unknown> };
}
