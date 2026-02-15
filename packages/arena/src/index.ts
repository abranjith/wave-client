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

// Agents — deprecated aliases (remove once all consumers are migrated)
export { createLearnAgent, type LearnAgentConfig } from './agents/learnAgent';
export {
  createDiscoverAgent,
  type DiscoverAgentConfig,
} from './agents/discoverAgent';

// Providers
export { createGeminiProvider, type GeminiProviderConfig } from './providers/gemini';
export { createProviderFactory, type ProviderConfig } from './providers/factory';

// Tools
export { createMcpBridge, type McpBridgeConfig } from './tools/mcpBridge';
export { createWebFetcher, type WebFetcherConfig } from './tools/webFetcher';

// Utils
export { createVectorStore, type VectorStoreConfig } from './utils/vectorStore';
export { createRateLimiter, type RateLimiterConfig } from './utils/rateLimiter';
