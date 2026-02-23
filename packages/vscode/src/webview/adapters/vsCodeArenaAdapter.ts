/**
 * VS Code Arena Adapter
 *
 * Implements IArenaAdapter for the VS Code webview environment.
 * This is a thin relay adapter — every operation is delegated to the extension
 * host via postMessage and awaited through the shared pendingRequests map.
 * No in-memory state is maintained here; the extension host is the source of truth.
 */

import type {
    Result,
    IArenaAdapter,
    ArenaSession,
    ArenaMessage,
    ArenaDocument,
    ArenaSettings,
    ArenaChatRequest,
    ArenaChatResponse,
    ArenaChatStreamChunk,
    IAdapterEvents,
    ArenaReference,
    ArenaProviderSettingsMap,
} from '@wave-client/core';

// ---------------------------------------------------------------------------
// Inline Result helpers — avoids a value-import of the ESM @wave-client/core
// package in the CJS webpack compilation context (TS1479).
// These match the shape produced by the real ok()/err() from @wave-client/core.
// ---------------------------------------------------------------------------
function ok<T>(value: T): Result<T, never> {
    return { isOk: true, isErr: false, value } as unknown as Result<T, never>;
}
function err<E>(error: E): Result<never, E> {
    return { isOk: false, isErr: true, error } as unknown as Result<never, E>;
}

// ============================================================================
// Types
// ============================================================================

/** Shared shape used by the parent vsCodeAdapter pendingRequests map. */
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
 * All operations are delegated to the extension host via postMessage.
 * Streaming chunks arrive as `arena.streamChunk` push messages — routed to the
 * `arenaStreamChunk` event by `vsCodeAdapter.handleMessage` — so we subscribe
 * to that event before posting a `streamMessage` request and unsubscribe when
 * the response (or error) arrives.
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

            // Map request types to response data fields.
            // Empty string ('') means the response carries no data (void success).
            const responseDataMap: Record<string, string> = {
                'arena.loadSessions':         'sessions',
                'arena.saveSession':          '',
                'arena.deleteSession':        '',
                'arena.loadMessages':         'messages',
                'arena.saveMessage':          '',
                'arena.clearSessionMessages': '',
                'arena.loadDocuments':        'documents',
                'arena.uploadDocument':       'document',
                'arena.deleteDocument':       '',
                'arena.streamMessage':        'response',
                'arena.loadSettings':         'settings',
                'arena.saveSettings':         '',
                'arena.validateApiKey':       'valid',
                'arena.loadReferences':       'references',
                'arena.saveReferences':       '',
                'arena.loadProviderSettings': 'settings',
                'arena.saveProviderSettings': '',
                'arena.getAvailableModels':   'models',
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

    // ============================================================================
    // IArenaAdapter implementation — all ops delegate to extension host
    // ============================================================================

    /**
     * Stream a chat message to the extension host and relay chunks via callback
     * and the shared `arenaStreamChunk` event.
     *
     * We subscribe to `arenaStreamChunk` BEFORE posting the request so no chunk
     * emitted on the event bus before the Promise resolves is missed.
     */
    async function streamMessageImpl(
        request: ArenaChatRequest,
        onChunk: (chunk: ArenaChatStreamChunk) => void
    ): Promise<Result<ArenaChatResponse, string>> {
        const chunkHandler = (chunk: ArenaChatStreamChunk) => onChunk(chunk);
        events.on('arenaStreamChunk', chunkHandler);

        const result = await sendAndWait<ArenaChatResponse>('arena.streamMessage', {
            request: request as unknown as Record<string, unknown>,
        });

        events.off('arenaStreamChunk', chunkHandler);
        return result;
    }

    return {
        // ── Session Management ───────────────────────────────────────────────

        async loadSessions(): Promise<Result<ArenaSession[], string>> {
            return sendAndWait<ArenaSession[]>('arena.loadSessions');
        },

        async saveSession(session: ArenaSession): Promise<Result<void, string>> {
            const result = await sendAndWait<void>('arena.saveSession', { session: session as unknown as Record<string, unknown> });
            if (result.isOk) events.emit('arenaSessionsChanged', undefined);
            return result;
        },

        async deleteSession(sessionId: string): Promise<Result<void, string>> {
            const result = await sendAndWait<void>('arena.deleteSession', { sessionId });
            if (result.isOk) events.emit('arenaSessionsChanged', undefined);
            return result;
        },

        // ── Message Management ───────────────────────────────────────────────

        async loadMessages(sessionId: string): Promise<Result<ArenaMessage[], string>> {
            return sendAndWait<ArenaMessage[]>('arena.loadMessages', { sessionId });
        },

        async saveMessage(message: ArenaMessage): Promise<Result<void, string>> {
            const result = await sendAndWait<void>('arena.saveMessage', { message: message as unknown as Record<string, unknown> });
            if (result.isOk) events.emit('arenaMessagesChanged', { sessionId: message.sessionId });
            return result;
        },

        async clearSessionMessages(sessionId: string): Promise<Result<void, string>> {
            const result = await sendAndWait<void>('arena.clearSessionMessages', { sessionId });
            if (result.isOk) events.emit('arenaMessagesChanged', { sessionId });
            return result;
        },

        // ── Document Management ──────────────────────────────────────────────

        async loadDocuments(): Promise<Result<ArenaDocument[], string>> {
            return sendAndWait<ArenaDocument[]>('arena.loadDocuments');
        },

        async uploadDocument(file: File, content: ArrayBuffer): Promise<Result<ArenaDocument, string>> {
            // Serialize only serialisable metadata; the extension host creates the ArenaDocument record.
            const result = await sendAndWait<ArenaDocument>('arena.uploadDocument', {
                filename: file.name,
                mimeType: file.type,
                size: file.size,
                // content is intentionally omitted (too large for postMessage in MVP)
            });
            if (result.isOk) events.emit('arenaDocumentsChanged', undefined);
            return result;
        },

        async deleteDocument(documentId: string): Promise<Result<void, string>> {
            const result = await sendAndWait<void>('arena.deleteDocument', { documentId });
            if (result.isOk) events.emit('arenaDocumentsChanged', undefined);
            return result;
        },

        // ── Chat Operations ──────────────────────────────────────────────────

        async sendMessage(request: ArenaChatRequest): Promise<Result<ArenaChatResponse, string>> {
            // Delegate to streamMessage with a no-op chunk handler so callers that
            // want just the final response don't need to wire up event listeners.
            return streamMessageImpl(request, () => { /* no-op */ });
        },

        async streamMessage(
            request: ArenaChatRequest,
            onChunk: (chunk: ArenaChatStreamChunk) => void
        ): Promise<Result<ArenaChatResponse, string>> {
            return streamMessageImpl(request, onChunk);
        },

        cancelChat(sessionId: string): void {
            // Fire-and-forget: tell the extension host to abort the in-flight request.
            vsCodeApi.postMessage({ type: 'arena.cancelChat', sessionId });
        },

        // ── Settings ─────────────────────────────────────────────────────────

        async loadSettings(): Promise<Result<ArenaSettings, string>> {
            return sendAndWait<ArenaSettings>('arena.loadSettings');
        },

        async saveSettings(settings: ArenaSettings): Promise<Result<void, string>> {
            const result = await sendAndWait<void>('arena.saveSettings', { settings: settings as unknown as Record<string, unknown> });
            if (result.isOk) events.emit('arenaSettingsChanged', undefined);
            return result;
        },

        // ── References ───────────────────────────────────────────────────────

        async loadReferences(): Promise<Result<ArenaReference[], string>> {
            return sendAndWait<ArenaReference[]>('arena.loadReferences');
        },

        async saveReferences(references: ArenaReference[]): Promise<Result<void, string>> {
            return sendAndWait<void>('arena.saveReferences', { references: references as unknown as Record<string, unknown> });
        },

        // ── Provider Settings ─────────────────────────────────────────────────

        async loadProviderSettings(): Promise<Result<ArenaProviderSettingsMap, string>> {
            return sendAndWait<ArenaProviderSettingsMap>('arena.loadProviderSettings');
        },

        async saveProviderSettings(settings: ArenaProviderSettingsMap): Promise<Result<void, string>> {
            return sendAndWait<void>('arena.saveProviderSettings', { settings: settings as unknown as Record<string, unknown> });
        },

        // ── API Key & Models ──────────────────────────────────────────────────

        async validateApiKey(provider: string, apiKey: string): Promise<Result<boolean, string>> {
            return sendAndWait<boolean>('arena.validateApiKey', { provider, apiKey });
        },

        async getAvailableModels(provider: string): Promise<Result<{ id: string; label: string }[], string>> {
            return sendAndWait<{ id: string; label: string }[]>('arena.getAvailableModels', { provider });
        },
    };
}

export default createVSCodeArenaAdapter;
