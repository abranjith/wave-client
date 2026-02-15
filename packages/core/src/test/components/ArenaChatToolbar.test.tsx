/**
 * Tests for the ArenaChatToolbar component.
 *
 * The toolbar displays:
 *  - A "References" icon button (BookOpen) with a badge showing the enabled-reference count
 *  - A provider / model popover
 *  - Metadata stats (messages, tokens) when a session is active
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ArenaChatToolbar from '../../components/arena/ArenaChatToolbar';
import { DEFAULT_ARENA_SETTINGS, createSessionMetadata, getDefaultProviderSettings } from '../../config/arenaConfig';

const defaultProps = {
  referenceCount: 0,
  onOpenReferences: vi.fn(),
  settings: DEFAULT_ARENA_SETTINGS,
  providerSettings: getDefaultProviderSettings(),
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

  it('should show metadata stats when provided', () => {
    const metadata = createSessionMetadata('gemini', 'gemini-2.0-flash');
    metadata.messageCount = 5;
    metadata.totalTokenCount = 1234;

    render(
      <ArenaChatToolbar
        {...defaultProps}
        metadata={metadata}
      />,
    );

    // Metadata renders the bare numbers — check by title attributes
    expect(screen.getByTitle('Messages')).toBeInTheDocument();
    expect(screen.getByTitle('Estimated tokens')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('should display the References button with the enabled count badge', () => {
    render(<ArenaChatToolbar {...defaultProps} referenceCount={3} />);

    // The badge should show the count and the label "References" should be visible
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('References')).toBeInTheDocument();
  });

  it('should call onOpenReferences when the References button is clicked', () => {
    const onOpenReferences = vi.fn();
    render(
      <ArenaChatToolbar {...defaultProps} onOpenReferences={onOpenReferences} />,
    );

    const referencesBtn = screen.getByText('References');
    fireEvent.click(referencesBtn);

    expect(onOpenReferences).toHaveBeenCalledOnce();
  });

  it('should open provider popover when provider/model button is clicked', () => {
    render(<ArenaChatToolbar {...defaultProps} />);

    const providerBtn = screen.getByText('Google Gemini');
    fireEvent.click(providerBtn);

    // Popover should now show "Provider & Model" header
    expect(screen.getByText('Provider & Model')).toBeInTheDocument();
  });
});
