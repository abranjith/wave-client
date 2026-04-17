/**
 * Unit tests for WsMessageTimeline component.
 *
 * Tested scenarios:
 *  1.  Shows empty-state placeholder when wsMessages is [].
 *  2.  Renders a received message with correct ↑ badge and content.
 *  3.  Renders a sent message with correct ↓ badge and content.
 *  4.  Shows truncation warning text when message.size > 1 MB; does not render content.
 *  5.  Does not show the Clear button when wsMessages is empty.
 *  6.  Shows the Clear button when wsMessages is non-empty; clicking it calls onClear.
 *  7.  Formats timestamp as HH:MM:SS.
 *  8.  Displays "500 B" for a 500-byte message.
 *  9.  Displays "1.5 KB" for a 1536-byte message.
 *
 * Strategy:
 *  - Zustand store is seeded via useAppStateStore.setState.
 *  - No adapter wrapping needed.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import WsMessageTimeline from '../../../components/common/WsMessageTimeline';
import type { RealtimeTabState, WsMessage } from '../../../types/realtime';

// jsdom does not implement scrollIntoView — stub it to prevent errors.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// ── Helpers ───────────────────────────────────────────────────────────────────

const TAB_ID = 'ws-timeline-tab';

function makeMessage(overrides: Partial<WsMessage> = {}): WsMessage {
    return {
        id: `msg-${Date.now()}-${Math.random()}`,
        direction: 'received',
        content: 'hello world',
        timestamp: Date.now(),
        size: 11,
        ...overrides,
    };
}

function seedMessages(messages: WsMessage[]) {
    const entry: RealtimeTabState = {
        tabId: TAB_ID,
        protocol: 'ws',
        connectionId: null,
        status: 'idle',
        responseHeaders: null,
        wsMessages: messages,
        sseEvents: [],
        selectedSseEventName: 'all',
    };
    useAppStateStore.setState({ realtimeState: { [TAB_ID]: entry } });
}

function renderTimeline(onClear = vi.fn()) {
    return render(<WsMessageTimeline tabId={TAB_ID} onClear={onClear} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WsMessageTimeline', () => {
    beforeEach(() => {
        useAppStateStore.setState({ realtimeState: {} });
    });

    afterEach(() => {
        useAppStateStore.setState({ realtimeState: {} });
    });

    it('shows empty-state placeholder when wsMessages is []', () => {
        seedMessages([]);
        renderTimeline();
        expect(screen.getByText('No messages yet')).toBeInTheDocument();
        expect(
            screen.getByText('Connect to a WebSocket endpoint to see messages here.')
        ).toBeInTheDocument();
    });

    it('renders a received message with correct ↑ badge and content', () => {
        const msg = makeMessage({ direction: 'received', content: 'inbound data', size: 12 });
        seedMessages([msg]);
        renderTimeline();

        const badge = screen.getByLabelText('received');
        expect(badge).toBeInTheDocument();
        expect(badge.textContent).toBe('↑');
        expect(screen.getByText('inbound data')).toBeInTheDocument();
    });

    it('renders a sent message with correct ↓ badge and content', () => {
        const msg = makeMessage({ direction: 'sent', content: 'outbound data', size: 13 });
        seedMessages([msg]);
        renderTimeline();

        const badge = screen.getByLabelText('sent');
        expect(badge).toBeInTheDocument();
        expect(badge.textContent).toBe('↓');
        expect(screen.getByText('outbound data')).toBeInTheDocument();
    });

    it('shows truncation warning and hides content when size > 1 MB', () => {
        const oversized = makeMessage({
            direction: 'received',
            content: 'should not appear',
            size: 1_048_577, // 1 MB + 1 byte
        });
        seedMessages([oversized]);
        renderTimeline();

        // Truncation warning should mention the size
        const warning = screen.getByText(/message too large/i);
        expect(warning).toBeInTheDocument();
        // Original content must NOT be rendered
        expect(screen.queryByText('should not appear')).not.toBeInTheDocument();
    });

    it('does not show the Clear button when wsMessages is empty', () => {
        seedMessages([]);
        renderTimeline();
        expect(screen.queryByTitle('Clear messages')).not.toBeInTheDocument();
    });

    it('shows the Clear button when wsMessages is non-empty and calls onClear when clicked', () => {
        const onClear = vi.fn();
        seedMessages([makeMessage()]);
        renderTimeline(onClear);

        const clearBtn = screen.getByTitle('Clear messages');
        expect(clearBtn).toBeInTheDocument();
        fireEvent.click(clearBtn);
        expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('formats timestamp as HH:MM:SS', () => {
        // Use a known timestamp to assert the formatted value.
        // We create a Date at a fixed local time and compute what formatWsTimestamp should produce.
        const d = new Date();
        d.setHours(14, 5, 9, 0);
        const msg = makeMessage({ timestamp: d.getTime() });
        seedMessages([msg]);
        renderTimeline();

        // The formatted string must appear somewhere in the document.
        const pad = (n: number) => String(n).padStart(2, '0');
        const expected = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it('displays "500 B" for a 500-byte message', () => {
        seedMessages([makeMessage({ size: 500 })]);
        renderTimeline();
        expect(screen.getByText('500 B')).toBeInTheDocument();
    });

    it('displays "1.5 KB" for a 1536-byte message', () => {
        seedMessages([makeMessage({ size: 1536 })]);
        renderTimeline();
        expect(screen.getByText('1.5 KB')).toBeInTheDocument();
    });
});
