import { describe, it, expect } from 'vitest';
import { ARENA_COMMANDS, ARENA_COMMAND_DEFINITIONS } from '@wave-client/core';
import {
  WAVE_SUPPORTED_COMMANDS,
  parseWaveCommand,
  type WaveCommandKind,
} from '../../agents/waveClientAgent';

describe('wave command contract continuity', () => {
  it('keeps parser command IDs in sync with core metadata command IDs', () => {
    const metadataWaveCommands = ARENA_COMMAND_DEFINITIONS
      .filter((command) => command.agent === 'wave-client' || command.universal)
      .map((command) => command.id)
      .sort();

    const parserCommands = [...WAVE_SUPPORTED_COMMANDS].sort();

    expect(parserCommands).toEqual(metadataWaveCommands);
  });

  it('maps each command to the expected intent hint kind', () => {
    const fixtures: Array<{ command: string; sampleInput: string; expectedKind: WaveCommandKind }> = [
      { command: ARENA_COMMANDS.HELP, sampleInput: '/help', expectedKind: 'help' },
      { command: ARENA_COMMANDS.COLLECTIONS, sampleInput: '/collections', expectedKind: 'collections' },
      { command: ARENA_COMMANDS.REQUESTS, sampleInput: '/requests login', expectedKind: 'requests' },
      { command: ARENA_COMMANDS.ENVIRONMENTS, sampleInput: '/environments', expectedKind: 'environments' },
      { command: ARENA_COMMANDS.FLOWS, sampleInput: '/flows', expectedKind: 'flows' },
      { command: ARENA_COMMANDS.TESTS, sampleInput: '/tests', expectedKind: 'tests' },
      { command: ARENA_COMMANDS.RUN_FLOW, sampleInput: '/run-flow "Smoke Flow"', expectedKind: 'run-flow' },
      { command: ARENA_COMMANDS.RUN_TESTS, sampleInput: '/run-tests "User API"', expectedKind: 'run-tests' },
    ];

    for (const fixture of fixtures) {
      const parsed = parseWaveCommand(fixture.sampleInput);
      expect(parsed.command).toBe(fixture.command);
      expect(parsed.hint?.kind).toBe(fixture.expectedKind);
    }
  });
});
