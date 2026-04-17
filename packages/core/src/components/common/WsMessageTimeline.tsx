/**
 * WsMessageTimeline Component
 *
 * Scrollable chronological list of WebSocket messages for a single tab.
 * Each row shows:
 *  - Direction badge: ↑ for received (teal), ↓ for sent (slate)
 *  - Content in monospace — truncated with a warning when > 1 MB
 *  - Timestamp formatted as HH:MM:SS (local time)
 *  - Payload size in human-readable form (B or KB)
 *
 * A Clear button (Trash2 icon) appears above the list when messages exist.
 * Auto-scrolls to the bottom whenever a new message is appended.
 *
 * Props:
 *  - tabId    — tab whose WS state is read from the Zustand store
 *  - onClear  — called when the user clicks the Clear button
 */

import React, { useEffect, useRef } from 'react';
import { MessageSquareIcon, Trash2Icon } from 'lucide-react';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import type { WsMessage } from '../../types/realtime';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Messages whose byte-length exceeds this threshold are not rendered inline.
 * Instead a truncation warning is shown to avoid freezing the UI.
 */
const WS_MAX_MESSAGE_DISPLAY_BYTES = 1_048_576; // 1 MB

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formats an epoch-milliseconds timestamp as a local `HH:MM:SS` string.
 *
 * @param ms - Epoch milliseconds (e.g., `Date.now()` at receive time).
 * @returns `"HH:MM:SS"` using the user's local system clock.
 */
function formatWsTimestamp(ms: number): string {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Formats a byte count for human-readable display.
 *  - < 1024 bytes  → `"X B"`
 *  - ≥ 1024 bytes  → `"X.X KB"` (one decimal place)
 */
function formatByteSize(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
}

// ── Props & types ─────────────────────────────────────────────────────────────

interface WsMessageTimelineProps {
    /** The tab ID whose realtime state drives this timeline. */
    tabId: string;
    /** Called when the user clicks the Clear button. */
    onClear: () => void;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface MessageRowProps {
    message: WsMessage;
}

/** Renders a single message row with badge, content, timestamp, and size. */
const MessageRow: React.FC<MessageRowProps> = ({ message }) => {
    const isSent = message.direction === 'sent';
    const isTruncated = message.size > WS_MAX_MESSAGE_DISPLAY_BYTES;

    return (
        <div className="flex gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 items-start">
            {/* Direction badge */}
            <span
                aria-label={isSent ? 'sent' : 'received'}
                className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded-full flex items-center justify-center text-xs font-bold select-none ${
                    isSent
                        ? 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                        : 'bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400'
                }`}
            >
                {isSent ? '↓' : '↑'}
            </span>

            {/* Message content */}
            <div className="flex-1 min-w-0">
                {isTruncated ? (
                    <p className="font-mono text-xs text-amber-600 dark:text-amber-400 italic">
                        {`message too large (${formatByteSize(message.size)} — truncated)`}
                    </p>
                ) : (
                    <pre className="font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all">
                        {message.content}
                    </pre>
                )}
            </div>

            {/* Metadata: timestamp + size */}
            <div className="flex-shrink-0 text-right text-xs text-slate-400 dark:text-slate-500 tabular-nums space-y-0.5">
                <div>{formatWsTimestamp(message.timestamp)}</div>
                <div>{formatByteSize(message.size)}</div>
            </div>
        </div>
    );
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Scrollable WebSocket message timeline for a tab.
 *
 * Reads `wsMessages` from the Zustand store via `tabId`.
 * When empty, renders the same empty-state placeholder that was previously
 * in the FEAT-003 `WsOutputArea` stub — no visual regression.
 * When non-empty, renders message rows newest-at-bottom and auto-scrolls
 * to the latest entry on each new message.
 */
const WsMessageTimeline: React.FC<WsMessageTimelineProps> = ({ tabId, onClear }) => {
    const wsMessages = useAppStateStore(
        (s) => s.getRealtimeState(tabId)?.wsMessages
    ) ?? [];
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to the bottom whenever a new message arrives.
    useEffect(() => {
        if (wsMessages.length > 0) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [wsMessages.length]);

    // ── Empty state ────────────────────────────────────────────────────────

    if (wsMessages.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <MessageSquareIcon
                    size={40}
                    className="text-slate-300 dark:text-slate-600"
                />
                <p className="text-base font-semibold text-slate-600 dark:text-slate-300">
                    No messages yet
                </p>
                <p className="text-sm text-slate-400 dark:text-slate-500">
                    Connect to a WebSocket endpoint to see messages here.
                </p>
            </div>
        );
    }

    // ── Message list ────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full">
            {/* Clear button — only shown when there are messages */}
            <div className="flex justify-end px-2 py-1 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
                <button
                    title="Clear messages"
                    aria-label="Clear messages"
                    onClick={onClear}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                >
                    <Trash2Icon size={13} />
                    Clear
                </button>
            </div>

            {/* Scrollable message rows */}
            <div className="flex-1 overflow-auto px-2 py-1">
                {wsMessages.map((msg) => (
                    <MessageRow key={msg.id} message={msg} />
                ))}
                {/* Sentinel element for auto-scroll */}
                <div ref={bottomRef} />
            </div>
        </div>
    );
};

export default WsMessageTimeline;
