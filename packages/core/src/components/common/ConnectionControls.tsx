/**
 * ConnectionControls Component
 *
 * Displays the current WebSocket / SSE connection status alongside a single
 * Connect / Disconnect action button. It reads `RealtimeTabState.status` from
 * the global Zustand store and fires the appropriate callback when clicked.
 *
 * Design constraints:
 * - Platform-agnostic — no VS Code or browser-specific imports.
 * - Does NOT make any adapter calls itself; callers supply `onConnect` /
 *   `onDisconnect` so the component stays testable without adapter wiring.
 * - Button is disabled during transitional states (connecting / disconnecting)
 *   and when the `disabled` prop is explicitly set to `true`.
 */

import React from 'react';
import { Link2Icon, Link2OffIcon } from 'lucide-react';
import { PrimaryButton } from '../ui/PrimaryButton';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import type { ConnectionStatus } from '../../types/realtime';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';

// ──────────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────────

interface ConnectionControlsProps {
    /** The tab ID whose realtime state drives the displayed status. */
    tabId: string;
    /** Called when the user clicks "Connect". */
    onConnect: () => void;
    /** Called when the user clicks "Disconnect". */
    onDisconnect: () => void;
    /** When `true` the action button is disabled regardless of status. */
    disabled?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Status → UI mappings
// ──────────────────────────────────────────────────────────────────────────────

const STATUS_DOT_COLOR: Record<ConnectionStatus, string> = {
    idle: 'text-slate-400',
    connecting: 'text-yellow-500',
    connected: 'text-green-500',
    disconnecting: 'text-yellow-500',
    disconnected: 'text-slate-500',
    error: 'text-red-500',
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
    idle: 'Idle',
    connecting: 'Connecting…',
    connected: 'Connected',
    disconnecting: 'Disconnecting…',
    disconnected: 'Disconnected',
    error: 'Error',
};

/** Statuses where the primary action is to connect (show "Connect" button). */
const CONNECT_STATUSES: ConnectionStatus[] = ['idle', 'disconnected', 'error'];

/** Statuses where the button should be disabled (transitional states). */
const TRANSITIONAL_STATUSES: ConnectionStatus[] = ['connecting', 'disconnecting'];

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Status indicator + Connect/Disconnect toggle for a WS or SSE request tab.
 */
const ConnectionControls: React.FC<ConnectionControlsProps> = ({
    tabId,
    onConnect,
    onDisconnect,
    disabled = false,
}) => {
    const realtimeState = useAppStateStore((s) => s.getRealtimeState(tabId));

    // Fall back to 'idle' if no realtime entry exists for the tab yet.
    const status: ConnectionStatus = realtimeState?.status ?? 'idle';
    const errorDetails = status === 'error' ? realtimeState?.error?.trim() : undefined;

    const isConnectAction = CONNECT_STATUSES.includes(status);
    const isTransitional = TRANSITIONAL_STATUSES.includes(status);
    const isButtonDisabled = disabled || isTransitional;

    const dotColorClass = STATUS_DOT_COLOR[status];
    const label = STATUS_LABEL[status];
    const tooltipText = errorDetails ? `${label}: ${errorDetails}` : label;

    return (
        <div className="flex items-center gap-3">
            {/* Status indicator — dot only, label shown in tooltip */}
            <Tooltip>
                <TooltipTrigger asChild>
                    <div
                        className="flex items-center cursor-default"
                        aria-label={`Connection status: ${tooltipText}`}
                    >
                        <svg
                            className={`w-2.5 h-2.5 fill-current flex-shrink-0 ${dotColorClass} ${status === 'connecting' ? 'animate-pulse' : ''}`}
                            viewBox="0 0 8 8"
                            aria-hidden="true"
                        >
                            <circle cx="4" cy="4" r="4" />
                        </svg>
                    </div>
                </TooltipTrigger>
                <TooltipContent className="px-2 py-1 text-xs">
                    {tooltipText}
                </TooltipContent>
            </Tooltip>

            {/* Action button — icon only */}
            <PrimaryButton
                onClick={isConnectAction ? onConnect : onDisconnect}
                icon={isConnectAction ? <Link2Icon /> : <Link2OffIcon />}
                colorTheme={isConnectAction ? 'main' : 'error'}
                tooltip={isConnectAction ? 'Connect' : 'Disconnect'}
                disabled={isButtonDisabled}
                className="px-4 py-2"
            />
        </div>
    );
};

export default ConnectionControls;
