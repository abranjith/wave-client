import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PassThrough } from 'stream';

// ── Module mocks ──────────────────────────────────────────────────────────────
// vi.mock calls are hoisted to the top of the file by Vitest.

vi.mock('axios');

vi.mock('../../services/StoreService.js', () => ({
    storeService: {
        getHttpsAgentForUrl: vi.fn().mockResolvedValue(null),
    },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import axios from 'axios';
import { SseService, setSseAuthServiceFactory } from '../../services/SseService.js';
import { storeService } from '../../services/StoreService.js';
import type { SseConnectionHandle, ConnectionStatus, SseEvent } from '@wave-client/core';
import { AuthType } from '../../services/auth/types.js';

const mockStoreService = storeService as { getHttpsAgentForUrl: ReturnType<typeof vi.fn> };
const mockAxios = vi.mocked(axios);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Flush all pending microtasks and macrotasks so async operations complete.
 * Used after triggering asynchronous side-effects (stream push, status emit).
 */
const flushPromises = (): Promise<void> =>
    new Promise<void>(resolve => setImmediate(resolve));

/**
 * Connection config type alias.
 */
type ConnectConfig = Parameters<SseService['connect']>[0];

/** Build a minimal `SseConnectionConfig`, applying optional overrides. */
function makeConfig(overrides: Partial<ConnectConfig> = {}): ConnectConfig {
    return {
        id: crypto.randomUUID(),
        method: 'GET',
        url: 'http://localhost:8080/events',
        ...overrides,
    };
}

/**
 * Connect to the service with a mock axios response that is pre-resolved.
 *
 * By the time this resolves, `_openStream` has already executed (it runs in a
 * microtask before the caller resumes from `await connect()`), so the stream has
 * its `data`/`end`/`error` listeners registered and the connection is `'connected'`.
 */
async function connectAndReady(
    service: SseService,
    overrides: Partial<ConnectConfig> = {},
    responseHeaders: Record<string, string> = { 'content-type': 'text/event-stream' },
): Promise<{ handle: SseConnectionHandle; stream: PassThrough }> {
    const stream = new PassThrough();
    mockAxios.mockResolvedValueOnce({ status: 200, headers: responseHeaders, data: stream });

    const config = makeConfig(overrides);
    const handle = await service.connect(config);
    if (!handle) {throw new Error('Expected non-null SseConnectionHandle from connectAndReady');}

    return { handle, stream };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('SseService', () => {
    let service: SseService;

    beforeEach(() => {
        service = new SseService();
        setSseAuthServiceFactory(null);
        // Avoid vi.clearAllMocks() here — it would wipe the storeService mock
        // implementation. Use selective resets instead.
        mockStoreService.getHttpsAgentForUrl.mockClear();
        mockStoreService.getHttpsAgentForUrl.mockResolvedValue(null);
        mockAxios.mockClear();
    });

    afterEach(() => {
        setSseAuthServiceFactory(null);
    });

    // ── SseFrameParser tests (T01–T15) ────────────────────────────────────
    //
    // The SseFrameParser is an internal (non-exported) class. It is tested
    // indirectly through the service by pushing raw SSE bytes into the mock
    // PassThrough stream and asserting on the resulting parsed events.

    describe('SseFrameParser', () => {

        // T01: Single event, single chunk
        it('T01: dispatches a "message" event for a single-chunk data frame', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            stream.push('data: hello\n\n');
            await flushPromises();

            expect(events).toHaveLength(1);
            expect(events[0].eventName).toBe('message');
            expect(events[0].data).toBe('hello');
        });

        // T02: Named event field
        it('T02: uses the event: field value as the eventName', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            stream.push('event: update\ndata: payload\n\n');
            await flushPromises();

            expect(events).toHaveLength(1);
            expect(events[0].eventName).toBe('update');
            expect(events[0].data).toBe('payload');
        });

        // T03: Multi-line data concatenated with \n
        it('T03: concatenates multiple data: lines with a newline separator', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            stream.push('data: line1\ndata: line2\n\n');
            await flushPromises();

            expect(events).toHaveLength(1);
            expect(events[0].data).toBe('line1\nline2');
        });

        // T04: Event with id: field
        it('T04: captures the id: field value on the dispatched event', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            stream.push('id: 42\ndata: hello\n\n');
            await flushPromises();

            expect(events[0].eventId).toBe('42');
        });

        // T05: id: field containing null character is ignored per SSE spec
        it('T05: ignores an id: field containing a null character', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            stream.push('id: bad\0id\ndata: hello\n\n');
            await flushPromises();

            expect(events[0].eventId).toBeUndefined();
        });

        // T06: retry: field alone → no event dispatched
        it('T06: does not dispatch an event when only a retry: field is present (empty data)', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            stream.push('retry: 3000\n\n');
            await flushPromises();

            // retry: alone without any data: field → no event
            expect(events).toHaveLength(0);
        });

        // T07: retry: with non-numeric value is silently ignored
        it('T07: ignores a retry: field whose value contains non-digit characters', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            // Non-numeric retry value should be ignored; data event should still parse
            stream.push('retry: abc\ndata: hello\n\n');
            await flushPromises();

            expect(events).toHaveLength(1);
            expect(events[0].data).toBe('hello');
        });

        // T08: Comment lines (starting with ':') are ignored
        it('T08: ignores SSE comment lines (starting with ":")', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            stream.push(': this is a comment\ndata: hello\n\n');
            await flushPromises();

            expect(events).toHaveLength(1);
            expect(events[0].eventName).toBe('message');
            expect(events[0].data).toBe('hello');
        });

        // T09: Event with no data → no dispatch
        it('T09: does not dispatch an event when the data buffer is empty', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            // event: without any data: → data buffer empty → no dispatch per SSE spec
            stream.push('event: ping\n\n');
            await flushPromises();

            expect(events).toHaveLength(0);
        });

        // T10: Partial chunk delivery — line buffer across two pushes
        it('T10: correctly assembles a data frame split across two stream chunks', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            stream.push('da');
            stream.push('ta: hello\n\n');
            await flushPromises();

            expect(events).toHaveLength(1);
            expect(events[0].data).toBe('hello');
        });

        // T11: Multiple events in one push
        it('T11: dispatches multiple events contained in a single stream chunk', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            stream.push('data: a\n\ndata: b\n\n');
            await flushPromises();

            expect(events).toHaveLength(2);
            expect(events[0].data).toBe('a');
            expect(events[1].data).toBe('b');
        });

        // T12: \r\n line endings handled the same as \n
        it('T12: handles \\r\\n line endings identically to \\n', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            stream.push('data: hello\r\n\r\n');
            await flushPromises();

            expect(events).toHaveLength(1);
            expect(events[0].data).toBe('hello');
        });

        // T13: Per-spec: only the first leading space after ':' is trimmed
        it('T13: trims only the first leading space after the colon (SSE spec)', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            // 'data:  two spaces' → value is ' two spaces' (first space trimmed, second preserved)
            stream.push('data:  two spaces\n\n');
            await flushPromises();

            expect(events[0].data).toBe(' two spaces');
        });

        // T14: Field name with no colon → value is empty string
        it('T14: treats a data field with no colon as an empty string (no dispatch)', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            // 'data\n' (no colon) → field=data, value='' → empty data buffer → no dispatch
            stream.push('data\n\n');
            await flushPromises();

            expect(events).toHaveLength(0);
        });

        // T15: flush() dispatches pending event at stream end
        it('T15: dispatches a pending event via flush() when the stream ends without a trailing blank line', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            // Push data WITHOUT a trailing blank line, then end the stream
            // The 'end' event triggers parser.flush() which dispatches the buffered event
            stream.push('data: hello');
            stream.push(null); // signals end of stream
            await flushPromises();

            expect(events).toHaveLength(1);
            expect(events[0].data).toBe('hello');
        });

    });

    // ── SseService lifecycle tests (T16–T37) ──────────────────────────────

    describe('connection lifecycle', () => {

        // T16: Valid http:// URL — axios called with correct params
        it('T16: calls axios with correct method, URL, and responseType=stream for http://', async () => {
            const stream = new PassThrough();
            mockAxios.mockResolvedValueOnce({ status: 200, headers: {}, data: stream });

            const config = makeConfig({ url: 'http://example.com/events', method: 'GET' });
            await service.connect(config);

            expect(mockAxios).toHaveBeenCalledOnce();
            expect(mockAxios.mock.calls[0][0]).toMatchObject({
                method: 'GET',
                url: 'http://example.com/events',
                responseType: 'stream',
            });
        });

        // T17: Valid https:// URL — HTTPS agent retrieved and passed to axios
        it('T17: retrieves and uses the HTTPS agent from storeService for https:// URLs', async () => {
            const fakeAgent = { options: { rejectUnauthorized: true } };
            mockStoreService.getHttpsAgentForUrl.mockResolvedValue(fakeAgent);
            const stream = new PassThrough();
            mockAxios.mockResolvedValueOnce({ status: 200, headers: {}, data: stream });

            await service.connect(makeConfig({ url: 'https://secure.example.com/events' }));

            expect(mockStoreService.getHttpsAgentForUrl).toHaveBeenCalledWith(
                'https://secure.example.com/events',
            );
            expect(mockAxios.mock.calls[0][0]).toMatchObject({ httpsAgent: fakeAgent });
        });

        // T18: onStatusChange fires 'connecting' then 'connected'
        it('T18: onStatusChange fires "connecting" then "connected" as the connection opens', async () => {
            // Use a deferred axios mock so we control exactly when the connection opens.
            // With mockResolvedValue, _openStream runs before the caller resumes, so
            // we can't observe the 'connecting' transition — we need a pending promise.
            let resolveAxios!: (r: unknown) => void;
            mockAxios.mockReturnValueOnce(new Promise(r => { resolveAxios = r; }));

            const config = makeConfig();
            const handle = await service.connect(config);
            if (!handle) {throw new Error('Expected non-null handle');}

            const statuses: ConnectionStatus[] = [];
            handle.onStatusChange(s => statuses.push(s));

            // Registering onStatusChange fires immediately with the current status,
            // which should be 'connecting' since axios is still pending.
            expect(statuses).toEqual(['connecting']);

            // Now open the connection by resolving the axios mock
            const mockStream = new PassThrough();
            resolveAxios({ status: 200, headers: {}, data: mockStream });
            await flushPromises();

            expect(statuses).toEqual(['connecting', 'connected']);
        });

        // T19: onHeaders fires with initial HTTP response headers
        it('T19: onHeaders fires with the initial HTTP response headers on connection open', async () => {
            // Use deferred axios mock so we can register the header listener before
            // the connection completes (headers are emitted once during _openStream).
            let resolveAxios!: (r: unknown) => void;
            mockAxios.mockReturnValueOnce(new Promise(r => { resolveAxios = r; }));

            const handle = await service.connect(makeConfig());
            if (!handle) {throw new Error('Expected non-null handle');}

            const receivedHeaders: Record<string, string>[] = [];
            handle.onHeaders(h => receivedHeaders.push(h));

            // Resolve the connection with specific response headers
            const mockStream = new PassThrough();
            resolveAxios({
                status: 200,
                headers: { 'content-type': 'text/event-stream', 'x-request-id': 'abc123' },
                data: mockStream,
            });
            await flushPromises();

            expect(receivedHeaders).toHaveLength(1);
            expect(receivedHeaders[0]).toMatchObject({
                'content-type': 'text/event-stream',
                'x-request-id': 'abc123',
            });
        });

        // T20: onEvent fires for parsed SSE events
        it('T20: onEvent fires for each parsed SSE event received from the stream', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            stream.push('data: hello\n\n');
            await flushPromises();

            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({ eventName: 'message', data: 'hello' });
        });

        // T21: Multiple events all dispatched
        it('T21: dispatches all events present in the stream', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            stream.push('data: first\n\ndata: second\n\n');
            await flushPromises();

            expect(events).toHaveLength(2);
            expect(events[0].data).toBe('first');
            expect(events[1].data).toBe('second');
        });

        // T22: Named SSE event
        it('T22: parses named SSE events (event: field) from the stream', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            stream.push('event: update\ndata: payload\n\n');
            await flushPromises();

            expect(events[0]).toMatchObject({ eventName: 'update', data: 'payload' });
        });

        // T23: Stream end emits 'disconnected'
        it('T23: emits "disconnected" status when the stream ends normally', async () => {
            const { handle, stream } = await connectAndReady(service);

            const statuses: ConnectionStatus[] = [];
            handle.onStatusChange(s => statuses.push(s));

            stream.push(null); // signal end of stream
            await flushPromises();

            expect(statuses).toContain('disconnected');
        });

        // T24: Stream error emits onError + 'error' status
        it('T24: emits onError and "error" status when the stream emits an error', async () => {
            const { handle, stream } = await connectAndReady(service);

            const errors: string[] = [];
            const statuses: ConnectionStatus[] = [];
            handle.onError(e => errors.push(e));
            handle.onStatusChange(s => statuses.push(s));

            stream.emit('error', new Error('connection reset'));
            await flushPromises();

            expect(errors).toContain('connection reset');
            expect(statuses).toContain('error');
        });

        // T25: disconnect() emits 'disconnecting' and aborts the request
        it('T25: disconnect() emits "disconnecting" status and cancels the request', async () => {
            const { handle, stream: _stream } = await connectAndReady(service);

            const statuses: ConnectionStatus[] = [];
            handle.onStatusChange(s => statuses.push(s));

            const result = await service.disconnect(handle.connectionId);

            expect(result.isOk).toBe(true);
            expect(statuses).toContain('disconnecting');
        });

        // T26: disconnect() returns err for unknown connectionId
        it('T26: disconnect() returns an error result when the connection ID is not found', async () => {
            const result = await service.disconnect('nonexistent-id-12345');

            expect(result.isOk).toBe(false);
            if (!result.isOk) {
                expect(result.error).toContain('nonexistent-id-12345');
            }
        });

        // T27: Invalid scheme ws:// — returns null
        it('T27: returns null for a ws:// URL without making any network call', async () => {
            const handle = await service.connect(
                makeConfig({ url: 'ws://localhost:8080/events' }),
            );

            expect(handle).toBeNull();
            expect(mockAxios).not.toHaveBeenCalled();
        });

        // T28: Invalid scheme javascript: — returns null
        it('T28: returns null for a javascript: URL without making any network call', async () => {
            const handle = await service.connect(
                makeConfig({ url: 'javascript:alert(1)' }),
            );

            expect(handle).toBeNull();
            expect(mockAxios).not.toHaveBeenCalled();
        });

        // T29: Connection limit (MAX_CONNECTIONS = 10)
        it('T29: returns null when the connection limit of 10 is reached', async () => {
            // Open exactly MAX_CONNECTIONS connections
            for (let i = 0; i < 10; i++) {
                const stream = new PassThrough();
                mockAxios.mockResolvedValueOnce({ status: 200, headers: {}, data: stream });
                const h = await service.connect(makeConfig({ id: `conn-limit-${i}` }));
                expect(h).not.toBeNull();
            }

            // The 11th connection must be rejected
            const overflow = await service.connect(makeConfig({ id: 'conn-overflow' }));

            expect(overflow).toBeNull();
        });

        // T30: Unsubscribe removes listener — no further callbacks after unsubscribe
        it('T30: unsubscribing onEvent prevents subsequent event callbacks', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            const unsub = handle.onEvent(e => events.push(e));
            unsub(); // remove listener immediately

            stream.push('data: should-not-appear\n\n');
            await flushPromises();

            expect(events).toHaveLength(0);
        });

        // T31: Late onStatusChange subscriber fires immediately with current status
        it('T31: onStatusChange fires immediately with "connected" for a late subscriber', async () => {
            // With mockResolvedValue, _openStream has already emitted 'connected'
            // before the caller resumes, so a late subscriber gets it immediately.
            const { handle } = await connectAndReady(service);

            const statuses: ConnectionStatus[] = [];
            handle.onStatusChange(s => statuses.push(s));

            // Should have fired immediately with the current status
            expect(statuses).toEqual(['connected']);
        });

        // T32: Accept: text/event-stream always present
        it('T32: always includes "Accept: text/event-stream" in the request headers', async () => {
            const stream = new PassThrough();
            mockAxios.mockResolvedValueOnce({ status: 200, headers: {}, data: stream });

            await service.connect(makeConfig());

            expect(mockAxios.mock.calls[0][0].headers).toMatchObject({
                'Accept': 'text/event-stream',
            });
        });

        // T33: Cache-Control: no-cache always present
        it('T33: always includes "Cache-Control: no-cache" in the request headers', async () => {
            const stream = new PassThrough();
            mockAxios.mockResolvedValueOnce({ status: 200, headers: {}, data: stream });

            await service.connect(makeConfig());

            expect(mockAxios.mock.calls[0][0].headers).toMatchObject({
                'Cache-Control': 'no-cache',
            });
        });

        // T34: POST method with body
        it('T34: passes the request body to axios for POST-based SSE connections', async () => {
            const stream = new PassThrough();
            mockAxios.mockResolvedValueOnce({ status: 200, headers: {}, data: stream });

            await service.connect(makeConfig({
                method: 'POST',
                body: { filter: 'all', cursor: 'abc' },
            }));

            expect(mockAxios.mock.calls[0][0]).toMatchObject({
                method: 'POST',
                data: { filter: 'all', cursor: 'abc' },
            });
        });

        // T35: Query params appended to URL
        it('T35: appends query params to the request URL when params is provided', async () => {
            const stream = new PassThrough();
            mockAxios.mockResolvedValueOnce({ status: 200, headers: {}, data: stream });

            await service.connect(makeConfig({
                url: 'http://localhost/events',
                params: 'a=1&b=2',
            }));

            expect(mockAxios.mock.calls[0][0].url).toBe('http://localhost/events?a=1&b=2');
        });

        // T36: Frame with no data field → no event dispatched
        it('T36: does not dispatch an event for a frame that contains no data: field', async () => {
            const { handle, stream } = await connectAndReady(service);
            const events: SseEvent[] = [];
            handle.onEvent(e => events.push(e));

            stream.push('event: ping\n\n');
            await flushPromises();

            expect(events).toHaveLength(0);
        });

        // T37: Malformed URL → returns null
        it('T37: returns null for a malformed URL string', async () => {
            const handle = await service.connect(makeConfig({ url: 'not-a-url' }));

            expect(handle).toBeNull();
            expect(mockAxios).not.toHaveBeenCalled();
        });

    });

    // ── Auth and proxy tests (T38–T44) ────────────────────────────────────

    describe('auth and proxy integration', () => {

        // T38: Auth: ApiKey adds header to request
        it('T38: merges auth headers (API key) from the factory into the SSE request', async () => {
            const mockAuthResult = {
                isOk: true as const,
                value: { headers: { 'X-Api-Key': 'key123' } },
            };
            const mockAuthSvc = { applyAuth: vi.fn().mockResolvedValue(mockAuthResult) };
            const mockFactory = { getService: vi.fn().mockReturnValue(mockAuthSvc) };
            setSseAuthServiceFactory(mockFactory);

            const stream = new PassThrough();
            mockAxios.mockResolvedValueOnce({ status: 200, headers: {}, data: stream });

            await service.connect(makeConfig({
                auth: { type: AuthType.API_KEY, enabled: true } as ConnectConfig['auth'],
            }));

            expect(mockAxios.mock.calls[0][0].headers).toMatchObject({
                'X-Api-Key': 'key123',
            });
        });

        // T39: Auth: Bearer/OAUTH2_REFRESH adds Authorization header
        it('T39: adds an "Authorization: Bearer" header for OAUTH2_REFRESH auth', async () => {
            const mockAuthResult = {
                isOk: true as const,
                value: { headers: { Authorization: 'Bearer tok' } },
            };
            const mockAuthSvc = { applyAuth: vi.fn().mockResolvedValue(mockAuthResult) };
            const mockFactory = { getService: vi.fn().mockReturnValue(mockAuthSvc) };
            setSseAuthServiceFactory(mockFactory);

            const stream = new PassThrough();
            mockAxios.mockResolvedValueOnce({ status: 200, headers: {}, data: stream });

            await service.connect(makeConfig({
                auth: { type: AuthType.OAUTH2_REFRESH, enabled: true } as ConnectConfig['auth'],
            }));

            expect(mockAxios.mock.calls[0][0].headers).toMatchObject({
                Authorization: 'Bearer tok',
            });
        });

        // T40: Auth: Digest is skipped with a console.warn
        it('T40: skips Digest auth with a console.warn and never calls the auth service', async () => {
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const mockFactory = { getService: vi.fn() };
            setSseAuthServiceFactory(mockFactory);

            const stream = new PassThrough();
            mockAxios.mockResolvedValueOnce({ status: 200, headers: {}, data: stream });

            await service.connect(makeConfig({
                auth: { type: AuthType.DIGEST, enabled: true } as ConnectConfig['auth'],
            }));

            // The factory must NOT be consulted — Digest is rejected before getService
            expect(mockFactory.getService).not.toHaveBeenCalled();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('digest'));

            consoleWarnSpy.mockRestore();
        });

        // T41: No auth factory set → request proceeds without auth
        it('T41: proceeds without auth headers when no auth factory is set (factory is null)', async () => {
            setSseAuthServiceFactory(null);

            const stream = new PassThrough();
            mockAxios.mockResolvedValueOnce({ status: 200, headers: {}, data: stream });

            const handle = await service.connect(makeConfig({
                auth: { type: AuthType.OAUTH2_REFRESH, enabled: true } as ConnectConfig['auth'],
            }));

            expect(handle).not.toBeNull();
            // Default headers should still be present even without auth
            expect(mockAxios.mock.calls[0][0].headers).toMatchObject({
                'Accept': 'text/event-stream',
            });
        });

        // T42: User-supplied Accept header overrides the default
        it('T42: allows a user-supplied Accept header to override the default "text/event-stream"', async () => {
            const stream = new PassThrough();
            mockAxios.mockResolvedValueOnce({ status: 200, headers: {}, data: stream });

            await service.connect(makeConfig({
                headers: { Accept: 'text/html' },
            }));

            expect(mockAxios.mock.calls[0][0].headers['Accept']).toBe('text/html');
        });

        // T43: https:// URL uses HTTPS agent from storeService
        it('T43: retrieves the HTTPS agent from storeService and passes it to axios for https:// URLs', async () => {
            const fakeAgent = { options: { rejectUnauthorized: true } };
            mockStoreService.getHttpsAgentForUrl.mockResolvedValue(fakeAgent);
            const stream = new PassThrough();
            mockAxios.mockResolvedValueOnce({ status: 200, headers: {}, data: stream });

            await service.connect(makeConfig({ url: 'https://secure.example.com/events' }));

            expect(mockStoreService.getHttpsAgentForUrl).toHaveBeenCalledWith(
                'https://secure.example.com/events',
            );
            expect(mockAxios.mock.calls[0][0]).toMatchObject({ httpsAgent: fakeAgent });
        });

        // T44: http:// URL does NOT trigger HTTPS agent lookup
        it('T44: does not call storeService.getHttpsAgentForUrl for http:// URLs', async () => {
            const stream = new PassThrough();
            mockAxios.mockResolvedValueOnce({ status: 200, headers: {}, data: stream });

            await service.connect(makeConfig({ url: 'http://localhost/events' }));

            expect(mockStoreService.getHttpsAgentForUrl).not.toHaveBeenCalled();
        });

    });
});
