/**
 * Tests for the ArenaChatToolbar component — updated for FEAT-015.
 *
 * The toolbar now displays:
 *  - A provider / model popover (left)
 *  - A streaming toggle (centre)
 *  - A ContextCircle showing context-window usage (right)
 *
 * The References button and MetadataSection have been removed.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ArenaChatToolbar from '../../components/arena/ArenaChatToolbar';
import { DEFAULT_ARENA_SETTINGS, getDefaultProviderSettings } from '../../config/arenaConfig';

const defaultProps = {
  settings: DEFAULT_ARENA_SETTINGS,
  providerSettings: getDefaultProviderSettings(),
  contextWords: 0,
  onSettingsChange: vi.fn(),
  onOpenSettings: vi.fn(),
  enableStreaming: true,
  onEnableStreamingChange: vi.fn(),
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

  it('should render ContextCircle with the provided contextWords', () => {
    // 75 000 / 150 000 = 50 %
    render(<ArenaChatToolbar {...defaultProps} contextWords={75_000} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('should open provider popover when provider/model button is clicked', () => {
    render(<ArenaChatToolbar {...defaultProps} />);

    const providerBtn = screen.getByText('Google Gemini');
    fireEvent.click(providerBtn);

    // Popover should now show "Provider & Model" header
    expect(screen.getByText('Provider & Model')).toBeInTheDocument();
  });
});
