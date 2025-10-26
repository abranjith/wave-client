import { StateCreator } from 'zustand'
import { ParsedCollection, ParsedRequest } from '../../types/collection';

interface CollectionsSlice {
    collections: ParsedCollection[];
    isCollectionsLoading: boolean;
    collectionLoadError: string | null;
    setCollections: (collections: ParsedCollection[]) => void;
    addCollection: (collection: ParsedCollection) => void;
    removeCollection: (name: string) => void;
    updateCollection: (name: string, updates: Partial<ParsedCollection>) => void;
    refreshCollections: (vsCodeApi: any) => void;
    setIsCollectionsLoading: (isLoading: boolean) => void;
    setCollectionLoadError: (error: string | null) => void;
}

const createCollectionsSlice: StateCreator<CollectionsSlice> = (set) => ({
    collections: [],
    isCollectionsLoading: false,
    collectionLoadError: null,
    setCollections: (collections) => set({ collections, isCollectionsLoading: false, collectionLoadError: null }),
    addCollection: (collection) => set((state) => ({
        collections: [...state.collections, collection]
    })),
    removeCollection: (name) => set((state) => ({
        collections: state.collections.filter((c) => c.name !== name)
    })),
    updateCollection: (name, updates) => set((state) => ({
        collections: state.collections.map((c) => c.name === name ? { ...c, ...updates } : c)
    })),
    refreshCollections: (vsCodeApi) => {
        if (vsCodeApi === 'undefined') {
            return;
        }
        set({ isCollectionsLoading: true, collectionLoadError: null });
        vsCodeApi.postMessage({ type: 'loadCollections' });
    },
    setIsCollectionsLoading: (isLoading) => set({ isCollectionsLoading: isLoading }),
    setCollectionLoadError: (error) => set({ collectionLoadError: error, isCollectionsLoading: false }),
});

export default createCollectionsSlice;