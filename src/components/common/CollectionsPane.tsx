import React, { useState } from 'react';
import { ChevronRightIcon, ChevronDownIcon, FolderIcon, LayoutGridIcon } from 'lucide-react';
import { ParsedRequest } from '../../types/collection';
import useAppStateStore from '../../hooks/store/useAppStateStore';

interface CollectionsPaneProps {
  onRequestSelect: (request: ParsedRequest) => void;
}

const getMethodColor = (method: string): string => {
  switch (method.toLowerCase()) {
    case 'get': return 'bg-green-500';
    case 'post': return 'bg-blue-500';
    case 'put': return 'bg-orange-500';
    case 'delete': return 'bg-red-500';
    case 'patch': return 'bg-purple-500';
    case 'head': return 'bg-gray-500';
    case 'options': return 'bg-yellow-500';
    default: return 'bg-slate-500';
  }
};

const CollectionsPane: React.FC<CollectionsPaneProps> = ({ 
  onRequestSelect
}) => {
  const collections = useAppStateStore((state) => state.collections);
  const isLoading = useAppStateStore((state) => state.isCollectionsLoading);
  const error = useAppStateStore((state) => state.collectionLoadError);

  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(
    new Set(collections.map(c => c.filename)) // Auto-expand all collections
  );
  
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-sm text-slate-600 dark:text-slate-400">Loading collections...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <div className="text-red-500 mb-2">⚠️</div>
          <p className="text-sm text-red-600 dark:text-red-400 mb-2">Error loading collections</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      </div>
    );
  }
  
  if (collections.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <FolderIcon className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">No collections found</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Add collection files to ~/.waveclient/collections
          </p>
        </div>
      </div>
    );
  }
  
  // Sort collections to show default collection first
  const sortedCollections = [...collections].sort((a, b) => {
    const aIsDefault = a.filename.toLowerCase().includes('default');
    const bIsDefault = b.filename.toLowerCase().includes('default');
    if (aIsDefault && !bIsDefault) return -1;
    if (!aIsDefault && bIsDefault) return 1;
    return a.name.localeCompare(b.name);
  });
  
  return (
    <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
      <div className="h-full overflow-auto p-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Collections</h2>
        
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
                                    <span className={`text-xs font-medium mr-2 px-2 py-1 rounded-full text-white flex-shrink-0 ${getMethodColor(request.method)}`}>
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
                                                        <span className={`text-xs font-medium mr-2 px-2 py-1 rounded-full text-white flex-shrink-0 ${getMethodColor(request.method)}`}>
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
    </div>
  );
};

export type { CollectionsPaneProps };
export default CollectionsPane;