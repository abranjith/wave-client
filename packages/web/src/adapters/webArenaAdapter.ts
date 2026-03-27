/**
 * Web Arena Adapter
 *
 * Implements IArenaAdapter for the web platform.
 * This is a thin relay adapter — every operation is delegated to the Wave
 * Client server via HTTP REST calls.  No in-memory state is maintained here;
 * the server (backed by `arenaStorageService` + `ArenaService`) is the source
 * of truth.
 *
 * Streaming uses Server-Sent Events (SSE): the adapter opens a `POST` to
 * `/api/arena/chat/stream` and receives chunks via the event stream.
 * A 120 s safety timeout fires if no events arrive; it resets on each chunk.
 */

import type {
    IArenaAdapter,
    IAdapterEvents,
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
import { ok, err, Result } from '@wave-client/core';

// ============================================================================
// Server Communication
// ============================================================================

/** Base URL for the Wave Client server. */
const SERVER_URL = 'http://127.0.0.1:3456';

/**
 * Makes a JSON request to the server and returns a `Result`.
 * Maps the server's `{ isOk, value, error }` envelope into core `Result`.
 */
async function serverRequest<T>(
    method: string,
    path: string,
    body?: unknown,
): Promise<Result<T, string>> {
    try {
        const init: RequestInit = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body !== undefined) {
            init.body = JSON.stringify(body);
        }

        const response = await fetch(`${SERVER_URL}${path}`, init);
        const data = await response.json();

        if (data.isOk) {
            return ok(data.value as T);
        }
        return err(data.error ?? `Server error: ${response.status}`);
    } catch (error) {
        return err(`Request failed: ${error}`);
    }
}

// ============================================================================
// Web Arena Adapter Implementation
// ============================================================================

/**
 * Creates a thin relay Arena adapter that delegates all operations to the
 * Wave Client server.
 *
 * @param events  Adapter event emitter — used to notify the UI of data changes.
 */
export function createWebArenaAdapter(events: IAdapterEvents): IArenaAdapter {
    return {
        // ====================================================================
        // Session Management
        // ====================================================================

        async loadSessions(): Promise<Result<ArenaSession[], string>> {
            return serverRequest<ArenaSession[]>('GET', '/api/arena/sessions');
        },

        async saveSession(session: ArenaSession): Promise<Result<void, string>> {
            const result = await serverRequest<void>('POST', '/api/arena/sessions', session);
            if (result.isOk) { events.emit('arenaSessionsChanged', undefined); }
            return result;
        },

        async deleteSession(sessionId: string): Promise<Result<void, string>> {
            const result = await serverRequest<void>('DELETE', `/api/arena/sessions/${encodeURIComponent(sessionId)}`);
            if (result.isOk) { events.emit('arenaSessionsChanged', undefined); }
            return result;
        },

        // ====================================================================
        // Message Management
        // ====================================================================

        async loadMessages(sessionId: string): Promise<Result<ArenaMessage[], string>> {
            return serverRequest<ArenaMessage[]>('GET', `/api/arena/sessions/${encodeURIComponent(sessionId)}/messages`);
        },

        async saveMessage(message: ArenaMessage): Promise<Result<void, string>> {
            const result = await serverRequest<void>('POST', '/api/arena/messages', message);
            if (result.isOk) { events.emit('arenaMessagesChanged', { sessionId: message.sessionId }); }
            return result;
        },

        async clearSessionMessages(sessionId: string): Promise<Result<void, string>> {
            const result = await serverRequest<void>('DELETE', `/api/arena/sessions/${encodeURIComponent(sessionId)}/messages`);
            if (result.isOk) { events.emit('arenaMessagesChanged', { sessionId }); }
            return result;
        },

        // ====================================================================
        // Chat Operations
        // ====================================================================

        async sendMessage(request: ArenaChatRequest): Promise<Result<ArenaChatResponse, string>> {
            return serverRequest<ArenaChatResponse>('POST', '/api/arena/chat', request);
        },

        streamMessage(request: ArenaChatRequest): StreamHandle {
            const chunkCbs = new Set<(chunk: ArenaChatStreamChunk) => void>();
            const doneCbs = new Set<(response: ArenaChatResponse) => void>();
            const errorCbs = new Set<(error: string) => void>();
            let ended = false;

            const controller = new AbortController();

            // ── 180 s safety timeout ──────────────────────────────────────────
            // Fires if no events arrive within 180 s. Resets on every chunk.
            let safetyTimer: ReturnType<typeof setTimeout> | null = null;

            function resetSafetyTimer() {
                if (safetyTimer) { clearTimeout(safetyTimer); }
                safetyTimer = setTimeout(() => {
                    console.warn('[WebArena] safety timeout fired — no events in 180 s');
                    emitError('Stream timed out — no response received within 180 s');
                    controller.abort();
                }, 180_000);
            }

            function clearSafetyTimer() {
                if (safetyTimer) {
                    clearTimeout(safetyTimer);
                    safetyTimer = null;
                }
            }

            function emitError(msg: string) {
                if (ended) { return; }
                ended = true;
                clearSafetyTimer();
                errorCbs.forEach((cb) => {
                    try { cb(msg); } catch (e) { console.error('[WebArena] error cb error', e); }
                });
            }

            function emitDone(response: ArenaChatResponse) {
                if (ended) { return; }
                ended = true;
                clearSafetyTimer();
                doneCbs.forEach((cb) => {
                    try { cb(response); } catch (e) { console.error('[WebArena] done cb error', e); }
                });
            }

            function makeSub<T>(set: Set<T>, cb: T): StreamUnsubscribe {
                set.add(cb);
                let removed = false;
                return () => { if (!removed) { removed = true; set.delete(cb); } };
            }

            // Start safety timer immediately
            resetSafetyTimer();

            // Kick off the SSE fetch in the background
            (async () => {
                try {
                    const response = await fetch(`${SERVER_URL}/api/arena/chat/stream`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(request),
                        signal: controller.signal,
                    });

                    if (!response.ok) {
                        const data = await response.json().catch(() => ({}));
                        emitError(data.error ?? `Server error: ${response.status}`);
                        return;
                    }

                    const reader = response.body?.getReader();
                    if (!reader) {
                        emitError('Failed to get response stream reader');
                        return;
                    }

                    const decoder = new TextDecoder();
                    let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) { break; }

                        buffer += decoder.decode(value, { stream: true });

                        // Parse SSE frames from the buffer
                        const frames = buffer.split('\n\n');
                        // Keep the last (possibly incomplete) frame in the buffer
                        buffer = frames.pop() ?? '';

                        for (const frame of frames) {
                            if (!frame.trim()) { continue; }

                            let eventType = '';
                            let eventData = '';

                            for (const line of frame.split('\n')) {
                                if (line.startsWith('event: ')) {
                                    eventType = line.slice(7).trim();
                                } else if (line.startsWith('data: ')) {
                                    eventData = line.slice(6);
                                }
                            }

                            if (!eventType || !eventData) { continue; }

                            try {
                                const parsed = JSON.parse(eventData);

                                switch (eventType) {
                                    case 'chunk':
                                        resetSafetyTimer();
                                        chunkCbs.forEach((cb) => {
                                            try { cb(parsed); } catch (e) { console.error('[WebArena] chunk cb error', e); }
                                        });
                                        break;

                                    case 'complete':
                                        emitDone(parsed);
                                        return;

                                    case 'error':
                                        emitError(parsed.message ?? 'Unknown stream error');
                                        return;
                                }
                            } catch {
                                // Skip malformed JSON
                            }
                        }
                    }

                    // Stream ended without a complete/error event
                    if (!ended) {
                        emitError('Stream ended unexpectedly');
                    }
                } catch (error) {
                    if (error instanceof DOMException && error.name === 'AbortError') {
                        if (!ended) {
                            emitError('Cancelled');
                        }
                    } else {
                        emitError(`Stream request failed: ${error}`);
                    }
                }
            })();

            return {
                onChunk(cb) { return makeSub(chunkCbs, cb); },
                onDone(cb) { return makeSub(doneCbs, cb); },
                onError(cb) { return makeSub(errorCbs, cb); },
                cancel() {
                    if (ended) { return; }
                    controller.abort();
                    emitError('Cancelled');
                },
            };
        },

        // ====================================================================
        // Settings
        // ====================================================================

        async loadSettings(): Promise<Result<ArenaSettings, string>> {
            return serverRequest<ArenaSettings>('GET', '/api/arena/settings');
        },

        async saveSettings(settings: ArenaSettings): Promise<Result<void, string>> {
            const result = await serverRequest<void>('PUT', '/api/arena/settings', settings);
            if (result.isOk) { events.emit('arenaSettingsChanged', undefined); }
            return result;
        },

        // ====================================================================
        // Validate API Key & Models
        // ====================================================================

        async validateApiKey(provider: string, apiKey: string): Promise<Result<boolean, string>> {
            const result = await serverRequest<{ valid: boolean; error?: string }>(
                'POST', '/api/arena/validate-api-key', { provider, apiKey },
            );
            if (result.isOk) {
                return result.value.valid ? ok(true) : err(result.value.error ?? 'Invalid API key');
            }
            return err(result.error);
        },

        async getAvailableModels(provider: string): Promise<Result<{ id: string; label: string }[], string>> {
            return serverRequest<{ id: string; label: string }[]>(
                'GET', `/api/arena/models/${encodeURIComponent(provider)}`,
            );
        },

        async checkMcpStatus(): Promise<Result<import('@wave-client/core').McpStatus, string>> {
            return serverRequest<import('@wave-client/core').McpStatus>('GET', '/api/arena/mcp/status');
        },

        async startMcpServer(): Promise<Result<import('@wave-client/core').McpStatus, string>> {
            return serverRequest<import('@wave-client/core').McpStatus>('POST', '/api/arena/mcp/start');
        },

        // ====================================================================
        // References
        // ====================================================================

        async loadReferences(): Promise<Result<ArenaReference[], string>> {
            return serverRequest<ArenaReference[]>('GET', '/api/arena/references');
        },

        async saveReferences(references: ArenaReference[]): Promise<Result<void, string>> {
            return serverRequest<void>('PUT', '/api/arena/references', references);
        },

        // ====================================================================
        // Provider Settings
        // ====================================================================

        async loadProviderSettings(): Promise<Result<ArenaProviderSettingsMap, string>> {
            return serverRequest<ArenaProviderSettingsMap>('GET', '/api/arena/provider-settings');
        },

        async saveProviderSettings(settings: ArenaProviderSettingsMap): Promise<Result<void, string>> {
            return serverRequest<void>('PUT', '/api/arena/provider-settings', settings);
        },
    };
}
