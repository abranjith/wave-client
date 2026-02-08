/**
 * Tests for the ArenaAgentSelect component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ArenaAgentSelect from '../../components/arena/ArenaAgentSelect';
import { ARENA_AGENT_IDS, ARENA_AGENT_DEFINITIONS } from '../../config/arenaConfig';

describe('ArenaAgentSelect', () => {
  it('should render all agent definitions as buttons', () => {
    const onSelectAgent = vi.fn();
    render(<ArenaAgentSelect onSelectAgent={onSelectAgent} />);

    for (const def of ARENA_AGENT_DEFINITIONS) {
      expect(screen.getByText(def.label)).toBeInTheDocument();
      expect(screen.getByText(def.description)).toBeInTheDocument();
    }
  });

  it('should render a heading', () => {
    render(<ArenaAgentSelect onSelectAgent={vi.fn()} />);
    expect(screen.getByText('Choose an Agent')).toBeInTheDocument();
  });

  it('should call onSelectAgent with the correct agent ID when clicked', () => {
    const onSelectAgent = vi.fn();
    render(<ArenaAgentSelect onSelectAgent={onSelectAgent} />);

    // Find the first agent button and click it
    const firstDef = ARENA_AGENT_DEFINITIONS[0];
    const button = screen.getByText(firstDef.label).closest('button');
    expect(button).toBeTruthy();
    fireEvent.click(button!);

    expect(onSelectAgent).toHaveBeenCalledTimes(1);
    expect(onSelectAgent).toHaveBeenCalledWith(firstDef.id);
  });

  it('should render 3 agent options', () => {
    render(<ArenaAgentSelect onSelectAgent={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });
});
