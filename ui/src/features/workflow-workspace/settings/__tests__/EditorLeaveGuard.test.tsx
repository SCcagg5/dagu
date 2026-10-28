// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  useWorkspaceEditorBinding,
  WorkspaceEditorProvider,
} from '../../canvas/WorkspaceEditorContext';
import type { WorkspaceEditorState } from '../../contracts';
import { EditorLeaveGuard } from '../EditorLeaveGuard';
import { SettingsLeaveGuardProvider } from '../useSettingsLeaveGuard';

function Editor({ dirty }: { dirty: boolean }) {
  const { onEditorStateChange } = useWorkspaceEditorBinding();
  useEffect(() => {
    onEditorStateChange({ dirty } as WorkspaceEditorState);
  }, [dirty, onEditorStateChange]);
  return null;
}

function Where() {
  const { pathname } = useLocation();
  return <output data-testid="where">{pathname}</output>;
}

function Page({ dirty }: { dirty: boolean }) {
  return (
    <WorkspaceEditorProvider>
      <SettingsLeaveGuardProvider>
        <Editor dirty={dirty} />
        <EditorLeaveGuard />
        <Link to="/dags/etl/executions">in workflow</Link>
        <Link to="/dag-runs">leave</Link>
        <a href="https://example.com/x">external</a>
      </SettingsLeaveGuardProvider>
    </WorkspaceEditorProvider>
  );
}

function renderPage(dirty: boolean) {
  return render(
    <BrowserRouter>
      <Where />
      <Routes>
        <Route path="/dags/:fileName" element={<Page dirty={dirty} />} />
        <Route path="/dags/:fileName/:tab" element={<Page dirty={dirty} />} />
        <Route path="*" element={<div>elsewhere</div>} />
      </Routes>
    </BrowserRouter>
  );
}

function unloadPrevented() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/dags/etl');
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('EditorLeaveGuard', () => {
  it('asks on unload only while the draft is dirty', () => {
    const { unmount } = renderPage(false);
    expect(unloadPrevented()).toBe(false);
    unmount();
    renderPage(true);
    expect(unloadPrevented()).toBe(true);
  });

  it('asks before a link that leaves the workflow, then follows it on confirm', async () => {
    const user = userEvent.setup();
    renderPage(true);

    await user.click(screen.getByRole('link', { name: 'leave' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dags/etl');
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('The workflow has unsaved changes');

    await user.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/dag-runs')
    );
  });

  it('stays on the page when the question is cancelled', async () => {
    const user = userEvent.setup();
    renderPage(true);
    await user.click(screen.getByRole('link', { name: 'leave' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dags/etl');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('lets a link inside the workflow and a clean draft pass', async () => {
    const user = userEvent.setup();
    renderPage(true);
    await user.click(screen.getByRole('link', { name: 'in workflow' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(
      '/dags/etl/executions'
    );
  });

  it('does not ask for a clean draft', async () => {
    const user = userEvent.setup();
    renderPage(false);
    await user.click(screen.getByRole('link', { name: 'leave' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/dag-runs');
  });

  it('holds back a Back to another page and asks first', async () => {
    renderPage(true);
    // The browser went back to an entry of another page.
    act(() => {
      window.history.replaceState({ idx: 5 }, '', '/dag-runs');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // The router never saw the event, so it still shows the workflow.
    expect(screen.getByTestId('where')).toHaveTextContent('/dags/etl');
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'The workflow has unsaved changes'
    );
  });

  it('lets a Back inside the workflow pass', () => {
    renderPage(true);
    act(() => {
      window.history.replaceState({ idx: 5 }, '', '/dags/etl/executions');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByTestId('where')).toHaveTextContent(
      '/dags/etl/executions'
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
