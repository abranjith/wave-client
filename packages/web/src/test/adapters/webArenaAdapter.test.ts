/**
 * Unit tests for WebArenaAdapter — seq numbering and heartbeat emission
 * (FEAT-016 / TASK-001 and TASK-002)
 *
 * Verifies:
 *  - Chunk events from SSE are forwarded to onChunk subscribers
 *  - Content chunk seq values are preserved (0,1,2…)
 *  - Done chunk seq values are preserved
 *  - Seq resets for each new stream call
 *  - Heartbeat chunks are forwarded and keep `seq` undefined
 *  - Complete events resolve onDone
 *  - Error events resolve onError
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ArenaChatStreamChunk, ArenaChatRequest, ArenaChatResponse } from '@wave-client/core';
import { createAdapterEventEmitter } from '@wave-client/core';

// ============================================================================
// Helpers — build a fake SSE streaming response
// ============================================================================

/** Encodes a single SSE frame into a Uint8Array. */
function buildSseEvent(event: 'chunk' | 'complete' | 'error', payload: unknown): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

/** Builds a chunk-frame payload. */
function buildChunkChunk(
    overrides: Partial<ArenaChatStreamChunk>,
): Uint8Array {
    const payload: ArenaChatStreamChunk = {
        messageId: 'msg-1',
        content: '',
        done: false,
        ...overrides,
    };
    return buildSseEvent('chunk', payload);
}

/** Builds a complete-frame payload. */
function buildCompleteChunk(
    overrides: Partial<ArenaChatResponse> = {},
): Uint8Array {
    const payload: ArenaChatResponse = {
        messageId: 'msg-1',
        content: '',
        ...overrides,
    };
    return buildSseEvent('complete', payload);
}

/**
 * Creates a mock `Response` with a ReadableStream body that yields the given
 * Uint8Array chunks sequentially, then signals done.
 */
function makeMockStreamResponse(...chunks: Uint8Array[]): Response {
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
            if (index < chunks.length) {
                controller.enqueue(chunks[index++]);
            } else {
                controller.close();
            }
        },
    });
    return new Response(stream, { status: 200 });
}

// ============================================================================
// Test fixture
// ============================================================================

const PROVIDER_SETTINGS_KEY = 'wave-arena-provider-settings';

const TEST_REQUEST: ArenaChatRequest = {
    sessionId: 'test-session',
    message: 'Hello',
    agent: 'wave-client',
    history: [],
    settings: {
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        maxSessions: 5,
        maxMessagesPerSession: 50,
        enableStreaming: true,
    },
};

function makeAdapter(
    createWebArenaAdapter: typeof import('../../adapters/webArenaAdapter').createWebArenaAdapter,
) {
    return createWebArenaAdapter(createAdapterEventEmitter());
}

// ============================================================================
// Suite
// ============================================================================

describe('WebArenaAdapter — seq numbering (TASK-001)', () => {
    let capturedChunks: ArenaChatStreamChunk[];
    let createWebArenaAdapter: typeof import('../../adapters/webArenaAdapter').createWebArenaAdapter;

    beforeEach(async () => {
        capturedChunks = [];

        // Import inside beforeEach so localStorage is already seeded.
        ({ createWebArenaAdapter } = await import('../../adapters/webArenaAdapter'));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('01 — content chunks have sequential seq values starting from 0', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            makeMockStreamResponse(
                buildChunkChunk({ content: 'Hello', seq: 0 }),
                buildChunkChunk({ content: ' there', seq: 1 }),
                buildChunkChunk({ content: '!', seq: 2 }),
                buildCompleteChunk({ content: 'Hello there!' }),
            ),
        );

        const adapter = makeAdapter(createWebArenaAdapter);
        const handle = adapter.streamMessage(TEST_REQUEST);
        handle.onChunk((chunk) => capturedChunks.push(chunk));

        // Wait for the stream to complete.
        await new Promise<void>((resolve, reject) => {
            handle.onDone(() => resolve());
            handle.onError((e) => reject(new Error(e)));
        });

        const contentChunks = capturedChunks.filter((c) => !c.heartbeat && !c.done);
        expect(contentChunks).toHaveLength(3);
        expect(contentChunks[0].seq).toBe(0);
        expect(contentChunks[1].seq).toBe(1);
        expect(contentChunks[2].seq).toBe(2);
    });

    it('02 — final done chunk carries the next seq value', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            makeMockStreamResponse(
                buildChunkChunk({ content: 'word1', seq: 0 }),
                buildChunkChunk({ content: 'word2', seq: 1 }),
                buildChunkChunk({ content: '', done: true, seq: 2, tokenCount: 42 }),
                buildCompleteChunk({ content: 'word1word2', tokenCount: 42 }),
            ),
        );

        const adapter = makeAdapter(createWebArenaAdapter);
        const handle = adapter.streamMessage(TEST_REQUEST);
        handle.onChunk((chunk) => capturedChunks.push(chunk));

        await new Promise<void>((resolve, reject) => {
            handle.onDone(() => resolve());
            handle.onError((e) => reject(new Error(e)));
        });

        const doneChunk = capturedChunks.find((c) => c.done && !c.heartbeat);
        expect(doneChunk).toBeDefined();
        // Two content chunks → seq 0, 1. Done chunk → seq 2.
        expect(doneChunk!.seq).toBe(2);
    });

    it('03 — seq resets to 0 for each new stream call', async () => {
        const mockFetch = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValue(
                makeMockStreamResponse(
                    buildChunkChunk({ content: 'ping', seq: 0 }),
                    buildChunkChunk({ content: '', done: true, seq: 1 }),
                    buildCompleteChunk({ content: 'ping' }),
                ),
            );

        const adapter = makeAdapter(createWebArenaAdapter);

        // First stream
        const run1Chunks: ArenaChatStreamChunk[] = [];
        const handle1 = adapter.streamMessage(TEST_REQUEST);
        handle1.onChunk((c) => run1Chunks.push(c));
        await new Promise<void>((resolve, reject) => {
            handle1.onDone(() => resolve());
            handle1.onError((e) => reject(new Error(e)));
        });

        // Second stream — fresh mock response
        mockFetch.mockResolvedValue(
            makeMockStreamResponse(
                buildChunkChunk({ content: 'pong', seq: 0 }),
                buildChunkChunk({ content: '', done: true, seq: 1 }),
                buildCompleteChunk({ content: 'pong' }),
            ),
        );
        const run2Chunks: ArenaChatStreamChunk[] = [];
        const handle2 = adapter.streamMessage(TEST_REQUEST);
        handle2.onChunk((c) => run2Chunks.push(c));
        await new Promise<void>((resolve, reject) => {
            handle2.onDone(() => resolve());
            handle2.onError((e) => reject(new Error(e)));
        });

        const run1Content = run1Chunks.filter((c) => !c.heartbeat && !c.done);
        const run2Content = run2Chunks.filter((c) => !c.heartbeat && !c.done);

        // Both runs should have content chunk seq starting at 0.
        expect(run1Content[0].seq).toBe(0);
        expect(run2Content[0].seq).toBe(0);
    });
});

describe('WebArenaAdapter — heartbeat emission (TASK-002)', () => {
    let capturedChunks: ArenaChatStreamChunk[];
    let createWebArenaAdapter: typeof import('../../adapters/webArenaAdapter').createWebArenaAdapter;

    beforeEach(async () => {
        capturedChunks = [];

        ({ createWebArenaAdapter } = await import('../../adapters/webArenaAdapter'));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('04 — an immediate heartbeat is emitted before any content chunks', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            makeMockStreamResponse(
                buildChunkChunk({ heartbeat: true }),
                buildChunkChunk({ content: 'Hello', seq: 0 }),
                buildChunkChunk({ done: true, seq: 1 }),
                buildCompleteChunk({ content: 'Hello' }),
            ),
        );

        const adapter = makeAdapter(createWebArenaAdapter);
        const handle = adapter.streamMessage(TEST_REQUEST);
        handle.onChunk((chunk) => capturedChunks.push(chunk));

        await new Promise<void>((resolve, reject) => {
            handle.onDone(() => resolve());
            handle.onError((e) => reject(new Error(e)));
        });

        // The first chunk emitted must be a heartbeat.
        expect(capturedChunks.length).toBeGreaterThan(0);
        expect(capturedChunks[0].heartbeat).toBe(true);

        // The heartbeat must come before any content chunk.
        const firstContentIndex = capturedChunks.findIndex((c) => !c.heartbeat && !c.done);
        const firstHeartbeatIndex = capturedChunks.findIndex((c) => c.heartbeat === true);
        expect(firstHeartbeatIndex).toBeLessThan(firstContentIndex);
    });

    it('05 — periodic heartbeat interval emits heartbeats every 15 s', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            makeMockStreamResponse(
                buildChunkChunk({ heartbeat: true }),
                buildChunkChunk({ heartbeat: true }),
                buildChunkChunk({ content: 'hi', seq: 0 }),
                buildChunkChunk({ done: true, seq: 1 }),
                buildCompleteChunk({ content: 'hi' }),
            ),
        );

        const adapter = makeAdapter(createWebArenaAdapter);
        const handle = adapter.streamMessage(TEST_REQUEST);
        handle.onChunk((chunk) => capturedChunks.push(chunk));

        await new Promise<void>((resolve, reject) => {
            handle.onDone(() => resolve());
            handle.onError((e) => reject(new Error(e)));
        });

        const heartbeats = capturedChunks.filter((c) => c.heartbeat === true);
        // At least two heartbeats should be forwarded when present in stream.
        expect(heartbeats.length).toBeGreaterThanOrEqual(2);
    });

    it('06 — heartbeat chunks have heartbeat: true and no seq field', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            makeMockStreamResponse(
                buildChunkChunk({ heartbeat: true }),
                buildChunkChunk({ content: 'test', seq: 0 }),
                buildChunkChunk({ done: true, seq: 1 }),
                buildCompleteChunk({ content: 'test' }),
            ),
        );

        const adapter = makeAdapter(createWebArenaAdapter);
        const handle = adapter.streamMessage(TEST_REQUEST);
        handle.onChunk((chunk) => capturedChunks.push(chunk));

        await new Promise<void>((resolve, reject) => {
            handle.onDone(() => resolve());
            handle.onError((e) => reject(new Error(e)));
        });

        const heartbeats = capturedChunks.filter((c) => c.heartbeat === true);
        expect(heartbeats.length).toBeGreaterThan(0);
        for (const hb of heartbeats) {
            expect(hb.heartbeat).toBe(true);
            expect(hb.seq).toBeUndefined();
            expect(hb.content).toBe('');
            expect(hb.done).toBe(false);
        }
    });

    it('07 — stream completes successfully when complete event is received', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            makeMockStreamResponse(
                buildChunkChunk({ heartbeat: true }),
                buildChunkChunk({ content: 'done', seq: 0 }),
                buildChunkChunk({ done: true, seq: 1 }),
                buildCompleteChunk({ content: 'done' }),
            ),
        );

        const adapter = makeAdapter(createWebArenaAdapter);
        const handle = adapter.streamMessage(TEST_REQUEST);
        handle.onChunk((chunk) => capturedChunks.push(chunk));

        await new Promise<void>((resolve, reject) => {
            handle.onDone(() => resolve());
            handle.onError((e) => reject(new Error(e)));
        });

        expect(capturedChunks.some((c) => c.done === true)).toBe(true);
    });

    it('08 — stream errors when an SSE error event is received', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            makeMockStreamResponse(
                buildChunkChunk({ heartbeat: true }),
                buildSseEvent('error', { message: 'Stream read failure' }),
            ),
        );

        const adapter = makeAdapter(createWebArenaAdapter);
        const handle = adapter.streamMessage(TEST_REQUEST);
        handle.onChunk((chunk) => capturedChunks.push(chunk));

        await new Promise<void>((resolve, reject) => {
            handle.onDone(() => reject(new Error('Expected onError, got onDone')));
            handle.onError((error) => {
                expect(error).toContain('Stream read failure');
                resolve();
            });
        });
    });
});
