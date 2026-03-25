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
import { DEFAULT_ARENA_SETTINGS, getDefaultProviderSettings, ARENA_AGENT_IDS } from '../../config/arenaConfig';

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

describe('ArenaChatToolbar', () => {
  it('should render the toolbar with provider/model button', () => {
    render(<ArenaChatToolbar {...defaultProps} />);
    // The provider label "Google Gemini" should appear in the toolbar
    expect(screen.getByText('Google Gemini')).toBeInTheDocument();
    // The default model should also appear
    expect(screen.getByText('gemini-2.0-flash')).toBeInTheDocument();
  });

  it('should not render metadata stats (MetadataSection removed)', () => {
    render(<ArenaChatToolbar {...defaultProps} />);

    // These title-attribute spans were part of MetadataSection and are now gone
    expect(screen.queryByTitle('Messages')).toBeNull();
    expect(screen.queryByTitle('Estimated tokens')).toBeNull();
    expect(screen.queryByTitle('Session duration')).toBeNull();
  });

  it('should not render the References button', () => {
    render(<ArenaChatToolbar {...defaultProps} />);

    expect(screen.queryByText('References')).toBeNull();
    expect(screen.queryByTitle('Manage references')).toBeNull();
  });

  it('should open provider popover when provider/model button is clicked', () => {
    render(<ArenaChatToolbar {...defaultProps} />);

    const providerBtn = screen.getByText('Google Gemini');
    fireEvent.click(providerBtn);

    // Popover should now show "Provider & Model" header
    expect(screen.getByText('Provider & Model')).toBeInTheDocument();
  });
});
