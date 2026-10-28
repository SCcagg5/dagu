// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderInspectorForm } from './formHarness';

const schema = {
  type: 'object',
  properties: {
    image: { type: 'string', title: 'image' },
    pod: {
      type: 'object',
      title: 'pod',
      properties: {
        restart_policy: { type: 'string', title: 'restart_policy' },
      },
    },
  },
};

describe('CollapsibleObjectFieldTemplate', () => {
  it('renders a nested object in a closed block when it has no value', () => {
    const { container } = renderInspectorForm(schema, { image: 'alpine' });
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    expect(details?.querySelector('summary')).toHaveTextContent('pod');
    expect(screen.getByLabelText('image')).toBeInTheDocument();
  });

  it('opens the block of a nested object with a value', () => {
    const { container } = renderInspectorForm(schema, {
      pod: { restart_policy: 'Never' },
    });
    expect(container.querySelector('details')).toHaveAttribute('open');
    expect(screen.getByLabelText('restart_policy')).toHaveValue('Never');
  });
});
