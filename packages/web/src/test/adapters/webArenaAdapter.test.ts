/**
 * Unit tests for WebArenaAdapter — seq numbering and heartbeat emission
 * (FEAT-016 / TASK-001 and TASK-002)
 *
 * Verifies:
 *  - Content chunks carry sequential `seq` values starting from 0
 *  - The final done chunk carries the next seq value
 *  - seq resets to 0 for each new stream call
 *  - An immediate heartbeat is emitted after fetch succeeds (before content)
 *  - Periodic heartbeats are emitted via setInterval (every 15 s)
 *  - Heartbeat chunks have `heartbeat: true` and no `seq` field
 *  - The heartbeat interval is cleared on stream completion
 *  - The heartbeat interval is cleared on stream error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ArenaChatStreamChunk, ArenaChatRequest } from '@wave-client/core';

// ============================================================================
// Helpers — build a fake SSE streaming response
// ============================================================================

/** Encodes SSE lines into a Uint8Array for the mock ReadableStream. */
function buildSseChunk(...texts: string[]): Uint8Array {
    const encoder = new TextEncoder();
    const lines = texts
        .map((text) => {
            const payload = JSON.stringify({
                candidates: [{ content: { parts: [{ text }] } }],
            });
            return `data: ${payload}`;
        })
        .join('\n');
    return encoder.encode(lines + '\n');
}

/** Builds a final SSE line with usageMetadata. */
function buildSseFinalChunk(tokenCount: number): Uint8Array {
    const encoder = new TextEncoder();
    const payload = JSON.stringify({
        candidates: [{ content: { parts: [{ text: '' }] } }],
        usageMetadata: { totalTokenCount: tokenCount },
    });
    return encoder.encode(`data: ${payload}\n`);
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

// ============================================================================
// Suite
// ============================================================================

describe('WebArenaAdapter — seq numbering (TASK-001)', () => {
    let capturedChunks: ArenaChatStreamChunk[];
    let WebArenaAdapter: typeof import('../../adapters/webArenaAdapter').WebArenaAdapter;

    beforeEach(async () => {
        capturedChunks = [];
        vi.useFakeTimers();

        // Seed localStorage with a fake API key so the adapter doesn't bail early.
        localStorage.setItem(
            PROVIDER_SETTINGS_KEY,
            JSON.stringify({ gemini: { apiKey: 'test-key' } }),
        );

        // Import inside beforeEach so localStorage is already seeded.
        ({ WebArenaAdapter } = await import('../../adapters/webArenaAdapter'));
    });

    afterEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('01 — content chunks have sequential seq values starting from 0', async () => {
        // Three SSE lines yield three content chunks (seq 0, 1, 2).
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            makeMockStreamResponse(
                buildSseChunk('Hello'),
                buildSseChunk(' there'),
                buildSseChunk('!'),
            ),
        );

        const adapter = new WebArenaAdapter();
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
                buildSseChunk('word1'),
                buildSseChunk('word2'),
                buildSseFinalChunk(42),
            ),
        );

        const adapter = new WebArenaAdapter();
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
                makeMockStreamResponse(buildSseChunk('ping')),
            );

        const adapter = new WebArenaAdapter();

        // First stream
        const run1Chunks: ArenaChatStreamChunk[] = [];
        const handle1 = adapter.streamMessage(TEST_REQUEST);
        handle1.onChunk((c) => run1Chunks.push(c));
        await new Promise<void>((resolve, reject) => {
            handle1.onDone(() => resolve());
            handle1.onError((e) => reject(new Error(e)));
        });

        // Second stream — fresh mock response
        mockFetch.mockResolvedValue(makeMockStreamResponse(buildSseChunk('pong')));
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
    let WebArenaAdapter: typeof import('../../adapters/webArenaAdapter').WebArenaAdapter;

    beforeEach(async () => {
        capturedChunks = [];
        vi.useFakeTimers();

        localStorage.setItem(
            PROVIDER_SETTINGS_KEY,
            JSON.stringify({ gemini: { apiKey: 'test-key' } }),
        );

        ({ WebArenaAdapter } = await import('../../adapters/webArenaAdapter'));
    });

    afterEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('04 — an immediate heartbeat is emitted before any content chunks', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            makeMockStreamResponse(buildSseChunk('Hello')),
        );

        const adapter = new WebArenaAdapter();
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
        // Capture the setInterval callback without scheduling it so we can invoke
        // it manually while the stream is still active.
        let capturedHeartbeatCb: (() => void) | undefined;
        vi.spyOn(globalThis, 'setInterval').mockImplementation(
            (fn: TimerHandler, delay?: number) => {
                if (delay === 15_000) {
                    capturedHeartbeatCb = fn as () => void;
                }
                return 0 as unknown as ReturnType<typeof setInterval>;
            },
        );
        vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});

        // Controlled stream: emit one chunk, then pause until we resolve.
        let resolveStream!: () => void;
        const blocker = new Promise<void>((r) => { resolveStream = r; });
        let pullCount = 0;

        const pausedStream = new ReadableStream<Uint8Array>({
            pull(controller) {
                pullCount++;
                if (pullCount === 1) {
                    controller.enqueue(buildSseChunk('hi'));
                } else {
                    return blocker.then(() => controller.close());
                }
            },
        });

        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(pausedStream, { status: 200 }),
        );

        const adapter = new WebArenaAdapter();
        const handle = adapter.streamMessage(TEST_REQUEST);
        handle.onChunk((chunk) => capturedChunks.push(chunk));

        const streamDone = new Promise<void>((resolve, reject) => {
            handle.onDone(() => resolve());
            handle.onError((e) => reject(new Error(e)));
        });

        // Drain the microtask queue until setInterval has been called.
        // The chain is: fetch() → heartbeat → setInterval → reader.read() × 2 (second blocks).
        // 20 await steps is sufficient to exhaust all synchronous-async chaining.
        for (let i = 0; i < 20; i++) {
            await Promise.resolve();
        }

        // setInterval must have been called with the 15 s delay by now.
        expect(capturedHeartbeatCb).toBeDefined();

        // Manually fire the periodic callback while the stream is still paused
        // (simulates the 15 s timer firing).
        capturedHeartbeatCb!();

        const heartbeats = capturedChunks.filter((c) => c.heartbeat === true);
        // 1 immediate (on connection) + 1 manually triggered periodic.
        expect(heartbeats.length).toBeGreaterThanOrEqual(2);

        // Close the stream and wait for the done event.
        resolveStream();
        await streamDone;
    });

    it('06 — heartbeat chunks have heartbeat: true and no seq field', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            makeMockStreamResponse(buildSseChunk('test')),
        );

        const adapter = new WebArenaAdapter();
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

    it('07 — heartbeat interval is cleared on stream completion', async () => {
        const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            makeMockStreamResponse(buildSseChunk('done')),
        );

        const adapter = new WebArenaAdapter();
        const handle = adapter.streamMessage(TEST_REQUEST);
        handle.onChunk((chunk) => capturedChunks.push(chunk));

        await new Promise<void>((resolve, reject) => {
            handle.onDone(() => resolve());
            handle.onError((e) => reject(new Error(e)));
        });

        expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('08 — heartbeat interval is cleared on stream error (fetch failure)', async () => {
        const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

        // Simulate a successful fetch but a reader that throws on read.
        let readCount = 0;
        const errorStream = new ReadableStream<Uint8Array>({
            pull(controller) {
                readCount++;
                if (readCount === 1) {
                    controller.enqueue(buildSseChunk('first'));
                } else {
                    throw new Error('Stream read failure');
                }
            },
        });

        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(errorStream, { status: 200 }),
        );

        const adapter = new WebArenaAdapter();
        const handle = adapter.streamMessage(TEST_REQUEST);
        handle.onChunk((chunk) => capturedChunks.push(chunk));

        await new Promise<void>((resolve) => {
            handle.onDone(() => resolve());
            handle.onError(() => resolve());
        });

        expect(clearIntervalSpy).toHaveBeenCalled();
    });
});
