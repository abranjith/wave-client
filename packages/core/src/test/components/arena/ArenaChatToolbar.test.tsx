/**
 * Unit tests for ArenaChatToolbar
 *
 * Verifies the toolbar renders the back button, agent name, provider/model
 * dropdown, streaming toggle, and context-panel toggle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ArenaChatToolbar } from '../../../components/arena/ArenaChatToolbar';
import type { ArenaChatToolbarProps } from '../../../components/arena/ArenaChatToolbar';
import { getDefaultProviderSettings, ARENA_AGENT_IDS } from '../../../config/arenaConfig';
import { DEFAULT_ARENA_SETTINGS } from '../../../types/arena';

// ============================================================================
// Fixtures
// ============================================================================

const defaultProps: ArenaChatToolbarProps = {
  settings: { ...DEFAULT_ARENA_SETTINGS, provider: 'gemini', model: 'gemini-2.0-flash' },
  providerSettings: getDefaultProviderSettings(),
  onSettingsChange: vi.fn(),
  enableStreaming: true,
  onEnableStreamingChange: vi.fn(),
  onBack: vi.fn(),
  agentId: ARENA_AGENT_IDS.WAVE_CLIENT,
  showRightPane: false,
  onToggleRightPane: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// Tests
// ============================================================================

describe('ArenaChatToolbar (FEAT-015)', () => {
  it('does not render a References button', () => {
    render(<ArenaChatToolbar {...defaultProps} />);
    expect(screen.queryByTitle('Manage references')).toBeNull();
    expect(screen.queryByText('References')).toBeNull();
  });

  it('does not render MetadataSection stats (messages / tokens / duration)', () => {
    render(
      <ArenaChatToolbar
        {...defaultProps}
      />,
    );

    // These stat labels/icons were part of MetadataSection — should be gone
    expect(screen.queryByTitle('Messages')).toBeNull();
    expect(screen.queryByTitle('Estimated tokens')).toBeNull();
    expect(screen.queryByTitle('Session duration')).toBeNull();
  });

  it('renders the back button', () => {
    render(<ArenaChatToolbar {...defaultProps} />);
    expect(screen.getByLabelText('Back to agents')).toBeInTheDocument();
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(<ArenaChatToolbar {...defaultProps} onBack={onBack} />);
    fireEvent.click(screen.getByLabelText('Back to agents'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders the agent name for the current agent', () => {
    render(<ArenaChatToolbar {...defaultProps} agentId={ARENA_AGENT_IDS.WAVE_CLIENT} />);
    expect(screen.getByText('Wave Client')).toBeInTheDocument();
  });

  it('renders the context panel toggle button', () => {
    render(<ArenaChatToolbar {...defaultProps} />);
    expect(screen.getByTitle('Toggle context panel')).toBeInTheDocument();
  });

  it('calls onToggleRightPane when context panel toggle is clicked', () => {
    const onToggle = vi.fn();
    render(<ArenaChatToolbar {...defaultProps} onToggleRightPane={onToggle} />);
    fireEvent.click(screen.getByTitle('Toggle context panel'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('renders provider and model in the dropdown button', () => {
    render(<ArenaChatToolbar {...defaultProps} />);
    // Provider label and model are in separate spans
    expect(screen.getByText('Google Gemini')).toBeInTheDocument();
    expect(screen.getByText('gemini-2.0-flash')).toBeInTheDocument();
  });

  it('opens provider popover when provider button is clicked', () => {
    render(<ArenaChatToolbar {...defaultProps} />);
    // Provider & Model is shown as a button; clicking it opens the popover
    const modelText = screen.getByText(/gemini-2\.0-flash/i);
    fireEvent.click(modelText.closest('button')!);
    // The popover header should appear
    expect(screen.getByText('Provider & Model')).toBeInTheDocument();
  });

  it('calls onEnableStreamingChange when the streaming toggle is clicked', () => {
    const onToggle = vi.fn();
    render(
      <ArenaChatToolbar
        {...defaultProps}
        enableStreaming={true}
        onEnableStreamingChange={onToggle}
      />,
    );

    const toggleBtn = screen.getByTitle('Streaming enabled');
    fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('shows streaming disabled state when enableStreaming is false', () => {
    render(<ArenaChatToolbar {...defaultProps} enableStreaming={false} />);
    expect(screen.getByTitle('Streaming disabled')).toBeInTheDocument();
  });
});
