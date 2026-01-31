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

// Export validation engine utilities
export { executeValidation, createGlobalRulesMap, createEnvVarsMap } from './utils/validationEngine';
