import React from 'react';
import { RefreshButton } from '@/components/ui/refresh-button';
import Title from '@/components/ui/title';
import { useI18n } from '@/i18n/I18nProvider';
import { CreateDAGButton } from '../common';
import { I18nText } from '@/i18n/I18nText';

interface DAGListHeaderProps {
  onRefresh?: () => void | Promise<void>;
  /** The workflows that match the filters, on the server. */
  resultCount?: number;
}

const DAGListHeader: React.FC<DAGListHeaderProps> = ({
  onRefresh,
  resultCount,
}) => {
  const { ts } = useI18n();
  return (
    <div className="flex flex-row items-center justify-between mb-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <Title>
          <I18nText text={'Workflows'} />
        </Title>
        {resultCount !== undefined && (
          <span
            data-testid="workflow-count"
            className="text-xs text-muted-foreground"
          >
            {ts(resultCount === 1 ? '{count} workflow' : '{count} workflows', {
              count: resultCount.toLocaleString(),
            })}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <CreateDAGButton />
        {onRefresh && <RefreshButton onRefresh={onRefresh} />}
      </div>
    </div>
  );
};

export default DAGListHeader;
