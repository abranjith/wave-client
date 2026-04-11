/**
 * Unit tests for HistoryPane — FEAT-006 per-item removal coverage.
 *
 * Protects against the following regressions:
 *  - Remove button missing from history rows.
 *  - Remove click triggering row selection (onRequestSelect).
 *  - Adapter deleteHistoryItem not called with the correct request ID.
 *  - Store not updated after successful adapter deletion.
 *  - Failed adapter delete mutating the store or silently swallowing the error.
 *  - Sibling history items being removed when only one item is deleted.
 *
 * Tested scenarios:
 *  1.  A remove button is rendered for each history row.
 *  2.  Clicking the remove button calls adapter.deleteHistoryItem with the correct request ID.
 *  3.  A successful delete removes only the target row; siblings remain.
 *  4.  A failed delete shows an error notification.
 *  5.  A failed delete does NOT remove the row from the store.
 *  6.  Clicking the remove button does NOT invoke onRequestSelect.
 *  7.  Clicking a row (outside the remove button) DOES invoke onRequestSelect.
 *  8.  When history is empty the empty-state placeholder is shown.
 *  9.  When history is loading the loading spinner is shown.
 * 10.  When history errors the error message is shown.
 *
 * Strategy:
 *  - The remove button is a plain <button> with aria-label — no UI primitive mocking needed.
 *  - Adapter calls are verified via vi.spyOn on the mock adapter's storage interface.
 *  - Zustand store is seeded via useAppStateStore.setState and reset in afterEach.
 *  - Button component (retry) is stubbed so it renders without Radix internals.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter } from '../../mocks/mockAdapter';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import HistoryPane from '../../../components/common/HistoryPane';
import type { CollectionRequest } from '../../../types/collection';
import { err } from '../../../utils/result';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../components/ui/button', () => ({
    Button: ({
        children,
        onClick,
    }: {
        children: React.ReactNode;
        onClick?: () => void;
    }) => <button onClick={onClick}>{children}</button>,
}));

// ── Test Data ─────────────────────────────────────────────────────────────────

const HISTORY_ITEM_1: CollectionRequest = {
    id: 'hist-req-001',
    name: 'GET Users',
    method: 'GET',
    url: 'https://api.example.com/users',
    header: [],
};

const HISTORY_ITEM_2: CollectionRequest = {
    id: 'hist-req-002',
    name: 'POST Login',
    method: 'POST',
    url: 'https://api.example.com/login',
    header: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function seedStore(history: CollectionRequest[] = [HISTORY_ITEM_1, HISTORY_ITEM_2]) {
    useAppStateStore.setState({
        history,
        isHistoryLoading: false,
        historyLoadError: null,
    });
}

function renderPane(
    mockAdapterResult?: ReturnType<typeof createMockAdapter>,
    onRequestSelect?: (req: CollectionRequest) => void,
) {
    const result = mockAdapterResult ?? createMockAdapter({ initialData: { history: [HISTORY_ITEM_1, HISTORY_ITEM_2] } });
    const { adapter, notificationLog } = result;

    const renderResult = render(
        <AdapterProvider adapter={adapter}>
            <HistoryPane onRequestSelect={onRequestSelect ?? vi.fn()} />
        </AdapterProvider>,
    );

    return { ...renderResult, adapter, notificationLog };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HistoryPane — FEAT-006 per-item removal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        seedStore();
    });

    afterEach(() => {
        useAppStateStore.setState({ history: [], isHistoryLoading: false, historyLoadError: null });
    });

    // ── Remove button presence ────────────────────────────────────────────────

    it('renders a remove button for each history row', () => {
        renderPane();
        const removeButtons = screen.getAllByRole('button', { name: 'Remove history item' });
        expect(removeButtons).toHaveLength(2);
    });

    it('renders one remove button per row when only one item is present', () => {
        useAppStateStore.setState({ history: [HISTORY_ITEM_1] });
        renderPane();
        const removeButtons = screen.getAllByRole('button', { name: 'Remove history item' });
        expect(removeButtons).toHaveLength(1);
    });

    // ── Adapter call on remove ────────────────────────────────────────────────

    it('clicking the remove button calls adapter.deleteHistoryItem with the correct request ID', async () => {
        const mock = createMockAdapter({ initialData: { history: [HISTORY_ITEM_1, HISTORY_ITEM_2] } });
        const deleteSpy = vi.spyOn(mock.adapter.storage, 'deleteHistoryItem');
        renderPane(mock);

        const [firstRemoveBtn] = screen.getAllByRole('button', { name: 'Remove history item' });
        fireEvent.click(firstRemoveBtn);

        await waitFor(() => expect(deleteSpy).toHaveBeenCalledOnce());
        expect(deleteSpy).toHaveBeenCalledWith(HISTORY_ITEM_1.id);
    });

    // ── Successful delete ─────────────────────────────────────────────────────

    it('after a successful delete the target row is removed from the store', async () => {
        renderPane();

        const [firstRemoveBtn] = screen.getAllByRole('button', { name: 'Remove history item' });
        fireEvent.click(firstRemoveBtn);

        await waitFor(() =>
            expect(useAppStateStore.getState().history).toHaveLength(1),
        );
        expect(useAppStateStore.getState().history[0].id).toBe(HISTORY_ITEM_2.id);
    });

    it('only the target row is removed; sibling rows remain in the pane', async () => {
        renderPane();

        expect(screen.getByText('GET Users')).toBeInTheDocument();
        expect(screen.getByText('POST Login')).toBeInTheDocument();

        const [firstRemoveBtn] = screen.getAllByRole('button', { name: 'Remove history item' });
        fireEvent.click(firstRemoveBtn);

        await waitFor(() => expect(screen.queryByText('GET Users')).toBeNull());
        expect(screen.getByText('POST Login')).toBeInTheDocument();
    });

    // ── Failed delete ─────────────────────────────────────────────────────────

    it('a failed adapter delete shows an error notification', async () => {
        const mock = createMockAdapter({ initialData: { history: [HISTORY_ITEM_1, HISTORY_ITEM_2] } });
        vi.spyOn(mock.adapter.storage, 'deleteHistoryItem').mockResolvedValueOnce(
            err('Storage error'),
        );
        renderPane(mock);

        const [firstRemoveBtn] = screen.getAllByRole('button', { name: 'Remove history item' });
        fireEvent.click(firstRemoveBtn);

        await waitFor(() => expect(mock.notificationLog).toHaveLength(1));
        expect(mock.notificationLog[0].type).toBe('error');
        expect(mock.notificationLog[0].message).toContain('Storage error');
    });

    it('a failed adapter delete does NOT remove the row from the store', async () => {
        const mock = createMockAdapter({ initialData: { history: [HISTORY_ITEM_1, HISTORY_ITEM_2] } });
        vi.spyOn(mock.adapter.storage, 'deleteHistoryItem').mockResolvedValueOnce(
            err('Storage error'),
        );
        renderPane(mock);

        const [firstRemoveBtn] = screen.getAllByRole('button', { name: 'Remove history item' });
        fireEvent.click(firstRemoveBtn);

        await waitFor(() => expect(mock.notificationLog).toHaveLength(1));
        // Both items should still be present
        expect(useAppStateStore.getState().history).toHaveLength(2);
    });

    // ── Event propagation ─────────────────────────────────────────────────────

    it('clicking the remove button does NOT invoke onRequestSelect', async () => {
        const onRequestSelect = vi.fn();
        const mock = createMockAdapter({ initialData: { history: [HISTORY_ITEM_1, HISTORY_ITEM_2] } });
        renderPane(mock, onRequestSelect);

        const [firstRemoveBtn] = screen.getAllByRole('button', { name: 'Remove history item' });
        fireEvent.click(firstRemoveBtn);

        // Wait for adapter to settle
        await waitFor(() =>
            expect(useAppStateStore.getState().history).toHaveLength(1),
        );
        expect(onRequestSelect).not.toHaveBeenCalled();
    });

    it('clicking a row (outside the remove button) DOES invoke onRequestSelect', async () => {
        const onRequestSelect = vi.fn();
        renderPane(undefined, onRequestSelect);

        // Click the method badge text to simulate row click (not remove button)
        fireEvent.click(screen.getByText('GET'));

        await waitFor(() => expect(onRequestSelect).toHaveBeenCalledOnce());
        expect(onRequestSelect).toHaveBeenCalledWith(HISTORY_ITEM_1);
    });

    // ── Loading / error / empty states ────────────────────────────────────────

    it('shows the loading spinner when isHistoryLoading is true', () => {
        useAppStateStore.setState({ isHistoryLoading: true, history: [] });
        renderPane();
        expect(screen.getByText('Loading history...')).toBeInTheDocument();
    });

    it('shows the error message when historyLoadError is set', () => {
        useAppStateStore.setState({ historyLoadError: 'Network error', history: [] });
        renderPane();
        expect(screen.getByText('Error loading history')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    it('shows the empty-state placeholder when history is empty', () => {
        useAppStateStore.setState({ history: [] });
        renderPane();
        expect(screen.getByText('No history found')).toBeInTheDocument();
    });
});
