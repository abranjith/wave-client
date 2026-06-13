/**
 * Unit tests for OAuth2RefreshService.
 *
 * Covers:
 *  - Fetches token and returns Authorization header
 *  - Honors clientAuthMethod: 'basic' vs 'body'
 *  - Caches the token when expires_in is present; does NOT cache when absent
 *  - A second call re-fetches when token is not cached (no expires_in)
 *  - Unresolved env placeholders surface authErr
 *  - Validation (disabled, expired, wrong domain) surfaces authErr
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OAuth2RefreshService } from '../../../services/auth/OAuth2RefreshService.js';
import type { OAuth2RefreshAuth } from '../../../services/auth/types.js';
import { AuthType } from '../../../services/auth/types.js';
import type { AuthRequestConfig } from '../../../services/auth/types.js';

// ── Mock httpService ──────────────────────────────────────────────────────────

vi.mock('../../../services/HttpService.js', () => ({
    httpService: {
        send: vi.fn(),
    },
}));

import { httpService } from '../../../services/HttpService.js';
const mockSend = vi.mocked(httpService.send);

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeAuth = (overrides: Partial<OAuth2RefreshAuth> = {}): OAuth2RefreshAuth => ({
    id: 'auth-1',
    name: 'Test Refresh',
    type: AuthType.OAUTH2_REFRESH,
    enabled: true,
    domainFilters: [],
    tokenUrl: 'https://auth.example.com/token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    refreshToken: 'rt-123',
    clientAuthMethod: 'basic',
    ...overrides,
});

const config: AuthRequestConfig = {
    method: 'GET',
    url: 'https://api.example.com/data',
    headers: {},
};

const tokenResponse = (expiresIn?: number) => ({
    error: null,
    response: {
        status: 200,
        data: {
            access_token: 'at-abc',
            token_type: 'Bearer',
            ...(expiresIn !== undefined ? { expires_in: expiresIn } : {}),
        },
        headers: {},
    },
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OAuth2RefreshService', () => {
    let service: OAuth2RefreshService;

    beforeEach(() => {
        service = new OAuth2RefreshService();
        vi.clearAllMocks();
    });

    it('returns Authorization: Bearer <token> on success', async () => {
        mockSend.mockResolvedValueOnce(tokenResponse(3600) as ReturnType<typeof mockSend> extends Promise<infer R> ? R : never);

        const result = await service.applyAuth(config, makeAuth(), {});
        expect(result.isErr).toBe(false);
        if (!result.isErr) {
            expect(result.value.headers?.['Authorization']).toBe('Bearer at-abc');
        }
    });

    it("clientAuthMethod 'basic' sets Authorization header on the token request — not body params", async () => {
        mockSend.mockResolvedValueOnce(tokenResponse(3600) as any);

        await service.applyAuth(config, makeAuth({ clientAuthMethod: 'basic' }), {});

        const call = mockSend.mock.calls[0][0];
        expect(call.headers['Authorization']).toMatch(/^Basic /);
        // Body must NOT contain client credentials
        expect(call.body).not.toContain('client_id=');
        expect(call.body).not.toContain('client_secret=');
    });

    it("clientAuthMethod 'body' puts credentials in the request body — not header", async () => {
        mockSend.mockResolvedValueOnce(tokenResponse(3600) as any);

        await service.applyAuth(config, makeAuth({ clientAuthMethod: 'body' }), {});

        const call = mockSend.mock.calls[0][0];
        expect(call.headers['Authorization']).toBeUndefined();
        expect(call.body).toContain('client_id=client-id');
        expect(call.body).toContain('client_secret=client-secret');
    });

    it('caches the token when expires_in is present — second call skips network', async () => {
        mockSend.mockResolvedValue(tokenResponse(3600) as any);

        await service.applyAuth(config, makeAuth(), {});
        await service.applyAuth(config, makeAuth(), {});

        // Only one network call because the second is served from cache
        expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('does NOT cache when token response omits expires_in — second call re-fetches', async () => {
        mockSend.mockResolvedValue(tokenResponse() as any); // no expires_in

        await service.applyAuth(config, makeAuth(), {});
        await service.applyAuth(config, makeAuth(), {});

        // Both calls hit the network because there's no TTL to cache by
        expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('returns authErr for unresolved env placeholder in tokenUrl', async () => {
        const result = await service.applyAuth(
            config,
            makeAuth({ tokenUrl: '{{MISSING_VAR}}/token' }),
            {}
        );
        expect(result.isErr).toBe(true);
        if (result.isErr) {
            expect(result.error).toContain('Unresolved placeholders');
        }
    });

    it('returns authErr when auth is disabled', async () => {
        const result = await service.applyAuth(config, makeAuth({ enabled: false }), {});
        expect(result.isErr).toBe(true);
        if (result.isErr) {
            expect(result.error).toContain('disabled');
        }
    });

    it('returns authErr when auth is expired', async () => {
        const result = await service.applyAuth(
            config,
            makeAuth({ expiryDate: new Date(Date.now() - 1000).toISOString() }),
            {}
        );
        expect(result.isErr).toBe(true);
        if (result.isErr) {
            expect(result.error).toContain('expired');
        }
    });

    it('returns authErr when domain filter does not match', async () => {
        const result = await service.applyAuth(
            config,
            makeAuth({ domainFilters: ['other.example.com'] }),
            {}
        );
        expect(result.isErr).toBe(true);
        if (result.isErr) {
            expect(result.error).toContain('domain');
        }
    });

    it('returns authErr when token endpoint returns an error', async () => {
        mockSend.mockResolvedValueOnce({ error: 'Network error', response: { status: 0, data: null, headers: {} } } as any);

        const result = await service.applyAuth(config, makeAuth(), {});
        expect(result.isErr).toBe(true);
    });

    it('returns authErr when token response is missing access_token', async () => {
        mockSend.mockResolvedValueOnce({
            error: null,
            response: { status: 200, data: { token_type: 'Bearer' }, headers: {} },
        } as any);

        const result = await service.applyAuth(config, makeAuth(), {});
        expect(result.isErr).toBe(true);
    });

    it('skips request when Authorization header already present', async () => {
        const configWithAuth: AuthRequestConfig = {
            ...config,
            headers: { Authorization: 'Bearer existing-token' },
        };
        const result = await service.applyAuth(configWithAuth, makeAuth(), {});
        expect(result.isErr).toBe(false);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('includes scope in token request when set', async () => {
        mockSend.mockResolvedValueOnce(tokenResponse(3600) as any);

        await service.applyAuth(config, makeAuth({ scope: 'read write' }), {});

        const call = mockSend.mock.calls[0][0];
        expect(call.body).toContain('scope=read+write');
    });
});
