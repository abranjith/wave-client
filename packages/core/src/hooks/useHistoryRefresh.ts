import { useCallback } from 'react';
import { useStorageAdapter } from './useAdapter';
import useAppStateStore from './store/useAppStateStore';
import type { CollectionRequest } from '../types/collection';
import { err, ok, type Result } from '../utils/result';

export interface UseHistoryRefreshResult {
    refreshHistory: () => Promise<Result<void, string>>;
    saveRequestToHistoryAndRefresh: (request: CollectionRequest) => Promise<Result<void, string>>;
}

/**
 * Keeps history state in sync with persisted storage using a pull-based pattern.
 *
 * @returns Helpers to refresh history from storage and to persist+refresh in one call.
 *
 * @example
 * const { saveRequestToHistoryAndRefresh } = useHistoryRefresh();
 * const result = await saveRequestToHistoryAndRefresh(request);
 * if (!result.isOk) {
 *   console.warn(result.error);
 * }
 */
export function useHistoryRefresh(): UseHistoryRefreshResult {
    const storage = useStorageAdapter();
    const setHistory = useAppStateStore((state) => state.setHistory);

    const refreshHistory = useCallback(async (): Promise<Result<void, string>> => {
        const historyResult = await storage.loadHistory();
        if (!historyResult.isOk) {
            return err(historyResult.error);
        }

        setHistory(historyResult.value);
        return ok(undefined);
    }, [setHistory, storage]);

    const saveRequestToHistoryAndRefresh = useCallback(
        async (request: CollectionRequest): Promise<Result<void, string>> => {
            const saveResult = await storage.saveRequestToHistory(request);
            if (!saveResult.isOk) {
                return err(saveResult.error);
            }

            return refreshHistory();
        },
        [refreshHistory, storage],
    );

    return {
        refreshHistory,
        saveRequestToHistoryAndRefresh,
    };
}
