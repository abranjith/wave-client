import { describe, it, expect } from 'vitest';
import { ARENA_COMMANDS, ARENA_COMMAND_DEFINITIONS } from '../../types/arena';

describe('arena command metadata contract', () => {
  it('includes unique command IDs', () => {
    const ids = ARENA_COMMAND_DEFINITIONS.map((command) => command.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('marks /help as universal', () => {
    const help = ARENA_COMMAND_DEFINITIONS.find((command) => command.id === ARENA_COMMANDS.HELP);
    expect(help).toBeDefined();
    expect(help?.universal).toBe(true);
  });

  it('provides non-empty placeholders for argument-bearing wave commands', () => {
    const argumentCommands = [
      ARENA_COMMANDS.REQUESTS,
      ARENA_COMMANDS.RUN_FLOW,
      ARENA_COMMANDS.RUN_TESTS,
    ];

    for (const id of argumentCommands) {
      const command = ARENA_COMMAND_DEFINITIONS.find((definition) => definition.id === id);
      expect(command).toBeDefined();
      expect(command?.placeholder?.trim().length).toBeGreaterThan(0);
    }
  });

  it('exposes the complete wave command surface', () => {
    const waveCommandIds = ARENA_COMMAND_DEFINITIONS
      .filter((command) => command.agent === 'wave-client' || command.universal)
      .map((command) => command.id)
      .sort();

    expect(waveCommandIds).toEqual([
      ARENA_COMMANDS.COLLECTIONS,
      ARENA_COMMANDS.ENVIRONMENTS,
      ARENA_COMMANDS.FLOWS,
      ARENA_COMMANDS.HELP,
      ARENA_COMMANDS.REQUESTS,
      ARENA_COMMANDS.RUN_FLOW,
      ARENA_COMMANDS.RUN_TESTS,
      ARENA_COMMANDS.TESTS,
    ].sort());
  });
});
