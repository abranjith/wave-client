/**
 * Auth types and interfaces for the Auth Service layer.
 * These types are used in the extension backend (Node.js environment).
 */

// Auth type enum (mirroring the webview types for consistency)
export enum AuthType {
    API_KEY = 'apiKey',
    BASIC = 'basic',
    DIGEST = 'digest',
    OAUTH2_REFRESH = 'oauth2Refresh',
}

// Base interface with common properties for all auth types
export interface BaseAuth {
    id: string;
    name: string;
    enabled: boolean;
    domainFilters: string[];
    expiryDate?: string;
    base64Encode: boolean;
}

// API Key Auth
export interface ApiKeyAuth extends BaseAuth {
    type: AuthType.API_KEY;
    key: string;
    value: string;
    sendIn: 'header' | 'query';
    prefix?: string;
}

// Basic Auth
export interface BasicAuth extends BaseAuth {
    type: AuthType.BASIC;
    username: string;
    password: string;
}

// Digest Auth
export interface DigestAuth extends BaseAuth {
    type: AuthType.DIGEST;
    username: string;
    password: string;
    realm?: string;
    nonce?: string;
    algorithm?: 'MD5' | 'MD5-sess' | 'SHA-256' | 'SHA-256-sess';
    qop?: 'auth' | 'auth-int';
    nc?: string;
    cnonce?: string;
    opaque?: string;
}

// OAuth2 Refresh Token Auth
export interface OAuth2RefreshAuth extends BaseAuth {
    type: AuthType.OAUTH2_REFRESH;
    tokenUrl: string;
    clientId: string;
    clientSecret?: string;
    refreshToken: string;
    scope?: string;
    accessToken?: string; // Cached access token
    tokenExpiresAt?: number; // Timestamp when token expires
}

// Union type for all auth types
export type Auth = ApiKeyAuth | BasicAuth | DigestAuth | OAuth2RefreshAuth;

/**
 * Result of applying authentication to a request.
 * For most auth types, this contains headers/params to add.
 * For Digest auth (which handles the full request internally), it may contain the response.
 */
export interface AuthResult {
    headers?: Record<string, string>;
    queryParams?: Record<string, string>;
    // For auth types that handle the full request internally (like Digest)
    handledInternally?: boolean;
    response?: any;
    error?: string;
}

/**
 * Request configuration passed to auth services
 */
export interface AuthRequestConfig {
    method: string;
    url: string;
    headers: Record<string, string | string[]>;
    params?: string;
    body?: any;
}

/**
 * Cached auth data for in-memory caching
 */
export interface CachedAuthData {
    data: any;
    expiresAt: number;
}

/**
 * Environment variables map type
 */
export type EnvVarsMap = Record<string, string>;
