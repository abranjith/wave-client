/**
 * @wave-client/arena
 * AI agent engine for Wave Client - LangGraph-based multi-agent system
 */

// Types
export * from './types';

// Agents — new names (Phase 1.3)
export {
  createWebExpertAgent,
  type WebExpertAgentConfig,
} from './agents/webExpertAgent';
export {
  createWaveClientAgent,
  type WaveClientAgentConfig,
} from './agents/waveClientAgent';

// Providers
export { createGeminiProvider, type GeminiProviderConfig } from './providers/gemini';
export { createProviderFactory, type ProviderConfig } from './providers/factory';

// Tools
export { McpClientManager, type McpToolDefinition } from './tools/mcpClient';
export { createMcpBridge } from './tools/mcpBridge';

// Utils
export { createVectorStore, type VectorStoreConfig } from './utils/vectorStore';
export { createRateLimiter, type RateLimiterConfig } from './utils/rateLimiter';

// Arena service — orchestrates provider config, agent lifecycle, and chat streaming
export { ArenaService, arenaService, type McpStatus } from './ArenaService';
