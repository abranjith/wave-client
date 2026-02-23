import { createProviderFactory, createWaveClientAgent, createWebExpertAgent } from '@wave-client/arena';
import type { LLMProviderConfig, ChatMessage, ChatChunk } from '@wave-client/arena';
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
} from '@wave-client/shared';

/** Ollama default base URL (mirrors OLLAMA_DEFAULT_BASE_URL in @wave-client/core). */
const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

/** Minimal interface for a cached agent instance. */
interface CachedAgent {
    chat(history: ChatMessage[], message: string): AsyncGenerator<ChatChunk>;
}

/**
 * VS Code extension-host service that wires up LangGraph-powered Arena AI agents
 * to handle chat requests from the webview.
 *
 * ### Agent Caching
 * Compiled LangGraph state-graphs are expensive to create.  ArenaService maintains
 * a `Map<string, CachedAgent>` keyed by `"${provider}:${model ?? 'default'}:${agentId}"`
 * so the same graph is reused across requests within a single extension host session.
 *
 * ### Provider Support
 * Only `'gemini'` and `'ollama'` are wired.  Any other provider throws immediately in
 * `buildProviderConfig`, which the calling message handler converts into a user error.
 *
 * ### Thread Safety
 * Node.js is single-threaded; no locking is needed.
 */
export class ArenaService {
    /** Reuse compiled LangGraph graphs across requests. */
    private readonly agentCache = new Map<string, CachedAgent>();

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Streams an Arena AI chat response back to the caller via `onChunk`.
     *
     * Steps:
     *  1. Resolve `LLMProviderConfig` from stored provider settings + request.
     *  2. Create (or retrieve cached) agent.
     *  3. Drive the `AsyncGenerator<ChatChunk>` render loop, emitting each chunk
     *     via `onChunk`.
     *  4. Return the accumulated `ArenaChatResponse` when streaming is complete.
     *
     * @param request  The chat request from the webview.
     * @param onChunk  Callback invoked for every streamed chunk.
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
        const llm = createProviderFactory(providerConfig);
        const agent = await this.getOrCreateAgent(request, llm);
        const chatHistory = this.convertHistory(request.history);
        const messageId = crypto.randomUUID();
        let accContent = '';

        // Handle already-aborted signal before entering the loop
        if (signal?.aborted) {
            onChunk({ messageId, content: '', done: true });
            return { messageId, content: '' };
        }

        const gen = agent.chat(chatHistory, request.message);
        let finished = false;

        for await (const chunk of gen) {
            if (signal?.aborted) {
                break;
            }

            if (chunk.error) {
                accContent += `\n[Error: ${chunk.error}]`;
                onChunk({ messageId, content: accContent, done: true });
                finished = true;
                break;
            }

            // Tool-call-only chunks carry no displayable text; skip silently.
            if (chunk.toolCall) {
                continue;
            }

            accContent += chunk.content;
            onChunk({ messageId, content: chunk.content, done: chunk.done });

            if (chunk.done) {
                finished = true;
                break;
            }
        }

        // If aborted mid-stream, emit a terminal done chunk.
        if (!finished) {
            onChunk({ messageId, content: accContent, done: true });
        }

        return { messageId, content: accContent };
    }

    /**
     * Validates a provider API key / connectivity without touching the agent.
     *
     * Uses global `fetch` directly (not `HttpService`) to keep this path free of
     * request-plumbing dependencies.
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
                const res = await fetch(geminiModelsUrl(apiKey));
                return res.ok
                    ? { valid: true }
                    : { valid: false, error: `Gemini returned status ${res.status}` };
            }

            if (provider === 'ollama') {
                const baseUrl = providerSettings.apiUrl ?? OLLAMA_DEFAULT_BASE_URL;
                const res = await fetch(ollamaTagsUrl(baseUrl));
                return res.ok
                    ? { valid: true }
                    : { valid: false, error: `Ollama returned status ${res.status}` };
            }

            return { valid: false, error: `Provider '${provider}' validation is not supported` };
        } catch (err) {
            return { valid: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Returns the list of models available for the given provider.
     *
     * For Ollama, probes the live `/api/tags` endpoint and maps the response to
     * `ModelDefinition[]`.  Falls back to the static list in `@wave-client/core`
     * on any fetch failure.  All other providers use the static list directly.
     *
     * Uses global `fetch` directly (not `HttpService`).
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
                const res = await fetch(ollamaTagsUrl(baseUrl));
                if (res.ok) {
                    const data = (await res.json()) as { models: { name: string }[] };
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
                agent = createWaveClientAgent({ llm });
                break;

            case ARENA_AGENT_IDS.WEB_EXPERT:
                agent = createWebExpertAgent({ llm });
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
