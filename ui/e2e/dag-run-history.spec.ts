// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Page, test } from '@playwright/test';
import {
  loadStack,
  loginViaAPI,
  loginViaUI,
  startDAG,
  uniqueName,
  waitForDAGAvailable,
  waitForRunStatus,
  writeLocalDAG,
} from './helpers/e2e';

// The Activity lanes select a lane's newest run on the first arrow key.
async function openNewestRunFromLane(page: Page, dagName: string) {
  const lane = page.getByRole('group', { name: new RegExp(`^${dagName}:`) });
  await lane.focus();
  await lane.press('ArrowRight');
  await lane.press('Enter');
}

// A row of a run list opens the run on its own page: no side panel. The link
// names the run on the workflow page, which sends it to the run page.
for (const view of ['list', 'grouped', 'activity'] as const) {
  test(`opens a run on its page from the ${view} view`, async ({
    page,
    request,
  }) => {
    const stack = await loadStack();
    const token = await loginViaAPI(
      request,
      stack.auth.adminUsername,
      stack.auth.adminPassword
    );
    const dagName = uniqueName(`history-${view}`);
    const fileName = await writeLocalDAG(
      dagName,
      `
name: ${dagName}
steps:
  - name: result
    run: echo history-output
    output: RESULT
`
    );
    await waitForDAGAvailable(request, token, fileName);
    const runId = await startDAG(request, token, fileName);
    await waitForRunStatus(request, token, dagName, runId, ['succeeded']);
    await loginViaUI(page, stack.auth.adminUsername, stack.auth.adminPassword);

    const runPage = `/dag-runs/${dagName}/${runId}`;

    if (view === 'activity') {
      await page.goto('/dashboard');
      await page.getByLabel('Filter workflows').fill(dagName);
      await openNewestRunFromLane(page, dagName);
    } else {
      await page.goto(`/dag-runs?name=${dagName}`);
      if (view === 'grouped') {
        await page.getByRole('button', { name: 'Grouped view' }).click();
        await page.getByText(dagName, { exact: true }).click();
        await page.getByText(runId, { exact: true }).click();
      } else {
        await page
          .getByRole('row')
          .filter({ hasText: dagName })
          .first()
          .click();
      }
    }

    await expect.poll(() => new URL(page.url()).pathname).toBe(runPage);
    await expect(page.locator('.dagRun-modal-content')).toHaveCount(0);

    if (view === 'list') {
      await page.goBack();
      await expect(page).toHaveURL(/\/dag-runs\?/);
      const [popup] = await Promise.all([
        page.context().waitForEvent('page'),
        page
          .getByRole('row')
          .filter({ hasText: dagName })
          .first()
          .click({ modifiers: ['ControlOrMeta'] }),
      ]);
      await expect.poll(() => new URL(popup.url()).pathname).toBe(runPage);
      await popup.close();
      // The list stays where it was.
      expect(new URL(page.url()).pathname).toBe('/dag-runs');
    }
  });
}
