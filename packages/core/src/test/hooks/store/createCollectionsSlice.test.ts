/**
 * Unit tests for createCollectionsSlice — filename-keyed store operations
 * (FEAT-003: display name is never a lookup key; `filename` is the
 * persistence key, `info.waveId` the logical identity).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import type { Collection } from '../../../types/collection';

// ── Test Data ─────────────────────────────────────────────────────────────────

const mkCollection = (filename: string, name: string, waveId: string): Collection => ({
    info: { waveId, name, version: '0.0.1' },
    item: [],
    filename,
});

const COL_A = mkCollection('a.json', 'Alpha', 'wave-a');
const COL_B = mkCollection('b.json', 'Beta', 'wave-b');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createCollectionsSlice — filename-keyed operations', () => {
    beforeEach(() => {
        useAppStateStore.setState({
            collections: [COL_A, COL_B],
            isCollectionsLoading: false,
            collectionLoadError: null,
        });
    });

    it('updates the right collection by filename even when the display name changes', () => {
        // The rename case that broke before: the name is exactly what changes.
        useAppStateStore.getState().updateCollection('a.json', {
            info: { ...COL_A.info, name: 'Alpha Renamed' },
        });

        const collections = useAppStateStore.getState().collections;
        expect(collections.find(c => c.filename === 'a.json')!.info.name).toBe('Alpha Renamed');
        expect(collections.find(c => c.filename === 'b.json')!.info.name).toBe('Beta');
    });

    it('updates items by filename without touching other collections', () => {
        useAppStateStore.getState().updateCollection('b.json', {
            item: [{ id: 'i1', name: 'New Item' }],
        });

        const collections = useAppStateStore.getState().collections;
        expect(collections.find(c => c.filename === 'b.json')!.item).toHaveLength(1);
        expect(collections.find(c => c.filename === 'a.json')!.item).toHaveLength(0);
    });

    it('removes a collection by filename', () => {
        useAppStateStore.getState().removeCollection('a.json');

        const collections = useAppStateStore.getState().collections;
        expect(collections).toHaveLength(1);
        expect(collections[0].filename).toBe('b.json');
    });

    it('is a no-op for an unknown filename', () => {
        useAppStateStore.getState().updateCollection('missing.json', { item: [] });
        useAppStateStore.getState().removeCollection('missing.json');

        expect(useAppStateStore.getState().collections).toHaveLength(2);
    });

    it('tracks collections with identical display names independently', () => {
        const twinA = mkCollection('twin-a.json', 'Twin', 'wave-ta');
        const twinB = mkCollection('twin-b.json', 'Twin', 'wave-tb');
        useAppStateStore.setState({ collections: [twinA, twinB] });

        useAppStateStore.getState().updateCollection('twin-a.json', {
            info: { ...twinA.info, name: 'Twin Renamed' },
        });
        useAppStateStore.getState().removeCollection('twin-b.json');

        const collections = useAppStateStore.getState().collections;
        expect(collections).toHaveLength(1);
        expect(collections[0].filename).toBe('twin-a.json');
        expect(collections[0].info.name).toBe('Twin Renamed');
    });
});
