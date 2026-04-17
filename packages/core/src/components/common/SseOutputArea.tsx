/**
 * SseOutputArea Component
 *
 * The output area shell for Server-Sent Events (SSE) request tabs. Renders two sub-tabs:
 *  - **Events** — Live SSE event stream rendered by SseEventTimeline.
 *  - **Response Headers** — Displays the HTTP response headers received at connect time.
 *
 * Reads `RealtimeTabState.responseHeaders` from the global Zustand store.
 * Manages its own local `activeTab` state; it does NOT touch the global store's
 * `activeResponseSection` field (that is used only by the HTTP response area).
 */

import React, { useState } from 'react';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import SseEventTimeline from './SseEventTimeline';

// ──────────────────────────────────────────────────────────────────────────────
// Props & types
// ──────────────────────────────────────────────────────────────────────────────

interface SseOutputAreaProps {
    /** The tab ID whose realtime state drives the output area. */
    tabId: string;
}

type SseOutputTab = 'Events' | 'Headers';

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Output area shell for SSE tabs. Renders two sub-tabs: live event stream and response headers.
 */
const SseOutputArea: React.FC<SseOutputAreaProps> = ({ tabId }) => {
    const [activeTab, setActiveTab] = useState<SseOutputTab>('Events');

    const realtimeState = useAppStateStore((s) => s.getRealtimeState(tabId));
    const responseHeaders = realtimeState?.responseHeaders ?? null;
    const clearRealtimeTimeline = useAppStateStore((s) => s.clearRealtimeTimeline);

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900">
            {/* Tab bar */}
            <div className="border-b border-slate-200 dark:border-slate-700 flex gap-0 bg-slate-50 dark:bg-slate-900 flex-shrink-0">
                {(['Events', 'Headers'] as SseOutputTab[]).map((tab) => (
                    <button
                        key={tab}
                        className={`px-6 py-3 text-sm font-medium focus:outline-none transition-all relative ${
                            activeTab === tab
                                ? 'border-b-2 border-blue-500 text-blue-600 bg-white dark:bg-slate-800 dark:text-blue-400 dark:border-blue-400'
                                : 'text-slate-600 bg-transparent hover:text-blue-600 hover:bg-white/50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-slate-800/50'
                        }`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === 'Headers' ? 'Response Headers' : tab}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 flex flex-col">
                {activeTab === 'Events' && (
                    <SseEventTimeline
                        tabId={tabId}
                        onClear={() => clearRealtimeTimeline(tabId)}
                    />
                )}

                {activeTab === 'Headers' && (
                    <div className="overflow-auto px-6 py-4 flex-1">
                        {responseHeaders && Object.keys(responseHeaders).length > 0 ? (
                            <div className="space-y-2">
                                {Object.entries(responseHeaders).map(([key, value]) => (
                                    <div
                                        key={key}
                                        className="flex gap-2 py-1 border-b border-slate-100 dark:border-slate-800 last:border-0"
                                    >
                                        <span className="font-mono font-bold text-slate-500 dark:text-slate-400 w-40 flex-shrink-0">
                                            {key}
                                        </span>
                                        <span className="font-mono text-slate-800 dark:text-slate-200 break-words">
                                            {value}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-400 dark:text-slate-500">
                                Response headers will appear here after connecting.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SseOutputArea;
