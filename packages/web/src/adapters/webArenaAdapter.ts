/**
 * Web Arena Adapter
 * 
 * Implements IArenaAdapter for the web platform.
 * Uses localStorage for session storage and direct LLM API calls.
 */

import type {
    IArenaAdapter,
    ArenaSession,
    ArenaMessage,
    ArenaSettings,
    ArenaChatRequest,
    ArenaChatResponse,
    ArenaChatStreamChunk,
    ArenaReference,
    ArenaProviderSettingsMap,
    StreamHandle,
    StreamUnsubscribe,
} from '@wave-client/core';
import {
    ok,
    err,
    Result,
    DEFAULT_ARENA_SETTINGS,
    STORAGE_KEYS as CONFIG_STORAGE_KEYS,
    getDefaultProviderSettings,
    geminiGenerateContentUrl,
    geminiStreamUrl,
    geminiModelsUrl,
    ARENA_AGENT_IDS,
    getModelsForProvider,
    LLM_DEFAULTS,
} from '@wave-client/core';

// ============================================================================
// Storage Keys
// ============================================================================

const STORAGE_KEYS = {
    SESSIONS: CONFIG_STORAGE_KEYS.SESSIONS,
    MESSAGES: CONFIG_STORAGE_KEYS.MESSAGES,
    SETTINGS: CONFIG_STORAGE_KEYS.SETTINGS,
    REFERENCES: CONFIG_STORAGE_KEYS.REFERENCES,
    PROVIDER_SETTINGS: CONFIG_STORAGE_KEYS.PROVIDER_SETTINGS,
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.error(`Error loading ${key} from localStorage:`, error);
    }
    return defaultValue;
}

function saveToStorage<T>(key: string, value: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error(`Error saving ${key} to localStorage:`, error);
    }
}

// ============================================================================
// Active Chat State
// ============================================================================

let activeChatController: AbortController | null = null;

// ============================================================================
// Web Arena Adapter Implementation
// ============================================================================

export class WebArenaAdapter implements IArenaAdapter {
    // ========================================================================
    // Session Management
    // ========================================================================

    async loadSessions(): Promise<Result<ArenaSession[], string>> {
        try {
            const sessions = loadFromStorage<ArenaSession[]>(STORAGE_KEYS.SESSIONS, []);
            // Sort by most recent first
            sessions.sort((a, b) => b.updatedAt - a.updatedAt);
            return ok(sessions);
        } catch (error) {
            return err(`Failed to load sessions: ${error}`);
        }
    }

    async saveSession(session: ArenaSession): Promise<Result<void, string>> {
        try {
            const sessions = loadFromStorage<ArenaSession[]>(STORAGE_KEYS.SESSIONS, []);
            const index = sessions.findIndex(s => s.id === session.id);
            
            if (index >= 0) {
                sessions[index] = session;
            } else {
                sessions.push(session);
            }
            
            saveToStorage(STORAGE_KEYS.SESSIONS, sessions);
            return ok(undefined);
        } catch (error) {
            return err(`Failed to save session: ${error}`);
        }
    }

    async deleteSession(sessionId: string): Promise<Result<void, string>> {
        try {
            // Delete session
            const sessions = loadFromStorage<ArenaSession[]>(STORAGE_KEYS.SESSIONS, []);
            const filtered = sessions.filter(s => s.id !== sessionId);
            saveToStorage(STORAGE_KEYS.SESSIONS, filtered);
            
            // Delete associated messages
            const allMessages = loadFromStorage<ArenaMessage[]>(STORAGE_KEYS.MESSAGES, []);
            const remainingMessages = allMessages.filter(m => m.sessionId !== sessionId);
            saveToStorage(STORAGE_KEYS.MESSAGES, remainingMessages);
            
            return ok(undefined);
        } catch (error) {
            return err(`Failed to delete session: ${error}`);
        }
    }

    // ========================================================================
    // Message Management
    // ========================================================================

    async loadMessages(sessionId: string): Promise<Result<ArenaMessage[], string>> {
        try {
            const allMessages = loadFromStorage<ArenaMessage[]>(STORAGE_KEYS.MESSAGES, []);
            const sessionMessages = allMessages
                .filter(m => m.sessionId === sessionId)
                .sort((a, b) => a.timestamp - b.timestamp);
            return ok(sessionMessages);
        } catch (error) {
            return err(`Failed to load messages: ${error}`);
        }
    }

    async saveMessage(message: ArenaMessage): Promise<Result<void, string>> {
        try {
            const allMessages = loadFromStorage<ArenaMessage[]>(STORAGE_KEYS.MESSAGES, []);
            const index = allMessages.findIndex(m => m.id === message.id);
            
            if (index >= 0) {
                allMessages[index] = message;
            } else {
                allMessages.push(message);
            }
            
            saveToStorage(STORAGE_KEYS.MESSAGES, allMessages);
            return ok(undefined);
        } catch (error) {
            return err(`Failed to save message: ${error}`);
        }
    }

    async clearSessionMessages(sessionId: string): Promise<Result<void, string>> {
        try {
            const allMessages = loadFromStorage<ArenaMessage[]>(STORAGE_KEYS.MESSAGES, []);
            const remaining = allMessages.filter(m => m.sessionId !== sessionId);
            saveToStorage(STORAGE_KEYS.MESSAGES, remaining);
            return ok(undefined);
        } catch (error) {
            return err(`Failed to clear messages: ${error}`);
        }
    }

    // ========================================================================
    // Chat Operations
    // ========================================================================

    async sendMessage(request: ArenaChatRequest): Promise<Result<ArenaChatResponse, string>> {
        try {
            const { settings } = request;
            
            // For MVP, only Gemini is supported
            if (settings.provider !== 'gemini') {
                return err(`Provider ${settings.provider} is not supported yet. Please use Gemini.`);
            }

            // Resolve API key from provider settings
            const providerSettings = loadFromStorage<ArenaProviderSettingsMap>(
                STORAGE_KEYS.PROVIDER_SETTINGS,
                getDefaultProviderSettings(),
            );
            const apiKey = providerSettings['gemini']?.apiKey;
            if (!apiKey) {
                return err('API key is required. Please configure your Gemini API key in Arena settings.');
            }

            // Cancel any existing request
            if (activeChatController) {
                activeChatController.abort();
                activeChatController = null;
            }
            activeChatController = new AbortController();

            const response = await this.callGeminiAPI(request, activeChatController.signal);
            activeChatController = null;
            
            return response;
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return err('Chat request was cancelled');
            }
            return err(`Failed to send message: ${error}`);
        }
    }

    streamMessage(request: ArenaChatRequest): StreamHandle {
        const chunkCbs = new Set<(chunk: ArenaChatStreamChunk) => void>();
        const doneCbs = new Set<(response: ArenaChatResponse) => void>();
        const errorCbs = new Set<(error: string) => void>();
        let ended = false;

        function makeSub<T>(set: Set<T>, cb: T): StreamUnsubscribe {
            set.add(cb);
            let removed = false;
            return () => { if (!removed) { removed = true; set.delete(cb); } };
        }

        function emitError(msg: string) {
            if (ended) return;
            ended = true;
            errorCbs.forEach((cb) => { try { cb(msg); } catch (e) { console.error('[WebArena] error cb error', e); } });
        }

        function emitDone(response: ArenaChatResponse) {
            if (ended) return;
            ended = true;
            doneCbs.forEach((cb) => { try { cb(response); } catch (e) { console.error('[WebArena] done cb error', e); } });
        }

        // Cancel any existing request
        if (activeChatController) {
            activeChatController.abort();
            activeChatController = null;
        }
        const controller = new AbortController();
        activeChatController = controller;

        // Kick off the async stream in the background
        (async () => {
            try {
                const { settings } = request;
                if (settings.provider !== 'gemini') {
                    emitError(`Provider ${settings.provider} is not supported yet. Please use Gemini.`);
                    return;
                }
                const providerSettings = loadFromStorage<ArenaProviderSettingsMap>(
                    STORAGE_KEYS.PROVIDER_SETTINGS,
                    getDefaultProviderSettings(),
                );
                const apiKey = providerSettings['gemini']?.apiKey;
                if (!apiKey) {
                    emitError('API key is required. Please configure your Gemini API key in Arena settings.');
                    return;
                }

                const result = await this.callGeminiAPIWithStream(
                    request,
                    controller.signal,
                    (chunk) => {
                        if (ended) return;
                        chunkCbs.forEach((cb) => { try { cb(chunk); } catch (e) { console.error('[WebArena] chunk cb error', e); } });
                    },
                );

                if (activeChatController === controller) {
                    activeChatController = null;
                }

                if (result.isOk) {
                    emitDone(result.value);
                } else {
                    emitError(result.error);
                }
            } catch (error) {
                if (activeChatController === controller) {
                    activeChatController = null;
                }
                if (error instanceof DOMException && error.name === 'AbortError') {
                    emitError('Chat request was cancelled');
                } else {
                    emitError(`Failed to stream message: ${error}`);
                }
            }
        })();

        return {
            onChunk(cb) { return makeSub(chunkCbs, cb); },
            onDone(cb) { return makeSub(doneCbs, cb); },
            onError(cb) { return makeSub(errorCbs, cb); },
            cancel() {
                if (ended) return;
                controller.abort();
                if (activeChatController === controller) {
                    activeChatController = null;
                }
                emitError('Cancelled');
            },
        };
    }

    // ========================================================================
    // Settings
    // ========================================================================

    async loadSettings(): Promise<Result<ArenaSettings, string>> {
        try {
            const settings = loadFromStorage<ArenaSettings>(
                STORAGE_KEYS.SETTINGS, 
                DEFAULT_ARENA_SETTINGS
            );
            return ok(settings);
        } catch (error) {
            return err(`Failed to load settings: ${error}`);
        }
    }

    async saveSettings(settings: ArenaSettings): Promise<Result<void, string>> {
        try {
            saveToStorage(STORAGE_KEYS.SETTINGS, settings);
            return ok(undefined);
        } catch (error) {
            return err(`Failed to save settings: ${error}`);
        }
    }

    async validateApiKey(provider: string, apiKey: string): Promise<Result<boolean, string>> {
        try {
            if (provider !== 'gemini') {
                return err(`Provider ${provider} is not supported yet.`);
            }

            const response = await fetch(geminiModelsUrl(apiKey), { method: 'GET' });
            return ok(response.ok);
        } catch (error) {
            return err(`Failed to validate API key: ${error}`);
        }
    }

    async getAvailableModels(provider: string): Promise<Result<{ id: string; label: string }[], string>> {
        // For the web adapter we currently only support Gemini so return static list
        return ok(getModelsForProvider(provider as any).map(m => ({ id: m.id, label: m.label })));
    }

    // References (stored in localStorage)
    async loadReferences(): Promise<Result<ArenaReference[], string>> {
        try {
            const refs = loadFromStorage<ArenaReference[]>(STORAGE_KEYS.REFERENCES, []);
            return ok(refs);
        } catch (error) {
            return err(`Failed to load references: ${error}`);
        }
    }

    async saveReferences(references: ArenaReference[]): Promise<Result<void, string>> {
        try {
            saveToStorage(STORAGE_KEYS.REFERENCES, references);
            return ok(undefined);
        } catch (error) {
            return err(`Failed to save references: ${error}`);
        }
    }

    // ========================================================================
    // Provider Settings
    // ========================================================================

    async loadProviderSettings(): Promise<Result<ArenaProviderSettingsMap, string>> {
        try {
            const settings = loadFromStorage<ArenaProviderSettingsMap>(
                STORAGE_KEYS.PROVIDER_SETTINGS,
                getDefaultProviderSettings(),
            );
            return ok(settings);
        } catch (error) {
            return err(`Failed to load provider settings: ${error}`);
        }
    }

    async saveProviderSettings(settings: ArenaProviderSettingsMap): Promise<Result<void, string>> {
        try {
            saveToStorage(STORAGE_KEYS.PROVIDER_SETTINGS, settings);
            return ok(undefined);
        } catch (error) {
            return err(`Failed to save provider settings: ${error}`);
        }
    }

    // ========================================================================
    // Private: Gemini API Methods
    // ========================================================================

    private async callGeminiAPI(
        request: ArenaChatRequest,
        signal: AbortSignal
    ): Promise<Result<ArenaChatResponse, string>> {
        const { message, history, settings } = request;
        const model = settings.model || LLM_DEFAULTS.GEMINI_MODEL;
        const providerSettings = loadFromStorage<ArenaProviderSettingsMap>(
            STORAGE_KEYS.PROVIDER_SETTINGS,
            getDefaultProviderSettings(),
        );
        const apiKey = providerSettings['gemini']?.apiKey!;

        // Build conversation contents
        const contents = this.buildGeminiContents(history, message);
        const systemPrompt = this.getSystemPrompt(request.agent);

        try {
            const response = await fetch(
                geminiGenerateContentUrl(model, apiKey),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal,
                    body: JSON.stringify({
                        contents,
                        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 4096,
                        },
                    }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return err(`Gemini API error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

            return ok({
                messageId: generateId(),
                content: textContent,
                tokenCount: data.usageMetadata?.totalTokenCount,
            });
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw error;
            }
            return err(`Gemini API request failed: ${error}`);
        }
    }

    private async callGeminiAPIWithStream(
        request: ArenaChatRequest,
        signal: AbortSignal,
        onChunk: (chunk: ArenaChatStreamChunk) => void
    ): Promise<Result<ArenaChatResponse, string>> {
        const { message, history, settings } = request;
        const model = settings.model || LLM_DEFAULTS.GEMINI_MODEL;
        const providerSettings = loadFromStorage<ArenaProviderSettingsMap>(
            STORAGE_KEYS.PROVIDER_SETTINGS,
            getDefaultProviderSettings(),
        );
        const apiKey = providerSettings['gemini']?.apiKey!

        // Build conversation contents
        const contents = this.buildGeminiContents(history, message);
        const systemPrompt = this.getSystemPrompt(request.agent);
        const messageId = generateId();

        try {
            const response = await fetch(
                geminiStreamUrl(model, apiKey),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal,
                    body: JSON.stringify({
                        contents,
                        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 4096,
                        },
                    }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return err(`Gemini API error: ${errorData.error?.message || response.statusText}`);
            }

            // Read the stream
            const reader = response.body?.getReader();
            if (!reader) {
                return err('Failed to get response reader');
            }

            const decoder = new TextDecoder();
            let fullContent = '';
            let tokenCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            
                            if (text) {
                                fullContent += text;
                                onChunk({
                                    messageId,
                                    content: text,
                                    done: false,
                                });
                            }

                            if (data.usageMetadata?.totalTokenCount) {
                                tokenCount = data.usageMetadata.totalTokenCount;
                            }
                        } catch {
                            // Skip invalid JSON
                        }
                    }
                }
            }

            // Final chunk
            onChunk({
                messageId,
                content: '',
                done: true,
                tokenCount,
            });

            return ok({
                messageId,
                content: fullContent,
                tokenCount,
            });
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw error;
            }
            return err(`Gemini API stream request failed: ${error}`);
        }
    }

    private buildGeminiContents(
        history: ArenaMessage[],
        message: string,
    ): Array<{ role: string; parts: Array<{ text: string }> }> {
        const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

        // Add history messages
        for (const msg of history) {
            if (msg.role === 'user' || msg.role === 'assistant') {
                contents.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }],
                });
            }
        }

        // Add current message
        contents.push({
            role: 'user',
            parts: [{ text: message }],
        });

        return contents;
    }

    private getSystemPrompt(agent: string): string {
        switch (agent) {
            case ARENA_AGENT_IDS.WEB_EXPERT:
                return this.getWebExpertPrompt();
            case ARENA_AGENT_IDS.WAVE_CLIENT:
                return this.getWaveClientPrompt();
            default:
                return 'You are a helpful AI assistant.';
        }
    }

    private getWebExpertPrompt(): string {
        const basePrompt = `You are the Web Expert, an AI agent specialising in web technologies, networking protocols, and API design.
Your role is to help users understand web technologies including HTTP protocols, REST APIs, GraphQL, WebSocket,
network protocols (TCP/IP, DNS, TLS), and modern web development practices.

Guidelines:
- Provide accurate, up-to-date information based on official specifications and standards
- Include practical examples when helpful
- Reference RFC numbers and official documentation when discussing protocol behaviour
- Be concise but thorough
- If you're unsure, say so rather than guessing`;

        const formattingRules = `

## Response Format Rules

- Use ## section headers when covering more than one distinct concept.
- Use bullet points for any list of three or more items.
- Wrap all code examples in fenced code blocks with a language tag (http, json, bash, typescript).
- Bold key terms, protocol names, and RFC references on first use.
- Keep paragraphs short — two to three sentences maximum.
- End technical answers with a horizontal rule (---) followed by: **Key Takeaway:** one sentence summary.`;

        return basePrompt + formattingRules;
    }

    private getWaveClientPrompt(): string {
        const basePrompt = `You are the Wave Client AI assistant, a helpful agent for Wave Client — an HTTP REST client application.
Your role is to help users work with their collections, environments, flows, and test suites.

Guidelines:
- Help users understand Wave Client features
- Provide guidance on organising collections and requests
- Assist with environment variable management
- Help create and debug request flows
- Guide test suite creation and execution`;

        const formattingRules = `

## Response Format Rules

- Use ## section headers when a response covers setup, usage, and reference as distinct parts.
- Use bullet points or tables instead of flowing lists in prose.
- Wrap all code samples in fenced code blocks with a language tag (json, http, javascript).
- Bold field names, variable names, and action verbs the user must act on.
- End action-oriented answers with **Next Steps:** listing one or two concrete things the user should do next.
- Always call list_* tools before answering questions about existing collections, environments, flows, or test suites.`;

        return basePrompt + formattingRules;
    }
}

/**
 * Create the Web Arena adapter
 */
export function createWebArenaAdapter(): IArenaAdapter {
    return new WebArenaAdapter();
}
