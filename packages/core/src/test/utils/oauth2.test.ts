/**
 * Unit tests for packages/core/src/utils/oauth2.ts
 *
 * Covers:
 *  - generatePkcePair: S256 produces valid base64url challenge; plain returns verifier
 *  - buildAuthorizationUrl: all required params present; optional params omitted when empty
 *  - applyClientAuth: 'basic' sets Authorization header; 'body' adds params to body
 *  - parseAuthorizationResponse: full redirect URL, bare code, error redirect
 */

import { describe, it, expect } from 'vitest';
import {
    generatePkcePair,
    buildAuthorizationUrl,
    applyClientAuth,
    parseAuthorizationResponse,
} from '../../utils/oauth2';

// ── generatePkcePair ──────────────────────────────────────────────────────────

describe('generatePkcePair', () => {
    it('returns base64url strings without padding for S256', async () => {
        const { codeVerifier, codeChallenge } = await generatePkcePair('S256');

        // base64url — must not contain +, /, or =
        expect(codeVerifier).toMatch(/^[A-Za-z0-9\-_]+$/);
        expect(codeChallenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    it('S256 challenge differs from verifier', async () => {
        const { codeVerifier, codeChallenge } = await generatePkcePair('S256');
        expect(codeChallenge).not.toBe(codeVerifier);
    });

    it('plain challenge equals verifier', async () => {
        const { codeVerifier, codeChallenge } = await generatePkcePair('plain');
        expect(codeChallenge).toBe(codeVerifier);
    });

    it('produces 32-byte verifiers (43 base64url chars for 32 bytes)', async () => {
        const { codeVerifier } = await generatePkcePair('S256');
        // 32 bytes → 43 base64url characters (ceil(32 * 4/3) with no padding)
        expect(codeVerifier.length).toBe(43);
    });

    it('each call produces a unique verifier', async () => {
        const a = await generatePkcePair('S256');
        const b = await generatePkcePair('S256');
        expect(a.codeVerifier).not.toBe(b.codeVerifier);
    });

    it('S256 challenge is the SHA-256/base64url of the verifier', async () => {
        const { codeVerifier, codeChallenge } = await generatePkcePair('S256');

        // Independently compute the expected challenge
        const encoded = new TextEncoder().encode(codeVerifier);
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
        const bytes = new Uint8Array(hashBuffer);
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        const expected = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        expect(codeChallenge).toBe(expected);
    });
});

// ── buildAuthorizationUrl ─────────────────────────────────────────────────────

describe('buildAuthorizationUrl', () => {
    const base = {
        authorizationUrl: 'https://auth.example.com/authorize',
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        state: 'random-state',
        codeChallenge: 'challenge-abc',
        codeChallengeMethod: 'S256' as const,
    };

    it('includes all required OAuth2 params', () => {
        const url = new URL(buildAuthorizationUrl(base));
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('client_id')).toBe('client-123');
        expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/callback');
        expect(url.searchParams.get('state')).toBe('random-state');
        expect(url.searchParams.get('code_challenge')).toBe('challenge-abc');
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });

    it('omits scope when not provided', () => {
        const url = new URL(buildAuthorizationUrl(base));
        expect(url.searchParams.has('scope')).toBe(false);
    });

    it('includes scope when provided', () => {
        const url = new URL(buildAuthorizationUrl({ ...base, scope: 'openid profile' }));
        expect(url.searchParams.get('scope')).toBe('openid profile');
    });

    it('appends extra params', () => {
        const url = new URL(buildAuthorizationUrl({
            ...base,
            extraParams: { audience: 'https://api.example.com' },
        }));
        expect(url.searchParams.get('audience')).toBe('https://api.example.com');
    });

    it('uses the provided authorization base URL', () => {
        const url = new URL(buildAuthorizationUrl(base));
        expect(url.origin + url.pathname).toBe('https://auth.example.com/authorize');
    });
});

// ── applyClientAuth ───────────────────────────────────────────────────────────

describe('applyClientAuth', () => {
    it("'basic' sets Authorization header with base64url-encoded credentials", () => {
        const body = new URLSearchParams();
        const headers: Record<string, string> = {};
        applyClientAuth('basic', 'my-client', 'my-secret', body, headers);

        // Authorization: Basic base64(my-client:my-secret)
        const expected = `Basic ${btoa('my-client:my-secret')}`;
        expect(headers['Authorization']).toBe(expected);
    });

    it("'basic' does NOT put client_id or client_secret in the body", () => {
        const body = new URLSearchParams();
        const headers: Record<string, string> = {};
        applyClientAuth('basic', 'my-client', 'my-secret', body, headers);

        expect(body.has('client_id')).toBe(false);
        expect(body.has('client_secret')).toBe(false);
    });

    it("'body' appends client_id and client_secret to the body", () => {
        const body = new URLSearchParams();
        const headers: Record<string, string> = {};
        applyClientAuth('body', 'my-client', 'my-secret', body, headers);

        expect(body.get('client_id')).toBe('my-client');
        expect(body.get('client_secret')).toBe('my-secret');
    });

    it("'body' does NOT set an Authorization header", () => {
        const body = new URLSearchParams();
        const headers: Record<string, string> = {};
        applyClientAuth('body', 'my-client', 'my-secret', body, headers);

        expect(headers['Authorization']).toBeUndefined();
    });

    it("'body' omits client_secret when empty", () => {
        const body = new URLSearchParams();
        applyClientAuth('body', 'public-client', '', body, {});
        expect(body.has('client_secret')).toBe(false);
        expect(body.get('client_id')).toBe('public-client');
    });
});

// ── parseAuthorizationResponse ────────────────────────────────────────────────

describe('parseAuthorizationResponse', () => {
    it('extracts code and state from a full redirect URL', () => {
        const url = 'https://app.example.com/callback?code=auth-code-xyz&state=abc123';
        const result = parseAuthorizationResponse(url);
        expect(result.code).toBe('auth-code-xyz');
        expect(result.state).toBe('abc123');
        expect(result.error).toBeUndefined();
    });

    it('extracts error and error_description from an error redirect', () => {
        const url = 'https://app.example.com/callback?error=access_denied&error_description=User+denied+access&state=abc123';
        const result = parseAuthorizationResponse(url);
        expect(result.error).toBe('access_denied');
        expect(result.errorDescription).toBe('User denied access');
        expect(result.code).toBeUndefined();
    });

    it('treats a bare string as a code', () => {
        const result = parseAuthorizationResponse('auth-code-bare-value');
        expect(result.code).toBe('auth-code-bare-value');
        expect(result.state).toBeUndefined();
    });

    it('returns empty object for empty input', () => {
        const result = parseAuthorizationResponse('');
        expect(result.code).toBeUndefined();
        expect(result.state).toBeUndefined();
    });

    it('handles URL with code but no state', () => {
        const result = parseAuthorizationResponse('https://app.example.com/cb?code=abc');
        expect(result.code).toBe('abc');
        expect(result.state).toBeUndefined();
    });
});
