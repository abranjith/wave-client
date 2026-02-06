/**
 * VS Code Arena Adapter
 * 
 * Implements IArenaAdapter for the VS Code webview environment.
 * This adapter handles Arena AI chat operations by communicating with
 * the extension backend via postMessage.
 */

import {
    ok,
    err,
    type Result,
    type IArenaAdapter,
    type ArenaSession,
    type ArenaMessage,
    type ArenaDocument,
    type ArenaSettings,
    type ArenaChatRequest,
    type ArenaChatResponse,
    type ArenaChatStreamChunk,
    type IAdapterEvents,
    DEFAULT_ARENA_SETTINGS,
} from '@wave-client/core';

// ============================================================================
// Types
// ============================================================================

interface PendingRequest<T> {
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

interface VSCodeAPI {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

// ============================================================================
// Arena Adapter
// ============================================================================

/**
 * Creates the Arena adapter for VS Code.
 * 
 * Note: For the MVP, Arena functionality is implemented entirely in the webview
 * using the @wave-client/arena package. The extension backend is only used for:
 * - Storing sessions/messages/documents (via storage service)
 * - Securely storing API keys (via secret storage)
 * 
 * In the future, we may move the LangGraph execution to the extension backend
 * for better performance and to avoid exposing API keys to the webview.
 */
export function createVSCodeArenaAdapter(
    vsCodeApi: VSCodeAPI,
    pendingRequests: Map<string, PendingRequest<unknown>>,
    events: IAdapterEvents,
    defaultTimeout: number = 120000
): IArenaAdapter {
    let requestIdCounter = 0;
    
    function generateRequestId(): string {
        return `arena-req-${Date.now()}-${++requestIdCounter}`;
    }

    /**
     * Send a request and wait for response
     */
    function sendAndWait<T>(
        type: string,
        data?: Record<string, unknown>
    ): Promise<Result<T, string>> {
        return new Promise((resolve) => {
            const requestId = generateRequestId();
            
            const timeout = setTimeout(() => {
                pendingRequests.delete(requestId);
                resolve(err(`Request timed out: ${type}`));
            }, defaultTimeout);

            // Map request types to response data fields
            const responseDataMap: Record<string, string> = {
                'arena.loadSessions': 'sessions',
                'arena.saveSession': '',
                'arena.deleteSession': '',
                'arena.loadMessages': 'messages',
                'arena.saveMessage': '',
                'arena.clearSessionMessages': '',
                'arena.loadDocuments': 'documents',
                'arena.uploadDocument': 'document',
                'arena.deleteDocument': '',
                'arena.sendMessage': 'response',
                'arena.streamMessage': 'response',
                'arena.loadSettings': 'settings',
                'arena.saveSettings': '',
                'arena.validateApiKey': 'valid',
            };

            pendingRequests.set(requestId, {
                resolve: (value) => {
                    const response = value as any;
                    if (response && response.error) {
                        resolve(err(response.error));
                    } else {
                        const dataField = responseDataMap[type];
                        const responseData = dataField ? response[dataField] : undefined;
                        resolve(ok(responseData as T));
                    }
                },
                reject: (error) => resolve(err(error.message)),
                timeout,
            });

            vsCodeApi.postMessage({ type, requestId, ...data });
        });
    }

    // For MVP, we'll store data locally in the webview state
    // This is a temporary solution until we implement proper backend storage
    
    let localSessions: ArenaSession[] = [];
    let localMessages: Map<string, ArenaMessage[]> = new Map();
    let localDocuments: ArenaDocument[] = [];
    let localSettings: ArenaSettings = DEFAULT_ARENA_SETTINGS;

    // Try to restore from VS Code state
    const savedState = vsCodeApi.getState() as any;
    if (savedState?.arenaSessions) {
        localSessions = savedState.arenaSessions;
    }
    if (savedState?.arenaMessages) {
        localMessages = new Map(Object.entries(savedState.arenaMessages));
    }
    if (savedState?.arenaDocuments) {
        localDocuments = savedState.arenaDocuments;
    }
    if (savedState?.arenaSettings) {
        localSettings = { ...DEFAULT_ARENA_SETTINGS, ...savedState.arenaSettings };
    }

    function saveState() {
        vsCodeApi.setState({
            ...vsCodeApi.getState() as any,
            arenaSessions: localSessions,
            arenaMessages: Object.fromEntries(localMessages),
            arenaDocuments: localDocuments,
            arenaSettings: localSettings,
        });
    }

    // Active chat cancellation
    const activeChatControllers: Map<string, AbortController> = new Map();

    /**
     * Send a message using Gemini API
     */
    async function sendGeminiMessage(request: ArenaChatRequest): Promise<Result<ArenaChatResponse, string>> {
        if (!request.settings.apiKey) {
            return err('API key not configured. Please set your API key in Arena settings.');
        }

        const model = request.settings.model || 'gemini-2.0-flash';
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${request.settings.apiKey}`;

        // Build conversation history
        const contents = request.history.slice(-5).map((msg: ArenaMessage) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
        }));

        // Add current message
        contents.push({
            role: 'user',
            parts: [{ text: request.message }],
        });

        // Add system instruction based on agent type
        const systemInstruction = request.agent === 'learn'
            ? 'You are a knowledgeable assistant helping users learn about web technologies, HTTP protocols, REST APIs, WebSocket, GraphQL, and related topics. Provide accurate, educational responses with examples when helpful.'
            : 'You are a helpful assistant for Wave Client, a REST API testing tool. Help users understand how to use collections, environments, flows, and test suites. Be concise and practical.';

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents,
                systemInstruction: {
                    parts: [{ text: systemInstruction }],
                },
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 4096,
                },
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return err(errorData.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return ok({
            messageId: `msg-${Date.now()}`,
            content: responseText,
            tokenCount: data.usageMetadata?.totalTokenCount,
        });
    }

    /**
     * Send a message using Ollama API
     */
    async function sendOllamaMessage(request: ArenaChatRequest): Promise<Result<ArenaChatResponse, string>> {
        const baseUrl = request.settings.ollamaBaseUrl || 'http://localhost:11434';
        //const model = request.settings.model || 'llama2';
        const model = "llama3.2";
        const apiUrl = `${baseUrl}/api/chat`;

        // Build conversation history
        const messages = [
            {
                role: 'system',
                content: request.agent === 'learn'
                    ? 'You are a knowledgeable assistant helping users learn about web technologies, HTTP protocols, REST APIs, WebSocket, GraphQL, and related topics. Provide accurate, educational responses with examples when helpful.'
                    : 'You are a helpful assistant for Wave Client, a REST API testing tool. Help users understand how to use collections, environments, flows, and test suites. Be concise and practical.',
            },
            ...request.history.slice(-5).map((msg: ArenaMessage) => ({
                role: msg.role,
                content: msg.content,
            })),
            {
                role: 'user' as const,
                content: request.message,
            },
        ];

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages,
                stream: false,
                options: {
                    temperature: 0.7,
                    num_ctx: 4096,
                },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            return err(errorText || `Ollama API error: ${response.status}. Make sure Ollama is running.`);
        }

        const data = await response.json();
        const responseText = data.message?.content || '';

        return ok({
            messageId: `msg-${Date.now()}`,
            content: responseText,
            tokenCount: data.eval_count || undefined,
        });
    }

    return {
        // Session Management
        async loadSessions(): Promise<Result<ArenaSession[], string>> {
            return ok(localSessions);
        },

        async saveSession(session: ArenaSession): Promise<Result<void, string>> {
            const existingIndex = localSessions.findIndex(s => s.id === session.id);
            if (existingIndex >= 0) {
                localSessions[existingIndex] = session;
            } else {
                localSessions.push(session);
            }
            saveState();
            events.emit('arenaSessionsChanged', undefined);
            return ok(undefined);
        },

        async deleteSession(sessionId: string): Promise<Result<void, string>> {
            localSessions = localSessions.filter(s => s.id !== sessionId);
            localMessages.delete(sessionId);
            saveState();
            events.emit('arenaSessionsChanged', undefined);
            return ok(undefined);
        },

        // Message Management
        async loadMessages(sessionId: string): Promise<Result<ArenaMessage[], string>> {
            return ok(localMessages.get(sessionId) || []);
        },

        async saveMessage(message: ArenaMessage): Promise<Result<void, string>> {
            const sessionMessages = localMessages.get(message.sessionId) || [];
            const existingIndex = sessionMessages.findIndex(m => m.id === message.id);
            if (existingIndex >= 0) {
                sessionMessages[existingIndex] = message;
            } else {
                sessionMessages.push(message);
            }
            localMessages.set(message.sessionId, sessionMessages);
            saveState();
            events.emit('arenaMessagesChanged', { sessionId: message.sessionId });
            return ok(undefined);
        },

        async clearSessionMessages(sessionId: string): Promise<Result<void, string>> {
            localMessages.delete(sessionId);
            saveState();
            events.emit('arenaMessagesChanged', { sessionId });
            return ok(undefined);
        },

        // Document Management
        async loadDocuments(): Promise<Result<ArenaDocument[], string>> {
            return ok(localDocuments);
        },

        async uploadDocument(file: File, content: ArrayBuffer): Promise<Result<ArenaDocument, string>> {
            // For MVP, documents are stored in memory (metadata only)
            // Full implementation would upload to extension backend for processing
            const document: ArenaDocument = {
                id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                filename: file.name,
                mimeType: file.type,
                size: file.size,
                uploadedAt: Date.now(),
                processed: false, // Would be true after vector embedding
            };
            localDocuments.push(document);
            saveState();
            events.emit('arenaDocumentsChanged', undefined);
            return ok(document);
        },

        async deleteDocument(documentId: string): Promise<Result<void, string>> {
            localDocuments = localDocuments.filter(d => d.id !== documentId);
            saveState();
            events.emit('arenaDocumentsChanged', undefined);
            return ok(undefined);
        },

        // Chat Operations
        async sendMessage(request: ArenaChatRequest): Promise<Result<ArenaChatResponse, string>> {
            // For MVP, we'll call the LLM API directly from the webview
            // This is not ideal (exposes API key for cloud providers) but works for initial development
            // TODO: Move to extension backend for production
            
            try {
                const provider = request.settings.provider || 'gemini';

                if (provider === 'gemini') {
                    return await sendGeminiMessage(request);
                } else if (provider === 'ollama') {
                    return await sendOllamaMessage(request);
                } else {
                    return err(`Provider '${provider}' is not yet supported`);
                }
            } catch (error) {
                return err(error instanceof Error ? error.message : 'Failed to send message');
            }
        },

        async streamMessage(
            request: ArenaChatRequest,
            onChunk: (chunk: ArenaChatStreamChunk) => void
        ): Promise<Result<ArenaChatResponse, string>> {
            // For MVP, use non-streaming and simulate streaming
            // TODO: Implement actual streaming for both Gemini and Ollama
            const result = await this.sendMessage(request);
            
            if (result.isErr) {
                return result;
            }

            const messageId = result.value.messageId;
            const content = result.value.content;
            
            // Simulate streaming by chunking the response
            const chunkSize = 20;
            for (let i = 0; i < content.length; i += chunkSize) {
                const chunk = content.slice(i, i + chunkSize);
                onChunk({
                    messageId,
                    content: chunk,
                    done: false,
                });
                // Small delay to simulate streaming
                await new Promise(r => setTimeout(r, 10));
            }

            // Final chunk
            onChunk({
                messageId,
                content: '',
                done: true,
                tokenCount: result.value.tokenCount,
            });

            return result;
        },

        cancelChat(sessionId: string): void {
            const controller = activeChatControllers.get(sessionId);
            if (controller) {
                controller.abort();
                activeChatControllers.delete(sessionId);
            }
        },

        // Settings
        async loadSettings(): Promise<Result<ArenaSettings, string>> {
            return ok(localSettings);
        },

        async saveSettings(settings: ArenaSettings): Promise<Result<void, string>> {
            localSettings = settings;
            saveState();
            events.emit('arenaSettingsChanged', undefined);
            return ok(undefined);
        },

        async validateApiKey(provider: string, apiKey: string): Promise<Result<boolean, string>> {
            // Quick validation by making a minimal API call
            if (provider === 'gemini') {
                try {
                    const response = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
                    );
                    return ok(response.ok);
                } catch {
                    return ok(false);
                }
            } else if (provider === 'ollama') {
                // For Ollama, validate the base URL connection
                try {
                    const baseUrl = localSettings.ollamaBaseUrl || 'http://localhost:11434';
                    const response = await fetch(`${baseUrl}/api/tags`);
                    return ok(response.ok);
                } catch {
                    return ok(false);
                }
            }
            return ok(false);
        },
    };
}

export default createVSCodeArenaAdapter;
