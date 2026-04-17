/**
 * Tests for the ArenaChatToolbar component.
 *
 * The toolbar displays:
 *  - Back button + agent name/icon (left)
 *  - Provider / model popover, streaming toggle, context-panel toggle (right)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArenaChatToolbar } from '../../components/arena/ArenaChatToolbar';
import { AdapterProvider } from '../../hooks/useAdapter';
import { DEFAULT_ARENA_SETTINGS, getDefaultProviderSettings, ARENA_AGENT_IDS } from '../../config/arenaConfig';
import { createMockAdapter } from '../mocks/mockAdapter';

const defaultProps = {
  settings: DEFAULT_ARENA_SETTINGS,
  providerSettings: getDefaultProviderSettings(),
  onSettingsChange: vi.fn(),
  enableStreaming: true,
  onEnableStreamingChange: vi.fn(),
  onBack: vi.fn(),
  agentId: ARENA_AGENT_IDS.WAVE_CLIENT,
  showRightPane: false,
  onToggleRightPane: vi.fn(),
};

function renderToolbar(overrides: Partial<typeof defaultProps> = {}) {
  const adapter = createMockAdapter().adapter;
  return render(
    <AdapterProvider adapter={adapter}>
      <ArenaChatToolbar {...defaultProps} {...overrides} />
    </AdapterProvider>,
  );
}

describe('ArenaChatToolbar', () => {
  it('should render the toolbar with provider/model button', () => {
    renderToolbar();
    // The provider label "Google Gemini" should appear in the toolbar
    expect(screen.getByText('Google Gemini')).toBeInTheDocument();
  });

  it('should not render metadata stats (MetadataSection removed)', () => {
    renderToolbar();

    // These title-attribute spans were part of MetadataSection and are now gone
    expect(screen.queryByTitle('Messages')).toBeNull();
    expect(screen.queryByTitle('Estimated tokens')).toBeNull();
    expect(screen.queryByTitle('Session duration')).toBeNull();
  });

  it('should not render the References button', () => {
    renderToolbar();

    expect(screen.queryByText('References')).toBeNull();
    expect(screen.queryByTitle('Manage references')).toBeNull();
  });

  it('should open provider popover when provider/model button is clicked', () => {
    renderToolbar();

    const providerBtn = screen.getByText('Google Gemini');
    fireEvent.click(providerBtn);

    // Popover should now show "Provider & Model" header
    expect(screen.getByText('Provider & Model')).toBeInTheDocument();
  });
});
