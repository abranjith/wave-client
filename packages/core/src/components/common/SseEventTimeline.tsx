/**
 * SseEventTimeline Component
 *
 * Scrollable chronological list of Server-Sent Events for a single tab.
 * Each row shows:
 *  - Event type badge (e.g., "message", "update") in purple
 *  - Event data in monospace — truncated with a warning when > 2000 chars
 *  - Timestamp formatted as HH:MM:SS (local time)
 *
 * When events exist a toolbar is shown above the list with:
 *  - An event-name filter dropdown (Radix UI Select) to narrow the visible events
 *  - A Clear button (Trash2 icon) to clear all events for this tab
 *
 * Auto-scrolls to the bottom whenever a new event is appended.
 *
 * Props:
 *  - tabId   — tab whose SSE state is read from the Zustand store
 *  - onClear — called when the user clicks the Clear button
 */

import React, { useEffect, useRef } from 'react';
import { RadioIcon, Trash2Icon } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import type { SseEvent } from '../../types/realtime';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Event data strings exceeding this character count are not rendered inline.
 * A truncation warning is shown instead to avoid freezing the UI with huge payloads.
 */
const SSE_MAX_DATA_DISPLAY_CHARS = 2000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formats an epoch-milliseconds timestamp as a local `HH:MM:SS` string.
 *
 * @param ms - Epoch milliseconds (e.g., `Date.now()` at receive time).
 * @returns `"HH:MM:SS"` using the user's local system clock.
 */
function formatTimestamp(ms: number): string {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Returns an ordered, deduplicated list of event names from the full event list.
 * Preserves first-seen insertion order so the dropdown is stable across filter changes.
 */
function getUniqueEventNames(events: SseEvent[]): string[] {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const ev of events) {
        if (!seen.has(ev.eventName)) {
            seen.add(ev.eventName);
            names.push(ev.eventName);
        }
    }
    return names;
}

// ── Props & types ─────────────────────────────────────────────────────────────

interface SseEventTimelineProps {
    /** The tab ID whose realtime state drives this timeline. */
    tabId: string;
    /** Called when the user clicks the Clear button. */
    onClear: () => void;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface EventRowProps {
    event: SseEvent;
}

/** Renders a single SSE event row with badge, data content, and timestamp. */
const EventRow: React.FC<EventRowProps> = ({ event }) => {
    const isTruncated = event.data.length > SSE_MAX_DATA_DISPLAY_CHARS;

    return (
        <div className="flex gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 items-start">
            {/* Event name badge */}
            <span
                aria-label={`event: ${event.eventName}`}
                className="flex-shrink-0 mt-0.5 px-2 py-0.5 rounded text-xs font-mono font-semibold select-none bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
            >
                {event.eventName}
            </span>

            {/* Event data content */}
            <div className="flex-1 min-w-0">
                {isTruncated ? (
                    <p className="font-mono text-xs text-amber-600 dark:text-amber-400 italic">
                        {`data too large (${event.data.length} chars — truncated)`}
                    </p>
                ) : (
                    <pre className="font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all">
                        {event.data}
                    </pre>
                )}
            </div>

            {/* Timestamp */}
            <div className="flex-shrink-0 text-right text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                {formatTimestamp(event.timestamp)}
            </div>
        </div>
    );
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Scrollable SSE event timeline for a tab.
 *
 * Reads `sseEvents` and `selectedSseEventName` from the Zustand store via `tabId`.
 * When empty, renders an empty-state placeholder consistent with WsMessageTimeline.
 * When non-empty, renders event rows newest-at-bottom with auto-scroll and
 * provides a filter dropdown to narrow events by event name.
 */
const SseEventTimeline: React.FC<SseEventTimelineProps> = ({ tabId, onClear }) => {
    // Read the full realtime state slice once — avoids calling store functions
    // inside selectors, which would create new array references on every render
    // and cause infinite re-render loops.
    const realtimeState = useAppStateStore((s) => s.getRealtimeState(tabId));
    const setSseEventFilter = useAppStateStore((s) => s.setSseEventFilter);

    const sseEvents = realtimeState?.sseEvents ?? [];
    const selectedSseEventName = realtimeState?.selectedSseEventName ?? 'all';

    // Compute filtered events in the component to avoid creating new array
    // references inside Zustand selectors (which would cause infinite loops).
    const filteredEvents =
        selectedSseEventName === 'all'
            ? sseEvents
            : sseEvents.filter((ev) => ev.eventName === selectedSseEventName);

    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to the bottom whenever a new event arrives.
    useEffect(() => {
        if (sseEvents.length > 0) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [sseEvents.length]);

    // ── Empty state ────────────────────────────────────────────────────────

    if (sseEvents.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <RadioIcon
                    size={40}
                    className="text-slate-300 dark:text-slate-600"
                />
                <p className="text-base font-semibold text-slate-600 dark:text-slate-300">
                    No events yet
                </p>
                <p className="text-sm text-slate-400 dark:text-slate-500">
                    Connect to an SSE endpoint to see events here.
                </p>
            </div>
        );
    }

    // ── Event list ─────────────────────────────────────────────────────────

    const uniqueEventNames = getUniqueEventNames(sseEvents);

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar — filter dropdown + clear button */}
            <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 gap-2">
                {/* Event-name filter dropdown */}
                <Select
                    value={selectedSseEventName}
                    onValueChange={(value) => setSseEventFilter(tabId, value)}
                >
                    <SelectTrigger
                        className="h-7 w-auto min-w-[120px] text-xs px-2 py-0"
                        aria-label="Filter by event name"
                    >
                        <SelectValue placeholder="All Events" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Events</SelectItem>
                        {uniqueEventNames.map((name) => (
                            <SelectItem key={name} value={name}>
                                {name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Clear button */}
                <button
                    title="Clear events"
                    aria-label="Clear events"
                    onClick={onClear}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                >
                    <Trash2Icon size={13} />
                    Clear
                </button>
            </div>

            {/* Scrollable event rows */}
            <div className="flex-1 overflow-auto px-2 py-1">
                {filteredEvents.map((ev) => (
                    <EventRow key={ev.id} event={ev} />
                ))}
                {/* Sentinel element for auto-scroll */}
                <div ref={bottomRef} />
            </div>
        </div>
    );
};

export default SseEventTimeline;
