/**
 * Unit tests for ArenaChatToolbar — FEAT-015 TASK-002
 *
 * Verifies the toolbar renders without the References button and
 * MetadataSection, displays the ContextCircle with the supplied word count,
 * and that the provider/model dropdown and streaming toggle still work.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ArenaChatToolbar } from '../../../components/arena/ArenaChatToolbar';
import type { ArenaChatToolbarProps } from '../../../components/arena/ArenaChatToolbar';
import { getDefaultProviderSettings } from '../../../config/arenaConfig';
import { DEFAULT_ARENA_SETTINGS } from '../../../types/arena';

// ============================================================================
// Fixtures
// ============================================================================

const defaultProps: ArenaChatToolbarProps = {
  settings: { ...DEFAULT_ARENA_SETTINGS, provider: 'gemini', model: 'gemini-2.0-flash' },
  providerSettings: getDefaultProviderSettings(),
  contextWords: 0,
  onSettingsChange: vi.fn(),
  enableStreaming: true,
  onEnableStreamingChange: vi.fn(),
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

  it('renders ContextCircle showing the provided contextWords percentage', () => {
    // 75 000 / 150 000 = 50%
    render(<ArenaChatToolbar {...defaultProps} contextWords={75_000} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders ContextCircle at 0% when contextWords is 0', () => {
    render(<ArenaChatToolbar {...defaultProps} contextWords={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('uses contextBudget when provided for the context circle', () => {
    // 25 000 / 50 000 = 50%
    render(
      <ArenaChatToolbar {...defaultProps} contextWords={25_000} contextBudget={50_000} />,
    );
    expect(screen.getByText('50%')).toBeInTheDocument();
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
