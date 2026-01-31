import { err, ok, Result } from '@wave-client/core';

/**
 * Auth types for the Auth Service layer.
 * 
 * This file defines service-layer types for authentication.
 * The core auth data model types are imported from @wave-client/core
 * to avoid duplication and ensure consistency across packages.
 */

// ==================== Re-export Core Auth Types ====================

// Re-export base auth types from core package
export type {
    Auth,
    BaseAuth,
    ApiKeyAuth,
    BasicAuth,
    DigestAuth,
    OAuth2RefreshAuth,
    EnvVarsMap,
} from '@wave-client/core';

export { AuthType } from '@wave-client/core';

// ==================== Auth Request/Response Types ====================

/**
 * Request configuration passed to auth services.
 */
export interface AuthRequestConfig {
    method: string;
    url: string;
    headers: Record<string, string | string[]>;
    params?: string;
    body?: unknown;
}

/**
 * Successful auth result data.
 */
export interface AuthResultData {
    headers?: Record<string, string>;
    queryParams?: Record<string, string>;
    // For auth types that handle the full request internally (like Digest)
    handledInternally?: boolean;
    response?: InternalAuthResponse;
}

/**
 * Response from auth services that handle requests internally.
 */
export interface InternalAuthResponse {
    status: number;
    statusText: string;
    headers: Record<string, unknown>;
    data?: Buffer | ArrayBuffer | string | unknown;
}

/**
 * Auth Result using the Result pattern.
 */
export type AuthResult = Result<AuthResultData, string>;

// Helper functions for creating AuthResult
export const authOk = (data: AuthResultData): AuthResult => ok(data);
export const authErr = (error: string): AuthResult => err(error);

// ==================== Cache Types ====================

/**
 * Cached auth data for in-memory caching.
 */
export interface CachedAuthData {
    data: unknown;
    expiresAt: number;
}
