/**
 * Web Arena Adapter
 * 
 * Implements IArenaAdapter for the web platform.
 * Uses localStorage for session/document storage and direct LLM API calls.
 */

import type {
    IArenaAdapter,
    ArenaSession,
    ArenaMessage,
    ArenaDocument,
    ArenaSettings,
    ArenaChatRequest,
    ArenaChatResponse,
    ArenaChatStreamChunk,
    ArenaReference,
    ArenaProviderSettingsMap,
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
    DOCUMENTS: CONFIG_STORAGE_KEYS.DOCUMENTS,
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
    // Document Management
    // ========================================================================

    async loadDocuments(): Promise<Result<ArenaDocument[], string>> {
        try {
            const documents = loadFromStorage<ArenaDocument[]>(STORAGE_KEYS.DOCUMENTS, []);
            documents.sort((a, b) => b.uploadedAt - a.uploadedAt);
            return ok(documents);
        } catch (error) {
            return err(`Failed to load documents: ${error}`);
        }
    }

    async uploadDocument(file: File, content: ArrayBuffer): Promise<Result<ArenaDocument, string>> {
        try {
            const settings = loadFromStorage<ArenaSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_ARENA_SETTINGS);
            
            // Check size limit
            if (content.byteLength > settings.maxDocumentSize) {
                return err(`File size ${(content.byteLength / 1024 / 1024).toFixed(2)}MB exceeds maximum ${(settings.maxDocumentSize / 1024 / 1024).toFixed(0)}MB`);
            }

            const document: ArenaDocument = {
                id: generateId(),
                filename: file.name,
                mimeType: file.type || 'application/octet-stream',
                size: content.byteLength,
                uploadedAt: Date.now(),
                processed: false,
            };

            // Save document metadata
            const documents = loadFromStorage<ArenaDocument[]>(STORAGE_KEYS.DOCUMENTS, []);
            documents.push(document);
            saveToStorage(STORAGE_KEYS.DOCUMENTS, documents);

            // Store content in separate key (base64 encoded)
            try {
                const base64Content = btoa(
                    new Uint8Array(content).reduce(
                        (data, byte) => data + String.fromCharCode(byte),
                        ''
                    )
                );
                localStorage.setItem(`wave-arena-doc-${document.id}`, base64Content);

                // Mark as processed
                document.processed = true;
                document.chunkCount = 1; // Simplified - in reality would chunk for RAG
                
                const index = documents.findIndex(d => d.id === document.id);
                if (index >= 0) {
                    documents[index] = document;
                    saveToStorage(STORAGE_KEYS.DOCUMENTS, documents);
                }
            } catch (storageError) {
                document.error = 'File too large for browser storage';
                const index = documents.findIndex(d => d.id === document.id);
                if (index >= 0) {
                    documents[index] = document;
                    saveToStorage(STORAGE_KEYS.DOCUMENTS, documents);
                }
            }

            return ok(document);
        } catch (error) {
            return err(`Failed to upload document: ${error}`);
        }
    }

    async deleteDocument(documentId: string): Promise<Result<void, string>> {
        try {
            const documents = loadFromStorage<ArenaDocument[]>(STORAGE_KEYS.DOCUMENTS, []);
            const filtered = documents.filter(d => d.id !== documentId);
            saveToStorage(STORAGE_KEYS.DOCUMENTS, filtered);
            
            // Remove content
            localStorage.removeItem(`wave-arena-doc-${documentId}`);
            
            return ok(undefined);
        } catch (error) {
            return err(`Failed to delete document: ${error}`);
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
            this.cancelChat(request.sessionId);
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

    async streamMessage(
        request: ArenaChatRequest,
        onChunk: (chunk: ArenaChatStreamChunk) => void
    ): Promise<Result<ArenaChatResponse, string>> {
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
            this.cancelChat(request.sessionId);
            activeChatController = new AbortController();

            const response = await this.callGeminiAPIWithStream(
                request, 
                activeChatController.signal,
                onChunk
            );
            activeChatController = null;
            
            return response;
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return err('Chat request was cancelled');
            }
            return err(`Failed to stream message: ${error}`);
        }
    }

    cancelChat(_sessionId: string): void {
        if (activeChatController) {
            activeChatController.abort();
            activeChatController = null;
        }
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
        const { message, history, settings, command } = request;
        const model = settings.model || LLM_DEFAULTS.GEMINI_MODEL;
        const providerSettings = loadFromStorage<ArenaProviderSettingsMap>(
            STORAGE_KEYS.PROVIDER_SETTINGS,
            getDefaultProviderSettings(),
        );
        const apiKey = providerSettings['gemini']?.apiKey!;

        // Build conversation contents
        const contents = this.buildGeminiContents(history, message, command);
        const systemPrompt = this.getSystemPrompt(request.agent, command);

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
        const { message, history, settings, command } = request;
        const model = settings.model || LLM_DEFAULTS.GEMINI_MODEL;
        const providerSettings = loadFromStorage<ArenaProviderSettingsMap>(
            STORAGE_KEYS.PROVIDER_SETTINGS,
            getDefaultProviderSettings(),
        );
        const apiKey = providerSettings['gemini']?.apiKey!;

        // Build conversation contents
        const contents = this.buildGeminiContents(history, message, command);
        const systemPrompt = this.getSystemPrompt(request.agent, command);
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
        _command?: string
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

    private getSystemPrompt(agent: string, command?: string): string {
        switch (agent) {
            case ARENA_AGENT_IDS.LEARN_WEB:
                return this.getLearnWebAgentPrompt(command);
            case ARENA_AGENT_IDS.LEARN_DOCS:
                return this.getLearnDocsAgentPrompt(command);
            case ARENA_AGENT_IDS.WAVE_CLIENT:
                return this.getWaveClientAgentPrompt(command);
            default:
                // Backward compat: old 'learn' / 'discover' sessions
                if (agent === 'learn') return this.getLearnWebAgentPrompt(command);
                if (agent === 'discover') return this.getWaveClientAgentPrompt(command);
                return 'You are a helpful AI assistant.';
        }
    }

    private getLearnWebAgentPrompt(command?: string): string {
        const basePrompt = `You are Wave Arena Learn Agent, an expert in web technologies, networking, and API development.
Your role is to help users understand web technologies including HTTP protocols, REST APIs, GraphQL, WebSocket, 
network protocols (TCP/IP, DNS, TLS), and modern web development practices.

Guidelines:
- Provide accurate, up-to-date information
- Include practical examples when helpful
- Reference official documentation when appropriate
- Be concise but thorough
- If you're unsure, say so rather than guessing`;

        const commandPrompts: Record<string, string> = {
            '/learn-http': `\n\nFocus on HTTP protocol topics: HTTP/1.1, HTTP/2, HTTP/3, headers, methods, status codes, caching, cookies, CORS.`,
            '/learn-rest': `\n\nFocus on REST API topics: principles, best practices, design patterns, versioning, error handling, HATEOAS.`,
            '/learn-websocket': `\n\nFocus on WebSocket topics: protocol, real-time communication, Socket.io, use cases, vs polling/SSE.`,
            '/learn-graphql': `\n\nFocus on GraphQL topics: queries, mutations, subscriptions, schema design, vs REST.`,
            '/learn-web': `\n\nFocus on general web technology topics using knowledge from MDN, W3C, IETF specifications.`,
            '/learn-local': `\n\nAnswer questions based on the user's uploaded documentation.`,
        };

        return basePrompt + (command ? (commandPrompts[command] || '') : '');
    }

    private getLearnDocsAgentPrompt(_command?: string): string {
        return `You are Wave Arena Learn Docs Agent, a specialised assistant that helps users learn from their uploaded documents.
Your role is to answer questions by referencing the specific documents the user has uploaded.

Guidelines:
- Always cite the source document when quoting or paraphrasing
- If no relevant document content is available, let the user know
- Summarise key points from documents when asked
- Be precise and comprehensive`;
    }

    private getWaveClientAgentPrompt(command?: string): string {
        const basePrompt = `You are Wave Arena Discover Agent, a helpful assistant for Wave Client - an HTTP REST client application.
Your role is to help users work with their collections, environments, flows, and test suites.

Guidelines:
- Help users understand Wave Client features
- Provide guidance on organizing collections and requests
- Assist with environment variable management
- Help create and debug request flows
- Guide test suite creation and execution`;

        const commandPrompts: Record<string, string> = {
            '/help': `\n\nProvide general help about Wave Client features and capabilities.`,
            '/collections': `\n\nFocus on collection management: creating, organizing, importing/exporting collections and requests.`,
            '/environments': `\n\nFocus on environment management: variables, environments, secrets, and variable substitution.`,
            '/flows': `\n\nFocus on request flows: chaining requests, using response data, conditional logic.`,
            '/tests': `\n\nFocus on test suites: creating tests, assertions, running test suites, test reports.`,
        };

        return basePrompt + (command ? (commandPrompts[command] || '') : '');
    }
}

/**
 * Create the Web Arena adapter
 */
export function createWebArenaAdapter(): IArenaAdapter {
    return new WebArenaAdapter();
}
