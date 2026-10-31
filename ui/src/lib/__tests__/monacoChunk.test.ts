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

// The specifiers of static value imports and re-exports (not `import type`
// or `export type`): a barrel that re-exports a module loads it too.
function staticSpecifiers(text: string): string[] {
  const pattern =
    /^(?:import|export)\s+(?!type\b)[^;]*?from\s+(['"])([^'"]+)\1|^import\s+(['"])([^'"]+)\3/gm;
  return [...text.matchAll(pattern)].flatMap((m) => m[2] ?? m[4] ?? []);
}

function staticImporters(match: (specifier: string) => boolean): string[] {
  return sourceFiles(srcRoot)
    .filter((file) => staticSpecifiers(readFileSync(file, 'utf8')).some(match))
    .map((file) => path.relative(srcRoot, file))
    .sort();
}

const ends = (name: string) => (specifier: string) =>
  specifier === name || specifier.endsWith(`/${name}`);

describe('staticSpecifiers', () => {
  it('reads both quote styles and re-exports, and skips type-only lines', () => {
    const text = [
      'import * as monaco from "monaco-editor";',
      "import 'monaco-yaml';",
      "export { DAGEditor } from './DAGEditor';",
      'export * from "./MonacoFieldEditor";',
      "import type { editor } from 'monaco-editor';",
      "export type { Props } from './types';",
    ].join('\n');
    expect(staticSpecifiers(text)).toEqual([
      'monaco-editor',
      'monaco-yaml',
      './DAGEditor',
      './MonacoFieldEditor',
    ]);
  });
});

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
