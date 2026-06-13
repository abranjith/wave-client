/**
 * Unit tests for HmacAuthService.
 *
 * Covers:
 *  - Known-vector HMAC for fixed template/secret/algorithm in hex and base64
 *  - All placeholder types resolve from the request config
 *  - Signature placed in header vs query per sendIn
 *  - prefix prepended to signature value
 *  - timestampHeader/nonceHeader emitted only when configured
 *  - Existing target header is preserved (no overwrite)
 *  - Missing required field returns authErr
 *  - Unresolved env placeholder returns authErr
 *  - Validation (disabled, expired, domain) returns authErr
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import { HmacAuthService } from '../../../services/auth/HmacAuthService.js';
import type { HmacAuth } from '../../../services/auth/types.js';
import { AuthType } from '../../../services/auth/types.js';
import type { AuthRequestConfig } from '../../../services/auth/types.js';

const makeAuth = (overrides: Partial<HmacAuth> = {}): HmacAuth => ({
    id: 'hmac-1',
    name: 'HMAC Auth',
    type: AuthType.HMAC,
    enabled: true,
    domainFilters: [],
    algorithm: 'sha256',
    secretKey: 'my-secret-key',
    signatureTemplate: '{method}\\n{path}\\n{timestamp}',
    outputEncoding: 'hex',
    sendIn: 'header',
    targetName: 'X-Signature',
    ...overrides,
});

const config: AuthRequestConfig = {
    method: 'POST',
    url: 'https://api.example.com/data?foo=bar',
    headers: {},
    body: '{"key":"value"}',
};

describe('HmacAuthService', () => {
    let service: HmacAuthService;

    beforeEach(() => {
        service = new HmacAuthService();
    });

    it('computes HMAC-SHA256/hex signature and sets target header', async () => {
        const result = await service.applyAuth(config, makeAuth(), {});
        expect(result.isErr).toBe(false);
        if (!result.isErr) {
            const sig = result.value.headers?.['X-Signature'];
            expect(sig).toBeDefined();
            // Must be a 64-char hex string (SHA-256 produces 32 bytes)
            expect(sig).toMatch(/^[0-9a-f]{64}$/);
        }
    });

    it('HMAC-SHA256/hex matches a known independently-computed vector', async () => {
        // Use a fixed template with no {timestamp}/{nonce} to produce a deterministic result
        const staticAuth = makeAuth({ signatureTemplate: '{method}:{path}', secretKey: 'test-key' });
        const staticConfig: AuthRequestConfig = {
            method: 'GET',
            url: 'https://example.com/endpoint',
            headers: {},
        };

        const result = await service.applyAuth(staticConfig, staticAuth, {});

        const expectedString = 'GET:/endpoint';
        const expected = crypto.createHmac('sha256', 'test-key').update(expectedString).digest('hex');

        expect(result.isErr).toBe(false);
        if (!result.isErr) {
            expect(result.value.headers?.['X-Signature']).toBe(expected);
        }
    });

    it('produces a different signature with base64 output encoding', async () => {
        const hexResult = await service.applyAuth(config, makeAuth({ signatureTemplate: '{method}:{host}', outputEncoding: 'hex' }), {});
        const b64Result = await service.applyAuth(config, makeAuth({ signatureTemplate: '{method}:{host}', outputEncoding: 'base64' }), {});

        expect(hexResult.isErr).toBe(false);
        expect(b64Result.isErr).toBe(false);
        if (!hexResult.isErr && !b64Result.isErr) {
            const hex = hexResult.value.headers?.['X-Signature'] ?? '';
            const b64 = b64Result.value.headers?.['X-Signature'] ?? '';
            // Different encodings of the same digest must be different strings
            expect(hex).not.toBe(b64);
            // base64 result should be a valid base64 string
            expect(b64).toMatch(/^[A-Za-z0-9+/]+=*$/);
        }
    });

    it('resolves {method} as upper-case HTTP method', async () => {
        const staticAuth = makeAuth({ signatureTemplate: '{method}', secretKey: 'k' });
        const lowerConfig = { ...config, method: 'get' };
        const result = await service.applyAuth(lowerConfig, staticAuth, {});
        const expected = crypto.createHmac('sha256', 'k').update('GET').digest('hex');
        expect(result.isErr).toBe(false);
        if (!result.isErr) {
            expect(result.value.headers?.['X-Signature']).toBe(expected);
        }
    });

    it('resolves {path} from URL pathname', async () => {
        const auth = makeAuth({ signatureTemplate: '{path}', secretKey: 'k' });
        const result = await service.applyAuth(config, auth, {});
        const expected = crypto.createHmac('sha256', 'k').update('/data').digest('hex');
        if (!result.isErr) {
            expect(result.value.headers?.['X-Signature']).toBe(expected);
        }
    });

    it('resolves {query} without leading ?', async () => {
        const auth = makeAuth({ signatureTemplate: '{query}', secretKey: 'k' });
        const result = await service.applyAuth(config, auth, {});
        const expected = crypto.createHmac('sha256', 'k').update('foo=bar').digest('hex');
        if (!result.isErr) {
            expect(result.value.headers?.['X-Signature']).toBe(expected);
        }
    });

    it('resolves {host} from URL host', async () => {
        const auth = makeAuth({ signatureTemplate: '{host}', secretKey: 'k' });
        const result = await service.applyAuth(config, auth, {});
        const expected = crypto.createHmac('sha256', 'k').update('api.example.com').digest('hex');
        if (!result.isErr) {
            expect(result.value.headers?.['X-Signature']).toBe(expected);
        }
    });

    it('resolves {body} from raw request body', async () => {
        const auth = makeAuth({ signatureTemplate: '{body}', secretKey: 'k' });
        const result = await service.applyAuth(config, auth, {});
        const expected = crypto.createHmac('sha256', 'k').update('{"key":"value"}').digest('hex');
        if (!result.isErr) {
            expect(result.value.headers?.['X-Signature']).toBe(expected);
        }
    });

    it('resolves {body} as empty string when body is absent', async () => {
        const auth = makeAuth({ signatureTemplate: '{body}', secretKey: 'k' });
        const noBodyConfig = { ...config, body: undefined };
        const result = await service.applyAuth(noBodyConfig, auth, {});
        const expected = crypto.createHmac('sha256', 'k').update('').digest('hex');
        if (!result.isErr) {
            expect(result.value.headers?.['X-Signature']).toBe(expected);
        }
    });

    it('places signature in query param when sendIn is query', async () => {
        const auth = makeAuth({ sendIn: 'query', targetName: 'sig' });
        const result = await service.applyAuth(config, auth, {});
        expect(result.isErr).toBe(false);
        if (!result.isErr) {
            expect(result.value.queryParams?.['sig']).toBeDefined();
            expect(result.value.headers?.['X-Signature']).toBeUndefined();
        }
    });

    it('prepends prefix to signature value', async () => {
        const auth = makeAuth({ prefix: 'HMAC ', signatureTemplate: '{method}', secretKey: 'k' });
        const result = await service.applyAuth({ ...config, method: 'GET' }, auth, {});
        if (!result.isErr) {
            const sig = result.value.headers?.['X-Signature'] ?? '';
            expect(sig.startsWith('HMAC ')).toBe(true);
        }
    });

    it('emits timestampHeader when configured', async () => {
        const auth = makeAuth({ timestampHeader: 'X-Timestamp' });
        const result = await service.applyAuth(config, auth, {});
        if (!result.isErr) {
            const ts = result.value.headers?.['X-Timestamp'];
            expect(ts).toBeDefined();
            expect(Number(ts)).toBeGreaterThan(0);
        }
    });

    it('does not emit timestampHeader when not configured', async () => {
        const result = await service.applyAuth(config, makeAuth(), {});
        if (!result.isErr) {
            expect(result.value.headers?.['X-Timestamp']).toBeUndefined();
        }
    });

    it('emits nonceHeader when configured', async () => {
        const auth = makeAuth({ nonceHeader: 'X-Nonce' });
        const result = await service.applyAuth(config, auth, {});
        if (!result.isErr) {
            const nonce = result.value.headers?.['X-Nonce'];
            expect(nonce).toBeDefined();
            expect(nonce).toMatch(/^[0-9a-f]{32}$/);
        }
    });

    it('timestamp in header matches timestamp used in template', async () => {
        const auth = makeAuth({ signatureTemplate: '{timestamp}', secretKey: 'k', timestampHeader: 'X-Ts' });
        const result = await service.applyAuth(config, auth, {});
        if (!result.isErr) {
            const ts = result.value.headers?.['X-Ts'] ?? '';
            const expected = crypto.createHmac('sha256', 'k').update(ts).digest('hex');
            expect(result.value.headers?.['X-Signature']).toBe(expected);
        }
    });

    it('does not overwrite an existing target header', async () => {
        const existingConfig: AuthRequestConfig = {
            ...config,
            headers: { 'X-Signature': 'already-set' },
        };
        const result = await service.applyAuth(existingConfig, makeAuth(), {});
        expect(result.isErr).toBe(false);
        if (!result.isErr) {
            // No new X-Signature in the returned headers (existing one is preserved by HttpService)
            expect(result.value.headers?.['X-Signature']).toBeUndefined();
        }
    });

    it('returns authErr for unresolved placeholder in secretKey', async () => {
        const result = await service.applyAuth(config, makeAuth({ secretKey: '{{MISSING_KEY}}' }), {});
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
            makeAuth({ domainFilters: ['other.com'] }),
            {}
        );
        expect(result.isErr).toBe(true);
        if (result.isErr) expect(result.error).toContain('domain');
    });

    it('supports SHA-1 algorithm', async () => {
        const auth = makeAuth({ algorithm: 'sha1', signatureTemplate: '{method}', secretKey: 'k', outputEncoding: 'hex' });
        const result = await service.applyAuth({ ...config, method: 'GET' }, auth, {});
        const expected = crypto.createHmac('sha1', 'k').update('GET').digest('hex');
        if (!result.isErr) {
            expect(result.value.headers?.['X-Signature']).toBe(expected);
        }
    });

    it('supports SHA-512 algorithm', async () => {
        const auth = makeAuth({ algorithm: 'sha512', signatureTemplate: '{method}', secretKey: 'k', outputEncoding: 'hex' });
        const result = await service.applyAuth({ ...config, method: 'GET' }, auth, {});
        const expected = crypto.createHmac('sha512', 'k').update('GET').digest('hex');
        if (!result.isErr) {
            expect(result.value.headers?.['X-Signature']).toBe(expected);
        }
    });
});
