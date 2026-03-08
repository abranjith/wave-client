import { createProviderFactory } from './providers/factory';
import { createWaveClientAgent } from './agents/waveClientAgent';
import { createWebExpertAgent } from './agents/webExpertAgent';
import type { LLMProviderConfig, ChatMessage, ChatChunk } from './types';
import type {
    ArenaChatRequest,
    ArenaChatResponse,
    ArenaChatStreamChunk,
    ArenaMessage,
    ArenaProviderType,
    ArenaProviderSettings,
    ModelDefinition,
} from '@wave-client/shared';
import {
    ARENA_AGENT_IDS,
    geminiModelsUrl,
    ollamaTagsUrl,
    getModelsForProvider,
    arenaStorageService,
    httpService,
} from '@wave-client/shared';

/** Ollama default base URL (mirrors OLLAMA_DEFAULT_BASE_URL in @wave-client/core). */
const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

/** Minimal interface for a cached agent instance. */
interface CachedAgent {
    chat(history: ChatMessage[], message: string, signal?: AbortSignal): AsyncGenerator<ChatChunk>;
}

/**
 * Optional factory/agent dependencies for `ArenaService`.
 * Injected in tests to replace real LangGraph agent constructors with mocks.
 * In production the module-level defaults are used.
 */
interface ArenaServiceDeps {
    createProviderFactory?: typeof createProviderFactory;
    createWaveClientAgent?: typeof createWaveClientAgent;
    createWebExpertAgent?: typeof createWebExpertAgent;
}

/**
 * Arena AI agent orchestration service that wires up LangGraph-powered agents
 * to handle chat requests.
 *
 * Import from `@wave-client/arena`:
 * ```ts
 * import { arenaService } from '@wave-client/arena';
 * ```
 *
 * ### Agent Caching
 * Compiled LangGraph state-graphs are expensive to create.  ArenaService maintains
 * a `Map<string, CachedAgent>` keyed by `"${provider}:${model ?? 'default'}:${agentId}"`
 * so the same graph is reused across requests within a single session.
 *
 * ### Provider Support
 * Only `'gemini'` and `'ollama'` are wired.  Any other provider throws immediately in
 * `buildProviderConfig`, which the calling handler converts into a user error.
 *
 * ### Thread Safety
 * Node.js is single-threaded; no locking is needed.
 *
 * ### Testing
 * Pass `deps` to override factory/agent constructors with mocks.  The shared
 * singletons (`arenaStorageService`, `httpService`) can be spied on directly via
 * `vi.spyOn` — they are shared by reference with the arena bundle.
 */
export class ArenaService {
    /** Reuse compiled LangGraph graphs across requests. */
    private readonly agentCache = new Map<string, CachedAgent>();

    private readonly _createProviderFactory: typeof createProviderFactory;
    private readonly _createWaveClientAgent: typeof createWaveClientAgent;
    private readonly _createWebExpertAgent: typeof createWebExpertAgent;

    constructor(deps: ArenaServiceDeps = {}) {
        this._createProviderFactory = deps.createProviderFactory ?? createProviderFactory;
        this._createWaveClientAgent = deps.createWaveClientAgent ?? createWaveClientAgent;
        this._createWebExpertAgent = deps.createWebExpertAgent ?? createWebExpertAgent;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Streams an Arena AI chat response back to the caller via `onChunk`.
     *
     * Steps:
     *  1. Resolve `LLMProviderConfig` from stored provider settings + request.
     *  2. Create (or retrieve cached) agent.
     *  3. Emit a heartbeat chunk immediately so the caller gets instant feedback.
     *  4. Drive the `AsyncGenerator<ChatChunk>` render loop, emitting each chunk
     *     via `onChunk`. A 90 s overall stream timeout ensures `onChunk` is always
     *     called at least once (heartbeat) and the stream always terminates.
     *  5. Return the accumulated `ArenaChatResponse` when streaming is complete.
     *
     * @param request  The chat request from the caller.
     * @param onChunk  Callback invoked for every streamed chunk (always called at
     *                 least once with a heartbeat chunk).
     * @param signal   Optional `AbortSignal`; iteration stops when aborted.
     * @returns        The fully accumulated `ArenaChatResponse`.
     * @throws         If the provider is unsupported or a required API key is missing.
     */
    async streamChat(
        request: ArenaChatRequest,
        onChunk: (chunk: ArenaChatStreamChunk) => void,
        signal?: AbortSignal,
    ): Promise<ArenaChatResponse> {
        const providerConfig = await this.buildProviderConfig(request);

        console.info('[Arena] streamChat start', {
            provider: providerConfig.provider,
            model: (providerConfig as { model?: string }).model,
            agent: request.agent,
            sessionId: request.sessionId,
        });

        const llm = this._createProviderFactory(providerConfig);
        const agent = await this.getOrCreateAgent(request, llm);
        const chatHistory = this.convertHistory(request.history);
        const messageId = crypto.randomUUID();
        let accContent = '';
        let chunkCount = 0;

        // Handle already-aborted signal before entering the loop
        if (signal?.aborted) {
            onChunk({ messageId, content: '', done: true });
            return { messageId, content: '' };
        }

        const gen = agent.chat(chatHistory, request.message, signal);
        let finished = false;

        // Emit a heartbeat before entering the loop so the caller has instant feedback.
        onChunk({ messageId, content: '', done: false, heartbeat: true });
        chunkCount++;

        // 90 s overall stream timeout — fires if the agent generator stalls.
        let streamTimedOut = false;
        const streamTimer = setTimeout(() => {
            streamTimedOut = true;
            console.warn('[Arena] stream timeout after 90 s', { sessionId: request.sessionId });
            onChunk({ messageId, content: '', error: 'Request timed out after 90 s', done: true });
            chunkCount++;
        }, 90_000);

        try {
            for await (const chunk of gen) {
                if (signal?.aborted || streamTimedOut) {
                    break;
                }

                if (chunk.error) {
                    // Emit the error in a dedicated field with empty content delta.
                    // The UI renders error text separately — not concatenated into the
                    // message body — so we must NOT send the accumulated content here.
                    onChunk({ messageId, content: '', error: chunk.error, done: true });
                    chunkCount++;
                    finished = true;
                    break;
                }

                // Tool-call-only chunks carry no displayable text; skip silently.
                if (chunk.toolCall) {
                    continue;
                }

                accContent += chunk.content;
                onChunk({ messageId, content: chunk.content, done: chunk.done });
                chunkCount++;

                if (chunk.done) {
                    finished = true;
                    break;
                }
            }
        } finally {
            clearTimeout(streamTimer);
        }

        // If aborted mid-stream (and not timed out), emit a terminal done chunk.
        // The UI already has the accumulated text from prior incremental chunks;
        // the final ArenaChatResponse (returned below) carries the full content.
        if (!finished && !streamTimedOut) {
            onChunk({ messageId, content: '', done: true });
            chunkCount++;
        }

        console.info('[Arena] streamChat complete', {
            sessionId: request.sessionId,
            chunkCount,
            contentLength: accContent.length,
        });

        return { messageId, content: accContent };
    }

    /**
     * Validates a provider API key / connectivity without touching the agent.
     *
     * Uses `httpService.send()` (axios-based) so that the user's proxy and
     * certificate settings are respected automatically.
     *
     * @param provider         The provider type to validate.
     * @param providerSettings The provider settings (must include `apiKey` for cloud).
     * @returns `{ valid: true }` on success or `{ valid: false, error: string }`.
     */
    async validateApiKey(
        provider: ArenaProviderType,
        providerSettings: ArenaProviderSettings,
    ): Promise<{ valid: boolean; error?: string }> {
        try {
            if (provider === 'gemini') {
                const apiKey = providerSettings.apiKey ?? '';
                if (!apiKey) {
                    return { valid: false, error: 'API key is empty' };
                }
                const result = await httpService.send({
                    method: 'GET',
                    url: geminiModelsUrl(apiKey),
                    headers: {},
                    validateStatus: true,
                });
                const status = result.response.status;
                return status >= 200 && status < 400
                    ? { valid: true }
                    : { valid: false, error: `Gemini returned status ${status}` };
            }

            if (provider === 'ollama') {
                const baseUrl = providerSettings.apiUrl ?? OLLAMA_DEFAULT_BASE_URL;
                const result = await httpService.send({
                    method: 'GET',
                    url: ollamaTagsUrl(baseUrl),
                    headers: {},
                    validateStatus: true,
                });
                const status = result.response.status;
                return status >= 200 && status < 400
                    ? { valid: true }
                    : { valid: false, error: `Ollama returned status ${status}` };
            }

            return { valid: false, error: `Provider '${provider}' validation is not supported` };
        } catch (err) {
            return { valid: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Returns the list of models available for the given provider.
     *
     * For Ollama, probes the live `/api/tags` endpoint via `httpService.send()` and
     * maps the response to `ModelDefinition[]`.  Falls back to the static list on any
     * failure.  All other providers use the static list directly.
     *
     * @param provider         The provider type.
     * @param providerSettings The provider settings (used for Ollama base URL).
     * @returns Array of available `ModelDefinition` objects.
     */
    async getAvailableModels(
        provider: ArenaProviderType,
        providerSettings: ArenaProviderSettings,
    ): Promise<ModelDefinition[]> {
        if (provider === 'ollama') {
            try {
                const baseUrl = providerSettings.apiUrl ?? OLLAMA_DEFAULT_BASE_URL;
                const result = await httpService.send({
                    method: 'GET',
                    url: ollamaTagsUrl(baseUrl),
                    headers: {},
                    validateStatus: true,
                    responseType: 'json',
                });
                if (result.response.status >= 200 && result.response.status < 400) {
                    const data = result.response.data as { models: { name: string }[] };
                    return (data.models ?? []).map((m) => ({
                        id: m.name,
                        label: m.name,
                        provider: 'ollama' as const,
                        contextWindow: 0,
                    }));
                }
            } catch {
                // fall through to static list
            }
        }
        return getModelsForProvider(provider);
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Resolves the `LLMProviderConfig` from current stored provider settings and
     * the request's active provider / model.
     *
     * @throws `Error` when a required API key is absent or the provider is unsupported.
     */
    private async buildProviderConfig(request: ArenaChatRequest): Promise<LLMProviderConfig> {
        const storedSettings = await arenaStorageService.loadProviderSettings();
        const { provider, model } = request.settings;
        const providerSettings = storedSettings[provider as keyof typeof storedSettings];

        switch (provider) {
            case 'gemini': {
                const apiKey = providerSettings?.apiKey;
                if (!apiKey) {
                    throw new Error('Gemini API key is not configured');
                }
                const config: LLMProviderConfig = { provider: 'gemini', apiKey };
                if (model !== undefined) {
                    (config as { provider: 'gemini'; apiKey: string; model?: string }).model = model;
                }
                return config;
            }

            case 'ollama': {
                const baseUrl = providerSettings?.apiUrl ?? OLLAMA_DEFAULT_BASE_URL;
                const config: LLMProviderConfig = { provider: 'ollama', baseUrl };
                if (model !== undefined) {
                    (config as { provider: 'ollama'; baseUrl: string; model?: string }).model = model;
                }
                return config;
            }

            default:
                throw new Error(`Provider '${provider}' is not supported`);
        }
    }

    /**
     * Returns a cached agent or creates, caches, and returns a new one.
     *
     * @param request The current chat request (used for agent type and cache key).
     * @param llm     The `BaseChatModel` instance to pass to the agent factory.
     * @throws `Error` for unknown agent IDs.
     */
    private async getOrCreateAgent(request: ArenaChatRequest, llm: ReturnType<typeof createProviderFactory>): Promise<CachedAgent> {
        const cacheKey = this.buildCacheKey(request);
        const cached = this.agentCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        let agent: CachedAgent;
        switch (request.agent) {
            case ARENA_AGENT_IDS.WAVE_CLIENT:
                agent = this._createWaveClientAgent({ llm });
                break;

            case ARENA_AGENT_IDS.WEB_EXPERT:
                agent = this._createWebExpertAgent({ llm });
                break;

            default:
                throw new Error(`Unknown agent: ${request.agent}`);
        }

        this.agentCache.set(cacheKey, agent);
        return agent;
    }

    /**
     * Builds a cache key that uniquely identifies a provider+model+agent combination.
     */
    private buildCacheKey(request: ArenaChatRequest): string {
        const { provider, model } = request.settings;
        return `${provider}:${model ?? 'default'}:${request.agent}`;
    }

    /**
     * Converts `ArenaMessage[]` (core type) to `ChatMessage[]` (arena type),
     * filtering out non-conversational roles (`'tool'`, `'system'`) defensively.
     */
    private convertHistory(history: ArenaMessage[]): ChatMessage[] {
        return history
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({
                id: m.id,
                role: m.role as 'user' | 'assistant',
                content: m.content,
                timestamp: m.timestamp,
                ...(m.tokenCount !== undefined && { tokenCount: m.tokenCount }),
            }));
    }
}

/** Singleton instance of {@link ArenaService}. */
export const arenaService = new ArenaService();
