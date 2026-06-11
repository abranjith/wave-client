import React, { type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdapterProvider } from '../../hooks/useAdapter';
import { useHistoryRefresh } from '../../hooks/useHistoryRefresh';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { createMockAdapter } from '../mocks/mockAdapter';
import type { CollectionRequest } from '../../types/collection';
import type { Result } from '../../utils/result';
import { err } from '../../utils/result';

const EXISTING_REQUEST: CollectionRequest = {
    id: 'req-existing',
    name: 'Existing Request',
    method: 'GET',
    url: 'https://example.com/existing',
    header: [],
};

const NEW_REQUEST: CollectionRequest = {
    id: 'req-new',
    name: 'New Request',
    method: 'POST',
    url: 'https://example.com/new',
    header: [],
};

function renderHookWithAdapter(adapter: ReturnType<typeof createMockAdapter>['adapter']) {
    return renderHook(() => useHistoryRefresh(), {
        wrapper: ({ children }: { children: ReactNode }) => (
            <AdapterProvider adapter={adapter}>{children}</AdapterProvider>
        ),
    });
}

describe('useHistoryRefresh', () => {
    beforeEach(() => {
        useAppStateStore.setState({
            history: [],
            isHistoryLoading: false,
            historyLoadError: null,
        });
    });

    it('saveRequestToHistoryAndRefresh persists and reloads history after a successful save', async () => {
        const { adapter } = createMockAdapter({
            initialData: {
                history: [EXISTING_REQUEST],
            },
        });

        useAppStateStore.setState({
            history: [EXISTING_REQUEST],
            historyLoadError: null,
        });

        const saveSpy = vi.spyOn(adapter.storage, 'saveRequestToHistory');
        const loadSpy = vi.spyOn(adapter.storage, 'loadHistory');

        const { result } = renderHookWithAdapter(adapter);

        await act(async () => {
            const saveResult = await result.current.saveRequestToHistoryAndRefresh(NEW_REQUEST);
            expect(saveResult.isOk).toBe(true);
        });

        expect(saveSpy).toHaveBeenCalledWith(NEW_REQUEST);
        expect(loadSpy).toHaveBeenCalledTimes(1);
        expect(saveSpy.mock.invocationCallOrder[0]).toBeLessThan(loadSpy.mock.invocationCallOrder[0]);

        const { history, historyLoadError } = useAppStateStore.getState();
        expect(history[0]?.id).toBe('req-new');
        expect(history[1]?.id).toBe('req-existing');
        expect(historyLoadError).toBeNull();
    });

    it('returns an error and keeps visible history state unchanged when refresh fails after save', async () => {
        const { adapter } = createMockAdapter({
            initialData: {
                history: [EXISTING_REQUEST],
            },
        });

        useAppStateStore.setState({
            history: [EXISTING_REQUEST],
            historyLoadError: null,
        });

        const saveSpy = vi.spyOn(adapter.storage, 'saveRequestToHistory');
        const loadSpy = vi.spyOn(adapter.storage, 'loadHistory').mockResolvedValue(err('history load failed'));

        const { result } = renderHookWithAdapter(adapter);

        let saveResult: Result<void, string> | undefined;
        await act(async () => {
            saveResult = await result.current.saveRequestToHistoryAndRefresh(NEW_REQUEST);
        });

        expect(saveSpy).toHaveBeenCalledWith(NEW_REQUEST);
        expect(loadSpy).toHaveBeenCalledTimes(1);
        expect(saveResult).toBeDefined();
        expect(saveResult?.isOk).toBe(false);
        if (saveResult && !saveResult.isOk) {
            expect(saveResult.error).toBe('history load failed');
        }

        const { history, historyLoadError } = useAppStateStore.getState();
        expect(history).toEqual([EXISTING_REQUEST]);
        expect(historyLoadError).toBeNull();
    });
});
