/**
 * Auth types and interfaces.
 * 
 * This file contains the core auth data model types used by the UI layer.
 * Service-layer types (AuthRequestConfig, AuthResult, etc.) are defined in
 * @wave-client/shared/services/auth/types.ts
 */

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

/**
 * Environment variables map type.
 */
export type EnvVarsMap = Record<string, string>;
