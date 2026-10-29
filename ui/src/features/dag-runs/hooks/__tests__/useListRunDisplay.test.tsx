// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, render } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '@/api/v1/schema';
import { useListRunDisplay } from '../useListRunDisplay';

const h = vi.hoisted(() => {
  // A Request needs an absolute URL.
  (globalThis as { getConfig?: unknown }).getConfig = () => ({
    apiURL: 'http://localhost/api/v1',
    basePath: '',
    version: 'test',
  });
  return { fetch: vi.fn() };
});

vi.mock('@/lib/requestTimeout', () => ({
  fetchWithTimeout: (input: Request) => {
    return h.fetch(input.url);
  },
}));
vi.mock('@/contexts/RemoteNodeContext', () => ({
  useRemoteNode: () => 'local',
}));

const definitionFetches = () =>
  h.fetch.mock.calls.filter(([url]) => String(url).includes('/dags/'));

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'Date',
    ],
  });
  h.fetch.mockImplementation(
    async () =>
      new Response(JSON.stringify({ dag: { steps: [{}] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
  );
});

afterEach(() => {
  vi.useRealTimers();
  h.fetch.mockReset();
});

// The definition of a workflow is reused for 5 minutes and read again by the
// first row that mounts after that.
// A row of a list.
function Row() {
  useListRunDisplay('etl', 'r1', Status.Running);
  return null;
}

// The list stays mounted, as in the app: its rows mount and unmount.
function List({ rows }: { rows: number }) {
  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      {Array.from({ length: rows }, (_, i) => (
        <Row key={i} />
      ))}
    </SWRConfig>
  );
}

const settle = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

// The definition of a workflow is reused for 5 minutes and read again by the
// first row that mounts after that.
describe('useListRunDisplay definition cache', () => {
  it('reads the definition again only after the dedupe interval', async () => {
    const { rerender } = render(<List rows={3} />);
    await settle(50);
    // The three rows of one workflow share one request.
    expect(definitionFetches()).toHaveLength(1);

    rerender(<List rows={0} />);
    await settle(4 * 60_000);
    rerender(<List rows={1} />);
    await settle(50);
    expect(definitionFetches()).toHaveLength(1);

    rerender(<List rows={0} />);
    await settle(2 * 60_000);
    rerender(<List rows={1} />);
    await settle(50);
    expect(definitionFetches()).toHaveLength(2);
  });
});
