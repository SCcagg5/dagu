// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { lineDiffStats } from '../lineDiffStats';

describe('lineDiffStats', () => {
  it('returns zero for equal texts', () => {
    expect(lineDiffStats('a\nb\n', 'a\nb\n')).toEqual({ added: 0, removed: 0 });
    expect(lineDiffStats('', '')).toEqual({ added: 0, removed: 0 });
  });

  it('counts added lines', () => {
    expect(lineDiffStats('a\nc\n', 'a\nb\nc\n')).toEqual({
      added: 1,
      removed: 0,
    });
  });

  it('counts removed lines', () => {
    expect(lineDiffStats('a\nb\nc\n', 'a\nc\n')).toEqual({
      added: 0,
      removed: 1,
    });
  });

  it('counts a changed line as one removed and one added', () => {
    expect(lineDiffStats('a\nb\nc\n', 'a\nx\nc\n')).toEqual({
      added: 1,
      removed: 1,
    });
  });

  it('handles interleaved changes', () => {
    expect(lineDiffStats('a\nb\nc\nd\ne\n', 'a\nc\nx\ne\ny\n')).toEqual({
      added: 2,
      removed: 2,
    });
  });

  it('handles empty sides', () => {
    expect(lineDiffStats('', 'a\nb\n')).toEqual({ added: 2, removed: 0 });
    expect(lineDiffStats('a\nb\n', '')).toEqual({ added: 0, removed: 2 });
  });

  it('ignores the final line end and CRLF', () => {
    expect(lineDiffStats('a\nb', 'a\r\nb\r\n')).toEqual({
      added: 0,
      removed: 0,
    });
  });

  it('falls back to an upper bound on very large middles', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`);
    const r = lineDiffStats(
      ['h', ...a, 't'].join('\n'),
      ['h', ...b, 't'].join('\n')
    );
    expect(r).toEqual({ added: 3000, removed: 3000 });
  });
});
