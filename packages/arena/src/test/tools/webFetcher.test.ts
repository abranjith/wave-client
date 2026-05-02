import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWebFetcher } from '../../tools/webFetcher';
import type { ReferenceWebsite } from '../../types';

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const STUB_HTML = '<html><head><title>Stub Page</title></head><body><main>stub content</main></body></html>';

const mockFetchResponse = (body: string, status = 200) =>
    Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        text: () => Promise.resolve(body),
    } as Response);

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => mockFetchResponse(STUB_HTML));
});

afterEach(() => {
    fetchSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Reference website fixtures
// ---------------------------------------------------------------------------

const MDN_SITE: ReferenceWebsite = {
    id: 'mdn',
    name: 'MDN',
    url: 'https://developer.mozilla.org/',
    description: 'MDN Web Docs',
    categories: ['http', 'web'],
    enabled: true,
};

const RFC_EDITOR_SITE: ReferenceWebsite = {
    id: 'rfc-editor',
    name: 'RFC Editor',
    url: 'https://www.rfc-editor.org/',
    description: 'RFC Editor',
    categories: ['rfc', 'standards'],
    enabled: true,
};

// ---------------------------------------------------------------------------
// fetchUrl tests
// ---------------------------------------------------------------------------

describe('webFetcher — fetchUrl', () => {
    it('fetches a URL when its origin is in the allowlisted reference websites', async () => {
        const fetcher = createWebFetcher({ websites: [MDN_SITE] });

        const result = await fetcher.fetchUrl('https://developer.mozilla.org/en-US/docs/Web/HTTP');

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const calledUrl = String(fetchSpy.mock.calls[0][0]);
        expect(calledUrl).toContain('developer.mozilla.org');
        expect(result.content).toBeTruthy();
        expect(result.url).toContain('developer.mozilla.org');
    });

    it('returns empty content and warns when origin is not in allowlist', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetcher = createWebFetcher({ websites: [MDN_SITE] });

        const result = await fetcher.fetchUrl('https://random-blog.example.com/post');

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.content).toBe('');
        expect(result.title).toBe('<external URL>');
        expect(result.url).toBe('https://random-blog.example.com/post');
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('not in allowlist'),
            expect.anything(),
        );

        warnSpy.mockRestore();
    });

    it('normalises RFC Editor URLs through fetchRfc for canonical URL dedup', async () => {
        const fetcher = createWebFetcher({ websites: [RFC_EDITOR_SITE] });

        const result = await fetcher.fetchUrl('https://www.rfc-editor.org/rfc/rfc9110');

        // fetchRfc builds the .txt URL — so fetch is called with the canonical .txt form
        const calledUrl = String(fetchSpy.mock.calls[0][0]);
        expect(calledUrl).toContain('rfc9110');
        // result.url should be the canonical .txt URL (set by the fetch response mock)
        expect(result.url).toBeTruthy();
    });

    it('uses the webFetcher cache on the second call to the same URL', async () => {
        const fetcher = createWebFetcher({ websites: [MDN_SITE] });
        const url = 'https://developer.mozilla.org/en-US/docs/Web/HTTP';

        await fetcher.fetchUrl(url);
        await fetcher.fetchUrl(url);

        // Second call must be served from cache — only one real HTTP request
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('returns invalid-URL sentinel for a malformed URL', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetcher = createWebFetcher({ websites: [MDN_SITE] });

        const result = await fetcher.fetchUrl('not-a-valid-url');

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.content).toBe('');
        expect(result.title).toBe('<invalid URL>');
        warnSpy.mockRestore();
    });
});
