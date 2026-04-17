/**
 * WsOutputArea Component
 *
 * The output area shell for WebSocket request tabs. Renders two sub-tabs:
 *  - **Messages** — WS message timeline (WsMessageTimeline) and composer (WsMessageComposer).
 *  - **Response Headers** — Displays the HTTP upgrade response headers received at connect time.
 *
 * Reads `RealtimeTabState` from the global Zustand store.
 * Manages its own local `activeTab` state; it does NOT touch the global store's
 * `activeResponseSection` field (that is used only by the HTTP response area).
 */

import React, { useState } from 'react';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import WsMessageTimeline from './WsMessageTimeline';
import WsMessageComposer from './WsMessageComposer';

// ──────────────────────────────────────────────────────────────────────────────
// Props & types
// ──────────────────────────────────────────────────────────────────────────────

interface WsOutputAreaProps {
    /** The tab ID whose realtime state drives the output area. */
    tabId: string;
    /**
     * Called when the user composes and sends a message via the WsMessageComposer.
     * Typically wired to `useWsConnection().sendMessage`.
     */
    onSendMessage: (message: string) => void;
}

type WsOutputTab = 'Messages' | 'Headers';

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Output area shell for WebSocket tabs.
 *
 * The Messages pane renders WsMessageTimeline (scrollable chat-like list) and
 * WsMessageComposer (send bar). The composer is disabled unless the connection
 * status is `'connected'`.
 */
const WsOutputArea: React.FC<WsOutputAreaProps> = ({ tabId, onSendMessage }) => {
    const [activeTab, setActiveTab] = useState<WsOutputTab>('Messages');

    const realtimeState = useAppStateStore((s) => s.getRealtimeState(tabId));
    const clearRealtimeTimeline = useAppStateStore((s) => s.clearRealtimeTimeline);
    const responseHeaders = realtimeState?.responseHeaders ?? null;
    const isConnected = realtimeState?.status === 'connected';
    const connectionError = realtimeState?.status === 'error' ? realtimeState.error : undefined;

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900">
            {/* Tab bar */}
            <div className="border-b border-slate-200 dark:border-slate-700 flex gap-0 bg-slate-50 dark:bg-slate-900 flex-shrink-0">
                {(['Messages', 'Headers'] as WsOutputTab[]).map((tab) => (
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

            {/* Connection error details */}
            {connectionError && (
                <div className="px-6 py-3 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
                    <div className="text-xs font-semibold text-red-700 dark:text-red-400">
                        WebSocket connection failed
                    </div>
                    <div className="mt-1 text-xs font-mono text-red-700 dark:text-red-300 break-words">
                        {connectionError}
                    </div>
                </div>
            )}

            {/* Tab content */}
            <div className="flex-1 min-h-0 flex flex-col">
                {activeTab === 'Messages' && (
                    <div className="flex flex-col flex-1 min-h-0">
                        {/* Scrollable timeline takes all remaining space */}
                        <div className="flex-1 min-h-0 overflow-auto">
                            <WsMessageTimeline
                                tabId={tabId}
                                onClear={() => clearRealtimeTimeline(tabId)}
                            />
                        </div>
                        {/* Composer pinned at the bottom */}
                        <WsMessageComposer
                            onSend={onSendMessage}
                            disabled={!isConnected}
                        />
                    </div>
                )}

                {activeTab === 'Headers' && (
                    <div className="flex-1 overflow-auto px-6 py-4">
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

export default WsOutputArea;

