import { StateCreator } from 'zustand'
import { Collection } from '../../types/collection';

interface CollectionsSlice {
    collections: Collection[];
    isCollectionsLoading: boolean;
    collectionLoadError: string | null;
    collectionSearchText: string;
    savedExpandedCollections: string[] | null;
    savedExpandedFolders: string[] | null;
    setCollections: (collections: Collection[]) => void;
    addCollection: (collection: Collection) => void;
    removeCollection: (name: string) => void;
    updateCollection: (name: string, updates: Partial<Collection>) => void;
    refreshCollections: (vsCodeApi: any) => void;
    setIsCollectionsLoading: (isLoading: boolean) => void;
    setCollectionLoadError: (error: string | null) => void;
    setCollectionSearchText: (text: string) => void;
    setSavedExpandedState: (collections: string[], folders: string[]) => void;
    clearSavedExpandedState: () => void;
}

const createCollectionsSlice: StateCreator<CollectionsSlice> = (set) => ({
    collections: [],
    isCollectionsLoading: false,
    collectionLoadError: null,
    collectionSearchText: '',
    savedExpandedCollections: null,
    savedExpandedFolders: null,
    setCollections: (collections) => set({ collections, isCollectionsLoading: false, collectionLoadError: null }),
    addCollection: (collection) => set((state) => ({
        collections: [...state.collections, collection]
    })),
    removeCollection: (name) => set((state) => ({
        collections: state.collections.filter((c) => c.info.name !== name)
    })),
    updateCollection: (name, updates) => set((state) => ({
        collections: state.collections.map((c) => c.info.name === name ? { ...c, ...updates } : c)
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
    setCollectionSearchText: (text) => set({ collectionSearchText: text }),
    setSavedExpandedState: (collections, folders) => set({
        savedExpandedCollections: [...collections],
        savedExpandedFolders: [...folders],
    }),
    clearSavedExpandedState: () => set({
        savedExpandedCollections: null,
        savedExpandedFolders: null,
    }),
});

export default createCollectionsSlice;