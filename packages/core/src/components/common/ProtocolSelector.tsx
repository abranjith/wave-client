/**
 * ProtocolSelector Component
 *
 * A protocol dropdown that lets the user switch the active tab's protocol
 * between HTTP, WebSocket (WS), and SSE. Reads `activeTab.protocol` from the
 * global Zustand store and invokes `updateProtocol` on change.
 *
 * Design constraints:
 * - Platform-agnostic — no VS Code or browser-specific imports.
 * - Renders `null` when there is no active tab.
 * - Styled to match the Method dropdown in `RequestEditor` (same height/border).
 */

import React from 'react';
import { GlobeIcon, CableIcon, RadioIcon } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import type { RequestProtocol } from '../../types/collection';

// ──────────────────────────────────────────────────────────────────────────────
// Protocol option definitions
// ──────────────────────────────────────────────────────────────────────────────

interface ProtocolOption {
    value: RequestProtocol;
    label: string;
    icon: React.ReactNode;
    colorClass: string;
}

const PROTOCOL_OPTIONS: ProtocolOption[] = [
    {
        value: 'http',
        label: 'HTTP',
        icon: <GlobeIcon size={14} />,
        colorClass: 'text-blue-600 dark:text-blue-400',
    },
    {
        value: 'ws',
        label: 'WebSocket',
        icon: <CableIcon size={14} />,
        colorClass: 'text-teal-600 dark:text-teal-400',
    },
    {
        value: 'sse',
        label: 'SSE',
        icon: <RadioIcon size={14} />,
        colorClass: 'text-purple-600 dark:text-purple-400',
    },
];

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Renders the protocol dropdown for the active request editor tab.
 * Returns `null` when no tab is open.
 */
const ProtocolSelector: React.FC = () => {
    const activeTab = useAppStateStore((state) => state.getActiveTab());
    const updateProtocol = useAppStateStore((state) => state.updateProtocol);

    if (!activeTab) {
        return null;
    }

    const protocol = activeTab.protocol ?? 'http';

    return (
        <Select value={protocol} onValueChange={(val) => updateProtocol(val as RequestProtocol)}>
            <SelectTrigger className="w-auto min-w-[120px] bg-white border-slate-300 text-slate-900 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {PROTOCOL_OPTIONS.map((option) => (
                    <SelectItem
                        key={option.value}
                        value={option.value}
                        className="hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                        <span className={`flex items-center gap-2 ${option.colorClass}`}>
                            {option.icon}
                            {option.label}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};

export default ProtocolSelector;
