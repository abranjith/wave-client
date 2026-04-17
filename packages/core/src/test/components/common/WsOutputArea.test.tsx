/**
 * Unit tests for WsOutputArea component.
 *
 * Tested scenarios:
 *  1.  Shows "No messages yet" placeholder by default (Messages tab active).
 *  2.  "Connect to a WebSocket endpoint…" subtext is visible with the placeholder.
 *  3.  Clicking the "Response Headers" tab switches to header view.
 *  4.  Header view shows key/value pairs when responseHeaders is non-empty.
 *  5.  Header view shows placeholder text when responseHeaders is empty/null.
 *  6.  WsMessageTimeline is rendered in the Messages tab.
 *  7.  WsMessageComposer is rendered in the Messages tab.
 *  8.  WsMessageComposer is disabled when status is 'idle'.
 *  9.  WsMessageComposer is enabled when status is 'connected'.
 *
 * Strategy:
 *  - Zustand store is seeded with realtimeState via useAppStateStore.setState.
 *  - No adapter wrapping needed (component reads directly from Zustand).
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import WsOutputArea from '../../../components/common/WsOutputArea';
import type { RealtimeTabState } from '../../../types/realtime';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TAB_ID = 'ws-tab-1';

function seedRealtimeState(
    overrides: Partial<RealtimeTabState> = {}
) {
    const entry: RealtimeTabState = {
        tabId: TAB_ID,
        protocol: 'ws',
        connectionId: null,
        status: 'idle',
        responseHeaders: null,
        wsMessages: [],
        sseEvents: [],
        selectedSseEventName: 'all',
        ...overrides,
    };
    useAppStateStore.setState({ realtimeState: { [TAB_ID]: entry } });
}

function renderOutput(onSendMessage = vi.fn()) {
    return render(<WsOutputArea tabId={TAB_ID} onSendMessage={onSendMessage} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WsOutputArea', () => {
    beforeEach(() => {
        useAppStateStore.setState({ realtimeState: {} });
    });

    afterEach(() => {
        useAppStateStore.setState({ realtimeState: {} });
    });

    it('shows "No messages yet" placeholder by default', () => {
        seedRealtimeState();
        renderOutput();
        expect(screen.getByText('No messages yet')).toBeInTheDocument();
    });

    it('shows the WebSocket connection subtext with the placeholder', () => {
        seedRealtimeState();
        renderOutput();
        expect(
            screen.getByText('Connect to a WebSocket endpoint to see messages here.')
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
        seedRealtimeState({ responseHeaders: { 'content-type': 'application/json', 'x-custom': 'value123' } });
        renderOutput();
        fireEvent.click(screen.getByText('Response Headers'));
        expect(screen.getByText('content-type')).toBeInTheDocument();
        expect(screen.getByText('application/json')).toBeInTheDocument();
        expect(screen.getByText('x-custom')).toBeInTheDocument();
        expect(screen.getByText('value123')).toBeInTheDocument();
    });

    it('shows headers placeholder when responseHeaders is null', () => {
        seedRealtimeState({ responseHeaders: null });
        renderOutput();
        fireEvent.click(screen.getByText('Response Headers'));
        expect(
            screen.getByText('Response headers will appear here after connecting.')
        ).toBeInTheDocument();
    });

    it('renders WsMessageTimeline in the Messages tab (empty-state text visible)', () => {
        seedRealtimeState();
        renderOutput();
        // The WsMessageTimeline empty-state is shown when there are no messages
        expect(screen.getByText('No messages yet')).toBeInTheDocument();
    });

    it('renders WsMessageComposer in the Messages tab', () => {
        seedRealtimeState();
        renderOutput();
        // The composer textarea placeholder is always rendered
        expect(
            screen.getByPlaceholderText('Type a message and press Enter to send…')
        ).toBeInTheDocument();
    });

    it('WsMessageComposer is disabled when status is "idle"', () => {
        seedRealtimeState({ status: 'idle' });
        renderOutput();
        const textarea = screen.getByPlaceholderText('Type a message and press Enter to send…');
        expect(textarea).toBeDisabled();
    });

    it('WsMessageComposer is enabled when status is "connected"', () => {
        seedRealtimeState({ status: 'connected', connectionId: 'conn-1' });
        renderOutput();
        const textarea = screen.getByPlaceholderText('Type a message and press Enter to send…');
        expect(textarea).not.toBeDisabled();
    });

    it('renders a connection error panel when realtime status is error', () => {
        seedRealtimeState({ status: 'error', error: 'connect ECONNREFUSED 127.0.0.1:7192' });
        renderOutput();

        expect(screen.getByText('WebSocket connection failed')).toBeInTheDocument();
        expect(screen.getByText('connect ECONNREFUSED 127.0.0.1:7192')).toBeInTheDocument();
    });
});

