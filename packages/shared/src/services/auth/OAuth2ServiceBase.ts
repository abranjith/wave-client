/**
 * Abstract base class shared by all OAuth2 grant-type services.
 *
 * Responsibilities:
 *  - POST to a token endpoint with form-urlencoded body
 *  - Apply client authentication (Basic header or body params)
 *  - Parse the token response into a normalized result
 *  - Cache tokens with TTL, skipping caching when expires_in is absent
 *  - Provide transparent refresh via a refresh_token
 */

import { AuthServiceBase } from './AuthServiceBase';
import { applyClientAuth } from '@wave-client/core';
import type { OAuth2ClientAuthMethod } from '@wave-client/core';
import { httpService } from '../HttpService';
import type { SendConfig } from '../HttpService';

// Buffer before actual expiry to treat a token as expired (1 minute).
const EXPIRY_BUFFER_MS = 60_000;

export interface OAuth2TokenResult {
    accessToken: string;
    refreshToken?: string;
    tokenType: string;
    /** Epoch ms when the access token expires; undefined if the server did not send expires_in. */
    expiresAt?: number;
}

export abstract class OAuth2ServiceBase extends AuthServiceBase {
    /**
     * POST to the token endpoint with the supplied grant params.
     *
     * @param tokenUrl         OAuth2 token endpoint URL
     * @param grantParams      Grant-specific body params (grant_type, code, etc.)
     * @param clientAuthMethod How to transmit client credentials
     * @param clientId         OAuth2 client_id
     * @param clientSecret     OAuth2 client_secret (may be empty for public clients)
     */
    protected async fetchToken(
        tokenUrl: string,
        grantParams: Record<string, string>,
        clientAuthMethod: OAuth2ClientAuthMethod,
        clientId: string,
        clientSecret: string
    ): Promise<OAuth2TokenResult> {
        const body = new URLSearchParams(grantParams);
        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded',
        };

        // Apply client authentication per chosen method
        applyClientAuth(clientAuthMethod, clientId, clientSecret, body, headers);

        const sendConfig: SendConfig = {
            method: 'POST',
            url: tokenUrl,
            headers,
            body: body.toString(),
            responseType: 'json',
        };

        const result = await httpService.send(sendConfig);

        if (result.error) {
            throw new Error(result.error);
        }

        return this.parseTokenResponse(result.response.data as Record<string, unknown>);
    }

    /**
     * Parses a raw token endpoint response into a normalized result.
     *
     * token_type defaults to 'Bearer' per RFC 6750 §6.1.1 (the spec reserves
     * 'Bearer' as the standard value; it is not an arbitrary default).
     *
     * expires_in is NOT fabricated — if the server omits it, expiresAt is left
     * undefined and the token will not be cached by TTL.
     */
    protected parseTokenResponse(data: Record<string, unknown>): OAuth2TokenResult {
        if (!data.access_token || typeof data.access_token !== 'string') {
            throw new Error('Token response missing access_token');
        }

        const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : undefined;

        return {
            accessToken: data.access_token,
            refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
            // RFC 6750 §6.1.1 — 'Bearer' is the registered token type value
            tokenType: typeof data.token_type === 'string' ? data.token_type : 'Bearer',
            expiresAt: expiresIn !== undefined ? Date.now() + expiresIn * 1000 : undefined,
        };
    }

    /**
     * Stores a token in the in-memory cache.
     * Skips caching when expiresAt is undefined (no TTL available).
     */
    protected cacheToken(authId: string, token: OAuth2TokenResult): void {
        if (token.expiresAt === undefined) {
            return;
        }
        const ttlMs = token.expiresAt - Date.now();
        if (ttlMs > 0) {
            this.setCache(authId, token, ttlMs);
        }
    }

    /**
     * Retrieves a cached token, returning undefined if absent or close to expiry.
     */
    protected getCachedToken(authId: string): OAuth2TokenResult | undefined {
        const cached = this.getCached<OAuth2TokenResult>(authId);
        if (!cached || cached.expiresAt === undefined) {
            return undefined;
        }
        // Treat the token as expired if it expires within the buffer window
        if (Date.now() >= cached.expiresAt - EXPIRY_BUFFER_MS) {
            this.clearCache(authId);
            return undefined;
        }
        return cached;
    }

    /**
     * Fetches a new access token using a refresh_token grant.
     */
    protected async refreshAccessToken(
        tokenUrl: string,
        refreshToken: string,
        clientAuthMethod: OAuth2ClientAuthMethod,
        clientId: string,
        clientSecret: string,
        scope?: string
    ): Promise<OAuth2TokenResult> {
        const grantParams: Record<string, string> = {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        };
        if (scope) {
            grantParams.scope = scope;
        }
        return this.fetchToken(tokenUrl, grantParams, clientAuthMethod, clientId, clientSecret);
    }
}
