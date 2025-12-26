import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronRightIcon, ChevronDownIcon, FolderIcon, LayoutGridIcon, ImportIcon, DownloadIcon, MoreVertical } from 'lucide-react';
import { Collection, CollectionItem } from '../../types/collection';
import { collectionItemToFormData, countRequests } from '../../utils/collectionParser';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { Button } from '../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import CollectionsImportWizard from './CollectionsImportWizard';
import CollectionExportWizard from './CollectionExportWizard';
import CollectionTreeItem from './CollectionTreeItem';
import RunCollectionModal from './RunCollectionModal';
import { RequestFormData } from '../../utils/collectionParser';
import { Input } from '../ui/input';

interface CollectionsPaneProps {
  onRequestSelect: (request: RequestFormData) => void;
  onImportCollection: (fileName: string, fileContent: string, collectionType: string) => void;
  onExportCollection: (collectionName: string, exportFormat: string) => void;
  vsCodeApi?: { postMessage: (message: unknown) => void };
}

// Extract domain + path (no query/fragment) from a collection URL
const getUrlDomainPath = (url: any): string => {
  if (!url) return '';

  if (typeof url === 'string') {
    const base = url.split(/[?#]/)[0];
    return base.toLowerCase();
  }

  if (url.raw) {
    const base = url.raw.split(/[?#]/)[0];
    return base.toLowerCase();
  }

  const host = url.host?.join('.') || '';
  const path = url.path?.join('/') || '';
  const prefix = host ? `${host}` : '';
  const suffix = path ? `/${path}` : '';
  return `${prefix}${suffix}`.toLowerCase();
};

// Recursively filter collection items by name or URL domain/path
// If a folder matches by name, include the full folder contents (unfiltered) to keep search expansive.
const filterItems = (items: CollectionItem[], query: string, inLoop: Boolean = false): CollectionItem[] => {
  return items
    .map((item) => {
      const nameMatch = item.name.toLowerCase().includes(query);

      if (item.item) {
        // Recurse into children first
        const childItems =  filterItems(item.item, query, true);
        
        // Include pruned children if any matched
        if (nameMatch && childItems.length > 0) {
          return { ...item, item: childItems };
        }

        // If folder name matches but no children matched, include all requests
        if (nameMatch && childItems.length === 0) {
          return { ...item, item: item.item.filter((child) => Boolean(child.request)) };
        }

        return null;
      }

      if (item.request) {
        const urlText = getUrlDomainPath(item.request.url);
        const urlMatch = urlText.includes(query);
        if (nameMatch || urlMatch) {
          return item;
        }
      }

      return null;
    })
    .filter((item): item is CollectionItem => Boolean(item));
};

// Collect all folder keys for expansion during search
const collectFolderKeys = (collection: Collection, collectionFilename: string): string[] => {
  const keys: string[] = [];

  const walk = (items: CollectionItem[], path: string[] = []) => {
    for (const item of items) {
      if (item.item) {
        const key = `${collectionFilename}:${[...path, item.name].join('/')}`;
        keys.push(key);
        walk(item.item, [...path, item.name]);
      }
    }
  };

  walk(collection.item, []);
  return keys;
};

const setsEqual = (a: Set<string>, b: Set<string>): boolean => {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
};

interface CollectionsPaneHeaderProps {
  label: string;
  onImportClick: () => void;
  onExportClick: () => void;
}

const CollectionsPaneHeader: React.FC<CollectionsPaneHeaderProps> = ({ label, onImportClick, onExportClick }) => {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{label}</h2>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onImportClick}
              className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <ImportIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Import Collection</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onExportClick}
              className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <DownloadIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export Collection</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};

const CollectionsPane: React.FC<CollectionsPaneProps> = ({ 
  onRequestSelect,
  onImportCollection,
  onExportCollection,
  vsCodeApi,
}) => {
  const collections = useAppStateStore((state) => state.collections);
  const isLoading = useAppStateStore((state) => state.isCollectionsLoading);
  const error = useAppStateStore((state) => state.collectionLoadError);
  const activeTab = useAppStateStore((state) => state.getActiveTab());
  const currentRequestId = activeTab?.id;
  const searchText = useAppStateStore((state) => state.collectionSearchText);
  const setCollectionSearchText = useAppStateStore((state) => state.setCollectionSearchText);
  const savedExpandedCollections = useAppStateStore((state) => state.savedExpandedCollections);
  const savedExpandedFolders = useAppStateStore((state) => state.savedExpandedFolders);
  const setSavedExpandedState = useAppStateStore((state) => state.setSavedExpandedState);
  const clearSavedExpandedState = useAppStateStore((state) => state.clearSavedExpandedState);

  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());
  const [sortedCollections, setSortedCollections] = useState<Collection[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);
  const [isExportWizardOpen, setIsExportWizardOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState(searchText.trim());
  const [openMenuFilename, setOpenMenuFilename] = useState<string | null>(null);
  const [runModalData, setRunModalData] = useState<{
    isOpen: boolean;
    collectionName: string;
    items: CollectionItem[];
    itemPath: string[];
  }>({ isOpen: false, collectionName: '', items: [], itemPath: [] });
  const wasSearchingRef = useRef(false);

  const toggleCollection = (filename: string) => {
    const newExpanded = new Set(expandedCollections);
    if (newExpanded.has(filename)) {
      newExpanded.delete(filename);
    } else {
      newExpanded.add(filename);
    }
    setExpandedCollections(newExpanded);
  };
  
  const toggleFolder = useCallback((folderKey: string) => {
    setExpandedFolders(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(folderKey)) {
        newExpanded.delete(folderKey);
      } else {
        newExpanded.add(folderKey);
      }
      return newExpanded;
    });
  }, []);

  const handleRequestSelect = useCallback((
    item: CollectionItem,
    collectionFilename: string,
    collectionName: string,
    itemPath: string[]
  ) => {
    const formData = collectionItemToFormData(item, collectionFilename, collectionName, itemPath);
    onRequestSelect(formData);
  }, [onRequestSelect]);

  const handleRunCollection = useCallback((
    collectionName: string,
    items: CollectionItem[],
    itemPath: string[] = []
  ) => {
    setRunModalData({
      isOpen: true,
      collectionName,
      items,
      itemPath,
    });
  }, []);

  const handleCloseRunModal = useCallback(() => {
    setRunModalData(prev => ({ ...prev, isOpen: false }));
  }, []);

  //TODO this default logic is flaky and needs a better approach
  // Sort collections to show default collection first
  useEffect(() => {
    const sorted = [...collections].sort((a, b) => {
      const aIsDefault = a.filename?.toLowerCase().includes('default') || false;
      const bIsDefault = b.filename?.toLowerCase().includes('default') || false;
      if (aIsDefault && !bIsDefault) return -1;
      if (!aIsDefault && bIsDefault) return 1;
      return a.info.name.localeCompare(b.info.name);
    });
    setSortedCollections(sorted);
  }, [collections]);

  // Debounce search input to reduce render churn
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, 500);

    return () => clearTimeout(handle);
  }, [searchText]);

  const isSearching = debouncedSearch.length >= 3;

  const filteredCollections = useMemo(() => {
    if (!isSearching) {
      return sortedCollections;
    }

    const q = debouncedSearch.toLowerCase();

    return sortedCollections
      .map((collection) => {
        const nameMatch = collection.info.name.toLowerCase().includes(q);
        const filteredItems = filterItems(collection.item, q);
        if (nameMatch || filteredItems.length > 0) {
          return { ...collection, item: filteredItems } as Collection;
        }
        return null;
      })
      .filter((c): c is Collection => Boolean(c));
  }, [debouncedSearch, isSearching, sortedCollections]);

  // Expand/collapse management tied to search state
  useEffect(() => {
    const hasQuery = isSearching;

    if (hasQuery) {
      if (!wasSearchingRef.current) {
        setSavedExpandedState(Array.from(expandedCollections), Array.from(expandedFolders));
      }

      const desiredCollections = new Set(filteredCollections.map((c) => c.filename || ''));
      const desiredFolders = new Set(
        filteredCollections.flatMap((collection) => collectFolderKeys(collection, collection.filename || ''))
      );

      setExpandedCollections((prev) => (setsEqual(prev, desiredCollections) ? prev : desiredCollections));
      setExpandedFolders((prev) => (setsEqual(prev, desiredFolders) ? prev : desiredFolders));
    } else if (wasSearchingRef.current) {
      const restoredCollections = savedExpandedCollections ? new Set(savedExpandedCollections) : new Set<string>();
      const restoredFolders = savedExpandedFolders ? new Set(savedExpandedFolders) : new Set<string>();

      setExpandedCollections((prev) => (setsEqual(prev, restoredCollections) ? prev : restoredCollections));
      setExpandedFolders((prev) => (setsEqual(prev, restoredFolders) ? prev : restoredFolders));
      clearSavedExpandedState();
    }

    wasSearchingRef.current = hasQuery;
  }, [isSearching, filteredCollections, savedExpandedCollections, savedExpandedFolders, setSavedExpandedState, clearSavedExpandedState, expandedCollections, expandedFolders]);

  if (isLoading) {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-4">
          <CollectionsPaneHeader 
            label="Collections" 
            onImportClick={() => setIsImportWizardOpen(true)} 
            onExportClick={() => setIsExportWizardOpen(true)}
          />
        </div>
        <div className="flex items-center justify-center h-[calc(100%-5rem)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Loading collections...</p>
          </div>
        </div>
        <CollectionsImportWizard
          isOpen={isImportWizardOpen}
          onClose={() => setIsImportWizardOpen(false)}
          onImportCollection={onImportCollection}
        />
        <CollectionExportWizard
          isOpen={isExportWizardOpen}
          onClose={() => setIsExportWizardOpen(false)}
          onExportCollection={onExportCollection}
        />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-4">
          <CollectionsPaneHeader 
            label="Collections" 
            onImportClick={() => setIsImportWizardOpen(true)} 
            onExportClick={() => setIsExportWizardOpen(true)}
          />
        </div>
        <div className="flex items-center justify-center h-[calc(100%-5rem)] p-4">
          <div className="text-center">
            <div className="text-red-500 mb-2">⚠️</div>
            <p className="text-sm text-red-600 dark:text-red-400 mb-2">Error loading collections</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{error}</p>
          </div>
        </div>
        <CollectionsImportWizard
          isOpen={isImportWizardOpen}
          onClose={() => setIsImportWizardOpen(false)}
          onImportCollection={onImportCollection}
        />
        <CollectionExportWizard
          isOpen={isExportWizardOpen}
          onClose={() => setIsExportWizardOpen(false)}
          onExportCollection={onExportCollection}
        />
      </div>
    );
  }
  
  if (collections.length === 0) {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-4">
          <CollectionsPaneHeader 
            label="Collections" 
            onImportClick={() => setIsImportWizardOpen(true)} 
            onExportClick={() => setIsExportWizardOpen(true)}
          />
        </div>
        <div className="flex items-center justify-center h-[calc(100%-5rem)] p-4">
          <div className="text-center">
            <FolderIcon className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">No collections found</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Add collection files to ~/.waveclient/collections
            </p>
          </div>
        </div>
        <CollectionsImportWizard
          isOpen={isImportWizardOpen}
          onClose={() => setIsImportWizardOpen(false)}
          onImportCollection={onImportCollection}
        />
        <CollectionExportWizard
          isOpen={isExportWizardOpen}
          onClose={() => setIsExportWizardOpen(false)}
          onExportCollection={onExportCollection}
        />
      </div>
    );
  }
  
  const collectionsToRender = isSearching ? filteredCollections : sortedCollections;

  return (
    <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
      <div className="h-full overflow-auto p-4">
        <CollectionsPaneHeader 
          label="Collections" 
          onImportClick={() => setIsImportWizardOpen(true)} 
          onExportClick={() => setIsExportWizardOpen(true)}
        />

        <div className="mb-3">
          <Input
            value={searchText}
            onChange={(e) => setCollectionSearchText(e.target.value)}
            placeholder="Search collections (name or URL)"
          />
          {searchText.length > 0 && searchText.length < 3 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Type at least 3 characters to filter</p>
          )}
        </div>
        
        <div className="space-y-2">
          {isSearching && collectionsToRender.length === 0 && (
            <div className="text-sm text-slate-600 dark:text-slate-400 px-2">No matching results</div>
          )}
          {collectionsToRender.map(collection => {
            const totalRequests = countRequests(collection.item);
            const filename = collection.filename || '';
            
            return (
            <div key={filename} className="border border-slate-200 dark:border-slate-700 rounded-lg">
                {/* Collection Header */}
                <div 
                    className={`flex items-center p-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer rounded-t-lg group transition-colors ${
                      openMenuFilename === filename ? 'bg-slate-100 dark:bg-slate-700' : ''
                    }`}
                    onClick={() => toggleCollection(filename)}
                >
                <div className="flex items-center flex-1 mb-1">
                        {expandedCollections.has(filename) ? (
                        <ChevronDownIcon className="h-5 w-5 text-slate-500 mr-2 flex-shrink-0" />
                        ) : (
                        <ChevronRightIcon className="h-5 w-5 text-slate-500 mr-2 flex-shrink-0" />
                        )}
                        <LayoutGridIcon className="h-4 w-4 text-amber-600 mr-2 flex-shrink-0" />
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-words">
                        {collection.info.name}
                        </h3>
                </div>
                <span className={`text-xs text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-full ml-2 transition-opacity ${
                  openMenuFilename === filename ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}>
                        {totalRequests}
                </span>
                <div className={`ml-1 transition-opacity ${openMenuFilename === filename ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu onOpenChange={(open) => setOpenMenuFilename(open ? filename : null)}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-6 w-6 p-0 hover:bg-slate-300 dark:hover:bg-slate-600">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-24">
                      <DropdownMenuItem onClick={() => handleRunCollection(collection.info.name, collection.item, [])}>Run</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {}}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                </div>
                
                {/* Collection Content - Recursive Tree Rendering */}
                {expandedCollections.has(filename) && (
                    <div className="p-3 space-y-1 overflow-x-auto">
                        {collection.item.map((item) => (
                            <CollectionTreeItem
                                key={item.id}
                                item={item}
                                depth={0}
                                collectionFilename={filename}
                                collectionName={collection.info.name}
                                itemPath={[]}
                                currentRequestId={currentRequestId}
                                expandedFolders={expandedFolders}
                                onToggleFolder={toggleFolder}
                                onRequestSelect={handleRequestSelect}
                                onRunFolder={(items, folderPath) => handleRunCollection(collection.info.name, items, folderPath)}
                            />
                        ))}
                    </div>
                )}
            </div>
            );
          })}
        </div>
      </div>
      <CollectionsImportWizard
        isOpen={isImportWizardOpen}
        onClose={() => setIsImportWizardOpen(false)}
        onImportCollection={onImportCollection}
      />
      <CollectionExportWizard
        isOpen={isExportWizardOpen}
        onClose={() => setIsExportWizardOpen(false)}
        onExportCollection={onExportCollection}
      />
      <RunCollectionModal
        isOpen={runModalData.isOpen}
        onClose={handleCloseRunModal}
        collectionName={runModalData.collectionName}
        items={runModalData.items}
        itemPath={runModalData.itemPath}
        vsCodeApi={vsCodeApi!}
      />
    </div>
  );
};

export type { CollectionsPaneProps };
export default CollectionsPane;