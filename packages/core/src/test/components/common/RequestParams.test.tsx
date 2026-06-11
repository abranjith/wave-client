/**
 * Unit tests for RequestParams — Copy/Paste relocation into the table header.
 *
 * Tested scenarios:
 *  1.  Copy/Paste controls render inside the "Actions" table-header cell (not a
 *      standalone toolbar row above the table).
 *  2.  The Copy control is disabled when there are no enabled, non-empty params.
 *  3.  The Copy control is enabled once a param has a key.
 *  4.  Clicking Paste runs the clipboard-adapter logic and appends the parsed
 *      rows (behavioral pin — relocation must not change paste behaviour).
 *  5.  A clipboard read failure surfaces an error notification.
 *
 * Strategy:
 *  - Radix Tooltip is stubbed so the Button renders directly (asChild passthrough).
 *  - Zustand store is seeded via useAppStateStore.setState and reset afterEach.
 *  - Clipboard/notification I/O is provided by createMockAdapter through AdapterProvider.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import RequestParams from '../../../components/common/RequestParams';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import { createEmptyTab, createEmptyParamRow } from '../../../types/tab';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter } from '../../mocks/mockAdapter';
import type { ParamRow } from '../../../types/collection';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../components/ui/tooltip', () => ({
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
        asChild ? <>{children}</> : <div>{children}</div>,
    TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeParam(key: string, value: string): ParamRow {
    return { ...createEmptyParamRow(), key, value };
}

function seedTab(params: ParamRow[]) {
    const tab = { ...createEmptyTab(), params };
    useAppStateStore.setState({ tabs: [tab], activeTabId: tab.id });
    return tab;
}

function renderParams(clipboardText = '') {
    const mock = createMockAdapter({ clipboard: { initialText: clipboardText } });
    const result = render(
        <AdapterProvider adapter={mock.adapter}>
            <RequestParams />
        </AdapterProvider>
    );
    return { ...result, ...mock };
}

/** Returns the <tr> that holds the table header (the row containing "Actions"). */
function getHeaderRow(): HTMLElement {
    return screen.getByText('Actions').closest('tr') as HTMLElement;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RequestParams — copy/paste in table header', () => {
    beforeEach(() => {
        useAppStateStore.setState({ tabs: [], activeTabId: undefined });
    });

    afterEach(() => {
        useAppStateStore.setState({ tabs: [], activeTabId: undefined });
        vi.clearAllMocks();
    });

    it('renders Copy and Paste controls inside the Actions header cell', () => {
        seedTab([makeParam('token', 'abc')]);
        renderParams();

        const headerButtons = within(getHeaderRow()).getAllByRole('button');
        // Exactly the two relocated controls live in the header row.
        expect(headerButtons).toHaveLength(2);
    });

    it('does not render a standalone toolbar row above the table', () => {
        seedTab([makeParam('token', 'abc')]);
        const { container } = renderParams();

        // The first element rendered is the bordered table wrapper, not a toolbar.
        const root = container.firstElementChild as HTMLElement;
        expect(root.querySelector('table')).not.toBeNull();
    });

    it('disables Copy when there are no enabled, non-empty params', () => {
        seedTab([createEmptyParamRow()]);
        renderParams();

        const [copyBtn] = within(getHeaderRow()).getAllByRole('button');
        expect(copyBtn).toBeDisabled();
    });

    it('enables Copy once a param has a key', () => {
        seedTab([makeParam('token', 'abc')]);
        renderParams();

        const [copyBtn] = within(getHeaderRow()).getAllByRole('button');
        expect(copyBtn).toBeEnabled();
    });

    it('appends parsed rows when Paste is clicked (behavioral pin)', async () => {
        seedTab([createEmptyParamRow()]);
        renderParams('alpha=1\nbeta=2');

        const [, pasteBtn] = within(getHeaderRow()).getAllByRole('button');
        fireEvent.click(pasteBtn);

        // The relocation preserves the existing clipboard-read → parse → upsert path.
        await waitFor(() => {
            const keys = useAppStateStore.getState().tabs[0].params.map((p) => p.key);
            expect(keys).toContain('alpha');
            expect(keys).toContain('beta');
        });
    });

    it('shows an error notification when the clipboard read fails', async () => {
        seedTab([createEmptyParamRow()]);
        const mock = createMockAdapter({ clipboard: { failOnRead: true } });
        render(
            <AdapterProvider adapter={mock.adapter}>
                <RequestParams />
            </AdapterProvider>
        );

        const [, pasteBtn] = within(getHeaderRow()).getAllByRole('button');
        fireEvent.click(pasteBtn);

        await waitFor(() => {
            expect(mock.notificationLog.some((n) => n.type === 'error')).toBe(true);
        });
    });
});
