/**
 * Unit tests for useArenaStreamManager (FEAT-010 / TASK-004)
 *
 * Tests the streaming state machine, safety timeout, content accumulation,
 * single-stream enforcement, and unmount cleanup.
 *
 * Architecture notes:
 *   - renderHook from @testing-library/react wraps the hook in an
 *     AdapterProvider so useArenaAdapter() resolves.
 *   - A controllable StreamHandle lets tests inject chunks/done/error
 *     synchronously inside act().
 *   - vi.useFakeTimers() controls the 120-second safety timeout.
 *   - The Zustand store is reset before each test to avoid state bleed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AdapterProvider } from '../../hooks/useAdapter';
import { createMockAdapter } from '../mocks/mockAdapter';
import { useArenaStreamManager } from '../../hooks/useArenaStreamManager';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import type { ArenaChatStreamChunk, ArenaChatResponse, StreamHandle } from '../../types/arena';
import type { ArenaChatRequest } from '../../types/arena';
import { ARENA_AGENT_IDS } from '../../config/arenaConfig';

// ============================================================================
// Test utilities
// ============================================================================

/** A controllable StreamHandle whose events are injected synchronously. */
function createControllableHandle() {
    const chunkCbs = new Set<(chunk: ArenaChatStreamChunk) => void>();
    const doneCbs  = new Set<(response: ArenaChatResponse) => void>();
    const errorCbs = new Set<(error: string) => void>();
    let cancelled = false;

    const handle: StreamHandle = {
        onChunk(cb) { chunkCbs.add(cb); return () => chunkCbs.delete(cb); },
        onDone(cb)  { doneCbs.add(cb);  return () => doneCbs.delete(cb);  },
        onError(cb) { errorCbs.add(cb); return () => errorCbs.delete(cb); },
        cancel()    { cancelled = true; },
    };

    return {
        handle,
        isCancelled: () => cancelled,
        pushChunk: (chunk: ArenaChatStreamChunk) =>
            chunkCbs.forEach((cb) => cb(chunk)),
        pushDone: (response: ArenaChatResponse) =>
            doneCbs.forEach((cb) => cb(response)),
        pushError: (error: string) =>
            errorCbs.forEach((cb) => cb(error)),
    };
}

/** Minimal ArenaChatRequest fixture. */
const TEST_REQUEST: ArenaChatRequest = {
    sessionId: 'session-1',
    message: 'Hello',
    agent: ARENA_AGENT_IDS.WAVE_CLIENT,
    history: [],
    settings: {
        provider: 'gemini',
        model: 'gemini-pro',
        maxSessions: 5,
        maxMessagesPerSession: 50,
        enableStreaming: true,
    },
};

const ASSISTANT_MSG_ID = 'msg-assistant-1';

const DONE_RESPONSE: ArenaChatResponse = {
    messageId: ASSISTANT_MSG_ID,
    content: 'Final answer',
    tokenCount: 42,
};

// ============================================================================
// Suite setup
// ============================================================================

describe('useArenaStreamManager', () => {
    let ctrl: ReturnType<typeof createControllableHandle>;

    beforeEach(() => {
        vi.useFakeTimers();

        // Reset the Zustand store so streaming message state doesn't bleed
        act(() => {
            useAppStateStore.setState({
                arenaMessages: [],
                arenaSessions: [],
                arenaActiveSessionId: null,
            });
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    /** Helper: render the hook with a fresh mock adapter and a controllable handle. */
    function setup() {
        const { adapter } = createMockAdapter();
        ctrl = createControllableHandle();
        vi.spyOn(adapter.arena, 'streamMessage').mockReturnValue(ctrl.handle);

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AdapterProvider adapter={adapter}>{children}</AdapterProvider>
        );

        return renderHook(() => useArenaStreamManager(), { wrapper });
    }

    // ──────────────────────────────────────────────────────────────────
    // 01. Initial state
    // ──────────────────────────────────────────────────────────────────

    it('01 — initial state is idle with empty content', () => {
        const { result } = setup();

        expect(result.current.streamState).toBe('idle');
        expect(result.current.streamingContent).toBe('');
        expect(result.current.streamingMessageId).toBeNull();
        expect(result.current.streamError).toBeNull();
        expect(result.current.isInputBlocked).toBe(false);
    });

    // ──────────────────────────────────────────────────────────────────
    // 02. startStream → connecting
    // ──────────────────────────────────────────────────────────────────

    it('02 — startStream transitions synchronously to connecting', () => {
        const { result } = setup();

        act(() => {
            result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID);
        });

        expect(result.current.streamState).toBe('connecting');
        expect(result.current.streamingMessageId).toBe(ASSISTANT_MSG_ID);
        expect(result.current.isInputBlocked).toBe(true);
    });

    // ──────────────────────────────────────────────────────────────────
    // 03. First content chunk → streaming
    // ──────────────────────────────────────────────────────────────────

    it('03 — first content chunk transitions connecting → streaming', () => {
        const { result } = setup();

        act(() => {
            result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID);
        });
        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'Hello', done: false });
        });

        expect(result.current.streamState).toBe('streaming');
        expect(result.current.streamingContent).toBe('Hello');
        expect(result.current.isInputBlocked).toBe(true);
    });

    // ──────────────────────────────────────────────────────────────────
    // 04. Heartbeat chunk — stays connecting, no content
    // ──────────────────────────────────────────────────────────────────

    it('04 — heartbeat chunk keeps state in connecting and adds no content', () => {
        const { result } = setup();

        act(() => {
            result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID);
        });
        act(() => {
            ctrl.pushChunk({
                messageId: ASSISTANT_MSG_ID,
                content: '',
                done: false,
                heartbeat: true,
            });
        });

        expect(result.current.streamState).toBe('connecting');
        expect(result.current.streamingContent).toBe('');
    });

    // ──────────────────────────────────────────────────────────────────
    // 05. Multiple content chunks accumulate
    // ──────────────────────────────────────────────────────────────────

    it('05 — multiple content chunks accumulate in streamingContent', () => {
        const { result } = setup();

        act(() => {
            result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID);
        });
        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'Word1 ', done: false });
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'Word2 ', done: false });
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'Word3',  done: false });
        });

        expect(result.current.streamingContent).toBe('Word1 Word2 Word3');
    });

    // ──────────────────────────────────────────────────────────────────
    // 06. onDone → complete, content cleared, updateArenaMessage called
    // ──────────────────────────────────────────────────────────────────

    it('06 — onDone transitions to complete, clears content, calls updateArenaMessage', () => {
        const { result } = setup();
        const onComplete = vi.fn();

        // Seed the assistant message in the store so updateArenaMessage has something to update
        act(() => {
            useAppStateStore.setState({
                arenaMessages: [
                    { id: ASSISTANT_MSG_ID, sessionId: 'session-1', role: 'assistant',
                      content: '', status: 'streaming', timestamp: Date.now() },
                ],
            });
        });

        act(() => {
            result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID, { onComplete });
        });
        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'partial', done: false });
        });
        act(() => {
            ctrl.pushDone(DONE_RESPONSE);
        });

        expect(result.current.streamState).toBe('complete');
        expect(result.current.streamingContent).toBe('');
        expect(result.current.streamingMessageId).toBeNull();
        expect(result.current.isInputBlocked).toBe(false);
        expect(onComplete).toHaveBeenCalledWith(DONE_RESPONSE);

        // Zustand store reflects the completed message
        const msg = useAppStateStore.getState().arenaMessages.find((m) => m.id === ASSISTANT_MSG_ID);
        expect(msg?.status).toBe('complete');
        expect(msg?.content).toBe('Final answer');
    });

    // ──────────────────────────────────────────────────────────────────
    // 07. Error chunk → error state
    // ──────────────────────────────────────────────────────────────────

    it('07 — error chunk transitions to error state and calls onError', () => {
        const { result } = setup();
        const onError = vi.fn();

        act(() => {
            useAppStateStore.setState({
                arenaMessages: [
                    { id: ASSISTANT_MSG_ID, sessionId: 'session-1', role: 'assistant',
                      content: '', status: 'streaming', timestamp: Date.now() },
                ],
            });
        });

        act(() => {
            result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID, { onError });
        });
        act(() => {
            ctrl.pushChunk({
                messageId: ASSISTANT_MSG_ID,
                content: '',
                done: true,
                error: 'Provider error',
            });
        });

        expect(result.current.streamState).toBe('error');
        expect(result.current.streamError).toBe('Provider error');
        expect(result.current.isInputBlocked).toBe(false);
        expect(onError).toHaveBeenCalledWith('Provider error');

        const msg = useAppStateStore.getState().arenaMessages.find((m) => m.id === ASSISTANT_MSG_ID);
        expect(msg?.status).toBe('error');
    });

    // ──────────────────────────────────────────────────────────────────
    // 08. Transport onError → error state
    // ──────────────────────────────────────────────────────────────────

    it('08 — transport onError transitions to error state', () => {
        const { result } = setup();
        const onError = vi.fn();

        act(() => {
            useAppStateStore.setState({
                arenaMessages: [
                    { id: ASSISTANT_MSG_ID, sessionId: 'session-1', role: 'assistant',
                      content: '', status: 'streaming', timestamp: Date.now() },
                ],
            });
        });

        act(() => {
            result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID, { onError });
        });
        act(() => {
            ctrl.pushError('Connection dropped');
        });

        expect(result.current.streamState).toBe('error');
        expect(result.current.streamError).toBe('Connection dropped');
        expect(onError).toHaveBeenCalledWith('Connection dropped');
    });

    // ──────────────────────────────────────────────────────────────────
    // 09. cancelStream → idle
    // ──────────────────────────────────────────────────────────────────

    it('09 — cancelStream from streaming transitions to idle', () => {
        const { result } = setup();

        act(() => {
            result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID);
        });
        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'partial', done: false });
        });

        expect(result.current.streamState).toBe('streaming');

        act(() => {
            result.current.cancelStream();
        });

        expect(result.current.streamState).toBe('idle');
        expect(result.current.streamingContent).toBe('');
        expect(result.current.streamingMessageId).toBeNull();
        expect(result.current.isInputBlocked).toBe(false);
        expect(ctrl.isCancelled()).toBe(true);
    });

    // ──────────────────────────────────────────────────────────────────
    // 10. Safety timeout fires → error
    // ──────────────────────────────────────────────────────────────────

    it('10 — safety timeout fires after 120 s of silence → error', () => {
        const { result } = setup();

        act(() => {
            useAppStateStore.setState({
                arenaMessages: [
                    { id: ASSISTANT_MSG_ID, sessionId: 'session-1', role: 'assistant',
                      content: '', status: 'streaming', timestamp: Date.now() },
                ],
            });
        });

        act(() => {
            result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID);
        });

        // Advance time beyond the safety window
        act(() => {
            vi.advanceTimersByTime(121_000);
        });

        expect(result.current.streamState).toBe('error');
        expect(result.current.streamError).toContain('timed out');
    });

    // ──────────────────────────────────────────────────────────────────
    // 11. Chunk resets the safety timer (doesn't fire early)
    // ──────────────────────────────────────────────────────────────────

    it('11 — chunk resets the safety timer preventing premature timeout', () => {
        const { result } = setup();

        act(() => {
            result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID);
        });

        // Advance 90 s, then send a chunk — the timer should reset
        act(() => {
            vi.advanceTimersByTime(90_000);
        });
        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'still alive', done: false });
        });

        // Another 90 s — if the timer wasn't reset, it would have fired at 121 s total
        act(() => {
            vi.advanceTimersByTime(90_000);
        });

        // Should still be streaming because the timer was reset by the chunk
        expect(result.current.streamState).toBe('streaming');
    });

    // ──────────────────────────────────────────────────────────────────
    // 12. startStream cancels a prior active stream
    // ──────────────────────────────────────────────────────────────────

    it('12 — starting a new stream automatically cancels the previous one', () => {
        const { adapter } = createMockAdapter();

        const ctrl1 = createControllableHandle();
        const ctrl2 = createControllableHandle();

        let callCount = 0;
        vi.spyOn(adapter.arena, 'streamMessage').mockImplementation(() => {
            callCount++;
            return callCount === 1 ? ctrl1.handle : ctrl2.handle;
        });

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AdapterProvider adapter={adapter}>{children}</AdapterProvider>
        );

        const { result } = renderHook(() => useArenaStreamManager(), { wrapper });

        act(() => {
            result.current.startStream(TEST_REQUEST, 'msg-1');
        });
        expect(result.current.streamState).toBe('connecting');
        expect(ctrl1.isCancelled()).toBe(false);

        act(() => {
            result.current.startStream(TEST_REQUEST, 'msg-2');
        });

        // First handle must have been cancelled
        expect(ctrl1.isCancelled()).toBe(true);
        // State immediately reflects the new stream
        expect(result.current.streamState).toBe('connecting');
        expect(result.current.streamingMessageId).toBe('msg-2');
    });

    // ──────────────────────────────────────────────────────────────────
    // 13. Unmount cancels the active stream
    // ──────────────────────────────────────────────────────────────────

    it('13 — unmounting the component cancels any active stream', () => {
        const { result, unmount } = setup();

        act(() => {
            result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID);
        });

        expect(ctrl.isCancelled()).toBe(false);

        unmount();

        expect(ctrl.isCancelled()).toBe(true);
    });

    // ══════════════════════════════════════════════════════════════════
    // FEAT-011 — Ordered Chunk Protocol (reorder buffer)
    // ══════════════════════════════════════════════════════════════════

    // ──────────────────────────────────────────────────────────────────
    // 14. Chunks arrive in order (seq 0, 1, 2) → content accumulates correctly
    // ──────────────────────────────────────────────────────────────────

    it('14 — in-order seq chunks accumulate content correctly', () => {
        const { result } = setup();

        act(() => { result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID); });

        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'A', done: false, seq: 0 });
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'B', done: false, seq: 1 });
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'C', done: false, seq: 2 });
        });

        expect(result.current.streamingContent).toBe('ABC');
        expect(result.current.streamState).toBe('streaming');
    });

    // ──────────────────────────────────────────────────────────────────
    // 15. Chunks arrive out of order (seq 1, 0, 2) → correct order
    // ──────────────────────────────────────────────────────────────────

    it('15 — out-of-order seq chunks are reordered before accumulation', () => {
        const { result } = setup();

        act(() => { result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID); });

        // seq 1 arrives first — should be buffered
        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'B', done: false, seq: 1 });
        });
        // Content should still be empty — waiting for seq 0
        expect(result.current.streamingContent).toBe('');

        // seq 0 arrives — processes 0, then drains seq 1 from buffer
        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'A', done: false, seq: 0 });
        });
        expect(result.current.streamingContent).toBe('AB');

        // seq 2 arrives in order
        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'C', done: false, seq: 2 });
        });
        expect(result.current.streamingContent).toBe('ABC');
    });

    // ──────────────────────────────────────────────────────────────────
    // 16. Gap: seq 0, 2 arrive; seq 1 arrives later → all in correct order
    // ──────────────────────────────────────────────────────────────────

    it('16 — gap: seq 0 and 2 buffered, seq 1 arrives and drains all in order', () => {
        const { result } = setup();

        act(() => { result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID); });

        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'A', done: false, seq: 0 });
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'C', done: false, seq: 2 });
        });
        // seq 0 processed, seq 2 buffered
        expect(result.current.streamingContent).toBe('A');

        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'B', done: false, seq: 1 });
        });
        // seq 1 triggers drain: processes 1, then 2
        expect(result.current.streamingContent).toBe('ABC');
    });

    // ──────────────────────────────────────────────────────────────────
    // 17. Gap timeout: seq 0 arrives, seq 1 never arrives, seq 2 in buffer → flush after 5 s
    // ──────────────────────────────────────────────────────────────────

    it('17 — gap timeout flushes buffered chunks after 5 s', () => {
        const { result } = setup();

        act(() => { result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID); });

        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'A', done: false, seq: 0 });
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'C', done: false, seq: 2 });
        });
        expect(result.current.streamingContent).toBe('A');

        // Advance past the 5s gap timeout — seq 2 should be flushed
        act(() => {
            vi.advanceTimersByTime(6_000);
        });

        expect(result.current.streamingContent).toBe('AC');
    });

    // ──────────────────────────────────────────────────────────────────
    // 18. Buffer overflow: >50 out-of-order chunks → flush triggered
    // ──────────────────────────────────────────────────────────────────

    it('18 — buffer overflow (51 chunks) triggers best-effort flush', () => {
        const { result } = setup();

        act(() => { result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID); });

        act(() => {
            // Push seq 0 first so the reorder starts expecting seq 1
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: '0', done: false, seq: 0 });
        });
        expect(result.current.streamingContent).toBe('0');

        // Push seq 2..52 — none of seq 1 (creates 51 buffered chunks)
        act(() => {
            for (let i = 2; i <= 52; i++) {
                ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: String(i), done: false, seq: i });
            }
        });

        // After overflow flush, all 51 buffered chunks should be processed
        const expectedContent = '0' + Array.from({ length: 51 }, (_, i) => String(i + 2)).join('');
        expect(result.current.streamingContent).toBe(expectedContent);
    });

    // ──────────────────────────────────────────────────────────────────
    // 19. Chunks without seq → processed in arrival order (backward compat)
    // ──────────────────────────────────────────────────────────────────

    it('19 — chunks without seq are processed in arrival order', () => {
        const { result } = setup();

        act(() => { result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID); });

        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'X', done: false });
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'Y', done: false });
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'Z', done: false });
        });

        expect(result.current.streamingContent).toBe('XYZ');
    });

    // ══════════════════════════════════════════════════════════════════
    // FEAT-012 — Send Guard & single-stream enforcement
    // ══════════════════════════════════════════════════════════════════

    // ──────────────────────────────────────────────────────────────────
    // SG-01. After natural completion, starting a new stream does NOT
    //        call cancel() on the completed handle.
    // ──────────────────────────────────────────────────────────────────

    it('SG-01 — completed stream: starting new stream does not cancel previous handle', () => {
        const { adapter } = createMockAdapter();

        const ctrl1 = createControllableHandle();
        const ctrl2 = createControllableHandle();

        let callCount = 0;
        vi.spyOn(adapter.arena, 'streamMessage').mockImplementation(() => {
            callCount++;
            return callCount === 1 ? ctrl1.handle : ctrl2.handle;
        });

        // Seed the store so onDone's updateArenaMessage doesn't throw
        act(() => {
            useAppStateStore.setState({
                arenaMessages: [
                    { id: 'msg-1', sessionId: 'session-1', role: 'assistant',
                      content: '', status: 'streaming', timestamp: Date.now() },
                ],
            });
        });

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AdapterProvider adapter={adapter}>{children}</AdapterProvider>
        );
        const { result } = renderHook(() => useArenaStreamManager(), { wrapper });

        // Start and complete stream A
        act(() => { result.current.startStream(TEST_REQUEST, 'msg-1'); });
        act(() => { ctrl1.pushDone({ messageId: 'msg-1', content: 'Done', tokenCount: 1 }); });
        expect(result.current.streamState).toBe('complete');
        expect(ctrl1.isCancelled()).toBe(false);

        // Start stream B — the completed handle should NOT be cancelled
        act(() => { result.current.startStream(TEST_REQUEST, 'msg-2'); });

        expect(ctrl1.isCancelled()).toBe(false);
        expect(result.current.streamState).toBe('connecting');
        expect(result.current.streamingMessageId).toBe('msg-2');
    });

    // ──────────────────────────────────────────────────────────────────
    // SG-02. Starting a new stream while one is active logs a message
    //        at info level with prevState and sessionId.
    // ──────────────────────────────────────────────────────────────────

    it('SG-02 — force-cancelling active stream emits console.info log', () => {
        const { result } = setup();
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

        act(() => { result.current.startStream(TEST_REQUEST, 'msg-1'); });
        expect(result.current.streamState).toBe('connecting');

        act(() => { result.current.startStream(TEST_REQUEST, 'msg-2'); });

        expect(infoSpy).toHaveBeenCalledWith(
            expect.stringContaining('Cancelling previous stream'),
            expect.objectContaining({ sessionId: TEST_REQUEST.sessionId }),
        );
    });

    // ──────────────────────────────────────────────────────────────────
    // SG-03. isInputBlocked is true during connecting and streaming,
    //        false after cancel.
    // ──────────────────────────────────────────────────────────────────

    it('SG-03 — isInputBlocked tracks busy states correctly', () => {
        const { result } = setup();

        // Idle — not blocked
        expect(result.current.isInputBlocked).toBe(false);

        // connecting — blocked
        act(() => { result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID); });
        expect(result.current.isInputBlocked).toBe(true);

        // streaming — still blocked
        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'Hi', done: false });
        });
        expect(result.current.isInputBlocked).toBe(true);

        // cancel — unblocked
        act(() => { result.current.cancelStream(); });
        expect(result.current.isInputBlocked).toBe(false);
    });

    // ──────────────────────────────────────────────────────────────────
    // 20. Duplicate seq → second occurrence ignored
    // ──────────────────────────────────────────────────────────────────

    it('20 — duplicate seq chunk is ignored', () => {
        const { result } = setup();

        act(() => { result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID); });

        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'A', done: false, seq: 0 });
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'A_dup', done: false, seq: 0 });
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'B', done: false, seq: 1 });
        });

        // The duplicate seq 0 should be ignored; content is 'AB' not 'AA_dupB'
        expect(result.current.streamingContent).toBe('AB');
    });

    // ══════════════════════════════════════════════════════════════════
    // FEAT-014 — Immediate Feedback & Streaming Lifecycle
    // ══════════════════════════════════════════════════════════════════

    // ──────────────────────────────────────────────────────────────────
    // F14-01. Multiple heartbeats then content — streaming only on content
    // ──────────────────────────────────────────────────────────────────

    it('F14-01 — multiple heartbeats then content: transitions to streaming only on content', () => {
        const { result } = setup();

        act(() => {
            result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID);
        });
        expect(result.current.streamState).toBe('connecting');

        // First heartbeat — state stays connecting
        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: '', done: false, heartbeat: true });
        });
        expect(result.current.streamState).toBe('connecting');
        expect(result.current.streamingContent).toBe('');

        // Second heartbeat — state still connecting
        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: '', done: false, heartbeat: true });
        });
        expect(result.current.streamState).toBe('connecting');
        expect(result.current.streamingContent).toBe('');

        // First real content chunk — transitions to streaming
        act(() => {
            ctrl.pushChunk({ messageId: ASSISTANT_MSG_ID, content: 'Hello', done: false });
        });
        expect(result.current.streamState).toBe('streaming');
        expect(result.current.streamingContent).toBe('Hello');
    });

    // ──────────────────────────────────────────────────────────────────
    // F14-02. onDone without prior chunks — connecting directly to complete
    // ──────────────────────────────────────────────────────────────────

    it('F14-02 — onDone without prior chunks: connecting transitions directly to complete', () => {
        const { result } = setup();

        act(() => {
            useAppStateStore.setState({
                arenaMessages: [
                    { id: ASSISTANT_MSG_ID, sessionId: 'session-1', role: 'assistant',
                      content: '', status: 'streaming', timestamp: Date.now() },
                ],
            });
        });

        act(() => {
            result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID);
        });
        expect(result.current.streamState).toBe('connecting');

        // onDone fires without any onChunk — atomic skip of streaming state
        act(() => {
            ctrl.pushDone(DONE_RESPONSE);
        });

        expect(result.current.streamState).toBe('complete');
        expect(result.current.streamingContent).toBe('');
        expect(result.current.streamingMessageId).toBeNull();
    });

    // ──────────────────────────────────────────────────────────────────
    // F14-03. Safety timeout fires during connecting → error
    // ──────────────────────────────────────────────────────────────────

    it('F14-03 — safety timeout during connecting phase transitions to error', () => {
        const { result } = setup();

        act(() => {
            useAppStateStore.setState({
                arenaMessages: [
                    { id: ASSISTANT_MSG_ID, sessionId: 'session-1', role: 'assistant',
                      content: '', status: 'streaming', timestamp: Date.now() },
                ],
            });
        });

        act(() => {
            result.current.startStream(TEST_REQUEST, ASSISTANT_MSG_ID);
        });
        expect(result.current.streamState).toBe('connecting');

        // No chunks arrive — advance past the safety window
        act(() => {
            vi.advanceTimersByTime(121_000);
        });

        expect(result.current.streamState).toBe('error');
        expect(result.current.streamError).toContain('timed out');
        expect(result.current.isInputBlocked).toBe(false);
    });
});
