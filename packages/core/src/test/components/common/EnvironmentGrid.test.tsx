import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EnvironmentGrid from '../../../components/common/EnvironmentGrid';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import type { Environment } from '../../../types/collection';

vi.mock('../../../components/ui/SecondaryButton', () => ({
  SecondaryButton: ({
    onClick,
    text,
    tooltip,
    disabled,
  }: {
    onClick?: () => void;
    text?: string;
    tooltip?: string;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {text ?? tooltip ?? 'Secondary button'}
    </button>
  ),
}));

vi.mock('../../../components/ui/PrimaryButton', () => ({
  PrimaryButton: ({
    onClick,
    text,
    disabled,
  }: {
    onClick?: () => void;
    text?: string;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {text ?? 'Primary button'}
    </button>
  ),
}));

vi.mock('../../../components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    title,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    title?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  ),
}));

const BASE_ENVIRONMENT: Environment = {
  id: 'env-1',
  name: 'Development',
  values: [
    {
      key: 'API_URL',
      value: 'https://api.example.com',
      type: 'default',
      enabled: true,
    },
  ],
};

function seedStore(environment: Environment): void {
  useAppStateStore.setState({
    environments: [environment],
    activeEnvironment: environment,
  });
}

function renderGrid(environment: Environment): void {
  seedStore(environment);
  render(
    <EnvironmentGrid
      environment={environment}
      onBack={vi.fn()}
      onSaveEnvironment={vi.fn()}
    />
  );
}

describe('EnvironmentGrid secret variable editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStateStore.setState({
      environments: [],
      activeEnvironment: null,
    });
  });

  it('adds a new variable as secret when the secret toggle is enabled', async () => {
    const emptyEnvironment: Environment = {
      ...BASE_ENVIRONMENT,
      values: [],
    };

    renderGrid(emptyEnvironment);

    fireEvent.click(screen.getByRole('button', { name: 'Add Variable' }));
    fireEvent.change(screen.getByPlaceholderText('Variable name'), {
      target: { value: 'API_TOKEN' },
    });
    fireEvent.change(screen.getByPlaceholderText('Value'), {
      target: { value: 'secret-token' },
    });

    const secretToggle = screen.getByLabelText('Secret variable') as HTMLInputElement;
    expect(secretToggle.checked).toBe(false);
    fireEvent.click(secretToggle);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      const values = useAppStateStore.getState().environments[0]?.values ?? [];
      expect(values).toHaveLength(1);
      expect(values[0]).toMatchObject({
        key: 'API_TOKEN',
        value: 'secret-token',
        type: 'secret',
      });
    });
  });

  it('edits an existing default variable to secret', async () => {
    renderGrid(BASE_ENVIRONMENT);

    fireEvent.click(screen.getByRole('button', { name: 'Edit variable' }));

    const secretToggle = screen.getByLabelText('Secret variable') as HTMLInputElement;
    expect(secretToggle.checked).toBe(false);
    fireEvent.click(secretToggle);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      const values = useAppStateStore.getState().environments[0]?.values ?? [];
      expect(values[0]?.type).toBe('secret');
    });

    expect(screen.getByTitle('Show value')).toBeInTheDocument();
  });

  it('edits an existing secret variable back to default', async () => {
    const secretEnvironment: Environment = {
      ...BASE_ENVIRONMENT,
      values: [
        {
          key: 'API_TOKEN',
          value: 'secret-token',
          type: 'secret',
          enabled: true,
        },
      ],
    };

    renderGrid(secretEnvironment);

    expect(screen.getByTitle('Show value')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit variable' }));

    const secretToggle = screen.getByLabelText('Secret variable') as HTMLInputElement;
    expect(secretToggle.checked).toBe(true);
    fireEvent.click(secretToggle);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      const values = useAppStateStore.getState().environments[0]?.values ?? [];
      expect(values[0]?.type).toBe('default');
    });

    expect(screen.queryByTitle('Show value')).not.toBeInTheDocument();
  });
});