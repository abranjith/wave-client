/**
 * Unit tests for createHistorySlice — FEAT-006 removeHistoryItem action.
 *
 * Tested scenarios:
 *  1.  removeHistoryItem filters the target item from the history array.
 *  2.  Non-target items remain in state after removal.
 *  3.  Calling removeHistoryItem with a non-existent ID is a no-op (no crash, state unchanged).
 *  4.  removeHistoryItem on an empty array is a no-op.
 *  5.  Removing the only item leaves an empty history array.
 *  6.  Removing from a list of three preserves order of remaining items.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import type { CollectionRequest } from '../../../types/collection';

// ── Test Data ─────────────────────────────────────────────────────────────────

const mkRequest = (id: string, name: string): CollectionRequest => ({
    id,
    name,
    method: 'GET',
    url: `https://example.com/${id}`,
    header: [],
});

const REQ_A = mkRequest('req-aaa', 'Request A');
const REQ_B = mkRequest('req-bbb', 'Request B');
const REQ_C = mkRequest('req-ccc', 'Request C');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createHistorySlice — removeHistoryItem', () => {
    beforeEach(() => {
        useAppStateStore.setState({
            history: [REQ_A, REQ_B, REQ_C],
            isHistoryLoading: false,
            historyLoadError: null,
        });
    });

    it('removes the item with the matching ID', () => {
        useAppStateStore.getState().removeHistoryItem('req-bbb');
        const { history } = useAppStateStore.getState();
        expect(history.map((r) => r.id)).not.toContain('req-bbb');
    });

    it('non-target items remain after removal', () => {
        useAppStateStore.getState().removeHistoryItem('req-bbb');
        const { history } = useAppStateStore.getState();
        expect(history.map((r) => r.id)).toContain('req-aaa');
        expect(history.map((r) => r.id)).toContain('req-ccc');
    });

    it('does not crash when given a non-existent ID', () => {
        expect(() =>
            useAppStateStore.getState().removeHistoryItem('does-not-exist'),
        ).not.toThrow();
        // State unchanged — all three items remain
        expect(useAppStateStore.getState().history).toHaveLength(3);
    });

    it('is a no-op on an empty history array', () => {
        useAppStateStore.setState({ history: [] });
        expect(() =>
            useAppStateStore.getState().removeHistoryItem('req-aaa'),
        ).not.toThrow();
        expect(useAppStateStore.getState().history).toHaveLength(0);
    });

    it('removing the only item leaves an empty history array', () => {
        useAppStateStore.setState({ history: [REQ_A] });
        useAppStateStore.getState().removeHistoryItem('req-aaa');
        expect(useAppStateStore.getState().history).toHaveLength(0);
    });

    it('preserves the order of remaining items after removal', () => {
        // Remove middle item — A and C must maintain their relative order
        useAppStateStore.getState().removeHistoryItem('req-bbb');
        const ids = useAppStateStore.getState().history.map((r) => r.id);
        expect(ids).toEqual(['req-aaa', 'req-ccc']);
    });
});
