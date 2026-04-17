/**
 * Unit tests for ProtocolSelector component.
 *
 * Tested scenarios:
 *  1. Renders without crashing when an HTTP tab is active.
 *  2. Shows "HTTP" as the current selection when protocol is 'http'.
 *  3. Shows "WebSocket" as the current selection when protocol is 'ws'.
 *  4. Shows "SSE" as the current selection when protocol is 'sse'.
 *  5. Calls updateProtocol('ws') when the WS option is selected.
 *  6. Calls updateProtocol('sse') when the SSE option is selected.
 *  7. Calls updateProtocol('http') when the HTTP option is selected.
 *  8. Renders null when there is no active tab.
 *
 * Strategy:
 *  - Radix UI Select is stubbed with a plain <select> element so JSDOM can
 *    interact with it without hover/keyboard navigation.
 *  - The Zustand store is seeded via useAppStateStore.setState and reset afterEach.
 *  - updateProtocol is intercepted via vi.spyOn to verify invocation.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter } from '../../mocks/mockAdapter';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import ProtocolSelector from '../../../components/common/ProtocolSelector';
import { createEmptyTab } from '../../../types/tab';
import type { RequestProtocol } from '../../../types/collection';

// ── Mocks ────────────────────────────────────────────────────────────────────

/**
 * Stub the Radix Select with a plain <select> element.
 * - SelectTrigger is rendered as a <div> (display-only).
 * - SelectValue reads `data-value` from its context — not needed for testing.
 * - Select itself holds `value`/`onValueChange` and renders a <select>.
 */
vi.mock('../../../components/ui/select', () => ({
    Select: ({
        value,
        onValueChange,
        children,
    }: {
        value: string;
        onValueChange: (val: string) => void;
        children: React.ReactNode;
    }) => (
        <select
            data-testid="protocol-select"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
        >
            {children}
        </select>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem: ({
        value,
        children,
    }: {
        value: string;
        children: React.ReactNode;
    }) => <option value={value}>{children}</option>,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockAdapter = createMockAdapter().adapter;

function seedTab(protocol: RequestProtocol) {
    const tab = { ...createEmptyTab(), protocol };
    useAppStateStore.setState({
        tabs: [tab],
        activeTabId: tab.id,
    });
}

function renderSelector() {
    return render(
        <AdapterProvider adapter={mockAdapter}>
            <ProtocolSelector />
        </AdapterProvider>
    );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProtocolSelector', () => {
    beforeEach(() => {
        useAppStateStore.setState({ tabs: [], activeTabId: undefined });
    });

    afterEach(() => {
        useAppStateStore.setState({ tabs: [], activeTabId: undefined });
    });

    it('renders without crashing when an HTTP tab is active', () => {
        seedTab('http');
        const { container } = renderSelector();
        expect(container).toBeTruthy();
    });

    it('shows "http" as selected value when protocol is "http"', () => {
        seedTab('http');
        renderSelector();
        const select = screen.getByTestId('protocol-select') as HTMLSelectElement;
        expect(select.value).toBe('http');
    });

    it('shows "ws" as selected value when protocol is "ws"', () => {
        seedTab('ws');
        renderSelector();
        const select = screen.getByTestId('protocol-select') as HTMLSelectElement;
        expect(select.value).toBe('ws');
    });

    it('shows "sse" as selected value when protocol is "sse"', () => {
        seedTab('sse');
        renderSelector();
        const select = screen.getByTestId('protocol-select') as HTMLSelectElement;
        expect(select.value).toBe('sse');
    });

    it('calls updateProtocol("ws") when the WebSocket option is selected', () => {
        seedTab('http');
        const updateProtocol = vi.spyOn(useAppStateStore.getState(), 'updateProtocol');
        renderSelector();
        const select = screen.getByTestId('protocol-select');
        fireEvent.change(select, { target: { value: 'ws' } });
        expect(updateProtocol).toHaveBeenCalledWith('ws');
        updateProtocol.mockRestore();
    });

    it('calls updateProtocol("sse") when the SSE option is selected', () => {
        seedTab('http');
        const updateProtocol = vi.spyOn(useAppStateStore.getState(), 'updateProtocol');
        renderSelector();
        const select = screen.getByTestId('protocol-select');
        fireEvent.change(select, { target: { value: 'sse' } });
        expect(updateProtocol).toHaveBeenCalledWith('sse');
        updateProtocol.mockRestore();
    });

    it('calls updateProtocol("http") when the HTTP option is selected from WS', () => {
        seedTab('ws');
        const updateProtocol = vi.spyOn(useAppStateStore.getState(), 'updateProtocol');
        renderSelector();
        const select = screen.getByTestId('protocol-select');
        fireEvent.change(select, { target: { value: 'http' } });
        expect(updateProtocol).toHaveBeenCalledWith('http');
        updateProtocol.mockRestore();
    });

    it('renders null when there is no active tab', () => {
        useAppStateStore.setState({ tabs: [], activeTabId: undefined });
        const { container } = renderSelector();
        // Nothing should be in the DOM
        expect(container.firstChild).toBeNull();
    });
});
