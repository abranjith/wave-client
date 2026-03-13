/**
 * useArenaStreamManager
 *
 * Centralises all streaming protocol concerns for Arena chat:
 *   - State machine: idle → connecting → streaming → complete / error
 *   - Safety timeout: 120 s with reset on every chunk or heartbeat
 *   - Single-stream enforcement: auto-cancels previous stream on startStream()
 *   - Content accumulation in local React state
 *   - Zustand message updates via updateArenaMessage
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

  // ── Safety timer helpers ──────────────────────────────────────────────────

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current !== null) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  // ── cancelStream ─────────────────────────────────────────────────────────

  const cancelStream = useCallback(() => {
    activeHandleRef.current?.cancel();
    activeHandleRef.current = null;
    clearSafetyTimer();
    setStreamState('idle');
    setStreamingContent('');
    setStreamingMessageId(null);
    setStreamError(null);
  }, [clearSafetyTimer]);

  // ── startStream ───────────────────────────────────────────────────────────

  const startStream = useCallback(
    (
      request: ArenaChatRequest,
      assistantMessageId: string,
      callbacks?: ArenaStreamCallbacks,
    ) => {
      // Cancel any prior stream before starting a new one
      if (activeHandleRef.current !== null) {
        activeHandleRef.current.cancel();
        activeHandleRef.current = null;
        clearSafetyTimer();
      }

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
          if (ended) return;
          ended = true;
          activeHandleRef.current = null;
          const msg = 'Stream timed out — no response received from server';
          setStreamState('error');
          setStreamError(msg);
          updateArenaMessage(assistantMessageId, { status: 'error', error: msg });
          callbacks?.onError?.(msg);
        }, SAFETY_TIMEOUT_MS);
      }

      armSafetyTimer();

      // ── onChunk ─────────────────────────────────────────────────────────
      handle.onChunk((chunk) => {
        if (ended) return;

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
          setStreamState('error');
          setStreamError(chunk.error);
          updateArenaMessage(assistantMessageId, { status: 'error', error: chunk.error });
          callbacks?.onError?.(chunk.error);
          return;
        }

        // First real content chunk: connecting → streaming
        setStreamState((prev) => (prev === 'connecting' ? 'streaming' : prev));

        if (chunk.content) {
          setStreamingContent((prev) => prev + chunk.content);
        }
      });

      // ── onDone ──────────────────────────────────────────────────────────
      handle.onDone((response) => {
        if (ended) return;
        ended = true;
        activeHandleRef.current = null;
        clearSafetyTimer();

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
        if (ended) return;
        ended = true;
        activeHandleRef.current = null;
        clearSafetyTimer();

        setStreamState('error');
        setStreamError(error);
        updateArenaMessage(assistantMessageId, { status: 'error', error });
        callbacks?.onError?.(error);
      });
    },
    [arenaAdapter, updateArenaMessage, clearSafetyTimer],
  );

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      activeHandleRef.current?.cancel();
      activeHandleRef.current = null;
      clearSafetyTimer();
    };
  }, [clearSafetyTimer]);

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
