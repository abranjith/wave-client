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
    saveRequestToCollection: (request: ParsedRequest, collectionName: string, folderName: string | null) => void;
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
    
    saveRequestToCollection: (request, collectionName, folderName) => set((state) => {
        const collections = state.collections.map((collection) => {
            if (collection.name !== collectionName) {
                return collection;
            }
            // If folderName is provided, find the folder and add/update the request there
            if (folderName) {
                const updatedFolders = collection.folders.map((folder) => {
                    if (folder.name !== folderName) {
                        return folder;
                    }
                    // Check if a request with the same name already exists
                    const existingIndex = folder.requests.findIndex((r) => r.name === request.name);
                    let updatedRequests;
                    if (existingIndex !== -1) {
                        // Replace existing request
                        updatedRequests = [...folder.requests];
                        updatedRequests[existingIndex] = request;
                    } else {
                        // Add new request
                        updatedRequests = [...folder.requests, request];
                    }
                    return {
                        ...folder,
                        requests: updatedRequests
                    };
                });
                return {
                    ...collection,
                    folders: updatedFolders
                };
            } else {
                // Check if a request with the same name already exists at top-level
                const existingIndex = collection.requests.findIndex((r) => r.name === request.name);
                let updatedRequests;
                if (existingIndex !== -1) {
                    // Replace existing request
                    updatedRequests = [...collection.requests];
                    updatedRequests[existingIndex] = request;
                } else {
                    // Add new request
                    updatedRequests = [...collection.requests, request];
                }
                return {
                    ...collection,
                    requests: updatedRequests
                };
            }
        });
        return { collections };
    })
});

export default createCollectionsSlice;