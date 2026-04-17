/**
 * Unit tests for ConnectionControls component.
 *
 * Tested scenarios:
 *  1.  Shows "Connect" button and "Idle" label when status is 'idle'.
 *  2.  Shows "Connect" button and "Disconnected" label when status is 'disconnected'.
 *  3.  Shows "Connect" button and "Error" label when status is 'error'.
 *  4.  Shows "Disconnect" button and "Connected" label when status is 'connected'.
 *  5.  Shows "Disconnect" button and "Connecting…" label when status is 'connecting'.
 *  6.  Shows "Disconnect" button and "Disconnecting…" label when status is 'disconnecting'.
 *  7.  Connect button is disabled when disabled={true}.
 *  8.  Button is disabled when status is 'connecting' (transitional).
 *  9.  Button is disabled when status is 'disconnecting' (transitional).
 * 10.  Clicking Connect calls onConnect.
 * 11.  Clicking Disconnect calls onDisconnect.
 * 12.  Status dot has the correct aria-label for each status variant.
 *
 * Strategy:
 *  - PrimaryButton is stubbed so JSDOM renders it as a plain <button>.
 *  - Zustand store is seeded with realtimeState entries via useAppStateStore.setState.
 *  - Callbacks are vi.fn() spies.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import ConnectionControls from '../../../components/common/ConnectionControls';
import type { ConnectionStatus, RealtimeTabState } from '../../../types/realtime';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../components/ui/PrimaryButton', () => ({
    PrimaryButton: ({
        onClick,
        text,
        disabled,
    }: {
        onClick: () => void;
        text?: string;
        disabled?: boolean;
        [key: string]: unknown;
    }) => (
        <button onClick={onClick} disabled={disabled} data-testid="action-button">
            {text}
        </button>
    ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const TAB_ID = 'test-tab-1';

function seedRealtimeState(status: ConnectionStatus) {
    const entry: RealtimeTabState = {
        tabId: TAB_ID,
        protocol: 'ws',
        connectionId: null,
        status,
        responseHeaders: null,
        wsMessages: [],
        sseEvents: [],
        selectedSseEventName: 'all',
    };
    useAppStateStore.setState({
        realtimeState: { [TAB_ID]: entry },
    });
}

function renderControls(props: {
    onConnect?: () => void;
    onDisconnect?: () => void;
    disabled?: boolean;
} = {}) {
    const onConnect = props.onConnect ?? vi.fn();
    const onDisconnect = props.onDisconnect ?? vi.fn();
    render(
        <ConnectionControls
            tabId={TAB_ID}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            disabled={props.disabled}
        />
    );
    return { onConnect, onDisconnect };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConnectionControls', () => {
    beforeEach(() => {
        useAppStateStore.setState({ realtimeState: {} });
    });

    afterEach(() => {
        useAppStateStore.setState({ realtimeState: {} });
    });

    it('shows "Connect" button and "Idle" label when status is idle', () => {
        seedRealtimeState('idle');
        renderControls();
        expect(screen.getByTestId('action-button')).toHaveTextContent('Connect');
        expect(screen.getByText('Idle')).toBeInTheDocument();
    });

    it('shows "Connect" button when status is disconnected', () => {
        seedRealtimeState('disconnected');
        renderControls();
        expect(screen.getByTestId('action-button')).toHaveTextContent('Connect');
        expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });

    it('shows "Connect" button and "Error" label when status is error', () => {
        seedRealtimeState('error');
        renderControls();
        expect(screen.getByTestId('action-button')).toHaveTextContent('Connect');
        expect(screen.getByText('Error')).toBeInTheDocument();
    });

    it('shows error details in status text when available', () => {
        const entry: RealtimeTabState = {
            tabId: TAB_ID,
            protocol: 'ws',
            connectionId: null,
            status: 'error',
            responseHeaders: null,
            wsMessages: [],
            sseEvents: [],
            selectedSseEventName: 'all',
            error: 'connect ECONNREFUSED 127.0.0.1:7192',
        };
        useAppStateStore.setState({ realtimeState: { [TAB_ID]: entry } });

        renderControls();
        expect(
            screen.getByText('Error: connect ECONNREFUSED 127.0.0.1:7192')
        ).toBeInTheDocument();
    });

    it('shows "Disconnect" button and "Connected" label when status is connected', () => {
        seedRealtimeState('connected');
        renderControls();
        expect(screen.getByTestId('action-button')).toHaveTextContent('Disconnect');
        expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('shows "Disconnect" button and "Connecting…" label when status is connecting', () => {
        seedRealtimeState('connecting');
        renderControls();
        expect(screen.getByTestId('action-button')).toHaveTextContent('Disconnect');
        expect(screen.getByText('Connecting…')).toBeInTheDocument();
    });

    it('shows "Disconnect" button and "Disconnecting…" label when status is disconnecting', () => {
        seedRealtimeState('disconnecting');
        renderControls();
        expect(screen.getByTestId('action-button')).toHaveTextContent('Disconnect');
        expect(screen.getByText('Disconnecting…')).toBeInTheDocument();
    });

    it('button is disabled when disabled prop is true', () => {
        seedRealtimeState('idle');
        renderControls({ disabled: true });
        expect(screen.getByTestId('action-button')).toBeDisabled();
    });

    it('button is disabled when status is connecting (transitional)', () => {
        seedRealtimeState('connecting');
        renderControls();
        expect(screen.getByTestId('action-button')).toBeDisabled();
    });

    it('button is disabled when status is disconnecting (transitional)', () => {
        seedRealtimeState('disconnecting');
        renderControls();
        expect(screen.getByTestId('action-button')).toBeDisabled();
    });

    it('clicking Connect calls onConnect', () => {
        seedRealtimeState('idle');
        const onConnect = vi.fn();
        renderControls({ onConnect });
        fireEvent.click(screen.getByTestId('action-button'));
        expect(onConnect).toHaveBeenCalledOnce();
    });

    it('clicking Disconnect calls onDisconnect', () => {
        seedRealtimeState('connected');
        const onDisconnect = vi.fn();
        renderControls({ onDisconnect });
        fireEvent.click(screen.getByTestId('action-button'));
        expect(onDisconnect).toHaveBeenCalledOnce();
    });

    it('status indicator has correct aria-label for each status', () => {
        const cases: [ConnectionStatus, string][] = [
            ['idle', 'Connection status: Idle'],
            ['connecting', 'Connection status: Connecting…'],
            ['connected', 'Connection status: Connected'],
            ['disconnecting', 'Connection status: Disconnecting…'],
            ['disconnected', 'Connection status: Disconnected'],
            ['error', 'Connection status: Error'],
        ];

        for (const [status, expectedLabel] of cases) {
            seedRealtimeState(status);
            const { unmount } = render(
                <ConnectionControls
                    tabId={TAB_ID}
                    onConnect={vi.fn()}
                    onDisconnect={vi.fn()}
                />
            );
            expect(screen.getByLabelText(expectedLabel)).toBeInTheDocument();
            unmount();
        }
    });
});
