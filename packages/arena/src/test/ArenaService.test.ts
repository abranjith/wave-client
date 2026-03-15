/**
 * Unit tests for ArenaService.streamChat() — sequence numbering (FEAT-011 / TASK-002)
 *
 * Verifies that:
 *  - Content chunks carry sequential `seq` values starting from 0
 *  - Heartbeat chunks have no `seq` field
 *  - Error chunks have no `seq` field
 *  - The final `done: true` chunk has a `seq` value
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArenaService } from '../ArenaService';
import type { ArenaChatStreamChunk } from '@wave-client/shared';
import type { LLMProviderConfig, ChatMessage, ChatChunk } from '../types';
import type { ArenaChatRequest } from '@wave-client/shared';

// ============================================================================
// Module-level mock — must be at top level; vitest hoists vi.mock calls.
// ============================================================================

vi.mock('@wave-client/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@wave-client/shared')>();
    return {
        ...actual,
        arenaStorageService: {
            loadProviderSettings: vi.fn().mockResolvedValue({
                gemini: { apiKey: 'test-key', model: 'gemini-pro' },
            }),
            saveProviderSettings: vi.fn(),
        },
        httpService: {
            send: vi.fn(),
            execute: vi.fn(),
        },
    };
});

// ============================================================================
// Helpers
// ============================================================================

/** Creates a mock agent whose generator emits the given chunks. */
function makeAgent(chunks: ChatChunk[]) {
    return {
        async *chat(
            _history: ChatMessage[],
            _message: string,
            _signal?: AbortSignal,
        ): AsyncGenerator<ChatChunk> {
            for (const chunk of chunks) {
                yield chunk;
            }
        },
    };
}

/** Minimal ArenaChatRequest fixture. */
const TEST_REQUEST: ArenaChatRequest = {
    sessionId: 'test-session',
    message: 'Hello',
    agent: 'wave-client',
    history: [],
    settings: {
        provider: 'gemini',
        model: 'gemini-pro',
        maxSessions: 5,
        maxMessagesPerSession: 50,
        enableStreaming: true,
    },
};

/**
 * Creates a service whose agent deps are replaced with a mock that emits the
 * given chunks. Bypasses `buildProviderConfig` by patching it with a spy.
 */
function createService(agentChunks: ChatChunk[]) {
    const agent = makeAgent(agentChunks);

    const svc = new ArenaService({
        createProviderFactory: vi.fn().mockReturnValue({}) as unknown as typeof import('../providers/factory').createProviderFactory,
        testProviderConnection: vi.fn().mockResolvedValue({ connected: true }) as unknown as typeof import('../providers/factory').testProviderConnection,
        createWaveClientAgent: vi.fn().mockReturnValue(agent) as unknown as typeof import('../agents/waveClientAgent').createWaveClientAgent,
        createWebExpertAgent: vi.fn().mockReturnValue(agent) as unknown as typeof import('../agents/webExpertAgent').createWebExpertAgent,
    });

    // Bypass buildProviderConfig (private) so we don't need real provider settings.
    (svc as unknown as Record<string, unknown>)['buildProviderConfig'] = vi.fn().mockResolvedValue({
        provider: 'gemini',
        model: 'gemini-pro',
        apiKey: 'test-key',
    } satisfies LLMProviderConfig);

    return svc;
}

// ============================================================================
// Suite
// ============================================================================

describe('ArenaService.streamChat() — sequence numbering', () => {
    let capturedChunks: ArenaChatStreamChunk[];

    beforeEach(() => {
        capturedChunks = [];
    });

    // ────────────────────────────────────────────────────────────────
    // 01. Content chunks carry sequential seq values starting at 0
    // ────────────────────────────────────────────────────────────────

    it('01 — content chunks carry sequential seq values starting from 0', async () => {
        const svc = createService([
            { content: 'Hello', done: false },
            { content: ' World', done: false },
            { content: '!', done: true },
        ]);

        await svc.streamChat(TEST_REQUEST, (chunk) => capturedChunks.push(chunk));

        const contentChunks = capturedChunks.filter((c) => !c.heartbeat && !c.error);

        expect(contentChunks).toHaveLength(3);
        expect(contentChunks[0].seq).toBe(0);
        expect(contentChunks[0].content).toBe('Hello');
        expect(contentChunks[1].seq).toBe(1);
        expect(contentChunks[1].content).toBe(' World');
        expect(contentChunks[2].seq).toBe(2);
        expect(contentChunks[2].content).toBe('!');
    });

    // ────────────────────────────────────────────────────────────────
    // 02. Heartbeat chunks have no seq field
    // ────────────────────────────────────────────────────────────────

    it('02 — heartbeat chunks have no seq field', async () => {
        const svc = createService([
            { content: 'Hi', done: true },
        ]);

        await svc.streamChat(TEST_REQUEST, (chunk) => capturedChunks.push(chunk));

        const heartbeats = capturedChunks.filter((c) => c.heartbeat === true);
        expect(heartbeats.length).toBeGreaterThan(0);
        for (const hb of heartbeats) {
            expect(hb.seq).toBeUndefined();
        }
    });

    // ────────────────────────────────────────────────────────────────
    // 03. Error chunks have no seq field
    // ────────────────────────────────────────────────────────────────

    it('03 — error chunks have no seq field', async () => {
        const svc = createService([
            { content: 'partial', done: false },
            { error: 'Provider failed', done: true },
        ]);

        await svc.streamChat(TEST_REQUEST, (chunk) => capturedChunks.push(chunk));

        const errorChunks = capturedChunks.filter((c) => c.error !== undefined);
        expect(errorChunks).toHaveLength(1);
        expect(errorChunks[0].seq).toBeUndefined();
    });

    // ────────────────────────────────────────────────────────────────
    // 04. The final done:true chunk has a seq value
    // ────────────────────────────────────────────────────────────────

    it('04 — the final done:true chunk carries a seq value', async () => {
        const svc = createService([
            { content: 'A', done: false },
            { content: 'B', done: false },
            { content: '', done: true },
        ]);

        await svc.streamChat(TEST_REQUEST, (chunk) => capturedChunks.push(chunk));

        const doneChunks = capturedChunks.filter((c) => c.done && !c.heartbeat && !c.error);
        expect(doneChunks.length).toBeGreaterThan(0);
        const finalDone = doneChunks[doneChunks.length - 1];
        expect(finalDone.seq).toBeDefined();
        expect(typeof finalDone.seq).toBe('number');
    });

    // ────────────────────────────────────────────────────────────────
    // 05. seq counter resets between separate streamChat() calls
    // ────────────────────────────────────────────────────────────────

    it('05 — seq counter starts from 0 for each independent stream', async () => {
        const svc = createService([{ content: 'First', done: true }]);

        const run1: ArenaChatStreamChunk[] = [];
        const run2: ArenaChatStreamChunk[] = [];

        await svc.streamChat(TEST_REQUEST, (c) => run1.push(c));
        await svc.streamChat(TEST_REQUEST, (c) => run2.push(c));

        const run1Content = run1.filter((c) => !c.heartbeat && !c.error);
        const run2Content = run2.filter((c) => !c.heartbeat && !c.error);

        expect(run1Content[0].seq).toBe(0);
        expect(run2Content[0].seq).toBe(0);
    });
});
