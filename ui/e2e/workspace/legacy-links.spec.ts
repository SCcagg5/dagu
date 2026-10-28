// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Page } from '@playwright/test';
import {
  loadStack,
  loginViaAPI,
  startDAG,
  waitForRunStatus,
} from '../helpers/e2e';
import { expect, signIn, test } from './fixtures';

// The legacy link rules of state/legacyLinks.ts (N3) in a browser. Each old
// link carries remoteNode, and each redirect must keep it. The workspace is
// one tab, so no old link lands on a mode.

/** Waits until the page is at the path and has these query values. */
async function expectAt(
  page: Page,
  pathname: string,
  query: Record<string, string | null>
): Promise<void> {
  await expect
    .poll(
      () => {
        const url = new URL(page.url());
        const values = Object.keys(query).map(
          (key) => `${key}=${url.searchParams.get(key)}`
        );
        return [url.pathname, ...values];
      },
      { timeout: 30_000 }
    )
    .toEqual([
      pathname,
      ...Object.entries(query).map(([key, value]) => `${key}=${value}`),
    ]);
}

test.describe('workspace legacy links', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // R5. parity:shell-remote-node
  test('opens /spec on the editor and drops ?yaml', async ({
    page,
    fixtureDAG,
    gotoWorkspace,
  }) => {
    const { fileName } = await fixtureDAG('visual-params.yaml', 'e2e-ws-link');
    const base = `/dags/${encodeURIComponent(fileName)}`;

    await gotoWorkspace(page, `${base}/spec?remoteNode=local`);
    await expectAt(page, base, { remoteNode: 'local', yaml: null });
    await expect(page.getByTestId('ww-pane')).toBeVisible();
    await expect(page.getByTestId('ww-mode-tabs')).toHaveCount(0);
  });

  // R5: the old Spec tab was the YAML, so the link opens the YAML panel
  // (?ndv=docked).
  test('opens /spec as the YAML panel', async ({
    page,
    fixtureDAG,
    gotoWorkspace,
  }) => {
    const { fileName } = await fixtureDAG('visual-params.yaml', 'e2e-ws-link');
    const base = `/dags/${encodeURIComponent(fileName)}`;

    await gotoWorkspace(page, `${base}/spec?remoteNode=local`);
    await expect(page.getByTestId('ndv')).toHaveAttribute(
      'data-state',
      'docked',
      { timeout: 10_000 }
    );
    await expect(page.getByTestId('yaml-file-body')).toBeVisible({
      timeout: 10_000,
    });
  });

  // R1. parity:shell-run-redirect parity:overview-legacy-run-redirect
  test('opens /status?dagRunId on the run of the workflow page', async ({
    page,
    request,
    fixtureDAG,
    gotoWorkspace,
  }) => {
    const stack = await loadStack();
    const token = await loginViaAPI(
      request,
      stack.auth.adminUsername,
      stack.auth.adminPassword
    );
    const { fileName } = await fixtureDAG('visual-params.yaml', 'e2e-ws-link');
    const dagRunId = await startDAG(request, token, fileName);

    await gotoWorkspace(
      page,
      `/dags/${encodeURIComponent(fileName)}/status?dagRunId=${encodeURIComponent(dagRunId)}&remoteNode=local`
    );
    await expectAt(page, `/dags/${encodeURIComponent(fileName)}`, {
      run: dagRunId,
      remoteNode: 'local',
    });
  });

  // R9
  test('opens /history on the timeline of the Run panel', async ({
    page,
    request,
    fixtureDAG,
    gotoWorkspace,
  }) => {
    const stack = await loadStack();
    const token = await loginViaAPI(
      request,
      stack.auth.adminUsername,
      stack.auth.adminPassword
    );
    const { dagName, fileName } = await fixtureDAG(
      'visual-params.yaml',
      'e2e-ws-link'
    );
    // The timeline tab of the Run panel needs a run.
    const dagRunId = await startDAG(request, token, fileName);
    await waitForRunStatus(request, token, dagName, dagRunId, [
      'succeeded',
      'partially_succeeded',
    ]);
    const base = `/dags/${encodeURIComponent(fileName)}`;

    await gotoWorkspace(page, `${base}/history?remoteNode=local`);
    await expectAt(page, base, {
      view: null,
      dock: 'timeline',
      remoteNode: 'local',
    });
    await expect(page.getByTestId('ww-pane')).toBeVisible();
    await expect(page.getByTestId('ww-mode-tabs')).toHaveCount(0);
    const dock = page.getByTestId('ww-dock');
    await expect(dock).toHaveAttribute('data-state', 'open', {
      timeout: 30_000,
    });
    await expect(
      dock.getByRole('tab', { name: 'Timeline', exact: true })
    ).toHaveAttribute('aria-selected', 'true');
  });

  // R11, D6: the old Executions route redirects to the workflow route with
  // every key. The page replaces the entry, so Back leaves the workflow.
  test('redirects /executions to the workflow route', async ({
    page,
    fixtureDAG,
    gotoWorkspace,
  }) => {
    const { fileName } = await fixtureDAG('visual-params.yaml', 'e2e-ws-link');
    const base = `/dags/${encodeURIComponent(fileName)}`;

    await gotoWorkspace(
      page,
      `${base}/executions?step=prepare&remoteNode=local`
    );
    await expectAt(page, base, { step: 'prepare', remoteNode: 'local' });
    await expect(page.getByTestId('ww-pane')).toBeVisible();
    await expect(page.getByTestId('ww-mode-tabs')).toHaveCount(0);
    await page.goBack();
    expect(new URL(page.url()).pathname).not.toMatch(/\/executions$/);
  });

  // R2. parity:shell-docs-redirect parity:page-legacy-docs-redirect
  test('opens /docs as the wiki tab of the Workflow panel', async ({
    page,
    fixtureDAG,
    gotoWorkspace,
  }) => {
    const { fileName } = await fixtureDAG('visual-params.yaml', 'e2e-ws-link');
    const base = `/dags/${encodeURIComponent(fileName)}`;

    await gotoWorkspace(page, `${base}/docs?remoteNode=local`);
    await expectAt(page, base, {
      remoteNode: 'local',
      wtab: 'wiki',
      panel: null,
    });
    await expect(
      page
        .getByTestId('ww-workflow-tabs')
        .getByRole('tab', { name: 'Wiki', exact: true })
    ).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
  });
});
