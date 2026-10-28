// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Monaco is about 1 MB of script. The pages that show no code editor must not
// load it, so that only a short list of modules imports it with a static
// import. The editors reach it through a dynamic import (loadDAGEditor,
// MonacoField), the one place that a page decides to pay for it.
const srcRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'test'
        ? []
        : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [full]
      : [];
  });
}

// Static value imports (not `import type`) of one module specifier.
function staticImporters(match: (specifier: string) => boolean): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(srcRoot)) {
    const text = readFileSync(file, 'utf8');
    const pattern =
      /^import\s+(?!type\b)[^;]*?from\s+'([^']+)'|^import\s+'([^']+)'/gm;
    for (const m of text.matchAll(pattern)) {
      const specifier = m[1] ?? m[2];
      if (specifier !== undefined && match(specifier)) {
        found.push(path.relative(srcRoot, file));
        break;
      }
    }
  }
  return found.sort();
}

const ends = (name: string) => (specifier: string) =>
  specifier === name || specifier.endsWith(`/${name}`);

describe('modules that hold Monaco', () => {
  it('lets only the editor modules import the Monaco packages', () => {
    expect(
      staticImporters((s) =>
        ['monaco-editor', '@monaco-editor/react', 'monaco-yaml'].includes(s)
      )
    ).toEqual([
      'components/editors/MarkdownEditor.tsx',
      'features/dags/components/dag-editor/DAGEditor.tsx',
      'features/visual-editor/inspector/MonacoFieldEditor.tsx',
      'features/visual-editor/inspector/monacoSetup.ts',
      'lib/monaco-theme.ts',
      'lib/monaco-yaml.ts',
      'pages/wiki/components/WikiPageHistoryModal.tsx',
    ]);
  });

  it('keeps the code editors behind a dynamic import', () => {
    expect(staticImporters(ends('DAGEditor'))).toEqual([]);
    expect(staticImporters(ends('MonacoFieldEditor'))).toEqual([]);
  });

  it('lets only the editor modules import the Monaco setup', () => {
    expect(staticImporters(ends('monacoSetup'))).toEqual([
      'features/visual-editor/inspector/MonacoFieldEditor.tsx',
    ]);
    expect(
      staticImporters(ends('monaco-yaml')).filter(
        (f) => !f.endsWith('monaco-yaml.ts')
      )
    ).toEqual([
      'features/dags/components/dag-editor/DAGEditor.tsx',
      'features/visual-editor/inspector/monacoSetup.ts',
    ]);
  });
});
