import React, { useState, useEffect } from 'react';
import { ChevronRightIcon, ChevronDownIcon, FolderIcon, LayoutGridIcon, ImportIcon, DownloadIcon } from 'lucide-react';
import { ParsedCollection, ParsedRequest } from '../../types/collection';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { Button } from '../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import CollectionsImportWizard from './CollectionsImportWizard';
import CollectionExportWizard from './CollectionExportWizard';
import { getHttpMethodColor } from '../../utils/common';

interface CollectionsPaneProps {
  onRequestSelect: (request: ParsedRequest) => void;
  onImportCollection: (fileName: string, fileContent: string, collectionType: string) => void;
  onExportCollection: (collectionName: string) => void;
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
              className="h-8 w-8 p-0"
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
              className="h-8 w-8 p-0"
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

  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());
  const [sortedCollections, setSortedCollections] = useState<ParsedCollection[]>([]);
  
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
  
  const toggleFolder = (folderKey: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderKey)) {
      newExpanded.delete(folderKey);
    } else {
      newExpanded.add(folderKey);
    }
    setExpandedFolders(newExpanded);
  };

  //TODO this default logic is flaky and needs a better approach
  // Sort collections to show default collection first
  useEffect(() => {
    const sorted = [...collections].sort((a, b) => {
      const aIsDefault = a.filename.toLowerCase().includes('default');
      const bIsDefault = b.filename.toLowerCase().includes('default');
      if (aIsDefault && !bIsDefault) return -1;
      if (!aIsDefault && bIsDefault) return 1;
      return a.name.localeCompare(b.name);
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
            const totalRequests = collection.requests.length + 
              collection.folders.reduce((acc, folder) => acc + folder.requests.length, 0);
            
            return (
            <div key={collection.filename} className="border border-slate-200 dark:border-slate-700 rounded-lg">
                {/* Collection Header */}
                <div 
                    className="flex items-center p-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer rounded-t-lg group transition-colors"
                    onClick={() => toggleCollection(collection.filename)}
                >
                <div className="flex items-center flex-1 mb-1">
                        {expandedCollections.has(collection.filename) ? (
                        <ChevronDownIcon className="h-5 w-5 text-slate-500 mr-2 flex-shrink-0" />
                        ) : (
                        <ChevronRightIcon className="h-5 w-5 text-slate-500 mr-2 flex-shrink-0" />
                        )}
                        <LayoutGridIcon className="h-4 w-4 text-amber-600 mr-2 flex-shrink-0" />
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-words">
                        {collection.name}
                        </h3>
                </div>
                <span className="text-xs text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-full ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {collection.folders.length + collection.requests.length}
                </span>
                </div>
                
                {/* Collection Content */}
                {expandedCollections.has(collection.filename) && (
                    <div className="p-3 space-y-1">
                        {/* Top-level requests */}
                        {collection.requests.map(request => (
                            <div
                                key={request.id}
                                className="flex items-center py-2 px-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer rounded-md group transition-colors"
                                onClick={() => onRequestSelect(request)}
                            >
                                <div className="flex items-center flex-1 min-w-0">
                                    <span className={`text-xs font-medium mr-2 px-2 py-1 rounded-full flex-shrink-0 ${getHttpMethodColor(request.method)}`}>
                                        {request.method}
                                    </span>
                                    <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                                        {request.name}
                                    </span>
                                </div>
                            </div>
                        ))}
                        
                        {/* Folders */}
                        {collection.folders.map(folder => {
                            const folderKey = `${collection.filename}:${folder.name}`;
                            const isFolderExpanded = expandedFolders.has(folderKey);
                            
                            return (
                                <div key={folder.name} className="space-y-1">
                                    {/* Folder Header */}
                                    <div 
                                        className="flex items-center py-2 px-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer rounded-md group transition-colors"
                                        onClick={() => toggleFolder(folderKey)}
                                    >
                                        <div className="flex items-center flex-1 min-w-0">
                                            {isFolderExpanded ? (
                                                <ChevronDownIcon className="h-4 w-4 text-slate-500 mr-1 flex-shrink-0" />
                                            ) : (
                                                <ChevronRightIcon className="h-4 w-4 text-slate-500 mr-1 flex-shrink-0" />
                                            )}
                                            <FolderIcon className="h-4 w-4 text-amber-600 mr-2 flex-shrink-0" />
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                                                {folder.name}
                                            </span>
                                        </div>
                                        <span className="text-xs text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-full ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {folder.requests.length}
                                        </span>
                                    </div>
                                    
                                    {/* Folder Requests */}
                                    {isFolderExpanded && (
                                        <div className="ml-6 space-y-1">
                                            {folder.requests.map(request => (
                                                <div
                                                    key={request.id}
                                                    className="flex items-center py-2 px-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer rounded-md group transition-colors"
                                                    onClick={() => onRequestSelect(request)}
                                                >
                                                    <div className="flex items-center flex-1 min-w-0">
                                                        <span className={`text-xs font-medium mr-2 px-2 py-1 rounded-full flex-shrink-0 ${getHttpMethodColor(request.method)}`}>
                                                            {request.method}
                                                        </span>
                                                        <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                                                            {request.name}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
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