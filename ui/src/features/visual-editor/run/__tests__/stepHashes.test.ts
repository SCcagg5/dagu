// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { hashText, stepHashes } from '../stepHashes';

const SPEC = `type: graph
steps:
  - id: slow
    name: slow
    run: echo slow
  - id: middle
    name: middle
    depends: [slow]
    run: echo "middle \${steps.slow.outputs.data}"
  - id: use
    name: use
    depends: [middle]
    run: echo use
  - id: other
    name: other
    run: echo other
`;

describe('hashText', () => {
  it('gives equal text the same hash and other text another', () => {
    expect(hashText('a')).toBe(hashText('a'));
    expect(hashText('a')).not.toBe(hashText('b'));
  });
});

describe('stepHashes', () => {
  it('hashes each named step', () => {
    const hashes = stepHashes(SPEC);
    expect([...hashes.keys()]).toEqual(['slow', 'middle', 'use', 'other']);
    expect(new Set(hashes.values()).size).toBe(4);
  });

  it('does not change with a comment or spacing', () => {
    const noisy = SPEC.replace(
      'run: echo slow',
      'run:   echo slow   # the slow step'
    );
    expect(stepHashes(noisy)).toEqual(stepHashes(SPEC));
  });

  it('changes for the step that changed and for the steps that need it', () => {
    const before = stepHashes(SPEC);
    const after = stepHashes(SPEC.replace('echo slow', 'echo slower'));
    expect(after.get('slow')).not.toBe(before.get('slow'));
    // middle depends on slow, and use depends on middle.
    expect(after.get('middle')).not.toBe(before.get('middle'));
    expect(after.get('use')).not.toBe(before.get('use'));
    expect(after.get('other')).toBe(before.get('other'));
  });

  it('keeps the steps before an edited step the same', () => {
    const before = stepHashes(SPEC);
    const after = stepHashes(SPEC.replace('echo use', 'echo use2'));
    expect(after.get('use')).not.toBe(before.get('use'));
    expect(after.get('slow')).toBe(before.get('slow'));
    expect(after.get('middle')).toBe(before.get('middle'));
  });

  it('follows a reference to an output when the step has no depends', () => {
    const spec = `steps:
  - id: a
    name: a
    run: echo a
  - id: b
    name: b
    run: echo \${steps.a.outputs.x}
`;
    const before = stepHashes(spec);
    const after = stepHashes(spec.replace('echo a', 'echo A'));
    expect(after.get('b')).not.toBe(before.get('b'));
  });

  it('follows the step before it in a chain', () => {
    const spec = `type: chain
steps:
  - name: a
    run: echo a
  - name: b
    run: echo b
`;
    const before = stepHashes(spec);
    const after = stepHashes(spec.replace('echo a', 'echo A'));
    expect(after.get('b')).not.toBe(before.get('b'));
  });

  it('changes every step when a top-level key changes', () => {
    const before = stepHashes(SPEC);
    const after = stepHashes(`env:\n  - X: 1\n${SPEC}`);
    for (const name of before.keys()) {
      expect(after.get(name)).not.toBe(before.get(name));
    }
  });

  it('gives no hash for a text that cannot be read', () => {
    expect(stepHashes('steps: [').size).toBe(0);
  });
});
