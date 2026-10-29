// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { defineMessages } from './define';

// The workflow list: the strip of the runs of the last 24 hours and the list
// of the recent runs under a workflow.
export default defineMessages({
  en: {
    'Runs in the last 24 hours': 'Runs in the last 24 hours',
    '1 run in the last 24 hours': '1 run in the last 24 hours',
    '{count} runs in the last 24 hours': '{count} runs in the last 24 hours',
    '{count}+ runs in the last 24 hours': '{count}+ runs in the last 24 hours',
    'Show recent runs': 'Show recent runs',
    'Hide recent runs': 'Hide recent runs',
    'Recent runs of {name}': 'Recent runs of {name}',
    'Open the workflow': 'Open the workflow',
    'Could not load the recent runs': 'Could not load the recent runs',
    '{own} + {cached} cached': '{own} + {cached} cached',
    'queued {time}': 'queued {time}',
  },
  'zh-CN': {
    'Runs in the last 24 hours': '过去 24 小时内的运行',
    '1 run in the last 24 hours': '过去 24 小时内有 1 次运行',
    '{count} runs in the last 24 hours': '过去 24 小时内有 {count} 次运行',
    '{count}+ runs in the last 24 hours': '过去 24 小时内有 {count} 次以上运行',
    'Show recent runs': '显示最近的运行',
    'Hide recent runs': '隐藏最近的运行',
    'Recent runs of {name}': '{name} 的最近运行',
    'Open the workflow': '打开工作流',
    'Could not load the recent runs': '无法加载最近的运行',
    '{own} + {cached} cached': '{own} + 缓存 {cached}',
    'queued {time}': '排队 {time}',
  },
  ja: {
    'Runs in the last 24 hours': '過去 24 時間の実行',
    '1 run in the last 24 hours': '過去 24 時間に 1 件の実行',
    '{count} runs in the last 24 hours': '過去 24 時間に {count} 件の実行',
    '{count}+ runs in the last 24 hours': '過去 24 時間に {count} 件以上の実行',
    'Show recent runs': '最近の実行を表示',
    'Hide recent runs': '最近の実行を隠す',
    'Recent runs of {name}': '{name} の最近の実行',
    'Open the workflow': 'ワークフローを開く',
    'Could not load the recent runs': '最近の実行を読み込めませんでした',
    '{own} + {cached} cached': '{own} + キャッシュ {cached}',
    'queued {time}': '待機 {time}',
  },
});
