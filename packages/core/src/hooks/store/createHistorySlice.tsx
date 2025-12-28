import { StateCreator } from 'zustand'
import { ParsedRequest } from '../../types/collection';

interface HistorySlice {
    history: ParsedRequest[];
    isHistoryLoading: boolean;
    historyLoadError: string | null;
    setHistory: (history: ParsedRequest[]) => void;
    addHistory: (request: ParsedRequest, vsCodeApi: any) => void;
    refreshHistory: (vsCodeApi: any) => void;
    setIsHistoryLoading: (isLoading: boolean) => void;
    setHistoryLoadError: (error: string | null) => void;
}

const createHistorySlice: StateCreator<HistorySlice> = (set) => ({
    history: [],
    isHistoryLoading: false,
    historyLoadError: null,

    setHistory: (history) => set({ history, historyLoadError: null, isHistoryLoading: false }),
    
    addHistory: (request, vsCodeApi) => {
        if (typeof vsCodeApi === 'undefined') {
            return;
        }
        vsCodeApi.postMessage({ 
            type: 'saveRequestToHistory',
            data: { requestContent: JSON.stringify(request) }
        });
    },
    
    refreshHistory: (vsCodeApi) => {
        if (typeof vsCodeApi === 'undefined') {
            return;
        }
        set({ isHistoryLoading: true, historyLoadError: null });
        vsCodeApi.postMessage({ type: 'loadHistory' });
    },
    
    setIsHistoryLoading: (isLoading) => set({ isHistoryLoading: isLoading }),
    
    setHistoryLoadError: (error) => set({ historyLoadError: error, isHistoryLoading: false }),
});

export default createHistorySlice;
