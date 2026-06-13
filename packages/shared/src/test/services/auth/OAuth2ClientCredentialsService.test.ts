/**
 * Unit tests for OAuth2ClientCredentialsService.
 *
 * Covers:
 *  - Obtains a token and returns Authorization header
 *  - clientAuthMethod 'basic' vs 'body'
 *  - scope and audience included only when set
 *  - Token cached when expires_in present; not cached when absent
 *  - Existing Authorization header is preserved (no-op)
 *  - Missing required field returns authErr
 *  - Unresolved env placeholder returns authErr
 *  - Validation (disabled, expired, domain mismatch) returns authErr
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OAuth2ClientCredentialsService } from '../../../services/auth/OAuth2ClientCredentialsService.js';
import type { OAuth2ClientCredentialsAuth } from '../../../services/auth/types.js';
import { AuthType } from '../../../services/auth/types.js';
import type { AuthRequestConfig } from '../../../services/auth/types.js';

vi.mock('../../../services/HttpService.js', () => ({
    httpService: { send: vi.fn() },
}));

import { httpService } from '../../../services/HttpService.js';
const mockSend = vi.mocked(httpService.send);

const makeAuth = (overrides: Partial<OAuth2ClientCredentialsAuth> = {}): OAuth2ClientCredentialsAuth => ({
    id: 'cc-1',
    name: 'CC Auth',
    type: AuthType.OAUTH2_CLIENT_CREDENTIALS,
    enabled: true,
    domainFilters: [],
    tokenUrl: 'https://auth.example.com/token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
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
            access_token: 'at-cc-001',
            token_type: 'Bearer',
            ...(expiresIn !== undefined ? { expires_in: expiresIn } : {}),
        },
        headers: {},
    },
});

describe('OAuth2ClientCredentialsService', () => {
    let service: OAuth2ClientCredentialsService;

    beforeEach(() => {
        service = new OAuth2ClientCredentialsService();
        vi.clearAllMocks();
    });

    it('returns Authorization: Bearer <token> on success', async () => {
        mockSend.mockResolvedValueOnce(tokenResponse(3600) as any);
        const result = await service.applyAuth(config, makeAuth(), {});
        expect(result.isErr).toBe(false);
        if (!result.isErr) {
            expect(result.value.headers?.['Authorization']).toBe('Bearer at-cc-001');
        }
    });

    it("clientAuthMethod 'basic' sends credentials in Authorization header, not body", async () => {
        mockSend.mockResolvedValueOnce(tokenResponse(3600) as any);
        await service.applyAuth(config, makeAuth({ clientAuthMethod: 'basic' }), {});

        const call = mockSend.mock.calls[0][0];
        expect(call.headers['Authorization']).toMatch(/^Basic /);
        expect(call.body).not.toContain('client_id=');
    });

    it("clientAuthMethod 'body' sends credentials in request body", async () => {
        mockSend.mockResolvedValueOnce(tokenResponse(3600) as any);
        await service.applyAuth(config, makeAuth({ clientAuthMethod: 'body' }), {});

        const call = mockSend.mock.calls[0][0];
        expect(call.headers['Authorization']).toBeUndefined();
        expect(call.body).toContain('client_id=client-id');
        expect(call.body).toContain('client_secret=client-secret');
    });

    it('includes scope in the token request when set', async () => {
        mockSend.mockResolvedValueOnce(tokenResponse(3600) as any);
        await service.applyAuth(config, makeAuth({ scope: 'api:read' }), {});
        expect(mockSend.mock.calls[0][0].body).toContain('scope=api%3Aread');
    });

    it('omits scope from the token request when not set', async () => {
        mockSend.mockResolvedValueOnce(tokenResponse(3600) as any);
        await service.applyAuth(config, makeAuth(), {});
        expect(mockSend.mock.calls[0][0].body).not.toContain('scope=');
    });

    it('includes audience when set', async () => {
        mockSend.mockResolvedValueOnce(tokenResponse(3600) as any);
        await service.applyAuth(config, makeAuth({ audience: 'https://api.example.com' }), {});
        expect(mockSend.mock.calls[0][0].body).toContain('audience=');
    });

    it('omits audience when not set', async () => {
        mockSend.mockResolvedValueOnce(tokenResponse(3600) as any);
        await service.applyAuth(config, makeAuth(), {});
        expect(mockSend.mock.calls[0][0].body).not.toContain('audience=');
    });

    it('caches the token when expires_in present — second call skips network', async () => {
        mockSend.mockResolvedValue(tokenResponse(3600) as any);
        await service.applyAuth(config, makeAuth(), {});
        await service.applyAuth(config, makeAuth(), {});
        expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('does not cache when expires_in is absent — second call re-fetches', async () => {
        mockSend.mockResolvedValue(tokenResponse() as any);
        await service.applyAuth(config, makeAuth(), {});
        await service.applyAuth(config, makeAuth(), {});
        expect(mockSend).toHaveBeenCalledTimes(2);
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

    it('returns authErr for unresolved placeholder in tokenUrl', async () => {
        const result = await service.applyAuth(config, makeAuth({ tokenUrl: '{{MISSING}}/token' }), {});
        expect(result.isErr).toBe(true);
        if (result.isErr) expect(result.error).toContain('Unresolved placeholders');
    });

    it('returns authErr when auth is disabled', async () => {
        const result = await service.applyAuth(config, makeAuth({ enabled: false }), {});
        expect(result.isErr).toBe(true);
        if (result.isErr) expect(result.error).toContain('disabled');
    });

    it('returns authErr when auth is expired', async () => {
        const result = await service.applyAuth(
            config,
            makeAuth({ expiryDate: new Date(Date.now() - 1000).toISOString() }),
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

    it('returns authErr when token response is missing access_token', async () => {
        mockSend.mockResolvedValueOnce({
            error: null,
            response: { status: 200, data: { token_type: 'Bearer' }, headers: {} },
        } as any);
        const result = await service.applyAuth(config, makeAuth(), {});
        expect(result.isErr).toBe(true);
    });

    it('sends grant_type=client_credentials in the body', async () => {
        mockSend.mockResolvedValueOnce(tokenResponse(3600) as any);
        await service.applyAuth(config, makeAuth({ clientAuthMethod: 'body' }), {});
        expect(mockSend.mock.calls[0][0].body).toContain('grant_type=client_credentials');
    });
});
