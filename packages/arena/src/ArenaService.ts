import { createProviderFactory, testProviderConnection, validateProviderApiKey } from './providers/factory';
import { createWaveClientAgent } from './agents/waveClientAgent';
import { createWebExpertAgent } from './agents/webExpertAgent';
import { createMcpBridge } from './tools/mcpBridge';
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

type McpStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface McpRuntimeModule {
    startMcpRuntime: () => Promise<McpStatus>;
    getMcpRuntimeStatus: () => McpStatus;
    getMcpRuntimeTools: () => ReadonlyArray<{
        name: string;
        description: string;
        schema: unknown;
    }>;
    executeMcpToolCall: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

let _mcpRuntimeModulePromise: Promise<McpRuntimeModule | null> | null = null;

async function getMcpRuntimeModule(): Promise<McpRuntimeModule | null> {
    if (!_mcpRuntimeModulePromise) {
        _mcpRuntimeModulePromise = import('@wave-client/mcp-server/runtime')
            .then((mod) => mod as unknown as McpRuntimeModule)
            .catch((error) => {
                console.warn('[Arena] MCP runtime unavailable', error);
                return null;
            });
    }
    return _mcpRuntimeModulePromise;
}

/**
 * Optional factory/agent dependencies for `ArenaService`.
 * Injected in tests to replace real LangGraph agent constructors with mocks.
 * In production the module-level defaults are used.
 */
interface ArenaServiceDeps {
    createProviderFactory?: typeof createProviderFactory;
    testProviderConnection?: typeof testProviderConnection;
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
    private readonly _testProviderConnection: typeof testProviderConnection;
    private readonly _createWaveClientAgent: typeof createWaveClientAgent;
    private readonly _createWebExpertAgent: typeof createWebExpertAgent;

    constructor(deps: ArenaServiceDeps = {}) {
        this._createProviderFactory = deps.createProviderFactory ?? createProviderFactory;
        this._testProviderConnection = deps.testProviderConnection ?? testProviderConnection;
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
     * ### Sequence numbering
     * Every content/done chunk is tagged with a monotonically-increasing `seq`
     * field (0-indexed, starting from 0 for each call). Heartbeat and error
     * chunks do NOT carry a `seq` value — they are out-of-band signals.
     * Consumers can use `seq` to reorder chunks that arrive out of order.
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
        const providerName = providerConfig.provider;
        const modelName = (providerConfig as { model?: string }).model ?? 'default';

        console.info('[Arena] streamChat start', {
            provider: providerName,
            model: modelName,
            agent: request.agent,
            sessionId: request.sessionId,
        });

        // ── Pre-flight connectivity check ────────────────────────────────────
        // Fail fast with a clear error instead of waiting for a 60–90 s timeout
        // when the provider endpoint is not reachable.
        console.info('[Arena] pre-flight connectivity check', { provider: providerName, model: modelName });
        const connResult = await this._testProviderConnection(providerConfig);
        if (!connResult.connected) {
            const errMsg = `Cannot connect to ${providerName}: ${connResult.error ?? 'unknown error'}. ` +
                (providerName === 'ollama'
                    ? 'Make sure Ollama is running ("ollama serve") and the URL is correct.'
                    : 'Check your provider configuration and credentials.');
            console.error('[Arena] pre-flight check failed', { provider: providerName, error: connResult.error });
            throw new Error(errMsg);
        }
        console.info('[Arena] provider reachable', { provider: providerName });

        let llm;
        try {
            llm = this._createProviderFactory(providerConfig);
            console.info('[Arena] LLM provider created', { provider: providerName, model: modelName });
        } catch (err) {
            const errMsg = `Failed to create ${providerName} provider: ${err instanceof Error ? err.message : String(err)}`;
            console.error('[Arena] provider creation failed', { provider: providerName, error: errMsg });
            throw new Error(errMsg);
        }

        let agent;
        try {
            agent = await this.getOrCreateAgent(request, llm);
            console.info('[Arena] agent ready', { agent: request.agent, cached: this.agentCache.has(this.buildCacheKey(request)) });
        } catch (err) {
            const errMsg = `Failed to create agent '${request.agent}': ${err instanceof Error ? err.message : String(err)}`;
            console.error('[Arena] agent creation failed', { agent: request.agent, error: errMsg });
            throw new Error(errMsg);
        }
        const chatHistory = this.convertHistory(request.history);
        const messageId = crypto.randomUUID();
        let accContent = '';
        let chunkCount = 0;
        /** 0-indexed sequence counter; incremented for every content/done chunk emitted. */
        let seq = 0;

        // Handle already-aborted signal before entering the loop
        if (signal?.aborted) {
            onChunk({ messageId, content: '', done: true, seq: seq++ });
            return { messageId, content: '' };
        }

        // Local abort controller for the stream.
        // The 120 s service timer aborts this to actually terminate a stuck generator,
        // rather than merely setting a flag that can't be checked while the loop is blocked.
        const localAbortController = new AbortController();
        if (signal) {
            signal.addEventListener('abort', () => localAbortController.abort(), { once: true });
        }

        const gen = agent.chat(chatHistory, request.message, localAbortController.signal);
        let finished = false;

        // Emit a heartbeat before entering the loop so the caller has instant feedback.
        // Heartbeats are out-of-band keep-alives — they do NOT carry a seq number.
        onChunk({ messageId, content: '', done: false, heartbeat: true });
        chunkCount++;

        // 120 s overall stream timeout — fires if the agent generator stalls.
        // Aborts the local controller so the `for await` actually terminates rather
        // than waiting indefinitely for the next generator value.
        let streamTimedOut = false;
        const streamTimer = setTimeout(() => {
            streamTimedOut = true;
            localAbortController.abort();
            const errMsg = `Request to ${providerName}/${modelName} timed out after 120 s — the model may be loading or unresponsive`;
            console.warn('[Arena] stream timeout', {
                provider: providerName,
                model: modelName,
                sessionId: request.sessionId,
                chunksSoFar: chunkCount,
            });
            // Error chunks are terminal and out-of-band — no seq.
            onChunk({ messageId, content: '', error: errMsg, done: true });
            chunkCount++;
        }, 120_000);

        const streamStartTime = Date.now();
        try {
            for await (const chunk of gen) {
                if (localAbortController.signal.aborted || streamTimedOut) {
                    console.info('[Arena] stream loop exited', { aborted: localAbortController.signal.aborted, timedOut: streamTimedOut });
                    break;
                }

                if (chunk.error) {
                    // Emit the error in a dedicated field with empty content delta.
                    // The UI renders error text separately — not concatenated into the
                    // message body — so we must NOT send the accumulated content here.
                    // Error chunks are terminal and out-of-band — no seq.
                    console.error('[Arena] agent error chunk', {
                        provider: providerName,
                        model: modelName,
                        error: chunk.error,
                        elapsedMs: Date.now() - streamStartTime,
                    });
                    onChunk({ messageId, content: '', error: chunk.error, done: true });
                    chunkCount++;
                    finished = true;
                    break;
                }

                // Tool-call-only chunks carry no displayable text; skip silently.
                if (chunk.toolCall) {
                    continue;
                }

                // Log the first content chunk for timing diagnostics
                if (chunkCount === 1) {
                    console.info('[Arena] first content chunk', {
                        provider: providerName,
                        model: modelName,
                        timeToFirstChunkMs: Date.now() - streamStartTime,
                    });
                }

                accContent += chunk.content;
                // Attach seq to every content/done chunk. seq is incremented for each
                // emitted content chunk (heartbeats and errors do not consume seq slots).
                onChunk({ messageId, content: chunk.content, done: chunk.done, seq: seq++ });
                chunkCount++;

                if (chunk.done) {
                    finished = true;
                    break;
                }
            }
        } catch (streamErr) {
            // Catch errors from the async generator iteration itself (e.g. LangGraph
            // failures, network errors not caught inside the agent's catch block).
            //
            // If the external abort signal fired (client disconnect / explicit cancel)
            // the error is expected — suppress it so the UI never shows a spurious
            // 'This operation was aborted' message.
            const isCancelled = localAbortController.signal.aborted && !streamTimedOut;
            if (isCancelled) {
                console.info('[Arena] stream cancelled externally — suppressing abort error', {
                    provider: providerName,
                    model: modelName,
                    sessionId: request.sessionId,
                });
            } else {
                const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
                console.error('[Arena] stream iteration error', {
                    provider: providerName,
                    model: modelName,
                    error: errMsg,
                    elapsedMs: Date.now() - streamStartTime,
                    chunksSoFar: chunkCount,
                });
                if (!streamTimedOut) {
                    onChunk({ messageId, content: '', error: `${providerName} error: ${errMsg}`, done: true });
                    chunkCount++;
                    finished = true;
                }
            }
        } finally {
            clearTimeout(streamTimer);
        }

        // If aborted mid-stream (and not timed out), emit a terminal done chunk.
        // The UI already has the accumulated text from prior incremental chunks;
        // the final ArenaChatResponse (returned below) carries the full content.
        if (!finished && !streamTimedOut && !localAbortController.signal.aborted) {
            onChunk({ messageId, content: '', done: true, seq: seq++ });
            chunkCount++;
        }

        console.info('[Arena] streamChat complete', {
            sessionId: request.sessionId,
            chunkCount,
            contentLength: accContent.length,
        });

        return { messageId, content: accContent };
    }

    /** Returns current MCP runtime status used by wave-client agent. */
    async checkMcpStatus(): Promise<McpStatus> {
        const mod = await getMcpRuntimeModule();
        if (!mod) {
            return 'disconnected';
        }
        return mod.getMcpRuntimeStatus();
    }

    /** Starts MCP runtime and clears wave-client cache entries so new tools are picked up immediately. */
    async startMcpServer(): Promise<McpStatus> {
        const mod = await getMcpRuntimeModule();
        if (!mod) {
            return 'error';
        }

        const status = await mod.startMcpRuntime();
        if (status === 'connected') {
            this.clearWaveClientAgentCache();
        }
        return status;
    }

    /**
     * Validates a provider API key / connectivity without touching the agent.
     *
     * Delegates to the provider-specific implementation in the provider factory,
     * keeping ArenaService free of per-provider logic.
     *
     * @param provider         The provider type to validate.
     * @param providerSettings The provider settings (must include `apiKey` for cloud).
     * @returns `{ valid: true }` on success or `{ valid: false, error: string }`.
     */
    async validateApiKey(
        provider: ArenaProviderType,
        providerSettings: ArenaProviderSettings,
    ): Promise<{ valid: boolean; error?: string }> {
        return validateProviderApiKey(provider, providerSettings);
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
        // Wave Client agent depends on dynamic MCP availability and should not reuse
        // stale cached instances created before MCP is connected.
        if (request.agent === ARENA_AGENT_IDS.WAVE_CLIENT) {
            const mcpStatus = await this.checkMcpStatus();
            const runtime = await getMcpRuntimeModule();
            const toolDefinitions = runtime
                ? runtime.getMcpRuntimeTools().map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.schema,
                }))
                : [];
            const mcpTools = mcpStatus === 'connected' && runtime
                ? createMcpBridge({
                    executeToolCall: async (toolName, args) => runtime.executeMcpToolCall(toolName, args),
                    toolDefinitions,
                })
                : [];

            return this._createWaveClientAgent({ llm, mcpTools });
        }

        const cacheKey = this.buildCacheKey(request);
        const cached = this.agentCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        let agent: CachedAgent;
        switch (request.agent) {
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

    /** Removes cached wave-client agents after MCP state changes. */
    private clearWaveClientAgentCache(): void {
        for (const key of this.agentCache.keys()) {
            if (key.endsWith(`:${ARENA_AGENT_IDS.WAVE_CLIENT}`)) {
                this.agentCache.delete(key);
            }
        }
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
