// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { Webhook } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { components } from '@/api/v1/schema';
import ConfirmModal from '@/components/ui/confirm-dialog';
import { useErrorModal } from '@/components/ui/error-modal';
import { Switch } from '@/components/ui/switch';
import { useCanManageWebhooks } from '@/contexts/AuthContext';
import { useConfig } from '@/contexts/ConfigContext';
import { useRemoteNode } from '@/contexts/RemoteNodeContext';
import { useClient, useQuery } from '@/hooks/api';
import { whenEnabled } from '@/hooks/queryUtils';
import { I18nProps } from '@/i18n/I18nProps';
import { useI18n } from '@/i18n/I18nProvider';
import LiveSwitch from '../common/LiveSwitch';
import { ScheduleLine, WebhookIndicator } from './ScheduleSummary';

type DAGFile = components['schemas']['DAGFile'];

/**
 * The schedule of a workflow with its switch (the suspension of the workflow)
 * and the next run; a dash without a schedule.
 */
export function ScheduleCell({
  dag,
  refresh,
}: {
  dag: DAGFile;
  refresh?: () => void;
}) {
  const hasSchedule = (dag.dag.schedule ?? []).length > 0;
  if (!hasSchedule) {
    return (
      <span
        data-testid="schedule-cell"
        className="text-xs text-muted-foreground"
      >
        -
      </span>
    );
  }
  return (
    <span
      data-testid="schedule-cell"
      onClick={(event) => event.stopPropagation()}
      className="flex min-w-0 items-center gap-1 text-xs"
    >
      <LiveSwitch dag={dag} refresh={refresh} />
      <ScheduleLine dag={dag} emptyLabel={false} indicator={false} />
    </span>
  );
}

/** The webhook of a workflow with its switch; a dash without a webhook. */
export function WebhookCell({ dag }: { dag: DAGFile }) {
  return (
    <div data-testid="webhook-cell" className="flex items-center text-xs">
      <WebhookSwitch dag={dag} />
    </div>
  );
}

/**
 * The switch of the webhook of a workflow. It shows only with a webhook and
 * the right to manage webhooks on the local server; a reader sees the marker
 * of the webhook without a switch.
 */
function WebhookSwitch({ dag }: { dag: DAGFile }) {
  const { ts } = useI18n();
  const config = useConfig();
  const client = useClient();
  const { showError } = useErrorModal();
  const canManage = useCanManageWebhooks();
  const remoteNode = useRemoteNode();
  // The read gate is local: a remote node can refuse it with a 401, which
  // signs the user out of the local server.
  const enabled = canManage && remoteNode === 'local';
  const init = useMemo(
    () => whenEnabled(enabled, { params: { query: { remoteNode } } }),
    [enabled, remoteNode]
  );
  const { data, mutate } = useQuery('/webhooks', init);
  const [pending, setPending] = useState<boolean | null>(null);
  const webhook = Array.isArray(data?.webhooks)
    ? data.webhooks.find((item) => item.dagName === dag.fileName)
    : undefined;

  const confirm = useCallback(async () => {
    const next = pending;
    setPending(null);
    if (next === null) return;
    const { error } = await client.POST('/dags/{fileName}/webhook/toggle', {
      params: { path: { fileName: dag.fileName }, query: { remoteNode } },
      body: { enabled: next },
    });
    if (error) {
      showError(
        error.message || ts('Could not update the webhook'),
        ts('Please try again or check the server connection.')
      );
      return;
    }
    await mutate();
  }, [client, dag.fileName, mutate, pending, remoteNode, showError, ts]);

  if (!enabled || !webhook) {
    return webhook ? (
      <WebhookIndicator fileName={dag.fileName} />
    ) : (
      <span className="text-muted-foreground">-</span>
    );
  }
  const name = dag.dag.name;
  const canToggle = config.permissions.runDags;
  return (
    <span
      onClick={(event) => event.stopPropagation()}
      className="flex shrink-0 items-center gap-1"
    >
      <Switch
        data-testid="webhook-switch"
        checked={webhook.enabled}
        disabled={!canToggle}
        onCheckedChange={canToggle ? (value) => setPending(value) : undefined}
        aria-label={ts('Webhook of {name}', { name })}
      />
      <Webhook aria-hidden="true" className="size-3.5 text-muted-foreground" />
      <I18nProps>
        <ConfirmModal
          title={pending ? 'Enable webhook' : 'Disable webhook'}
          buttonText={pending ? 'Enable' : 'Disable'}
          visible={pending !== null}
          dismissModal={() => setPending(null)}
          onSubmit={() => void confirm()}
        >
          <p>
            {ts('Are you sure you want to {action} the webhook for "{name}"?', {
              action: ts(pending ? 'enable' : 'disable'),
              name: dag.fileName,
            })}
          </p>
        </ConfirmModal>
      </I18nProps>
    </span>
  );
}
