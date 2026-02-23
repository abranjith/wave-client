import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatChunk } from '@wave-client/arena';
import type { ArenaChatRequest, ArenaChatStreamChunk, ArenaProviderSettings } from '@wave-client/shared';
import { ARENA_AGENT_IDS, getModelsForProvider } from '@wave-client/shared';

// ---------------------------------------------------------------------------
// Mock @wave-client/arena
// ---------------------------------------------------------------------------

const mockChatFn = vi.fn();
const mockWaveClientAgent = { chat: mockChatFn };
const mockWebExpertAgent = { chat: mockChatFn };
const mockCreateWaveClientAgent = vi.fn(() => mockWaveClientAgent);
const mockCreateWebExpertAgent = vi.fn(() => mockWebExpertAgent);
const mockCreateProviderFactory = vi.fn(() => ({}));

vi.mock('@wave-client/arena', () => ({
    createWaveClientAgent: mockCreateWaveClientAgent,
    createWebExpertAgent: mockCreateWebExpertAgent,
    createProviderFactory: mockCreateProviderFactory,
}));

// ---------------------------------------------------------------------------
// Mock @wave-client/shared
// ---------------------------------------------------------------------------

// vi.hoisted ensures these are available inside mock factories (which are hoisted above variable declarations)
const { mockLoadProviderSettings } = vi.hoisted(() => ({
    mockLoadProviderSettings: vi.fn(),
}));

vi.mock('@wave-client/shared', async (importActual) => {
    const actual = await importActual<typeof import('@wave-client/shared')>();
    return {
        ...actual,
        arenaStorageService: {
            loadProviderSettings: mockLoadProviderSettings,
        },
    };
});

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
    // Lazily import service after all mocks are registered
    let ArenaService: typeof import('../../services/ArenaService.js').ArenaService;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockCreateWaveClientAgent.mockReturnValue(mockWaveClientAgent);
        mockCreateWebExpertAgent.mockReturnValue(mockWebExpertAgent);
        mockCreateProviderFactory.mockReturnValue({});
        mockLoadProviderSettings.mockResolvedValue(defaultProviderSettings);

        // Re-import to get a fresh service instance each time (clears agent cache)
        vi.resetModules();
        mockChatFn.mockReset();
        const mod = await import('../../services/ArenaService.js');
        ArenaService = mod.ArenaService;
    });

    // -------------------------------------------------------------------------
    // streamChat — agent selection
    // -------------------------------------------------------------------------

    describe('streamChat — agent selection', () => {
        it('uses createWaveClientAgent when agent is WAVE_CLIENT', async () => {
            mockChatFn.mockReturnValue(makeChunks([{ content: 'ok', done: true }]));

            const service = new ArenaService();
            const request = makeRequest({ agent: ARENA_AGENT_IDS.WAVE_CLIENT });
            await service.streamChat(request, () => {});

            expect(mockCreateWaveClientAgent).toHaveBeenCalledOnce();
            expect(mockCreateWebExpertAgent).not.toHaveBeenCalled();
        });

        it('uses createWebExpertAgent when agent is WEB_EXPERT', async () => {
            mockChatFn.mockReturnValue(makeChunks([{ content: 'ok', done: true }]));

            const service = new ArenaService();
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

            const service = new ArenaService();
            const chunks: ArenaChatStreamChunk[] = [];
            const response = await service.streamChat(makeRequest(), (c) => chunks.push(c));

            expect(chunks).toHaveLength(2);
            expect(chunks[0]).toMatchObject({ content: 'Hello', done: false });
            expect(chunks[1]).toMatchObject({ content: ' World', done: true });
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

            const service = new ArenaService();
            const chunks: ArenaChatStreamChunk[] = [];
            await service.streamChat(makeRequest(), (c) => chunks.push(c));

            // First chunk should be 'A', not 'AB' or 'ABC'
            expect(chunks[0].content).toBe('A');
            expect(chunks[1].content).toBe('B');
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

            const service = new ArenaService();
            const chunks: ArenaChatStreamChunk[] = [];
            const response = await service.streamChat(makeRequest(), (c) => chunks.push(c));

            // Tool chunk is skipped, only the answer chunk is emitted
            expect(chunks).toHaveLength(1);
            expect(chunks[0].content).toBe('answer');
            expect(response.content).toBe('answer');
        });
    });

    // -------------------------------------------------------------------------
    // streamChat — AbortSignal
    // -------------------------------------------------------------------------

    describe('streamChat — AbortSignal', () => {
        it('emits a single done:true chunk and returns empty content when signal is already aborted', async () => {
            const service = new ArenaService();
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
        it('folds chunk.error into content on the done chunk', async () => {
            mockChatFn.mockReturnValue(
                makeChunks([
                    { content: 'partial', done: false },
                    { error: 'upstream failure', done: true, content: '' },
                ]),
            );

            const service = new ArenaService();
            const chunks: ArenaChatStreamChunk[] = [];
            const response = await service.streamChat(makeRequest(), (c) => chunks.push(c));

            const lastChunk = chunks[chunks.length - 1];
            expect(lastChunk.done).toBe(true);
            expect(lastChunk.content).toContain('[Error: upstream failure]');
            expect(response.content).toContain('partial');
            expect(response.content).toContain('[Error: upstream failure]');
        });
    });

    // -------------------------------------------------------------------------
    // streamChat — provider config errors
    // -------------------------------------------------------------------------

    describe('streamChat — provider config errors', () => {
        it('rejects with an error when Gemini API key is missing', async () => {
            mockLoadProviderSettings.mockResolvedValue({
                gemini: { enabled: true, disabledModels: [] }, // no apiKey
            });

            const service = new ArenaService();
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

            const service = new ArenaService();
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

            const service = new ArenaService();
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
            const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
            vi.stubGlobal('fetch', fetchMock);

            const service = new ArenaService();
            const result = await service.validateApiKey('gemini', geminiSettings);

            expect(result).toEqual({ valid: true });
            vi.unstubAllGlobals();
        });

        it('returns { valid: false, error: "API key is empty" } for empty Gemini key without calling fetch', async () => {
            const fetchMock = vi.fn();
            vi.stubGlobal('fetch', fetchMock);

            const service = new ArenaService();
            const result = await service.validateApiKey('gemini', {
                ...geminiSettings,
                apiKey: '',
            });

            expect(result).toEqual({ valid: false, error: 'API key is empty' });
            expect(fetchMock).not.toHaveBeenCalled();
            vi.unstubAllGlobals();
        });

        it('returns { valid: false } when Gemini returns 401', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

            const service = new ArenaService();
            const result = await service.validateApiKey('gemini', geminiSettings);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('401');
            vi.unstubAllGlobals();
        });

        it('returns { valid: true } when Ollama endpoint is reachable', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

            const service = new ArenaService();
            const result = await service.validateApiKey('ollama', ollamaSettings);

            expect(result).toEqual({ valid: true });
            vi.unstubAllGlobals();
        });

        it('returns { valid: false } when fetch throws (ECONNREFUSED)', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

            const service = new ArenaService();
            const result = await service.validateApiKey('gemini', geminiSettings);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('ECONNREFUSED');
            vi.unstubAllGlobals();
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
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue({
                    ok: true,
                    json: async () => ({ models: [{ name: 'llama3' }, { name: 'mistral' }] }),
                }),
            );

            const service = new ArenaService();
            const models = await service.getAvailableModels('ollama', ollamaSettings);

            expect(models).toContainEqual(
                expect.objectContaining({ id: 'llama3', label: 'llama3', provider: 'ollama' }),
            );
            expect(models).toContainEqual(
                expect.objectContaining({ id: 'mistral', label: 'mistral', provider: 'ollama' }),
            );
            vi.unstubAllGlobals();
        });

        it('falls back to static list when Ollama fetch fails', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

            const service = new ArenaService();
            const models = await service.getAvailableModels('ollama', ollamaSettings);

            expect(models).toEqual(getModelsForProvider('ollama'));
            vi.unstubAllGlobals();
        });

        it('returns static list for Gemini (no live fetch)', async () => {
            const fetchMock = vi.fn();
            vi.stubGlobal('fetch', fetchMock);

            const service = new ArenaService();
            const models = await service.getAvailableModels('gemini', geminiSettings);

            expect(models).toEqual(getModelsForProvider('gemini'));
            expect(fetchMock).not.toHaveBeenCalled();
            vi.unstubAllGlobals();
        });
    });
});
