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
    /**
     * Removes a collection by its `filename` — the persistence key, always
     * present after load. Display `name` is never a lookup key (it is exactly
     * what changes during rename).
     */
    removeCollection: (filename: string) => void;
    /**
     * Updates a collection by its `filename` (persistence key). See
     * {@link removeCollection} for why display name is never used here.
     */
    updateCollection: (filename: string, updates: Partial<Collection>) => void;
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
    removeCollection: (filename) => set((state) => ({
        collections: state.collections.filter((c) => c.filename !== filename)
    })),
    updateCollection: (filename, updates) => set((state) => ({
        collections: state.collections.map((c) => c.filename === filename ? { ...c, ...updates } : c)
    })),
    setIsCollectionsLoading: (isLoading) => set({
        isCollectionsLoading: isLoading,
        ...(isLoading ? { collectionLoadError: null } : {})
    }),
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