/**
 * Agents index
 *
 * Exports the two refactored agents (Phase 1.3) plus backward-compatible
 * aliases so existing consumers continue to work until fully migrated.
 */

// New agents
export {
  createWebExpertAgent,
  type WebExpertAgentConfig,
} from './webExpertAgent';
export {
  createWaveClientAgent,
  type WaveClientAgentConfig,
} from './waveClientAgent';
