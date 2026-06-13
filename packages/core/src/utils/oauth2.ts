/**
 * Pure, platform-agnostic OAuth2 and PKCE utility functions.
 *
 * These helpers are shared by:
 *  - packages/core AuthWizard (interactive token acquisition)
 *  - packages/shared auth services (token request building)
 *
 * No Node.js-specific APIs are used; all crypto is via the Web Crypto API
 * (available in both VS Code webview and browser environments).
 */

import type { OAuth2ClientAuthMethod } from '../types/auth';

// ==================== PKCE ====================

/**
 * Generates a PKCE code_verifier and code_challenge pair.
 *
 * code_verifier: base64url of 32 random bytes (RFC 7636 §4.1).
 * S256 challenge:  base64url(SHA-256(ASCII(code_verifier))) (RFC 7636 §4.2).
 * plain challenge: code_verifier unchanged.
 *
 * @param method 'S256' or 'plain'
 * @returns { codeVerifier, codeChallenge }
 */
export async function generatePkcePair(
    method: 'S256' | 'plain'
): Promise<{ codeVerifier: string; codeChallenge: string }> {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const codeVerifier = base64urlEncode(randomBytes);

    let codeChallenge: string;
    if (method === 'S256') {
        const encoded = new TextEncoder().encode(codeVerifier);
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
        codeChallenge = base64urlEncode(new Uint8Array(hashBuffer));
    } else {
        codeChallenge = codeVerifier;
    }

    return { codeVerifier, codeChallenge };
}

// ==================== Authorization URL ====================

export interface BuildAuthorizationUrlParams {
    authorizationUrl: string;
    clientId: string;
    redirectUri: string;
    scope?: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod: 'S256' | 'plain';
    extraParams?: Record<string, string>;
}

/**
 * Constructs the authorization endpoint URL for the Authorization Code flow.
 * All required OAuth2 parameters are included; optional parameters are omitted
 * when empty.
 */
export function buildAuthorizationUrl(params: BuildAuthorizationUrlParams): string {
    const url = new URL(params.authorizationUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', params.codeChallengeMethod);
    if (params.scope) {
        url.searchParams.set('scope', params.scope);
    }
    if (params.extraParams) {
        for (const [k, v] of Object.entries(params.extraParams)) {
            url.searchParams.set(k, v);
        }
    }
    return url.toString();
}

// ==================== Token Request Body ====================

/**
 * Applies the client authentication credentials to the token request body and
 * headers according to the chosen method.
 *
 * 'basic': encodes credentials in an HTTP Basic Authorization header and does
 *          NOT include client_id/client_secret in the body (RFC 6749 §2.3.1).
 * 'body':  appends client_id and client_secret to the request body
 *          (client_secret_post, RFC 6749 §2.3.1).
 *
 * @param method        Client auth method
 * @param clientId      OAuth2 client_id
 * @param clientSecret  OAuth2 client_secret (may be empty for public clients)
 * @param body          URLSearchParams to mutate (for 'body' method)
 * @param headers       Headers object to mutate (for 'basic' method)
 */
export function applyClientAuth(
    method: OAuth2ClientAuthMethod,
    clientId: string,
    clientSecret: string,
    body: URLSearchParams,
    headers: Record<string, string>
): void {
    if (method === 'basic') {
        const credentials = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`;
        headers['Authorization'] = `Basic ${btoa(credentials)}`;
    } else {
        body.set('client_id', clientId);
        if (clientSecret) {
            body.set('client_secret', clientSecret);
        }
    }
}

// ==================== Response Parsing ====================

export interface ParsedAuthorizationResponse {
    code?: string;
    state?: string;
    error?: string;
    errorDescription?: string;
}

/**
 * Parses the authorization server response from either a full redirect URL
 * (e.g., "https://app.example.com/callback?code=abc&state=xyz") or a bare
 * authorization code string.
 *
 * Surfaces error/error_description when the provider returned an error redirect.
 */
export function parseAuthorizationResponse(input: string): ParsedAuthorizationResponse {
    const trimmed = input.trim();

    // Try to parse as a full URL first
    try {
        const url = new URL(trimmed);
        const params = url.searchParams;
        const error = params.get('error') ?? undefined;
        return {
            code: params.get('code') ?? undefined,
            state: params.get('state') ?? undefined,
            error,
            errorDescription: params.get('error_description') ?? undefined,
        };
    } catch {
        // Not a valid URL — treat the raw string as a bare authorization code
        if (trimmed) {
            return { code: trimmed };
        }
        return {};
    }
}

// ==================== Internal Helpers ====================

/**
 * Base64url-encodes a Uint8Array without padding (RFC 7636 §3 / RFC 4648 §5).
 */
function base64urlEncode(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
