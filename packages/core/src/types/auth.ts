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
    OAUTH2_CLIENT_CREDENTIALS = 'oauth2ClientCredentials',
    OAUTH2_AUTHORIZATION_CODE = 'oauth2AuthorizationCode',
    HMAC = 'hmac',
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
 * Digest Auth - username and password only.
 * All challenge parameters (realm, nonce, algorithm, qop, etc.) are derived
 * automatically from the server's WWW-Authenticate challenge at request time.
 */
export interface DigestAuth extends BaseAuth {
    type: AuthType.DIGEST;
    username: string;
    password: string;
}

/**
 * The method used to transmit client credentials to the token endpoint.
 * 'basic' = HTTP Basic Authorization header (client_secret_basic, RFC 6749 §2.3.1).
 * 'body'  = client_id/client_secret in the request body (client_secret_post).
 */
export type OAuth2ClientAuthMethod = 'basic' | 'body';

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
    clientAuthMethod: OAuth2ClientAuthMethod;
}

/**
 * OAuth2 Client Credentials Auth.
 * Used for machine-to-machine (M2M) authentication where no user is involved.
 */
export interface OAuth2ClientCredentialsAuth extends BaseAuth {
    type: AuthType.OAUTH2_CLIENT_CREDENTIALS;
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
    scope?: string;
    /** Provider-specific resource/audience parameter (e.g. Auth0, Azure AD). */
    audience?: string;
    clientAuthMethod: OAuth2ClientAuthMethod;
}

/**
 * OAuth2 Authorization Code Auth (with PKCE support).
 * Token state is populated by the AuthWizard interactive acquisition flow.
 */
export interface OAuth2AuthorizationCodeAuth extends BaseAuth {
    type: AuthType.OAUTH2_AUTHORIZATION_CODE;
    authorizationUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    scope?: string;
    codeChallengeMethod: 'S256' | 'plain';
    clientAuthMethod: OAuth2ClientAuthMethod;
    // Token state — set by the wizard exchange; updated at refresh time
    accessToken?: string;
    refreshToken?: string;
    tokenType?: string;
    /** Epoch ms when the access token expires. */
    tokenExpiresAt?: number;
}

/** Algorithm options for HMAC signing. */
export type HmacHashAlgorithm = 'sha256' | 'sha1' | 'sha512' | 'md5';

/**
 * HMAC Authentication.
 * Signs a user-defined template string with a secret key; the resulting
 * signature is placed in a header or query parameter.
 *
 * Template placeholders (resolved at request time):
 *   {method}    — HTTP method (upper-case)
 *   {url}       — full request URL
 *   {path}      — URL pathname
 *   {query}     — raw query string (no leading ?)
 *   {host}      — URL host
 *   {body}      — raw request body as a string
 *   {timestamp} — Unix seconds (also emitted to timestampHeader if set)
 *   {nonce}     — random hex string (also emitted to nonceHeader if set)
 */
export interface HmacAuth extends BaseAuth {
    type: AuthType.HMAC;
    algorithm: HmacHashAlgorithm;
    secretKey: string;
    keyId?: string;
    signatureTemplate: string;
    outputEncoding: 'hex' | 'base64';
    sendIn: 'header' | 'query';
    targetName: string;
    prefix?: string;
    timestampHeader?: string;
    nonceHeader?: string;
}

/**
 * Union type for all auth types.
 */
export type Auth =
    | ApiKeyAuth
    | BasicAuth
    | DigestAuth
    | OAuth2RefreshAuth
    | OAuth2ClientCredentialsAuth
    | OAuth2AuthorizationCodeAuth
    | HmacAuth;

/**
 * Environment variables map type.
 */
export type EnvVarsMap = Record<string, string>;
