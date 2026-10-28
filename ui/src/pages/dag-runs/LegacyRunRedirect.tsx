// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { AppBarContext } from '../../contexts/AppBarContext';
import { legacyRunPageRedirectURL } from '../../features/dag-runs/lib/dagRunUrls';

/**
 * The route /dag-runs/:name/:dagRunId. The run page is the workflow page
 * with ?run now, so an old link or bookmark redirects there.
 */
export default function LegacyRunRedirect(): React.ReactElement {
  const { name = '', dagRunId = 'latest' } = useParams();
  const location = useLocation();
  const appBarRemoteNode = React.useContext(AppBarContext).selectedRemoteNode;
  const to = legacyRunPageRedirectURL(
    name,
    dagRunId,
    new URLSearchParams(location.search),
    appBarRemoteNode?.trim() || 'local'
  );
  return <Navigate to={to} replace />;
}
