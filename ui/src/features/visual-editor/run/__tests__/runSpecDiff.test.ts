// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { diffRunSpec, normalizeSpec, specTextDiffers } from '../runSpecDiff';

const BASE = `name: demo
env:
  - A=1
steps:
  - name: fetch
    run: curl example.com
  - name: parse
    run: jq . file
    depends: [fetch]
  - name: store
    run: cp out dest
    depends: [parse]
`;

describe('diffRunSpec', () => {
  it('finds no difference in equal texts', () => {
    const diff = diffRunSpec(BASE, BASE);
    expect(diff.headChanged).toBe(false);
    expect([...diff.changed]).toEqual([]);
    expect([...diff.removedFromLive]).toEqual([]);
    expect([...diff.addedInLive]).toEqual([]);
  });

  it('ignores comments, indentation and key order', () => {
    const live = `# a comment
name: demo
env: [A=1]
steps:
    - name: fetch   # fetch the page
      run: curl example.com

    - run: jq . file
      name: parse
      depends: [fetch]
    - name: store
      run: cp out dest
      depends:
        - parse
`;
    const diff = diffRunSpec(BASE, live);
    expect(diff.headChanged).toBe(false);
    expect([...diff.changed]).toEqual([]);
  });

  it('marks a step whose run changed', () => {
    const diff = diffRunSpec(BASE, BASE.replace('jq . file', 'jq .items file'));
    expect([...diff.changed]).toEqual(['parse']);
    expect(diff.headChanged).toBe(false);
  });

  it('marks a step whose depends changed', () => {
    const diff = diffRunSpec(
      BASE,
      BASE.replace('depends: [parse]', 'depends: [fetch]')
    );
    expect([...diff.changed]).toEqual(['store']);
  });

  it('marks a change of the head', () => {
    expect(diffRunSpec(BASE, BASE.replace('A=1', 'A=2')).headChanged).toBe(
      true
    );
    expect(
      diffRunSpec(BASE, BASE.replace('name: demo', 'name: other')).headChanged
    ).toBe(true);
  });

  it('does not count a handler as the head', () => {
    const withHandler = `${BASE}handler_on:
  failure:
    run: echo failed
`;
    const changed = withHandler.replace('echo failed', 'echo broken');
    const diff = diffRunSpec(withHandler, changed);
    expect(diff.headChanged).toBe(false);
    expect([...diff.changed]).toEqual([]);
  });

  it('lists added and removed steps', () => {
    const live = BASE.replace('name: store', 'name: save');
    const diff = diffRunSpec(BASE, live);
    expect([...diff.removedFromLive]).toEqual(['store']);
    expect([...diff.addedInLive]).toEqual(['save']);
  });

  it('matches a shorthand step with its explicit form', () => {
    const before = 'steps:\n  - name: a\n    run: echo x\n';
    const after = 'steps:\n  - {name: a, run: echo x}\n';
    expect([...diffRunSpec(before, after).changed]).toEqual([]);
  });

  it('gives headChanged for a text that cannot be read', () => {
    expect(diffRunSpec(BASE, 'name: [\n').headChanged).toBe(true);
    expect(diffRunSpec('name: [\n', BASE).headChanged).toBe(true);
  });

  it('names an unnamed step with the names of the server', () => {
    const before = 'steps:\n  - run: echo one\n  - run: echo two\n';
    const after = 'steps:\n  - run: echo one\n  - run: echo 2\n';
    const details = {
      name: 'demo',
      steps: [{ name: 'cmd_1' }, { name: 'cmd_2' }],
    } as never;
    const diff = diffRunSpec(before, after, {
      snapshot: details,
      live: details,
    });
    expect([...diff.changed]).toEqual(['cmd_2']);
  });
});

describe('normalizeSpec', () => {
  it('removes carriage returns and trailing blanks', () => {
    expect(normalizeSpec('a\r\nb\n\n')).toBe('a\nb');
    expect(specTextDiffers('a\r\nb\n', 'a\nb')).toBe(false);
    expect(specTextDiffers('a', 'b')).toBe(true);
  });
});
