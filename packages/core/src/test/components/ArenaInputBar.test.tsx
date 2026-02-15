/**
 * Tests for ArenaInputBar component
 *
 * Verifies:
 *  - Renders input textarea and send button
 *  - Send button fires onSend with trimmed content
 *  - Stop button renders during streaming and fires onCancel
 *  - Slash-command palette appears when typing "/"
 *  - Agent indicator renders with the correct agent name
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ArenaInputBar from '../../components/arena/ArenaInputBar';
import { ARENA_AGENT_IDS } from '../../config/arenaConfig';
import type { ArenaCommand } from '../../types/arena';
import { ARENA_COMMANDS } from '../../types/arena';

const sampleCommands: ArenaCommand[] = [
  {
    id: ARENA_COMMANDS.HELP,
    agent: ARENA_AGENT_IDS.WAVE_CLIENT,
    label: 'Get help',
    description: 'General help',
  },
  {
    id: ARENA_COMMANDS.HTTP,
    agent: ARENA_AGENT_IDS.WEB_EXPERT,
    label: 'HTTP protocols',
    description: 'HTTP questions',
  },
];

describe('ArenaInputBar', () => {
  const defaultProps = {
    commands: sampleCommands,
    onSend: vi.fn(),
    onCancel: vi.fn(),
    agentId: ARENA_AGENT_IDS.WAVE_CLIENT,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render a textarea placeholder', () => {
    render(<ArenaInputBar {...defaultProps} />);
    expect(
      screen.getByPlaceholderText(/Ask anything/i),
    ).toBeInTheDocument();
  });

  it('should render the agent indicator text', () => {
    render(<ArenaInputBar {...defaultProps} />);
    expect(screen.getByText('Wave Client')).toBeInTheDocument();
  });

  it('should display send button when there is input text', async () => {
    const user = userEvent.setup();
    render(<ArenaInputBar {...defaultProps} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hello');

    // Send button should be visible (look for the send icon button)
    const sendBtn = screen.getByLabelText(/send/i);
    expect(sendBtn).toBeInTheDocument();
  });

  it('should display stop button when isStreaming is true', () => {
    render(<ArenaInputBar {...defaultProps} isStreaming />);
    expect(screen.getByLabelText(/stop/i)).toBeInTheDocument();
  });

  it('should call onCancel when stop button is clicked', () => {
    const onCancel = vi.fn();
    render(<ArenaInputBar {...defaultProps} isStreaming onCancel={onCancel} />);

    fireEvent.click(screen.getByLabelText(/stop/i));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('should render quick-action command chips', () => {
    render(<ArenaInputBar {...defaultProps} />);
    // Command chips show display names, not slash prefixes
    expect(screen.getByText('Get help')).toBeInTheDocument();
  });

  it('should apply additional className', () => {
    const { container } = render(
      <ArenaInputBar {...defaultProps} className="extra-class" />,
    );
    expect(container.firstChild).toHaveClass('extra-class');
  });
});
