import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsWizard from '../../../components/common/SettingsWizard';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
} from '../../../hooks/store/createSettingsSlice';
import { getDefaultProviderSettings } from '../../../config/arenaConfig';

const buildSettings = (): AppSettings => ({
  ...DEFAULT_SETTINGS,
  commonHeaderNames: [...DEFAULT_SETTINGS.commonHeaderNames],
  arena: {
    ...DEFAULT_SETTINGS.arena,
    providers: getDefaultProviderSettings(),
    lastSelectedModels: undefined,
  },
});

const renderWizard = (settings: AppSettings = buildSettings()) => {
  const onSave = vi.fn();
  const onCancel = vi.fn();

  render(
    <SettingsWizard
      settings={settings}
      onSave={onSave}
      onCancel={onCancel}
    />,
  );

  return { onSave, onCancel };
};

describe('SettingsWizard collapsible sections', () => {
  it('renders main section labels with larger styling', () => {
    renderWizard();

    expect(screen.getByText('General Settings')).toHaveClass('text-base');
    expect(screen.getByText('Security Settings')).toHaveClass('text-base');
    expect(screen.getByText('Arena / AI Settings')).toHaveClass('text-base');
  });

  it('shows General expanded by default and Security/Arena collapsed', () => {
    renderWizard();

    const generalButton = screen.getByRole('button', { name: /General Settings/i });
    const securityButton = screen.getByRole('button', { name: /Security Settings/i });
    const arenaButton = screen.getByRole('button', { name: /Arena \/ AI Settings/i });

    expect(generalButton).toHaveAttribute('aria-expanded', 'true');
    expect(securityButton).toHaveAttribute('aria-expanded', 'false');
    expect(arenaButton).toHaveAttribute('aria-expanded', 'false');

    expect(screen.getByLabelText('Data Storage Location')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Redirects')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ignore Certificate Validation')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Default Provider')).not.toBeInTheDocument();
  });

  it('toggles Security and Arena sections via header controls', () => {
    renderWizard();

    const securityButton = screen.getByRole('button', { name: /Security Settings/i });
    fireEvent.click(securityButton);
    expect(securityButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Ignore Certificate Validation')).toBeInTheDocument();

    const arenaButton = screen.getByRole('button', { name: /Arena \/ AI Settings/i });
    fireEvent.click(arenaButton);
    expect(arenaButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Default Provider')).toBeInTheDocument();
  });

  it('collapses and re-expands General section including Request Settings fields', () => {
    renderWizard();

    const generalButton = screen.getByRole('button', { name: /General Settings/i });

    expect(screen.getByLabelText('Data Storage Location')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Redirects')).toBeInTheDocument();

    fireEvent.click(generalButton);
    expect(generalButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Data Storage Location')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Max Redirects')).not.toBeInTheDocument();

    fireEvent.click(generalButton);
    expect(generalButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Data Storage Location')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Redirects')).toBeInTheDocument();
  });
});
