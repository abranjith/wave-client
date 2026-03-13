/**
 * Arena Streaming Types
 *
 * State machine and manager interface for the shared streaming manager
 * (`useArenaStreamManager`). Extracted into their own module so they can be
 * imported without pulling in the full arena type barrel.
 */

import type { ArenaChatRequest, ArenaChatResponse } from './arena';

// ============================================================================
// Stream State Machine
// ============================================================================

/**
 * Lifecycle state of an Arena chat stream.
 *
 * ```
 * idle ──startStream()──▶ connecting ──first content chunk──▶ streaming
 *         │                   │                                   │
 *         │               heartbeat                           onDone()
 *         │                   │                                   │
 *         │                   ▼                                   ▼
 *         │              (stays connecting)                   complete
 *         │
 *         ├── cancelStream() ──▶ idle   (from any state)
 *         └── error chunk / onError() / safety timeout ──▶ error
 *
 * 'complete' and 'error' persist until the next startStream() call.
 * ```
 */
export type ArenaStreamState = 'idle' | 'connecting' | 'streaming' | 'complete' | 'error';

// ============================================================================
// Stream Manager Interface
// ============================================================================

/**
 * Public API returned by the `useArenaStreamManager` hook.
 *
 * Encapsulates all streaming protocol concerns: state machine, content
 * accumulation, safety timeout, heartbeat tracking, and single-stream
 * enforcement so callers (e.g. ArenaPane) only deal with high-level events.
 */
export interface ArenaStreamManager {
  /** Current stream lifecycle state. */
  streamState: ArenaStreamState;
  /** Accumulated streaming content for the active message. */
  streamingContent: string;
  /** ID of the message currently being streamed to. */
  streamingMessageId: string | null;
  /** Error message when `streamState === 'error'`. Null otherwise. */
  streamError: string | null;

  /**
   * Start a new stream for the given request, writing chunks to the message
   * identified by `assistantMessageId`.
   *
   * If a stream is already active it is automatically cancelled before the
   * new one starts — callers never need to manually cancel first.
   *
   * @param request            The chat request to stream.
   * @param assistantMessageId The ID of the pre-created assistant message.
   * @param callbacks          Optional lifecycle callbacks for post-stream
   *                           work (persistence, notifications).
   */
  startStream(
    request: ArenaChatRequest,
    assistantMessageId: string,
    callbacks?: ArenaStreamCallbacks,
  ): void;

  /**
   * Cancel the active stream and reset state to `idle`.
   * Safe to call when no stream is active (no-op).
   */
  cancelStream(): void;

  /**
   * Derived convenience flag.
   * `true` while `streamState` is `'connecting'` or `'streaming'` — i.e.
   * the input bar should be disabled and a stop button should be shown.
   */
  isInputBlocked: boolean;
}

/**
 * Optional lifecycle callbacks passed to `startStream` for post-stream work,
 * such as persisting the final message and updating session metadata.
 */
export interface ArenaStreamCallbacks {
  /** Called when the stream completes successfully with the final response. */
  onComplete?: (response: ArenaChatResponse) => void;
  /** Called when the stream fails (transport error, error chunk, or timeout). */
  onError?: (error: string) => void;
}
