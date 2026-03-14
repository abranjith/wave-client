/**
 * useArenaStreamManager
 *
 * Centralises all streaming protocol concerns for Arena chat:
 *   - State machine: idle → connecting → streaming → complete / error
 *   - Safety timeout: 120 s with reset on every chunk or heartbeat
 *   - Single-stream enforcement: auto-cancels previous stream on startStream()
 *   - Content accumulation in local React state
 *   - Zustand message updates via updateArenaMessage
 *   - Ordered chunk protocol: reorder buffer that buffers out-of-order `seq`
 *     chunks and flushes them in sequence order (FEAT-011)
 *   - Cleanup on unmount
 *
 * Both platform adapters return a raw `StreamHandle`; this hook wraps the
 * handle with protocol guarantees so neither adapter has to implement its
 * own timeout or state tracking.
 *
 * @module
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { useArenaAdapter } from './useAdapter';
import useAppStateStore from './store/useAppStateStore';
import type { StreamHandle } from '../types/arena';
import type { ArenaChatRequest } from '../types/arena';
import type { ArenaStreamState, ArenaStreamManager, ArenaStreamCallbacks } from '../types/arenaStreaming';

// ============================================================================
// Constants
// ============================================================================

/** Cancel stream if no chunk / heartbeat arrives within this window (ms). */
const SAFETY_TIMEOUT_MS = 120_000;

/**
 * Maximum number of out-of-order chunks held in the reorder buffer before a
 * best-effort flush is triggered. Prevents unbounded memory growth when a
 * large gap develops during transport.
 */
const MAX_BUFFER_SIZE = 50;

/**
 * How long (ms) to wait for the next expected sequence number before flushing
 * all buffered chunks in seq order. This covers cases where an intermediate
 * chunk is permanently lost in transit.
 */
const GAP_TIMEOUT_MS = 5_000;

// ============================================================================
// Hook
// ============================================================================

/**
 * Returns an {@link ArenaStreamManager} that manages a single streaming
 * request lifecycle.  Mount once per chat pane — the manager is not designed
 * to be shared across multiple components.
 */
export function useArenaStreamManager(): ArenaStreamManager {
  const arenaAdapter = useArenaAdapter();
  const updateArenaMessage = useAppStateStore((s) => s.updateArenaMessage);

  // ── Reactive state (drives re-renders) ────────────────────────────────────
  const [streamState, setStreamState] = useState<ArenaStreamState>('idle');
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  // ── Mutable refs (do NOT cause re-renders) ────────────────────────────────
  const activeHandleRef = useRef<StreamHandle | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Mirrors `streamState` so callbacks can read the current lifecycle phase
   * without creating stale closures or adding `streamState` to every dep array.
   */
  const streamStateRef = useRef<ArenaStreamState>('idle');
  useEffect(() => {
    streamStateRef.current = streamState;
  }, [streamState]);

  // ── Reorder buffer refs (FEAT-011) ────────────────────────────────────────
  /** Next expected seq number; resets to 0 on each new stream. */
  const nextExpectedSeqRef = useRef<number>(0);
  /** Chunks received ahead of nextExpectedSeq, keyed by seq number. */
  const reorderBufferRef = useRef<Map<number, import('../types/arena').ArenaChatStreamChunk>>(new Map());
  /** Timer fired when nextExpectedSeq doesn't advance within GAP_TIMEOUT_MS. */
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Per-stream stats for debug logging. */
  const reorderStatsRef = useRef({ reorderedChunks: 0, maxBufferDepth: 0, totalChunks: 0 });

  // ── Safety timer helpers ──────────────────────────────────────────────────

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current !== null) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  // ── Gap timer helpers (reorder buffer) ───────────────────────────────────

  const clearGapTimer = useCallback(() => {
    if (gapTimerRef.current !== null) {
      clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
    }
  }, []);

  // ── cancelStream ─────────────────────────────────────────────────────────

  const cancelStream = useCallback(() => {
    activeHandleRef.current?.cancel();
    activeHandleRef.current = null;
    clearSafetyTimer();
    clearGapTimer();
    reorderBufferRef.current.clear();
    setStreamState('idle');
    setStreamingContent('');
    setStreamingMessageId(null);
    setStreamError(null);
  }, [clearSafetyTimer, clearGapTimer]);

  // ── startStream ───────────────────────────────────────────────────────────

  /**
   * Begin a new streaming request for the given `assistantMessageId`.
   *
   * **Auto-cancellation**: if a stream is already active when this is called
   * (i.e. `streamState` is `connecting` or `streaming`), the previous stream
   * is cancelled via `cancelStream()` before the new one starts.  This
   * enforces single-stream concurrency: exactly one active stream per pane at
   * any time.  The cancellation is logged at `info` level so it is visible in
   * the tail-logs output.
   */
  const startStream = useCallback(
    (
      request: ArenaChatRequest,
      assistantMessageId: string,
      callbacks?: ArenaStreamCallbacks,
    ) => {
      // Auto-cancel any prior active stream before starting a new one.
      // We use activeHandleRef (not streamState) as the source-of-truth because
      // the ref is always synchronously up-to-date whereas the React state may
      // be one render behind inside callbacks.
      if (activeHandleRef.current !== null) {
        const prevState = streamStateRef.current;
        console.info(
          `[Arena] Cancelling previous stream (was: ${prevState}) to start new stream`,
          { sessionId: request.sessionId },
        );
        cancelStream();
      }

      // Reset reorder buffer state for the new stream
      nextExpectedSeqRef.current = 0;
      reorderBufferRef.current.clear();
      reorderStatsRef.current = { reorderedChunks: 0, maxBufferDepth: 0, totalChunks: 0 };

      // Transition to connecting immediately (synchronous, visible before first chunk)
      setStreamState('connecting');
      setStreamingContent('');
      setStreamingMessageId(assistantMessageId);
      setStreamError(null);

      const handle = arenaAdapter.streamMessage(request);
      activeHandleRef.current = handle;

      // `ended` prevents double-firing if both onDone and onError somehow fire
      let ended = false;

      // ── Safety timer ── reset on every chunk / heartbeat ─────────────────
      function armSafetyTimer() {
        clearSafetyTimer();
        safetyTimerRef.current = setTimeout(() => {
          if (ended) { return; }
          ended = true;
          activeHandleRef.current = null;
          clearGapTimer();
          reorderBufferRef.current.clear();
          const msg = 'Stream timed out — no response received from server';
          setStreamState('error');
          setStreamError(msg);
          updateArenaMessage(assistantMessageId, { status: 'error', error: msg });
          callbacks?.onError?.(msg);
        }, SAFETY_TIMEOUT_MS);
      }

      armSafetyTimer();

      // ── Reorder buffer helpers ────────────────────────────────────────────

      /**
       * Process a single chunk: transition state, append content.
       * Does NOT update nextExpectedSeq — the caller is responsible.
       *
       * State-transition table (non-heartbeat, non-error chunks):
       * ┌─────────────────────┬──────────────────────────────────────────────┐
       * │ Event               │ State transition                             │
       * ├─────────────────────┼──────────────────────────────────────────────┤
       * │ startStream()       │ * → connecting                               │
       * │ heartbeat chunk     │ connecting → connecting (no-op; see onChunk) │
       * │ first content chunk │ connecting → streaming                       │
       * │ subsequent chunks   │ streaming → streaming (no-op)                │
       * │ onDone (no chunks)  │ connecting → complete (skips streaming)      │
       * │ onDone (w/ chunks)  │ streaming → complete                         │
       * │ error chunk         │ * → error                                    │
       * │ safety timeout      │ * → error                                    │
       * │ cancelStream()      │ * → idle                                     │
       * └─────────────────────┴──────────────────────────────────────────────┘
       *
       * Heartbeats are intercepted in onChunk before reaching this function,
       * so every call here represents a real content or done chunk.
       */
      function processChunk(chunk: import('../types/arena').ArenaChatStreamChunk) {
        // First real content chunk (or done chunk with no content): connecting → streaming.
        // Subsequent calls are no-ops because prev is already 'streaming'.
        setStreamState((prev) => (prev === 'connecting' ? 'streaming' : prev));

        if (chunk.content) {
          setStreamingContent((prev) => prev + chunk.content);
        }
      }

      /**
       * Process the chunk at nextExpectedSeq and then drain the buffer for any
       * consecutively buffered chunks that follow.
       */
      function processInOrder(chunk: import('../types/arena').ArenaChatStreamChunk) {
        processChunk(chunk);
        nextExpectedSeqRef.current++;

        // Drain consecutive buffered chunks
        while (reorderBufferRef.current.has(nextExpectedSeqRef.current)) {
          const buffered = reorderBufferRef.current.get(nextExpectedSeqRef.current)!;
          reorderBufferRef.current.delete(nextExpectedSeqRef.current);
          processChunk(buffered);
          nextExpectedSeqRef.current++;
        }

        // Gap closed — stop the gap timer
        if (reorderBufferRef.current.size === 0) {
          clearGapTimer();
        }
      }

      /**
       * Flush all buffered chunks in seq order (best-effort drain).
       * Called when the buffer overflows or the gap timer fires.
       */
      function flushBuffer(reason: 'overflow' | 'gap-timeout') {
        const buffer = reorderBufferRef.current;
        if (buffer.size === 0) { return; }

        const sorted = [...buffer.keys()].sort((a, b) => a - b);
        console.debug('[Arena] reorder flush', {
          reason,
          expectedSeq: nextExpectedSeqRef.current,
          bufferSize: buffer.size,
          firstSeq: sorted[0],
        });

        for (const s of sorted) {
          const buffered = buffer.get(s)!;
          buffer.delete(s);
          processChunk(buffered);
        }
        // Advance nextExpectedSeq past the last flushed seq so future chunks
        // with seq > last flushed are handled correctly.
        if (sorted.length > 0) {
          nextExpectedSeqRef.current = sorted[sorted.length - 1] + 1;
        }
        clearGapTimer();
      }

      /**
       * Arm the gap timer. If nextExpectedSeq doesn't advance within
       * GAP_TIMEOUT_MS and the buffer is non-empty, flush in seq order.
       */
      function armGapTimer() {
        clearGapTimer();
        gapTimerRef.current = setTimeout(() => {
          if (ended) { return; }
          if (reorderBufferRef.current.size > 0) {
            flushBuffer('gap-timeout');
          }
        }, GAP_TIMEOUT_MS);
      }

      // ── onChunk ─────────────────────────────────────────────────────────
      handle.onChunk((chunk) => {
        if (ended) { return; }

        // Any chunk (including heartbeats) proves the connection is alive —
        // reset the safety timer to prevent a spurious timeout.
        armSafetyTimer();

        if (chunk.heartbeat) {
          // Connection keep-alive; no content — stay in 'connecting' state.
          return;
        }

        if (chunk.error) {
          ended = true;
          activeHandleRef.current = null;
          clearSafetyTimer();
          clearGapTimer();
          reorderBufferRef.current.clear();
          setStreamState('error');
          setStreamError(chunk.error);
          updateArenaMessage(assistantMessageId, { status: 'error', error: chunk.error });
          callbacks?.onError?.(chunk.error);
          return;
        }

        reorderStatsRef.current.totalChunks++;

        // ── Reorder buffer protocol ──────────────────────────────────────
        if (chunk.seq === undefined || typeof chunk.seq !== 'number' || !isFinite(chunk.seq) || chunk.seq < 0) {
          // No seq (backward-compat) or invalid seq — process immediately in arrival order.
          if (chunk.seq !== undefined) {
            console.warn('[Arena] chunk has invalid seq — processing in arrival order', { seq: chunk.seq });
          } else {
            console.debug('[Arena] chunk has no seq — processing in arrival order');
          }
          processChunk(chunk);
          return;
        }

        const { seq } = chunk;
        const expected = nextExpectedSeqRef.current;

        if (seq < expected) {
          // Duplicate or stale chunk — discard silently.
          console.debug('[Arena] duplicate/stale seq — ignored', { seq, expectedSeq: expected });
          return;
        }

        if (seq === expected) {
          // In-order delivery — process immediately and drain buffer.
          processInOrder(chunk);
          return;
        }

        // seq > expected — buffer the chunk and arm the gap timer.
        reorderBufferRef.current.set(seq, chunk);
        reorderStatsRef.current.reorderedChunks++;

        const depth = reorderBufferRef.current.size;
        if (depth > reorderStatsRef.current.maxBufferDepth) {
          reorderStatsRef.current.maxBufferDepth = depth;
        }

        console.debug('[Arena] buffering out-of-order chunk', { seq, expectedSeq: expected, bufferSize: depth });

        if (depth > MAX_BUFFER_SIZE) {
          // Buffer overflow — flush best-effort to prevent unbounded growth.
          console.debug('[Arena] buffer overflow — flushing', { bufferSize: depth });
          flushBuffer('overflow');
        } else {
          armGapTimer();
        }
      });

      // ── onDone ──────────────────────────────────────────────────────────
      handle.onDone((response) => {
        if (ended) { return; }
        ended = true;
        activeHandleRef.current = null;
        clearSafetyTimer();
        clearGapTimer();
        reorderBufferRef.current.clear();

        console.info('[Arena] stream complete', {
          totalChunks: reorderStatsRef.current.totalChunks,
          reorderedChunks: reorderStatsRef.current.reorderedChunks,
          maxBufferDepth: reorderStatsRef.current.maxBufferDepth,
        });

        updateArenaMessage(assistantMessageId, {
          content: response.content,
          status: 'complete',
          sources: response.sources,
          tokenCount: response.tokenCount,
          ...(response.blocks ? { blocks: response.blocks } : {}),
        });

        setStreamState('complete');
        setStreamingContent('');
        setStreamingMessageId(null);

        callbacks?.onComplete?.(response);
      });

      // ── onError ─────────────────────────────────────────────────────────
      handle.onError((error) => {
        if (ended) { return; }
        ended = true;
        activeHandleRef.current = null;
        clearSafetyTimer();
        clearGapTimer();
        reorderBufferRef.current.clear();

        setStreamState('error');
        setStreamError(error);
        updateArenaMessage(assistantMessageId, { status: 'error', error });
        callbacks?.onError?.(error);
      });
    },
    [arenaAdapter, updateArenaMessage, clearSafetyTimer, clearGapTimer, cancelStream],
  );

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      activeHandleRef.current?.cancel();
      activeHandleRef.current = null;
      clearSafetyTimer();
      clearGapTimer();
      reorderBufferRef.current.clear();
    };
  }, [clearSafetyTimer, clearGapTimer]);

  // ── Return public API ─────────────────────────────────────────────────────

  return {
    streamState,
    streamingContent,
    streamingMessageId,
    streamError,
    startStream,
    cancelStream,
    isInputBlocked: streamState === 'connecting' || streamState === 'streaming',
  };
}
