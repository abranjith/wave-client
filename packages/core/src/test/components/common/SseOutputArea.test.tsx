/**
 * Unit tests for SseOutputArea component.
 *
 * Tested scenarios:
 *  1.  Shows "No events yet" placeholder by default (Events tab active).
 *  2.  "Connect to an SSE endpoint…" subtext is visible with the placeholder.
 *  3.  Clicking the "Response Headers" tab switches to header view.
 *  4.  Header view shows key/value pairs when responseHeaders is non-empty.
 *  5.  Header view shows placeholder text when responseHeaders is empty/null.
 *
 * Strategy:
 *  - Zustand store is seeded with realtimeState via useAppStateStore.setState.
 *  - No adapter wrapping needed (component reads directly from Zustand).
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import SseOutputArea from '../../../components/common/SseOutputArea';
import type { RealtimeTabState } from '../../../types/realtime';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TAB_ID = 'sse-tab-1';

function seedRealtimeState(responseHeaders: Record<string, string> | null = null) {
    const entry: RealtimeTabState = {
        tabId: TAB_ID,
        protocol: 'sse',
        connectionId: null,
        status: 'idle',
        responseHeaders,
        wsMessages: [],
        sseEvents: [],
        selectedSseEventName: 'all',
    };
    useAppStateStore.setState({ realtimeState: { [TAB_ID]: entry } });
}

function renderOutput() {
    return render(<SseOutputArea tabId={TAB_ID} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SseOutputArea', () => {
    beforeEach(() => {
        useAppStateStore.setState({ realtimeState: {} });
    });

    afterEach(() => {
        useAppStateStore.setState({ realtimeState: {} });
    });

    it('shows "No events yet" placeholder by default', () => {
        seedRealtimeState();
        renderOutput();
        expect(screen.getByText('No events yet')).toBeInTheDocument();
    });

    it('shows the SSE connection subtext with the placeholder', () => {
        seedRealtimeState();
        renderOutput();
        expect(
            screen.getByText('Connect to an SSE endpoint to see events here.')
        ).toBeInTheDocument();
    });

    it('switches to headers view when Response Headers tab is clicked', () => {
        seedRealtimeState();
        renderOutput();
        fireEvent.click(screen.getByText('Response Headers'));
        expect(
            screen.getByText('Response headers will appear here after connecting.')
        ).toBeInTheDocument();
    });

    it('shows key/value pairs when responseHeaders is non-empty', () => {
        seedRealtimeState({ 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        renderOutput();
        fireEvent.click(screen.getByText('Response Headers'));
        expect(screen.getByText('content-type')).toBeInTheDocument();
        expect(screen.getByText('text/event-stream')).toBeInTheDocument();
        expect(screen.getByText('cache-control')).toBeInTheDocument();
        expect(screen.getByText('no-cache')).toBeInTheDocument();
    });

    it('shows headers placeholder when responseHeaders is null', () => {
        seedRealtimeState(null);
        renderOutput();
        fireEvent.click(screen.getByText('Response Headers'));
        expect(
            screen.getByText('Response headers will appear here after connecting.')
        ).toBeInTheDocument();
    });
});
