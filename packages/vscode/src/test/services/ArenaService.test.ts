import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArenaService } from '@wave-client/arena';
import type { ChatChunk } from '@wave-client/arena';
import type { ArenaChatRequest, ArenaChatStreamChunk, ArenaProviderSettings } from '@wave-client/shared';
import { ARENA_AGENT_IDS, arenaStorageService, httpService, getModelsForProvider } from '@wave-client/shared';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Mock functions passed as DI deps into ArenaService. */
const mockChatFn = vi.fn();
const mockCreateProviderFactory = vi.fn(() => ({}));
const mockCreateWaveClientAgent = vi.fn(() => ({ chat: mockChatFn }));
const mockCreateWebExpertAgent = vi.fn(() => ({ chat: mockChatFn }));

/**
 * Creates a test ArenaService with all factory/agent constructors replaced by
 * vi.fn() mocks.  The shared singletons (arenaStorageService, httpService) are
 * spied on in beforeEach so no vi.mock() is needed for @wave-client/shared.
 */
function makeService(): ArenaService {
    return new ArenaService({
        createProviderFactory: mockCreateProviderFactory as never,
        createWaveClientAgent: mockCreateWaveClientAgent as never,
        createWebExpertAgent: mockCreateWebExpertAgent as never,
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates an async generator that yields the provided partial ChatChunks. */
async function* makeChunks(chunks: Partial<ChatChunk>[]): AsyncGenerator<ChatChunk> {
    for (const c of chunks) {
        yield {
            id: 'chunk-id',
            messageId: 'msg-1',
            content: '',
            done: false,
            ...c,
        } as ChatChunk;
    }
}

/** Builds a minimal valid ArenaChatRequest. */
function makeRequest(overrides: Partial<ArenaChatRequest> = {}): ArenaChatRequest {
    return {
        sessionId: 'session-1',
        message: 'Hello',
        agent: ARENA_AGENT_IDS.WAVE_CLIENT,
        history: [],
        settings: {
            provider: 'gemini',
            maxSessions: 5,
            maxMessagesPerSession: 10,
            maxDocumentSize: 0,
            enableStreaming: true,
        },
        ...overrides,
    } as ArenaChatRequest;
}

/** Default provider settings with a Gemini API key. */
const defaultProviderSettings = {
    gemini: {
        providerId: 'gemini',
        enabled: true,
        apiKey: 'sk-test-key',
        disabledModels: [],
    },
    ollama: {
        providerId: 'ollama',
        enabled: true,
        apiUrl: 'http://localhost:11434',
        disabledModels: [],
    },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArenaService', () => {
    beforeEach(() => {
        // Spy on shared singletons in-place so the arena CJS bundle sees the same mock.
        vi.spyOn(arenaStorageService, 'loadProviderSettings').mockResolvedValue(
            defaultProviderSettings as never,
        );
        vi.spyOn(httpService, 'send').mockResolvedValue({
            response: { status: 200, statusText: 'OK', headers: {}, data: undefined },
        } as never);

        // Reset DI mock fns each test.
        mockChatFn.mockReset();
        mockCreateProviderFactory.mockReset().mockReturnValue({});
        mockCreateWaveClientAgent.mockReset().mockReturnValue({ chat: mockChatFn });
        mockCreateWebExpertAgent.mockReset().mockReturnValue({ chat: mockChatFn });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // streamChat — agent selection
    // -------------------------------------------------------------------------

    describe('streamChat — agent selection', () => {
        it('uses createWaveClientAgent when agent is WAVE_CLIENT', async () => {
            mockChatFn.mockReturnValue(makeChunks([{ content: 'ok', done: true }]));

            const service = makeService();
            const request = makeRequest({ agent: ARENA_AGENT_IDS.WAVE_CLIENT });
            await service.streamChat(request, () => {});

            expect(mockCreateWaveClientAgent).toHaveBeenCalledOnce();
            expect(mockCreateWebExpertAgent).not.toHaveBeenCalled();
        });

        it('uses createWebExpertAgent when agent is WEB_EXPERT', async () => {
            mockChatFn.mockReturnValue(makeChunks([{ content: 'ok', done: true }]));

            const service = makeService();
            const request = makeRequest({ agent: ARENA_AGENT_IDS.WEB_EXPERT });
            await service.streamChat(request, () => {});

            expect(mockCreateWebExpertAgent).toHaveBeenCalledOnce();
            expect(mockCreateWaveClientAgent).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // streamChat — chunk forwarding
    // -------------------------------------------------------------------------

    describe('streamChat — chunk forwarding', () => {
        it('forwards chunks and accumulates content correctly', async () => {
            mockChatFn.mockReturnValue(
                makeChunks([
                    { content: 'Hello', done: false },
                    { content: ' World', done: true },
                ]),
            );

            const service = makeService();
            const chunks: ArenaChatStreamChunk[] = [];
            const response = await service.streamChat(makeRequest(), (c) => chunks.push(c));

            // ArenaService emits a heartbeat chunk first, then the real content chunks
            const contentChunks = chunks.filter((c) => !c.heartbeat);
            expect(contentChunks).toHaveLength(2);
            expect(contentChunks[0]).toMatchObject({ content: 'Hello', done: false });
            expect(contentChunks[1]).toMatchObject({ content: ' World', done: true });
            expect(response.content).toBe('Hello World');
        });

        it('emits content delta (not accumulated string) on non-done chunks', async () => {
            mockChatFn.mockReturnValue(
                makeChunks([
                    { content: 'A', done: false },
                    { content: 'B', done: false },
                    { content: 'C', done: true },
                ]),
            );

            const service = makeService();
            const chunks: ArenaChatStreamChunk[] = [];
            await service.streamChat(makeRequest(), (c) => chunks.push(c));

            // Filter out the heartbeat chunk so we only check content deltas
            const contentChunks = chunks.filter((c) => !c.heartbeat);
            expect(contentChunks[0].content).toBe('A');
            expect(contentChunks[1].content).toBe('B');
        });
    });

    // -------------------------------------------------------------------------
    // streamChat — tool-call chunks
    // -------------------------------------------------------------------------

    describe('streamChat — tool-call chunks', () => {
        it('silently skips tool-call chunks', async () => {
            mockChatFn.mockReturnValue(
                makeChunks([
                    { toolCall: { name: 'search' }, content: '' },
                    { content: 'answer', done: true },
                ]),
            );

            const service = makeService();
            const chunks: ArenaChatStreamChunk[] = [];
            const response = await service.streamChat(makeRequest(), (c) => chunks.push(c));

            // Tool chunk is skipped; heartbeat is also emitted — filter to get only content chunks
            const contentChunks = chunks.filter((c) => !c.heartbeat && !c.toolCall);
            expect(contentChunks).toHaveLength(1);
            expect(contentChunks[0].content).toBe('answer');
            expect(response.content).toBe('answer');
        });
    });

    // -------------------------------------------------------------------------
    // streamChat — AbortSignal
    // -------------------------------------------------------------------------

    describe('streamChat — AbortSignal', () => {
        it('emits a single done:true chunk and returns empty content when signal is already aborted', async () => {
            const service = makeService();
            const controller = new AbortController();
            controller.abort();

            const chunks: ArenaChatStreamChunk[] = [];
            const response = await service.streamChat(makeRequest(), (c) => chunks.push(c), controller.signal);

            expect(chunks).toHaveLength(1);
            expect(chunks[0].done).toBe(true);
            expect(response.content).toBe('');
            // Generator should never have been called
            expect(mockChatFn).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // streamChat — error propagation
    // -------------------------------------------------------------------------

    describe('streamChat — error propagation', () => {
        it('emits error field on the done chunk (content stays empty)', async () => {
            mockChatFn.mockReturnValue(
                makeChunks([
                    { content: 'partial', done: false },
                    { error: 'upstream failure', done: true, content: '' },
                ]),
            );

            const service = makeService();
            const chunks: ArenaChatStreamChunk[] = [];
            const response = await service.streamChat(makeRequest(), (c) => chunks.push(c));

            const lastChunk = chunks[chunks.length - 1];
            expect(lastChunk.done).toBe(true);
            // Error chunk now carries content: '' with a separate error field
            expect(lastChunk.content).toBe('');
            expect(lastChunk.error).toBe('upstream failure');
            // Accumulated response still contains the partial content
            expect(response.content).toContain('partial');
        });
    });

    // -------------------------------------------------------------------------
    // streamChat — provider config errors
    // -------------------------------------------------------------------------

    describe('streamChat — provider config errors', () => {
        it('rejects with an error when Gemini API key is missing', async () => {
            vi.spyOn(arenaStorageService, 'loadProviderSettings').mockResolvedValue({
                gemini: { enabled: true, disabledModels: [] },
            } as never);

            const service = makeService();
            await expect(service.streamChat(makeRequest(), () => {})).rejects.toThrow(/Gemini API key/i);
        });

        it('rejects with an error when provider is unsupported', async () => {
            const request = makeRequest({
                settings: {
                    provider: 'openai' as never,
                    maxSessions: 5,
                    maxMessagesPerSession: 10,
                    maxDocumentSize: 0,
                    enableStreaming: true,
                },
            });

            const service = makeService();
            await expect(service.streamChat(request, () => {})).rejects.toThrow(/not supported/i);
        });
    });

    // -------------------------------------------------------------------------
    // streamChat — agent caching
    // -------------------------------------------------------------------------

    describe('streamChat — agent caching', () => {
        it('calls createWaveClientAgent only once for two requests with identical settings', async () => {
            mockChatFn
                .mockReturnValueOnce(makeChunks([{ content: 'first', done: true }]))
                .mockReturnValueOnce(makeChunks([{ content: 'second', done: true }]));

            const service = makeService();
            const request = makeRequest();

            await service.streamChat(request, () => {});
            await service.streamChat(request, () => {});

            expect(mockCreateWaveClientAgent).toHaveBeenCalledOnce();
        });
    });

    // =========================================================================
    // validateApiKey
    // =========================================================================

    describe('validateApiKey', () => {
        const geminiSettings: ArenaProviderSettings = {
            providerId: 'gemini',
            enabled: true,
            apiKey: 'sk-valid-key',
            disabledModels: [],
        };

        const ollamaSettings: ArenaProviderSettings = {
            providerId: 'ollama',
            enabled: true,
            apiUrl: 'http://localhost:11434',
            disabledModels: [],
        };

        it('returns { valid: true } when Gemini responds ok', async () => {
            vi.spyOn(httpService, 'send').mockResolvedValue({
                response: { status: 200, statusText: 'OK', headers: {}, data: undefined },
            } as never);

            const service = new ArenaService();
            const result = await service.validateApiKey('gemini', geminiSettings);

            expect(result).toEqual({ valid: true });
        });

        it('returns { valid: false, error: "API key is empty" } for empty Gemini key without calling httpService.send', async () => {
            const sendSpy = vi.spyOn(httpService, 'send');

            const service = new ArenaService();
            const result = await service.validateApiKey('gemini', {
                ...geminiSettings,
                apiKey: '',
            });

            expect(result).toEqual({ valid: false, error: 'API key is empty' });
            expect(sendSpy).not.toHaveBeenCalled();
        });

        it('returns { valid: false } when Gemini returns 401', async () => {
            vi.spyOn(httpService, 'send').mockResolvedValue({
                response: { status: 401, statusText: 'Unauthorized', headers: {}, data: undefined },
            } as never);

            const service = new ArenaService();
            const result = await service.validateApiKey('gemini', geminiSettings);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('401');
        });

        it('returns { valid: true } when Ollama endpoint is reachable', async () => {
            vi.spyOn(httpService, 'send').mockResolvedValue({
                response: { status: 200, statusText: 'OK', headers: {}, data: undefined },
            } as never);

            const service = new ArenaService();
            const result = await service.validateApiKey('ollama', ollamaSettings);

            expect(result).toEqual({ valid: true });
        });

        it('returns { valid: false } when httpService.send throws (ECONNREFUSED)', async () => {
            vi.spyOn(httpService, 'send').mockRejectedValue(new Error('ECONNREFUSED'));

            const service = new ArenaService();
            const result = await service.validateApiKey('gemini', geminiSettings);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('ECONNREFUSED');
        });
    });

    // =========================================================================
    // getAvailableModels
    // =========================================================================

    describe('getAvailableModels', () => {
        const ollamaSettings: ArenaProviderSettings = {
            providerId: 'ollama',
            enabled: true,
            apiUrl: 'http://localhost:11434',
            disabledModels: [],
        };

        const geminiSettings: ArenaProviderSettings = {
            providerId: 'gemini',
            enabled: true,
            apiKey: 'sk-key',
            disabledModels: [],
        };

        it('returns dynamic list from live Ollama /api/tags when reachable', async () => {
            vi.spyOn(httpService, 'send').mockResolvedValue({
                response: {
                    status: 200,
                    statusText: 'OK',
                    headers: {},
                    data: { models: [{ name: 'llama3' }, { name: 'mistral' }] },
                },
            } as never);

            const service = new ArenaService();
            const models = await service.getAvailableModels('ollama', ollamaSettings);

            expect(models).toContainEqual(
                expect.objectContaining({ id: 'llama3', label: 'llama3', provider: 'ollama' }),
            );
            expect(models).toContainEqual(
                expect.objectContaining({ id: 'mistral', label: 'mistral', provider: 'ollama' }),
            );
        });

        it('falls back to static list when Ollama httpService.send throws', async () => {
            vi.spyOn(httpService, 'send').mockRejectedValue(new Error('ECONNREFUSED'));

            const service = new ArenaService();
            const models = await service.getAvailableModels('ollama', ollamaSettings);

            expect(models).toEqual(getModelsForProvider('ollama'));
        });

        it('returns static list for Gemini (no httpService.send call)', async () => {
            const sendSpy = vi.spyOn(httpService, 'send');

            const service = new ArenaService();
            const models = await service.getAvailableModels('gemini', geminiSettings);

            expect(models).toEqual(getModelsForProvider('gemini'));
            expect(sendSpy).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // streamChat — heartbeat and timeout (TASK-004)
    // =========================================================================

    describe('streamChat — heartbeat', () => {
        it('emits heartbeat chunk before first content chunk', async () => {
            mockChatFn.mockReturnValue(
                makeChunks([{ content: 'hello', done: true }]),
            );

            const service = makeService();
            const chunks: ArenaChatStreamChunk[] = [];
            await service.streamChat(makeRequest(), (c) => chunks.push(c));

            // First chunk must be the heartbeat
            expect(chunks[0]).toMatchObject({ heartbeat: true, content: '', done: false });
            // Subsequent chunks carry real content
            expect(chunks.some((c) => c.content === 'hello')).toBe(true);
        });

        it('clears stream timer on normal completion (no spurious error)', async () => {
            vi.useFakeTimers();

            mockChatFn.mockReturnValue(
                makeChunks([{ content: 'done', done: true }]),
            );

            const service = makeService();
            const chunks: ArenaChatStreamChunk[] = [];
            await service.streamChat(makeRequest(), (c) => chunks.push(c));

            // Advance past the 90 s threshold — no error chunk should appear
            vi.advanceTimersByTime(91_000);

            expect(chunks.every((c) => !c.error)).toBe(true);

            vi.useRealTimers();
        });
    });

    describe('streamChat — 90 s stream timeout', () => {
        it('emits error chunk and returns after 90 s of generator silence', async () => {
            vi.useFakeTimers();

            // Generator that never yields (simulates a completely stalled LLM)
            async function* neverYields(): AsyncGenerator<ChatChunk> {
                await new Promise<never>(() => { /* never resolves */ });
            }
            mockChatFn.mockReturnValue(neverYields());

            const service = makeService();
            const chunks: ArenaChatStreamChunk[] = [];

            // Do NOT await — the generator is permanently stuck so streamChat
            // will never resolve.  We only verify the side-effect: onChunk is
            // called with an error chunk when the 90 s timer fires.
            service.streamChat(makeRequest(), (c) => chunks.push(c)); // intentionally unawaited

            // Flush enough microtask ticks to let streamChat complete its async
            // setup (buildProviderConfig + getOrCreateAgent = 3 awaits) and
            // register the streamTimer before we advance fake timers.
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve(); // extra buffer

            // Advance fake timers past the 90 s stream timeout
            vi.advanceTimersByTime(90_001);

            const timeoutChunk = chunks.find((c) => c.error);
            expect(timeoutChunk).toBeDefined();
            expect(timeoutChunk?.error).toMatch(/timed out/i);
            expect(timeoutChunk?.done).toBe(true);

            vi.useRealTimers();
        });
    });
});

