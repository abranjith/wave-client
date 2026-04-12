/**
 * @wave-client/shared
 * 
 * Shared services and utilities for Wave Client.
 * Used by both the VS Code extension and the server package.
 */

// Export all types
export * from './types';

// Export all services
export * from './services/index';

// Export validation engine utilities (including UI pre-validation helper)
export { executeValidation, createGlobalRulesMap, createEnvVarsMap, validateJsonSchemaString } from './utils/validationEngine';

// ---------------------------------------------------------------------------
// Arena types and constants re-exported from @wave-client/core so that the
// vscode extension backend (CommonJS) can import them without ESM/CJS issues.
// ---------------------------------------------------------------------------

export type {
    ArenaChatRequest,
    ArenaChatResponse,
    ArenaChatStreamChunk,
    StreamHandle,
    StreamUnsubscribe,
    ArenaMessage,
    ArenaMessageRole,
    ArenaMessageStatus,
    ArenaProviderType,
    ArenaProviderSettings,
    ArenaProviderSettingsMap,
    ArenaSettings,
    ArenaSession,
    ArenaReference,
    DynamicModelInfo,
} from '@wave-client/core';

export {
    ARENA_AGENT_IDS,
    DEFAULT_ARENA_SETTINGS,
    geminiModelsUrl,
    ollamaTagsUrl,
    getDefaultProviderSettings,
} from '@wave-client/core';
