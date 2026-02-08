/**
 * Tests for the ArenaChatToolbar component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ArenaChatToolbar from '../../components/arena/ArenaChatToolbar';
import { DEFAULT_ARENA_SETTINGS, createSessionMetadata } from '../../config/arenaConfig';
import type { ArenaSourceConfig } from '../../config/arenaConfig';

const defaultProps = {
  sources: [] as ArenaSourceConfig[],
  settings: DEFAULT_ARENA_SETTINGS,
  onSettingsChange: vi.fn(),
  onOpenSettings: vi.fn(),
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

  it('should display source pills when enabled sources are provided', () => {
    const sources: ArenaSourceConfig[] = [
      { type: 'web', label: 'MDN Web Docs', url: 'https://developer.mozilla.org', enabled: true },
      { type: 'document', label: 'My Doc', enabled: true },
    ];

    render(<ArenaChatToolbar {...defaultProps} sources={sources} />);

    expect(screen.getByText('MDN Web Docs')).toBeInTheDocument();
    expect(screen.getByText('My Doc')).toBeInTheDocument();
  });

  it('should show "No sources" when all sources are disabled', () => {
    const sources: ArenaSourceConfig[] = [
      { type: 'web', label: 'MDN Web Docs', url: 'https://developer.mozilla.org', enabled: false },
    ];

    render(<ArenaChatToolbar {...defaultProps} sources={sources} />);

    expect(screen.getByText('No sources')).toBeInTheDocument();
  });

  it('should open provider popover when provider/model button is clicked', () => {
    render(<ArenaChatToolbar {...defaultProps} />);

    const providerBtn = screen.getByText('Google Gemini');
    fireEvent.click(providerBtn);

    // Popover should now show "Provider & Model" header
    expect(screen.getByText('Provider & Model')).toBeInTheDocument();
  });
});
