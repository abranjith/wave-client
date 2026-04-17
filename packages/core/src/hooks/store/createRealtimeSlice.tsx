import { StateCreator } from 'zustand';
import type {
    RealtimeTabState,
    RealtimeStateByTabId,
    ConnectionStatus,
    WsMessage,
    SseEvent,
} from '../../types/realtime';
import { createIdleRealtimeTabState } from '../../types/realtime';

// ── Slice interface  ──────────────────────────────────────────────────────────

/**
 * Zustand slice managing per-tab realtime (WS / SSE) connection and timeline state.
 * - Only tabs with `protocol === 'ws'` or `protocol === 'sse'` should ever hold
 *   an entry in `realtimeState`.  HTTP tabs must not appear as keys.
 * - All state is ephemeral: entries are created when a WS/SSE tab is loaded and
 *   removed when the tab is closed, cleared, or switched back to HTTP.
 * - All slice actions are no-throw. Unknown tab IDs and protocol mismatches are
 *   silently ignored so callers never need to guard against slice errors.
 */
export interface RealtimeSlice {
    /** Per-tab realtime state keyed by tab ID. Ephemeral — not persisted. */
    realtimeState: RealtimeStateByTabId;

    // ── TASK-002: Idle state management  ─────────────────────────────────────

    /**
     * Creates a clean idle realtime entry for `tabId` if one does not already exist.
     * No-op when an entry for that tab is already present.
     */
    ensureRealtimeTabState: (tabId: string, protocol: 'ws' | 'sse') => void;

    /**
     * Returns the current realtime state for `tabId`, or `undefined` if the tab
     * has no realtime entry (e.g., it is an HTTP tab or has been closed).
     */
    getRealtimeState: (tabId: string) => RealtimeTabState | undefined;

    /**
     * Updates the `status` field for `tabId`. No-op for unknown tab IDs.
     */
    setRealtimeStatus: (tabId: string, status: ConnectionStatus) => void;

    /**
     * Updates the `connectionId` field for `tabId`. No-op for unknown tab IDs.
     */
    setRealtimeConnectionId: (tabId: string, connectionId: string | null) => void;

    /**
     * Stores the handshake / initial response headers for `tabId`.
     * No-op for unknown tab IDs.
     */
    setRealtimeResponseHeaders: (tabId: string, headers: Record<string, string>) => void;

    /**
     * Records an error message for `tabId` and switches status to `'error'`.
     * No-op for unknown tab IDs.
     */
    setRealtimeError: (tabId: string, error: string) => void;

    /**
     * Resets the realtime entry for `tabId` back to a clean idle state, discarding
     * all messages/events, headers, and error fields while keeping the entry in the map.
     * No-op for unknown tab IDs.
     */
    resetRealtimeTabState: (tabId: string) => void;

    /**
     * Removes the realtime entry for `tabId` entirely (e.g., when a tab is closed
     * or switched to HTTP). No-op when no entry exists.
     */
    removeRealtimeTabState: (tabId: string) => void;

    // ── TASK-003: Timeline actions  ───────────────────────────────────────────

    /**
     * Appends a WS message to the timeline for `tabId`.
     * No-op when `tabId` is unknown or the tab protocol is not `'ws'`.
     */
    appendWsMessage: (tabId: string, message: WsMessage) => void;

    /**
     * Appends an SSE event to the timeline for `tabId`.
     * No-op when `tabId` is unknown or the tab protocol is not `'sse'`.
     */
    appendSseEvent: (tabId: string, event: SseEvent) => void;

    /**
     * Clears all WS messages and SSE events for `tabId`, leaving the connection
     * status and other metadata fields intact. No-op for unknown tab IDs.
     */
    clearRealtimeTimeline: (tabId: string) => void;

    /**
     * Sets the active SSE event-name filter for `tabId`.
     * Pass `'all'` to show every event regardless of name.
     * No-op for unknown tab IDs or non-SSE tabs.
     */
    setSseEventFilter: (tabId: string, eventName: string) => void;

    /**
     * Returns the SSE events for `tabId`, filtered by the current
     * `selectedSseEventName`.  Returns an empty array for unknown tab IDs.
     *
     * @example
     * // Show only 'heartbeat' events
     * setSseEventFilter(tabId, 'heartbeat');
     * const events = getFilteredSseEvents(tabId); // only 'heartbeat' events
     *
     * // Show all
     * setSseEventFilter(tabId, 'all');
     * const all = getFilteredSseEvents(tabId); // every event
     */
    getFilteredSseEvents: (tabId: string) => SseEvent[];
}

// ── Slice creator  ────────────────────────────────────────────────────────────

const createRealtimeSlice: StateCreator<RealtimeSlice> = (set, get) => ({
    realtimeState: {},

    // ── TASK-002 ──────────────────────────────────────────────────────────────

    ensureRealtimeTabState: (tabId, protocol) =>
        set((state) => {
            if (state.realtimeState[tabId]) return state;
            return {
                realtimeState: {
                    ...state.realtimeState,
                    [tabId]: createIdleRealtimeTabState(tabId, protocol),
                },
            };
        }),

    getRealtimeState: (tabId) => get().realtimeState[tabId],

    setRealtimeStatus: (tabId, status) =>
        set((state) => {
            const entry = state.realtimeState[tabId];
            if (!entry) return state;
            return {
                realtimeState: {
                    ...state.realtimeState,
                    [tabId]: { ...entry, status },
                },
            };
        }),

    setRealtimeConnectionId: (tabId, connectionId) =>
        set((state) => {
            const entry = state.realtimeState[tabId];
            if (!entry) return state;
            return {
                realtimeState: {
                    ...state.realtimeState,
                    [tabId]: { ...entry, connectionId },
                },
            };
        }),

    setRealtimeResponseHeaders: (tabId, headers) =>
        set((state) => {
            const entry = state.realtimeState[tabId];
            if (!entry) return state;
            return {
                realtimeState: {
                    ...state.realtimeState,
                    [tabId]: { ...entry, responseHeaders: headers },
                },
            };
        }),

    setRealtimeError: (tabId, error) =>
        set((state) => {
            const entry = state.realtimeState[tabId];
            if (!entry) return state;
            return {
                realtimeState: {
                    ...state.realtimeState,
                    [tabId]: { ...entry, status: 'error', error },
                },
            };
        }),

    resetRealtimeTabState: (tabId) =>
        set((state) => {
            const entry = state.realtimeState[tabId];
            if (!entry) return state;
            return {
                realtimeState: {
                    ...state.realtimeState,
                    [tabId]: createIdleRealtimeTabState(tabId, entry.protocol),
                },
            };
        }),

    removeRealtimeTabState: (tabId) =>
        set((state) => {
            if (!state.realtimeState[tabId]) return state;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [tabId]: _removed, ...rest } = state.realtimeState;
            return { realtimeState: rest };
        }),

    // ── TASK-003 ──────────────────────────────────────────────────────────────

    appendWsMessage: (tabId, message) =>
        set((state) => {
            const entry = state.realtimeState[tabId];
            if (!entry || entry.protocol !== 'ws') return state;
            return {
                realtimeState: {
                    ...state.realtimeState,
                    [tabId]: { ...entry, wsMessages: [...entry.wsMessages, message] },
                },
            };
        }),

    appendSseEvent: (tabId, event) =>
        set((state) => {
            const entry = state.realtimeState[tabId];
            if (!entry || entry.protocol !== 'sse') return state;
            return {
                realtimeState: {
                    ...state.realtimeState,
                    [tabId]: { ...entry, sseEvents: [...entry.sseEvents, event] },
                },
            };
        }),

    clearRealtimeTimeline: (tabId) =>
        set((state) => {
            const entry = state.realtimeState[tabId];
            if (!entry) return state;
            return {
                realtimeState: {
                    ...state.realtimeState,
                    [tabId]: { ...entry, wsMessages: [], sseEvents: [] },
                },
            };
        }),

    setSseEventFilter: (tabId, eventName) =>
        set((state) => {
            const entry = state.realtimeState[tabId];
            if (!entry || entry.protocol !== 'sse') return state;
            return {
                realtimeState: {
                    ...state.realtimeState,
                    [tabId]: { ...entry, selectedSseEventName: eventName },
                },
            };
        }),

    getFilteredSseEvents: (tabId) => {
        const entry = get().realtimeState[tabId];
        if (!entry || entry.protocol !== 'sse') return [];
        if (entry.selectedSseEventName === 'all') return entry.sseEvents;
        return entry.sseEvents.filter((e) => e.eventName === entry.selectedSseEventName);
    },
});

export default createRealtimeSlice;
