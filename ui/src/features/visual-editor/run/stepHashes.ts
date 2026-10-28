// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ApiDAGDetails } from '../contracts';
import { parseDagDocLenient, resolveStepNames } from '../doc';
import { canonical, headOf } from './runSpecDiff';

/** A 53-bit hash of a text, in hex. It is not a security function. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// A reference to the output of another step: ${steps.<id>.outputs.<name>}.
const STEP_REFERENCE = /\$\{steps\.([A-Za-z0-9_-]+)\./g;

interface Item {
  name: string;
  id: string | undefined;
  canon: string;
  written: readonly string[];
  index: number;
}

/**
 * A hash of each step of a definition, by step name. The hash covers the
 * parsed step (comments and spacing do not count), the top-level keys of the
 * definition other than the steps, and the hashes of the steps that it needs:
 * its `depends`, the steps whose outputs it references, and in a chain the
 * step before it. A change of a step, or of a step upstream of it, gives it
 * another hash. A step that has no name stays out of the result. A text that
 * cannot be read gives an empty map, so nothing counts as fresh.
 */
export function stepHashes(
  text: string,
  details?: ApiDAGDetails
): Map<string, string> {
  const out = new Map<string, string>();
  const model = parseDagDocLenient(text);
  if (!model.ok) return out;
  const head = headOf(model);
  if (head === null) return out;
  const names = resolveStepNames(model, details).byKey;

  const items: Item[] = [];
  model.steps.forEach((step, index) => {
    const name = names[step.key] ?? step.explicitName ?? step.id;
    if (name === undefined) return;
    items.push({
      name,
      id: step.id,
      canon: canonical(step.value) + (step.broken ? `!${step.broken}` : ''),
      written: step.depends,
      index,
    });
  });
  const byName = new Map(items.map((item) => [item.name, item]));
  const byId = new Map(
    items.flatMap((item) => (item.id ? [[item.id, item] as const] : []))
  );
  const lookup = (ref: string): Item | undefined =>
    byName.get(ref) ?? byId.get(ref);

  const needs = new Map<Item, Item[]>();
  items.forEach((item, at) => {
    const found = new Set<Item>();
    for (const ref of item.written) {
      const target = lookup(ref);
      if (target && target !== item) found.add(target);
    }
    for (const match of item.canon.matchAll(STEP_REFERENCE)) {
      const target = lookup(match[1] as string);
      if (target && target !== item) found.add(target);
    }
    const previous = items[at - 1];
    if (model.dagType === 'chain' && item.written.length === 0 && previous) {
      found.add(previous);
    }
    needs.set(item, [...found]);
  });

  const memo = new Map<Item, string>();
  const visiting = new Set<Item>();
  const hashOf = (item: Item): string => {
    const known = memo.get(item);
    if (known !== undefined) return known;
    // A cycle is a fault of the definition: it hashes to a fixed text.
    if (visiting.has(item)) return 'cycle';
    visiting.add(item);
    const upstream = (needs.get(item) ?? []).map(hashOf).sort();
    visiting.delete(item);
    const hash = hashText([head, item.canon, ...upstream].join('\u0000'));
    memo.set(item, hash);
    return hash;
  };
  for (const item of items) out.set(item.name, hashOf(item));
  return out;
}
