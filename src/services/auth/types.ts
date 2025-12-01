/**
 * Auth types for the Auth Service layer.
 * Re-exports common types from src/types/auth.ts for convenience.
 */

// Re-export all types from the common auth types file
export {
    // Enum
    AuthType,
    // Interfaces
    BaseAuth,
    ApiKeyAuth,
    BasicAuth,
    DigestAuth,
    OAuth2RefreshAuth,
    Auth,
    AuthRequestConfig,
    AuthResultData,
    InternalAuthResponse,
    AuthResult,
    CachedAuthData,
    EnvVarsMap,
    // Helper functions
    authOk,
    authErr,
} from '../../types/auth';
