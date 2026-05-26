/**
 * WsMessageComposer Component
 *
 * Single-row textarea + Send button anchored at the bottom of the WS Messages pane.
 *
 * Send behaviour:
 *  - **Enter** (without Shift) — calls `onSend(trimmedValue)` and clears the input.
 *    Does nothing when the trimmed value is empty.
 *  - **Shift+Enter** — inserts a newline (native `<textarea>` default; not intercepted).
 *  - **Send button** — same as Enter; disabled while the input is empty or `disabled=true`.
 *
 * The textarea grows up to 4 visible rows via `max-h-24` and `overflow-y-auto`.
 * When `disabled=true` the textarea and send button are both disabled and rendered
 * in a muted visual style (e.g., while the WebSocket is not in `'connected'` state).
 *
 * Props:
 *  - onSend   — called with the trimmed message string
 *  - disabled — disables all interactive elements (e.g., while disconnected)
 */

import React, { useState, useCallback } from 'react';
import { SendHorizonalIcon } from 'lucide-react';
import { PrimaryButton } from '../ui/PrimaryButton';

// ── Props ─────────────────────────────────────────────────────────────────────

interface WsMessageComposerProps {
    /**
     * Called with the trimmed message text when the user presses Enter (without
     * Shift) or clicks the Send button. Never called with an empty string.
     */
    onSend: (message: string) => void;
    /**
     * When `true`, the textarea and Send button are both disabled and rendered
     * in a muted style. Typically `true` when the connection status is not
     * `'connected'`.
     */
    disabled: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Message composer bar for WebSocket tabs.
 *
 * Renders a controlled textarea that expands up to 4 rows, with an adjacent
 * Send button. Enter sends (Shift+Enter inserts a newline). Both are disabled
 * when no connection is active.
 */
const WsMessageComposer: React.FC<WsMessageComposerProps> = ({ onSend, disabled }) => {
    const [value, setValue] = useState('');

    const handleSend = useCallback(() => {
        const trimmed = value.trim();
        if (!trimmed) return;
        onSend(trimmed);
        setValue('');
    }, [onSend, value]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend]
    );

    const isSendDisabled = disabled || value.trim().length === 0;

    return (
        <div className="flex items-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0">
            <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                rows={1}
                placeholder="Type a message and press Enter to send…"
                className={`flex-1 resize-none overflow-y-auto max-h-24 rounded-md border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                    disabled
                        ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 placeholder-slate-300 dark:placeholder-slate-600 cursor-not-allowed'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500'
                }`}
            />
            <PrimaryButton
                onClick={handleSend}
                icon={<SendHorizonalIcon />}
                tooltip="Send"
                disabled={isSendDisabled}
                aria-label="Send"
                className="px-6 py-2"
            />
        </div>
    );
};

export default WsMessageComposer;
