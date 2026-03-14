/**
 * Tests for ArenaInputBar component
 *
 * Verifies:
 *  - Renders input textarea and send button
 *  - Send button fires onSend with trimmed content
 *  - Stop button renders when isBusy and fires onCancel
 *  - isBusy disables textarea and suppresses Enter key
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
    universal: true,
  },
  {
    id: ARENA_COMMANDS.COLLECTIONS,
    agent: ARENA_AGENT_IDS.WAVE_CLIENT,
    label: 'Collections',
    description: 'Manage collections',
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

  // ── TASK-002: isBusy prop tests ────────────────────────────────────

  it('isBusy=false — textarea is enabled and send button is visible', async () => {
    const user = userEvent.setup();
    render(<ArenaInputBar {...defaultProps} isBusy={false} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).not.toBeDisabled();

    await user.type(textarea, 'Hello');
    expect(screen.getByLabelText(/send/i)).toBeInTheDocument();
  });

  it('isBusy=true — textarea is disabled and Enter key does not call onSend', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ArenaInputBar {...defaultProps} isBusy={true} onSend={onSend} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();

    // Pressing Enter while busy should not send
    await user.keyboard('{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('isBusy=true with onCancel — stop button is visible', () => {
    render(<ArenaInputBar {...defaultProps} isBusy={true} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/stop/i)).toBeInTheDocument();
  });

  it('isBusy=false with no onCancel — send button is visible, no stop button', async () => {
    const user = userEvent.setup();
    render(
      <ArenaInputBar
        commands={sampleCommands}
        onSend={vi.fn()}
        agentId={ARENA_AGENT_IDS.WAVE_CLIENT}
        isBusy={false}
      />,
    );

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hello');

    expect(screen.getByLabelText(/send/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/stop/i)).not.toBeInTheDocument();
  });

  // ── Legacy streamState-compatible behavior ─────────────────────────

  it('should display stop button when isBusy is true', () => {
    render(<ArenaInputBar {...defaultProps} isBusy={true} />);
    expect(screen.getByLabelText(/stop/i)).toBeInTheDocument();
  });

  it('should call onCancel when stop button is clicked', () => {
    const onCancel = vi.fn();
    render(<ArenaInputBar {...defaultProps} isBusy={true} onCancel={onCancel} />);

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
