/**
 * Tests for createVSCodeArenaAdapter (thin postMessage relay)
 *
 * Pattern used throughout:
 *  1. Call adapter method (do NOT await yet) — this calls vsCodeApi.postMessage
 *     synchronously (inside the sendAndWait Promise executor) and registers a
 *     pending request.
 *  2. Call resolveRequest(...) to simulate the extension host's response.
 *  3. Await the adapter Promise and assert on the Result.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
    IAdapterEvents,
    ArenaSession,
    ArenaMessage,
    ArenaDocument,
    ArenaSettings,
    ArenaReference,
    ArenaProviderSettingsMap,
    ArenaChatStreamChunk,
    ArenaChatResponse,
    IArenaAdapter,
    StreamHandle,
} from '@wave-client/core';
import { createVSCodeArenaAdapter } from '../../webview/adapters/vsCodeArenaAdapter.js';

// ─── Mock events factory ─────────────────────────────────────────────────────
// Avoids importing the ESM createAdapterEventEmitter() as a value (TS1479).
// Provides the same on/off/emit semantics.
function createMockEvents(): IAdapterEvents {
    const handlers = new Map<string, Set<(data: unknown) => void>>();
    const instance: IAdapterEvents = {
        on(event: string, handler: (data: unknown) => void): void {
            if (!handlers.has(event)) handlers.set(event, new Set());
            handlers.get(event)!.add(handler);
        },
        off(event: string, handler: (data: unknown) => void): void {
            handlers.get(event)?.delete(handler);
        },
        emit(event: string, data: unknown): void {
            handlers.get(event)?.forEach((h) => h(data));
        },
    } as unknown as IAdapterEvents;
    return instance;
}

// ─── Mock VSCodeAPI ──────────────────────────────────────────────────────────

function makeMockVSCodeApi() {
    return {
        postMessage: vi.fn(),
        getState: vi.fn().mockReturnValue({}),
        setState: vi.fn(),
    };
}

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const SESSION: ArenaSession = {
    id: 'sess-1',
    title: 'Test Session',
    agent: 'general' as any,
    createdAt: 1000,
    updatedAt: 1000,
    messageCount: 0,
};

const MESSAGE: ArenaMessage = {
    id: 'msg-1',
    sessionId: 'sess-1',
    role: 'user',
    content: 'Hello',
    status: 'sent',
    timestamp: 1000,
};

const DOCUMENT: ArenaDocument = {
    id: 'doc-1',
    filename: 'test.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    uploadedAt: 1000,
    processed: false,
};

const SETTINGS: ArenaSettings = {
    model: 'gemini-pro',
    provider: 'gemini',
    maxContextMessages: 10,
} as any;

const REFERENCE: ArenaReference = { id: 'ref-1', type: 'web', title: 'Ref 1' } as any;
const PROVIDER_SETTINGS: ArenaProviderSettingsMap = { gemini: { apiKey: 'key-123' } } as any;

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('createVSCodeArenaAdapter', () => {
    let vsCodeApi: ReturnType<typeof makeMockVSCodeApi>;
    let pendingRequests: Map<string, any>;
    let events: IAdapterEvents;
    let adapter: IArenaAdapter;
    let handleStreamMessage: (message: any) => boolean;

    /** Get the requestId from the most-recent postMessage call. */
    function lastRequestId(): string {
        const calls = vsCodeApi.postMessage.mock.calls;
        return (calls[calls.length - 1][0] as any).requestId;
    }

    /**
     * Simulate the extension host responding to the most-recent request.
     * @param responseData - The full response object passed to pending.resolve()
     */
    function resolveRequest(responseData: Record<string, unknown> = {}): void {
        const requestId = lastRequestId();
        const pending = pendingRequests.get(requestId);
        if (!pending) throw new Error(`No pending request found for id: ${requestId}`);
        clearTimeout(pending.timeout);
        pending.resolve(responseData);
        pendingRequests.delete(requestId);
    }

    beforeEach(() => {
        vsCodeApi = makeMockVSCodeApi();
        pendingRequests = new Map();
        events = createMockEvents();
        // Short default timeout so timeout tests don't take 2 minutes
        const result = createVSCodeArenaAdapter(vsCodeApi, pendingRequests, events, 200);
        adapter = result.adapter;
        handleStreamMessage = result.handleStreamMessage;
    });

    // =========================================================================
    // Session Management
    // =========================================================================

    describe('loadSessions', () => {
        it('posts arena.loadSessions and resolves with sessions', async () => {
            const promise = adapter.loadSessions();
            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'arena.loadSessions' })
            );
            resolveRequest({ sessions: [SESSION] });
            const result = await promise;
            expect(result.isOk).toBe(true);
            expect((result as any).value).toEqual([SESSION]);
        });
    });

    describe('saveSession', () => {
        it('posts arena.saveSession, resolves void, and emits arenaSessionsChanged', async () => {
            const sessionChangedSpy = vi.fn();
            events.on('arenaSessionsChanged', sessionChangedSpy);

            const promise = adapter.saveSession(SESSION);
            resolveRequest({});
            const result = await promise;

            expect(result.isOk).toBe(true);
            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'arena.saveSession', session: SESSION })
            );
            expect(sessionChangedSpy).toHaveBeenCalledOnce();
        });

        it('does NOT emit arenaSessionsChanged on error', async () => {
            const sessionChangedSpy = vi.fn();
            events.on('arenaSessionsChanged', sessionChangedSpy);

            const promise = adapter.saveSession(SESSION);
            resolveRequest({ error: 'Save failed' });
            await promise;

            expect(sessionChangedSpy).not.toHaveBeenCalled();
        });
    });

    describe('deleteSession', () => {
        it('posts arena.deleteSession with sessionId and emits on success', async () => {
            const spy = vi.fn();
            events.on('arenaSessionsChanged', spy);

            const promise = adapter.deleteSession('sess-1');
            resolveRequest({});
            await promise;

            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'arena.deleteSession', sessionId: 'sess-1' })
            );
            expect(spy).toHaveBeenCalledOnce();
        });
    });

    // =========================================================================
    // Message Management
    // =========================================================================

    describe('loadMessages', () => {
        it('posts arena.loadMessages with sessionId and resolves messages', async () => {
            const promise = adapter.loadMessages('sess-1');
            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'arena.loadMessages', sessionId: 'sess-1' })
            );
            resolveRequest({ messages: [MESSAGE] });
            const result = await promise;
            expect(result.isOk).toBe(true);
            expect((result as any).value).toEqual([MESSAGE]);
        });
    });

    describe('saveMessage', () => {
        it('posts arena.saveMessage and emits arenaMessagesChanged', async () => {
            const spy = vi.fn();
            events.on('arenaMessagesChanged', spy);

            const promise = adapter.saveMessage(MESSAGE);
            resolveRequest({});
            await promise;

            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'arena.saveMessage', message: MESSAGE })
            );
            expect(spy).toHaveBeenCalledWith({ sessionId: MESSAGE.sessionId });
        });
    });

    describe('clearSessionMessages', () => {
        it('posts arena.clearSessionMessages and emits arenaMessagesChanged', async () => {
            const spy = vi.fn();
            events.on('arenaMessagesChanged', spy);

            const promise = adapter.clearSessionMessages('sess-1');
            resolveRequest({});
            await promise;

            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'arena.clearSessionMessages', sessionId: 'sess-1' })
            );
            expect(spy).toHaveBeenCalledWith({ sessionId: 'sess-1' });
        });
    });

    // =========================================================================
    // Document Management
    // =========================================================================

    describe('loadDocuments', () => {
        it('resolves with documents array', async () => {
            const promise = adapter.loadDocuments();
            resolveRequest({ documents: [DOCUMENT] });
            const result = await promise;
            expect(result.isOk).toBe(true);
            expect((result as any).value).toEqual([DOCUMENT]);
        });
    });

    describe('uploadDocument', () => {
        it('posts metadata only (not ArrayBuffer content) and emits arenaDocumentsChanged', async () => {
            const spy = vi.fn();
            events.on('arenaDocumentsChanged', spy);

            const file = new File(['data'], 'test.pdf', { type: 'application/pdf' });
            const content = new ArrayBuffer(4);

            const promise = adapter.uploadDocument(file, content);
            const posted = vsCodeApi.postMessage.mock.lastCall?.[0] as any;

            // Metadata should be present
            expect(posted.filename).toBe('test.pdf');
            expect(posted.mimeType).toBe('application/pdf');
            expect(posted.size).toBe(4);
            // Raw ArrayBuffer should NOT be sent
            expect(posted.content).toBeUndefined();

            resolveRequest({ document: DOCUMENT });
            const result = await promise;
            expect(result.isOk).toBe(true);
            expect((result as any).value).toEqual(DOCUMENT);
            expect(spy).toHaveBeenCalledOnce();
        });
    });

    describe('deleteDocument', () => {
        it('posts arena.deleteDocument and emits arenaDocumentsChanged', async () => {
            const spy = vi.fn();
            events.on('arenaDocumentsChanged', spy);

            const promise = adapter.deleteDocument('doc-1');
            resolveRequest({});
            await promise;

            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'arena.deleteDocument', documentId: 'doc-1' })
            );
            expect(spy).toHaveBeenCalledOnce();
        });
    });

    // =========================================================================
    // Settings
    // =========================================================================

    describe('loadSettings', () => {
        it('resolves with ArenaSettings', async () => {
            const promise = adapter.loadSettings();
            resolveRequest({ settings: SETTINGS });
            const result = await promise;
            expect(result.isOk).toBe(true);
            expect((result as any).value).toEqual(SETTINGS);
        });
    });

    describe('saveSettings', () => {
        it('posts arena.saveSettings and emits arenaSettingsChanged', async () => {
            const spy = vi.fn();
            events.on('arenaSettingsChanged', spy);

            const promise = adapter.saveSettings(SETTINGS);
            resolveRequest({});
            await promise;

            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'arena.saveSettings', settings: SETTINGS })
            );
            expect(spy).toHaveBeenCalledOnce();
        });
    });

    // =========================================================================
    // References
    // =========================================================================

    describe('loadReferences', () => {
        it('resolves with references array', async () => {
            const promise = adapter.loadReferences();
            resolveRequest({ references: [REFERENCE] });
            const result = await promise;
            expect(result.isOk).toBe(true);
            expect((result as any).value).toEqual([REFERENCE]);
        });
    });

    describe('saveReferences', () => {
        it('posts arena.saveReferences', async () => {
            const promise = adapter.saveReferences([REFERENCE]);
            resolveRequest({});
            const result = await promise;

            expect(result.isOk).toBe(true);
            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'arena.saveReferences', references: [REFERENCE] })
            );
        });
    });

    // =========================================================================
    // Provider Settings
    // =========================================================================

    describe('loadProviderSettings', () => {
        it('resolves with the provider settings map', async () => {
            const promise = adapter.loadProviderSettings();
            resolveRequest({ settings: PROVIDER_SETTINGS });
            const result = await promise;
            expect(result.isOk).toBe(true);
            expect((result as any).value).toEqual(PROVIDER_SETTINGS);
        });
    });

    describe('saveProviderSettings', () => {
        it('posts arena.saveProviderSettings', async () => {
            const promise = adapter.saveProviderSettings(PROVIDER_SETTINGS);
            resolveRequest({});
            const result = await promise;

            expect(result.isOk).toBe(true);
            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'arena.saveProviderSettings', settings: PROVIDER_SETTINGS })
            );
        });
    });

    // =========================================================================
    // Chat Operations
    // =========================================================================

    const CHAT_REQUEST: any = {
        message: 'Hi',
        history: [],
        settings: { model: 'gemini-pro', provider: 'gemini' },
        agent: 'general',
    };

    const CHAT_RESPONSE = { messageId: 'resp-1', content: 'Hello back', tokenCount: 20 };

    describe('sendMessage', () => {
        it('posts arena.sendMessage (non-streaming) and resolves response', async () => {
            const promise = adapter.sendMessage(CHAT_REQUEST);

            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'arena.sendMessage', request: CHAT_REQUEST })
            );

            resolveRequest({ response: CHAT_RESPONSE });
            const result = await promise;
            expect(result.isOk).toBe(true);
            expect((result as any).value).toEqual(CHAT_RESPONSE);
        });
    });

    describe('streamMessage', () => {
        it('returns a StreamHandle and posts arena.streamMessage with streamId', () => {
            const handle: StreamHandle = adapter.streamMessage(CHAT_REQUEST);

            expect(handle).toBeDefined();
            expect(handle.onChunk).toBeTypeOf('function');
            expect(handle.onDone).toBeTypeOf('function');
            expect(handle.onError).toBeTypeOf('function');
            expect(handle.cancel).toBeTypeOf('function');

            // Verify the postMessage was sent with streamId
            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'arena.streamMessage', chatRequest: CHAT_REQUEST })
            );
            const posted = vsCodeApi.postMessage.mock.lastCall![0] as any;
            expect(posted.streamId).toBeDefined();
        });

        it('delivers chunks to onChunk listeners via handleStreamMessage', () => {
            const handle = adapter.streamMessage(CHAT_REQUEST);
            const streamId = (vsCodeApi.postMessage.mock.lastCall![0] as any).streamId;

            const receivedChunks: ArenaChatStreamChunk[] = [];
            handle.onChunk((c) => receivedChunks.push(c));

            const chunk1: ArenaChatStreamChunk = { messageId: 'resp-1', content: 'Hello', done: false };
            const chunk2: ArenaChatStreamChunk = { messageId: 'resp-1', content: ' back', done: false };

            handleStreamMessage({ type: 'arena.streamChunk', streamId, chunk: chunk1 });
            handleStreamMessage({ type: 'arena.streamChunk', streamId, chunk: chunk2 });

            expect(receivedChunks).toEqual([chunk1, chunk2]);
        });

        it('delivers completion to onDone listeners and cleans up', () => {
            const handle = adapter.streamMessage(CHAT_REQUEST);
            const streamId = (vsCodeApi.postMessage.mock.lastCall![0] as any).streamId;

            let doneResponse: ArenaChatResponse | undefined;
            handle.onDone((r) => { doneResponse = r; });

            const response: ArenaChatResponse = { messageId: 'resp-1', content: 'Hello back', tokenCount: 20 };
            handleStreamMessage({ type: 'arena.streamComplete', streamId, response });

            expect(doneResponse).toEqual(response);

            // After completion, further chunks for the same streamId should be ignored
            const lateChunk = vi.fn();
            handle.onChunk(lateChunk);
            handleStreamMessage({ type: 'arena.streamChunk', streamId, chunk: { messageId: 'x', content: 'late', done: false } });
            // handleStreamMessage returns false because the stream was cleaned up
            expect(lateChunk).not.toHaveBeenCalled();
        });

        it('delivers errors to onError listeners and cleans up', () => {
            const handle = adapter.streamMessage(CHAT_REQUEST);
            const streamId = (vsCodeApi.postMessage.mock.lastCall![0] as any).streamId;

            let errorMsg: string | undefined;
            handle.onError((e) => { errorMsg = e; });

            handleStreamMessage({ type: 'arena.streamError', streamId, error: 'LLM error' });

            expect(errorMsg).toBe('LLM error');
        });

        it('unsubscribe callback prevents further delivery', () => {
            const handle = adapter.streamMessage(CHAT_REQUEST);
            const streamId = (vsCodeApi.postMessage.mock.lastCall![0] as any).streamId;

            const chunks: ArenaChatStreamChunk[] = [];
            const unsub = handle.onChunk((c) => chunks.push(c));

            handleStreamMessage({ type: 'arena.streamChunk', streamId, chunk: { messageId: 'r', content: 'a', done: false } });
            expect(chunks).toHaveLength(1);

            unsub();
            handleStreamMessage({ type: 'arena.streamChunk', streamId, chunk: { messageId: 'r', content: 'b', done: false } });
            expect(chunks).toHaveLength(1); // Not delivered after unsub
        });
    });

    describe('StreamHandle.cancel', () => {
        it('fires arena.cancelChat with streamId and notifies error listeners', () => {
            const handle = adapter.streamMessage(CHAT_REQUEST);
            const streamId = (vsCodeApi.postMessage.mock.lastCall![0] as any).streamId;

            let errorMsg: string | undefined;
            handle.onError((e) => { errorMsg = e; });

            handle.cancel();

            // Should post cancel message with the streamId
            expect(vsCodeApi.postMessage).toHaveBeenCalledWith({
                type: 'arena.cancelChat',
                streamId,
            });
            // Error listeners should be called with 'Cancelled'
            expect(errorMsg).toBe('Cancelled');
        });

        it('does NOT create a pending request entry', () => {
            const handle = adapter.streamMessage(CHAT_REQUEST);
            handle.cancel();
            // Only the stream request entry, not a cancel request
            expect(pendingRequests.size).toBe(0);
        });

        it('is idempotent — calling cancel twice does not double-post', () => {
            const handle = adapter.streamMessage(CHAT_REQUEST);
            const postCountAfterStream = vsCodeApi.postMessage.mock.calls.length;

            handle.cancel();
            handle.cancel();

            // Only one cancel postMessage should have been sent
            const cancelCalls = vsCodeApi.postMessage.mock.calls.slice(postCountAfterStream);
            expect(cancelCalls).toHaveLength(1);
        });
    });

    // =========================================================================
    // API Key Validation & Available Models
    // =========================================================================

    describe('validateApiKey', () => {
        it('posts arena.validateApiKey with provider and apiKey, resolves boolean', async () => {
            const promise = adapter.validateApiKey('gemini', 'sk-test');

            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'arena.validateApiKey', provider: 'gemini', apiKey: 'sk-test' })
            );

            resolveRequest({ valid: true });
            const result = await promise;
            expect(result.isOk).toBe(true);
            expect((result as any).value).toBe(true);
        });

        it('resolves false for invalid keys', async () => {
            const promise = adapter.validateApiKey('gemini', 'bad-key');
            resolveRequest({ valid: false });
            const result = await promise;
            expect(result.isOk).toBe(true);
            expect((result as any).value).toBe(false);
        });
    });

    describe('getAvailableModels', () => {
        it('posts arena.getAvailableModels with provider and resolves model list', async () => {
            const models = [{ id: 'gemini-pro', label: 'Gemini Pro' }];
            const promise = adapter.getAvailableModels!('gemini');

            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'arena.getAvailableModels', provider: 'gemini' })
            );

            resolveRequest({ models });
            const result = await promise;
            expect(result.isOk).toBe(true);
            expect((result as any).value).toEqual(models);
        });
    });

    // =========================================================================
    // Timeout behaviour
    // =========================================================================

    describe('timeout', () => {
        it('resolves as err when no response arrives within defaultTimeout', async () => {
            // defaultTimeout set to 200ms in beforeEach
            const promise = adapter.loadSessions();
            // Do NOT resolve — let the timeout fire
            const result = await promise;
            expect(result.isOk).toBe(false);
            expect((result as any).error).toMatch(/timed out/i);
        }, 1000 /* give the test 1 s but the adapter timeout is 200 ms */);

        it('cleans up the pending entry after timeout', async () => {
            const promise = adapter.loadSessions();
            await promise; // let it time out
            expect(pendingRequests.size).toBe(0);
        }, 1000);
    });
});
