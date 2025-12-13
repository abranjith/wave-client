import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRightIcon, ChevronDownIcon, FolderIcon, LayoutGridIcon, ImportIcon, DownloadIcon } from 'lucide-react';
import { Collection, CollectionItem } from '../../types/collection';
import { collectionItemToFormData, countRequests } from '../../utils/collectionParser';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { Button } from '../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import CollectionsImportWizard from './CollectionsImportWizard';
import CollectionExportWizard from './CollectionExportWizard';
import CollectionTreeItem from './CollectionTreeItem';
import { RequestFormData } from '../../utils/collectionParser';

interface CollectionsPaneProps {
  onRequestSelect: (request: RequestFormData) => void;
  onImportCollection: (fileName: string, fileContent: string, collectionType: string) => void;
  onExportCollection: (collectionName: string, exportFormat: string) => void;
}

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
  onExportCollection
}) => {
  const collections = useAppStateStore((state) => state.collections);
  const isLoading = useAppStateStore((state) => state.isCollectionsLoading);
  const error = useAppStateStore((state) => state.collectionLoadError);
  const activeTab = useAppStateStore((state) => state.getActiveTab());
  const currentRequestId = activeTab?.id;

  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());
  const [sortedCollections, setSortedCollections] = useState<Collection[]>([]);
  
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);
  const [isExportWizardOpen, setIsExportWizardOpen] = useState(false);

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
  
  return (
    <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
      <div className="h-full overflow-auto p-4">
        <CollectionsPaneHeader 
          label="Collections" 
          onImportClick={() => setIsImportWizardOpen(true)} 
          onExportClick={() => setIsExportWizardOpen(true)}
        />
        
        <div className="space-y-2">
          {sortedCollections.map(collection => {
            const totalRequests = countRequests(collection.item);
            const filename = collection.filename || '';
            
            return (
            <div key={filename} className="border border-slate-200 dark:border-slate-700 rounded-lg">
                {/* Collection Header */}
                <div 
                    className="flex items-center p-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer rounded-t-lg group transition-colors"
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
                <span className="text-xs text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-full ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {totalRequests}
                </span>
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
    </div>
  );
};

export type { CollectionsPaneProps };
export default CollectionsPane;