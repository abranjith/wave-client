/**
 * Unit tests for RequestHeaders — Copy/Paste relocation into the table header.
 *
 * Mirrors RequestParams.test.tsx — the two editors share the same relocation
 * pattern (Copy/Paste icon buttons inside the "Actions" header cell).
 *
 * Tested scenarios:
 *  1.  Copy/Paste controls render inside the "Actions" table-header cell.
 *  2.  Copy is disabled when there are no enabled, non-empty headers.
 *  3.  Copy is enabled once a header has a key.
 *  4.  Clicking Paste runs the clipboard-adapter logic and appends parsed rows.
 *  5.  A clipboard read failure surfaces an error notification.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import RequestHeaders from '../../../components/common/RequestHeaders';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import { createEmptyTab, createEmptyHeaderRow } from '../../../types/tab';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter } from '../../mocks/mockAdapter';
import type { HeaderRow } from '../../../types/collection';

// ── Mocks ────────────────────────────────────────────────────────────────────

// StyledAutocompleteInput (header-name input) observes its own width via
// ResizeObserver, which jsdom does not implement. Provide a no-op stub.
class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (ResizeObserverStub as unknown as typeof ResizeObserver);

vi.mock('../../../components/ui/tooltip', () => ({
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
        asChild ? <>{children}</> : <div>{children}</div>,
    TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeHeader(key: string, value: string): HeaderRow {
    return { ...createEmptyHeaderRow(), key, value };
}

function seedTab(headers: HeaderRow[]) {
    const tab = { ...createEmptyTab(), headers };
    useAppStateStore.setState({ tabs: [tab], activeTabId: tab.id });
    return tab;
}

function renderHeaders(clipboardText = '') {
    const mock = createMockAdapter({ clipboard: { initialText: clipboardText } });
    const result = render(
        <AdapterProvider adapter={mock.adapter}>
            <RequestHeaders />
        </AdapterProvider>
    );
    return { ...result, ...mock };
}

/** Returns the <tr> that holds the table header (the row containing "Actions"). */
function getHeaderRow(): HTMLElement {
    return screen.getByText('Actions').closest('tr') as HTMLElement;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RequestHeaders — copy/paste in table header', () => {
    beforeEach(() => {
        useAppStateStore.setState({ tabs: [], activeTabId: undefined });
    });

    afterEach(() => {
        useAppStateStore.setState({ tabs: [], activeTabId: undefined });
        vi.clearAllMocks();
    });

    it('renders Copy and Paste controls inside the Actions header cell', () => {
        seedTab([makeHeader('Content-Type', 'application/json')]);
        renderHeaders();

        const headerButtons = within(getHeaderRow()).getAllByRole('button');
        expect(headerButtons).toHaveLength(2);
    });

    it('does not render a standalone toolbar row above the table', () => {
        seedTab([makeHeader('Content-Type', 'application/json')]);
        const { container } = renderHeaders();

        const root = container.firstElementChild as HTMLElement;
        expect(root.querySelector('table')).not.toBeNull();
    });

    it('disables Copy when there are no enabled, non-empty headers', () => {
        seedTab([createEmptyHeaderRow()]);
        renderHeaders();

        const [copyBtn] = within(getHeaderRow()).getAllByRole('button');
        expect(copyBtn).toBeDisabled();
    });

    it('enables Copy once a header has a key', () => {
        seedTab([makeHeader('Content-Type', 'application/json')]);
        renderHeaders();

        const [copyBtn] = within(getHeaderRow()).getAllByRole('button');
        expect(copyBtn).toBeEnabled();
    });

    it('does not mark the tab dirty when a header input blurs without changes', async () => {
        seedTab([makeHeader('Content-Type', 'application/json')]);
        renderHeaders();

        const keyInput = screen.getByDisplayValue('Content-Type');
        fireEvent.focus(keyInput);
        fireEvent.blur(keyInput);

        await waitFor(() => {
            const activeTab = useAppStateStore.getState().tabs[0];
            expect(activeTab.isDirty).toBe(false);
            expect(activeTab.headers).toHaveLength(1);
        });
    });

    it('marks the tab dirty when a header value actually changes before blur', async () => {
        seedTab([makeHeader('Content-Type', 'application/json')]);
        renderHeaders();

        const valueInput = screen.getByDisplayValue('application/json');
        fireEvent.change(valueInput, { target: { value: 'text/plain' } });
        fireEvent.blur(valueInput);

        await waitFor(() => {
            const activeTab = useAppStateStore.getState().tabs[0];
            expect(activeTab.isDirty).toBe(true);
            expect(activeTab.headers.some((h) => h.value === 'text/plain')).toBe(true);
        });
    });

    it('appends parsed rows when Paste is clicked (behavioral pin)', async () => {
        seedTab([createEmptyHeaderRow()]);
        renderHeaders('X-One: 1\nX-Two: 2');

        const [, pasteBtn] = within(getHeaderRow()).getAllByRole('button');
        fireEvent.click(pasteBtn);

        await waitFor(() => {
            const keys = useAppStateStore.getState().tabs[0].headers.map((h) => h.key);
            expect(keys).toContain('X-One');
            expect(keys).toContain('X-Two');
        });
    });

    it('shows an error notification when the clipboard read fails', async () => {
        seedTab([createEmptyHeaderRow()]);
        const mock = createMockAdapter({ clipboard: { failOnRead: true } });
        render(
            <AdapterProvider adapter={mock.adapter}>
                <RequestHeaders />
            </AdapterProvider>
        );

        const [, pasteBtn] = within(getHeaderRow()).getAllByRole('button');
        fireEvent.click(pasteBtn);

        await waitFor(() => {
            expect(mock.notificationLog.some((n) => n.type === 'error')).toBe(true);
        });
    });
});
