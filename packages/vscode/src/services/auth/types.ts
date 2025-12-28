/**
 * Auth types for the Auth Service layer.
 * 
 * These types are defined locally to avoid ESM/CJS import issues with @wave-client/core.
 * Keep in sync with @wave-client/core/types/auth.ts when updating.
 */

// ==================== Result Pattern (simplified for auth) ====================

export interface Ok<T, E> {
    isOk: true;
    isErr: false;
    value: T;
}

export interface Err<T, E> {
    isOk: false;
    isErr: true;
    error: E;
}

export type Result<T, E> = Ok<T, E> | Err<T, E>;

function ok<T, E>(value: T): Ok<T, E> {
    return { isOk: true, isErr: false, value };
}

function err<T, E>(error: E): Err<T, E> {
    return { isOk: false, isErr: true, error };
}

// ==================== Auth Type Enum ====================

/**
 * Enum for all supported authentication types.
 */
export enum AuthType {
    API_KEY = 'apiKey',
    BASIC = 'basic',
    DIGEST = 'digest',
    OAUTH2_REFRESH = 'oauth2Refresh',
}

// ==================== Base Interface ====================

/**
 * Base interface with common properties for all auth types.
 */
export interface BaseAuth {
    id: string;                     // Cryptographically unique per record
    name: string;                   // User-friendly name (must be unique)
    enabled: boolean;               // Enable/disable flag
    domainFilters: string[];        // Will be sent only for these domains
    expiryDate?: string;            // Optional expiry date (ISO string)
    base64Encode: boolean;          // Flag to indicate if credentials should be base64 encoded
}

// ==================== Auth Type Interfaces ====================

/**
 * API Key Auth - stores direct key for header or query param.
 */
export interface ApiKeyAuth extends BaseAuth {
    type: AuthType.API_KEY;
    key: string;
    value: string;
    sendIn: 'header' | 'query';     // Flag to indicate where to send
    prefix?: string;                // Optional prefix (e.g., "Bearer ", "Token ")
}

/**
 * Basic Auth - username and password.
 */
export interface BasicAuth extends BaseAuth {
    type: AuthType.BASIC;
    username: string;
    password: string;
}

/**
 * Digest Auth - username, password, and digest-specific fields.
 */
export interface DigestAuth extends BaseAuth {
    type: AuthType.DIGEST;
    username: string;
    password: string;
    realm?: string;
    nonce?: string;
    algorithm?: 'MD5' | 'MD5-sess' | 'SHA-256' | 'SHA-256-sess';
    qop?: 'auth' | 'auth-int';
    nc?: string;                    // Nonce count
    cnonce?: string;                // Client nonce
    opaque?: string;
}

/**
 * OAuth2 Refresh Token Auth.
 */
export interface OAuth2RefreshAuth extends BaseAuth {
    type: AuthType.OAUTH2_REFRESH;
    tokenUrl: string;
    clientId: string;
    clientSecret?: string;
    refreshToken: string;
    scope?: string;
    accessToken?: string;           // Cached access token
    tokenExpiresAt?: number;        // Timestamp when token expires
}

/**
 * Union type for all auth types.
 */
export type Auth = ApiKeyAuth | BasicAuth | DigestAuth | OAuth2RefreshAuth;

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
    data: Buffer | ArrayBuffer | string | unknown;
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

/**
 * Environment variables map type.
 */
export type EnvVarsMap = Record<string, string>;
