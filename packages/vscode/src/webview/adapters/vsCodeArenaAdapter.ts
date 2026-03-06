/**
 * VS Code Arena Adapter
 *
 * Implements IArenaAdapter for the VS Code webview environment.
 * This is a thin relay adapter — every operation is delegated to the extension
 * host via postMessage and awaited through the shared pendingRequests map.
 * No in-memory state is maintained here; the extension host is the source of truth.
 *
 * Streaming: `streamMessage()` returns a `StreamHandle` immediately.  Chunks
 * arrive as `arena.streamChunk` messages keyed by `streamId`; completion and
 * errors arrive as `arena.streamComplete` / `arena.streamError`.  No pending
 * promise (and therefore no timeout) is involved for the streaming path.
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
    StreamHandle,
    StreamUnsubscribe,
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
 * Streaming uses a `streamId`-based protocol where chunks, completion, and
 * error messages are correlated via a unique `streamId` rather than the
 * shared `pendingRequests` map — eliminating timeout issues and dual-channel
 * race conditions.
 */
export function createVSCodeArenaAdapter(
    vsCodeApi: VSCodeAPI,
    pendingRequests: Map<string, PendingRequest<unknown>>,
    events: IAdapterEvents,
    defaultTimeout: number = 120000
): { adapter: IArenaAdapter; handleStreamMessage: (message: any) => boolean } {
    let requestIdCounter = 0;

    /** Active stream listeners keyed by streamId.  Cleaned up on done / error / cancel. */
    const activeStreams = new Map<string, {
        chunkCbs: Set<(chunk: ArenaChatStreamChunk) => void>;
        doneCbs: Set<(response: ArenaChatResponse) => void>;
        errorCbs: Set<(error: string) => void>;
    }>();

    function generateRequestId(): string {
        return `arena-req-${Date.now()}-${++requestIdCounter}`;
    }

    function generateStreamId(): string {
        return `arena-stream-${Date.now()}-${++requestIdCounter}`;
    }

    /**
     * Send a request and wait for response (used for non-streaming ops only).
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
                'arena.loadSessions': 'sessions',
                'arena.saveSession': '',
                'arena.deleteSession': '',
                'arena.loadMessages': 'messages',
                'arena.saveMessage': '',
                'arena.clearSessionMessages': '',
                'arena.loadDocuments': 'documents',
                'arena.uploadDocument': 'document',
                'arena.deleteDocument': '',
                'arena.loadSettings': 'settings',
                'arena.saveSettings': '',
                'arena.validateApiKey': 'valid',
                'arena.loadReferences': 'references',
                'arena.saveReferences': '',
                'arena.loadProviderSettings': 'settings',
                'arena.saveProviderSettings': '',
                'arena.getAvailableModels': 'models',
                'arena.sendMessage': 'response',
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

    // ========================================================================
    // Stream message routing
    // ========================================================================

    /**
     * Called by the parent vsCodeAdapter's `handleMessage` for stream-related
     * push messages.  Dispatches to the correct StreamHandle listeners.
     */
    function handleStreamMessage(message: any): boolean {
        const streamId: string | undefined = message.streamId;
        if (!streamId) { return false; }

        const listeners = activeStreams.get(streamId);
        if (!listeners) { return false; }

        switch (message.type) {
            case 'arena.streamChunk':
                listeners.chunkCbs.forEach((cb) => {
                    try { cb(message.chunk); } catch (e) { console.error('[ArenaAdapter] chunk cb error', e); }
                });
                return true;

            case 'arena.streamComplete':
                listeners.doneCbs.forEach((cb) => {
                    try { cb(message.response); } catch (e) { console.error('[ArenaAdapter] done cb error', e); }
                });
                activeStreams.delete(streamId);
                return true;

            case 'arena.streamError':
                listeners.errorCbs.forEach((cb) => {
                    try { cb(message.error ?? 'Unknown stream error'); } catch (e) { console.error('[ArenaAdapter] error cb error', e); }
                });
                activeStreams.delete(streamId);
                return true;

            default:
                return false;
        }
    }

    // Expose the stream-message router so the parent adapter can call it.

    // ========================================================================
    // IArenaAdapter implementation
    // ========================================================================

    const adapter: IArenaAdapter = {
        // ── Session Management ───────────────────────────────────────────────

        async loadSessions(): Promise<Result<ArenaSession[], string>> {
            return sendAndWait<ArenaSession[]>('arena.loadSessions');
        },

        async saveSession(session: ArenaSession): Promise<Result<void, string>> {
            const result = await sendAndWait<void>('arena.saveSession', { session: session as unknown as Record<string, unknown> });
            if (result.isOk) { events.emit('arenaSessionsChanged', undefined); }
            return result;
        },

        async deleteSession(sessionId: string): Promise<Result<void, string>> {
            const result = await sendAndWait<void>('arena.deleteSession', { sessionId });
            if (result.isOk) { events.emit('arenaSessionsChanged', undefined); }
            return result;
        },

        // ── Message Management ───────────────────────────────────────────────

        async loadMessages(sessionId: string): Promise<Result<ArenaMessage[], string>> {
            return sendAndWait<ArenaMessage[]>('arena.loadMessages', { sessionId });
        },

        async saveMessage(message: ArenaMessage): Promise<Result<void, string>> {
            const result = await sendAndWait<void>('arena.saveMessage', { message: message as unknown as Record<string, unknown> });
            if (result.isOk) { events.emit('arenaMessagesChanged', { sessionId: message.sessionId }); }
            return result;
        },

        async clearSessionMessages(sessionId: string): Promise<Result<void, string>> {
            const result = await sendAndWait<void>('arena.clearSessionMessages', { sessionId });
            if (result.isOk) { events.emit('arenaMessagesChanged', { sessionId }); }
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
            if (result.isOk) { events.emit('arenaDocumentsChanged', undefined); }
            return result;
        },

        async deleteDocument(documentId: string): Promise<Result<void, string>> {
            const result = await sendAndWait<void>('arena.deleteDocument', { documentId });
            if (result.isOk) { events.emit('arenaDocumentsChanged', undefined); }
            return result;
        },

        // ── Chat Operations ──────────────────────────────────────────────────

        async sendMessage(request: ArenaChatRequest): Promise<Result<ArenaChatResponse, string>> {
            // Non-streaming path: use sendAndWait with a dedicated message type
            // that tells the extension host NOT to push stream chunks.
            return sendAndWait<ArenaChatResponse>('arena.sendMessage', {
                request: request as unknown as Record<string, unknown>,
            });
        },

        streamMessage(request: ArenaChatRequest): StreamHandle {
            const streamId = generateStreamId();
            const listeners = {
                chunkCbs: new Set<(chunk: ArenaChatStreamChunk) => void>(),
                doneCbs: new Set<(response: ArenaChatResponse) => void>(),
                errorCbs: new Set<(error: string) => void>(),
            };
            activeStreams.set(streamId, listeners);

            // Fire-and-forget: post the request to the extension host.
            vsCodeApi.postMessage({
                type: 'arena.streamMessage',
                streamId,
                chatRequest: request,
            });

            let ended = false;

            function makeSub<T>(set: Set<T>, cb: T): StreamUnsubscribe {
                set.add(cb);
                let removed = false;
                return () => { if (!removed) { removed = true; set.delete(cb); } };
            }

            const handle: StreamHandle = {
                onChunk(cb) { return makeSub(listeners.chunkCbs, cb); },
                onDone(cb) { return makeSub(listeners.doneCbs, cb); },
                onError(cb) { return makeSub(listeners.errorCbs, cb); },
                cancel() {
                    if (ended) { return; }
                    ended = true;
                    vsCodeApi.postMessage({ type: 'arena.cancelChat', streamId });
                    // Immediately notify error listeners so the UI stops streaming
                    listeners.errorCbs.forEach((cb) => {
                        try { cb('Cancelled'); } catch (e) { console.error('[ArenaAdapter] cancel cb error', e); }
                    });
                    activeStreams.delete(streamId);
                },
            };

            return handle;
        },

        // ── Settings ─────────────────────────────────────────────────────────

        async loadSettings(): Promise<Result<ArenaSettings, string>> {
            return sendAndWait<ArenaSettings>('arena.loadSettings');
        },

        async saveSettings(settings: ArenaSettings): Promise<Result<void, string>> {
            const result = await sendAndWait<void>('arena.saveSettings', { settings: settings as unknown as Record<string, unknown> });
            if (result.isOk) { events.emit('arenaSettingsChanged', undefined); }
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

    return { adapter, handleStreamMessage };
}

export default createVSCodeArenaAdapter;
