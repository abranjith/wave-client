import { StateCreator } from 'zustand'
import { CollectionRequest } from '../../types/collection';

interface HistorySlice {
    history: CollectionRequest[];
    isHistoryLoading: boolean;
    historyLoadError: string | null;
    setHistory: (history: CollectionRequest[]) => void;
    setIsHistoryLoading: (isLoading: boolean) => void;
    setHistoryLoadError: (error: string | null) => void;
}

const createHistorySlice: StateCreator<HistorySlice> = (set) => ({
    history: [],
    isHistoryLoading: false,
    historyLoadError: null,

    setHistory: (history) => set({ history, historyLoadError: null, isHistoryLoading: false }),
    
    setIsHistoryLoading: (isLoading) => set({ 
        isHistoryLoading: isLoading,
        ...(isLoading ? { historyLoadError: null } : {})
    }),
    
    setHistoryLoadError: (error) => set({ historyLoadError: error, isHistoryLoading: false }),
});

export default createHistorySlice;
