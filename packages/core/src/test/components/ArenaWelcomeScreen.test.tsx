/**
 * Tests for ArenaWelcomeScreen component
 *
 * Verifies that:
 *  - The hero section renders with branding text
 *  - Agent cards render for each defined agent
 *  - Clicking an agent card fires onSelectAgent with the correct ID
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ArenaWelcomeScreen from '../../components/arena/ArenaWelcomeScreen';
import { ARENA_AGENT_DEFINITIONS, ARENA_AGENT_IDS } from '../../config/arenaConfig';

describe('ArenaWelcomeScreen', () => {
  const defaultProps = {
    onSelectAgent: vi.fn(),
  };

  it('should render the hero heading', () => {
    render(<ArenaWelcomeScreen {...defaultProps} />);
    expect(screen.getByText('Wave Arena')).toBeInTheDocument();
  });

  it('should render a card for every enabled agent', () => {
    render(<ArenaWelcomeScreen {...defaultProps} />);

    const agents = ARENA_AGENT_DEFINITIONS;

    for (const agent of agents) {
      expect(screen.getByText(agent.label)).toBeInTheDocument();
    }
  });

  it('should render agent descriptions', () => {
    render(<ArenaWelcomeScreen {...defaultProps} />);

    const agents = ARENA_AGENT_DEFINITIONS;

    for (const agent of agents) {
      // Description may be truncated in UI; check for a substring
      const descSnippet = agent.description.slice(0, 20);
      expect(
        screen.getByText((content) => content.includes(descSnippet)),
      ).toBeInTheDocument();
    }
  });

  it('should call onSelectAgent with the correct agent ID when a card is clicked', () => {
    const onSelectAgent = vi.fn();
    render(<ArenaWelcomeScreen onSelectAgent={onSelectAgent} />);

    // The agent cards are <button> elements containing the agent name
    // Click the "Wave Client" card
    const waveClientCard = screen.getByText('Wave Client').closest('button');
    expect(waveClientCard).not.toBeNull();
    fireEvent.click(waveClientCard!);

    expect(onSelectAgent).toHaveBeenCalledTimes(1);
    expect(onSelectAgent).toHaveBeenCalledWith(ARENA_AGENT_IDS.WAVE_CLIENT);
  });

  it('should apply additional className when provided', () => {
    const { container } = render(
      <ArenaWelcomeScreen {...defaultProps} className="my-custom-class" />,
    );
    expect(container.firstChild).toHaveClass('my-custom-class');
  });
});
