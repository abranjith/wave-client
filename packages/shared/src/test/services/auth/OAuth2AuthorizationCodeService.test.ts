/**
 * Unit tests for OAuth2AuthorizationCodeService.
 *
 * Covers:
 *  - Applies valid stored access token without a network call
 *  - Skips expired stored token and falls back to refresh
 *  - Refreshes via refreshToken; applies new token
 *  - Returns authErr when no token and no refresh token
 *  - Honors clientAuthMethod on refresh request
 *  - In-memory cached (refreshed) token used on subsequent call
 *  - Validation (disabled, expired config, domain) returns authErr
 *  - Existing Authorization header is preserved
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OAuth2AuthorizationCodeService } from '../../../services/auth/OAuth2AuthorizationCodeService.js';
import type { OAuth2AuthorizationCodeAuth } from '../../../services/auth/types.js';
import { AuthType } from '../../../services/auth/types.js';
import type { AuthRequestConfig } from '../../../services/auth/types.js';

vi.mock('../../../services/HttpService.js', () => ({
    httpService: { send: vi.fn() },
}));

import { httpService } from '../../../services/HttpService.js';
const mockSend = vi.mocked(httpService.send);

const NOW = Date.now();
const HOUR_MS = 3600 * 1000;

const makeAuth = (overrides: Partial<OAuth2AuthorizationCodeAuth> = {}): OAuth2AuthorizationCodeAuth => ({
    id: 'ac-1',
    name: 'AC Auth',
    type: AuthType.OAUTH2_AUTHORIZATION_CODE,
    enabled: true,
    domainFilters: [],
    authorizationUrl: 'https://auth.example.com/authorize',
    tokenUrl: 'https://auth.example.com/token',
    clientId: 'client-id',
    redirectUri: 'https://app.example.com/callback',
    codeChallengeMethod: 'S256',
    clientAuthMethod: 'basic',
    ...overrides,
});

const config: AuthRequestConfig = {
    method: 'GET',
    url: 'https://api.example.com/data',
    headers: {},
};

const refreshResponse = () => ({
    error: null,
    response: {
        status: 200,
        data: {
            access_token: 'at-refreshed',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'rt-new',
        },
        headers: {},
    },
});

describe('OAuth2AuthorizationCodeService', () => {
    let service: OAuth2AuthorizationCodeService;

    beforeEach(() => {
        service = new OAuth2AuthorizationCodeService();
        vi.clearAllMocks();
    });

    it('applies a valid stored access token without a network call', async () => {
        const auth = makeAuth({
            accessToken: 'at-stored',
            tokenType: 'Bearer',
            tokenExpiresAt: NOW + HOUR_MS,
        });
        const result = await service.applyAuth(config, auth, {});
        expect(result.isErr).toBe(false);
        if (!result.isErr) {
            expect(result.value.headers?.['Authorization']).toBe('Bearer at-stored');
        }
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('uses token type from stored token', async () => {
        const auth = makeAuth({
            accessToken: 'at-stored',
            tokenType: 'token',
            tokenExpiresAt: NOW + HOUR_MS,
        });
        const result = await service.applyAuth(config, auth, {});
        if (!result.isErr) {
            expect(result.value.headers?.['Authorization']).toBe('token at-stored');
        }
    });

    it('defaults token type to Bearer when not set on stored token', async () => {
        const auth = makeAuth({
            accessToken: 'at-stored',
            tokenExpiresAt: NOW + HOUR_MS,
        });
        const result = await service.applyAuth(config, auth, {});
        if (!result.isErr) {
            expect(result.value.headers?.['Authorization']).toBe('Bearer at-stored');
        }
    });

    it('refreshes when stored access token is expired and refresh token exists', async () => {
        mockSend.mockResolvedValueOnce(refreshResponse() as any);
        const auth = makeAuth({
            accessToken: 'at-expired',
            tokenExpiresAt: NOW - 1000,
            refreshToken: 'rt-old',
        });
        const result = await service.applyAuth(config, auth, {});
        expect(result.isErr).toBe(false);
        if (!result.isErr) {
            expect(result.value.headers?.['Authorization']).toBe('Bearer at-refreshed');
        }
        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(mockSend.mock.calls[0][0].body).toContain('grant_type=refresh_token');
    });

    it('uses in-memory cached refreshed token on subsequent call', async () => {
        mockSend.mockResolvedValue(refreshResponse() as any);
        const auth = makeAuth({
            accessToken: 'at-expired',
            tokenExpiresAt: NOW - 1000,
            refreshToken: 'rt-old',
        });
        await service.applyAuth(config, auth, {});
        await service.applyAuth(config, auth, {});
        // Only one network call; second served from in-memory cache
        expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it("honors clientAuthMethod 'body' on refresh request", async () => {
        mockSend.mockResolvedValueOnce(refreshResponse() as any);
        const auth = makeAuth({
            accessToken: 'at-expired',
            tokenExpiresAt: NOW - 1000,
            refreshToken: 'rt-old',
            clientAuthMethod: 'body',
        });
        await service.applyAuth(config, auth, {});
        const call = mockSend.mock.calls[0][0];
        expect(call.headers['Authorization']).toBeUndefined();
        expect(call.body).toContain('client_id=');
    });

    it('returns authErr when no access token and no refresh token', async () => {
        const result = await service.applyAuth(config, makeAuth(), {});
        expect(result.isErr).toBe(true);
        if (result.isErr) {
            expect(result.error).toContain('re-authorize');
        }
    });

    it('returns authErr when refresh fails', async () => {
        mockSend.mockResolvedValueOnce({ error: 'Network error', response: { status: 0, data: null, headers: {} } } as any);
        const auth = makeAuth({
            tokenExpiresAt: NOW - 1000,
            refreshToken: 'rt-old',
        });
        const result = await service.applyAuth(config, auth, {});
        expect(result.isErr).toBe(true);
    });

    it('no-ops when Authorization header already present', async () => {
        const result = await service.applyAuth(
            { ...config, headers: { Authorization: 'Bearer existing' } },
            makeAuth(),
            {}
        );
        expect(result.isErr).toBe(false);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns authErr when auth is disabled', async () => {
        const result = await service.applyAuth(config, makeAuth({ enabled: false }), {});
        expect(result.isErr).toBe(true);
        if (result.isErr) expect(result.error).toContain('disabled');
    });

    it('returns authErr when auth is expired (config expiry)', async () => {
        const result = await service.applyAuth(
            config,
            makeAuth({ expiryDate: new Date(NOW - 1000).toISOString() }),
            {}
        );
        expect(result.isErr).toBe(true);
        if (result.isErr) expect(result.error).toContain('expired');
    });

    it('returns authErr when domain filter does not match', async () => {
        const result = await service.applyAuth(
            config,
            makeAuth({ domainFilters: ['other.domain.com'] }),
            {}
        );
        expect(result.isErr).toBe(true);
        if (result.isErr) expect(result.error).toContain('domain');
    });

    it('returns authErr for unresolved placeholder in tokenUrl during refresh', async () => {
        const auth = makeAuth({
            tokenUrl: '{{MISSING}}/token',
            tokenExpiresAt: NOW - 1000,
            refreshToken: 'rt-old',
        });
        const result = await service.applyAuth(config, auth, {});
        expect(result.isErr).toBe(true);
        if (result.isErr) expect(result.error).toContain('Unresolved placeholders');
    });
});
