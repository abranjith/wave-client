import React, { useState } from 'react';
import { ChevronRightIcon, ChevronDownIcon, FolderIcon } from 'lucide-react';
import { CollectionItem, isFolder, isRequest } from '../../types/collection';
import { getHttpMethodColor } from '../../utils/common';
import { urlToString } from '../../utils/collectionParser';

interface CollectionTreeItemProps {
  item: CollectionItem;
  depth: number;
  collectionFilename: string;
  collectionName: string;
  itemPath: string[];
  currentRequestId: string | undefined;
  expandedFolders: Set<string>;
  onToggleFolder: (folderKey: string) => void;
  onRequestSelect: (item: CollectionItem, collectionFilename: string, collectionName: string, itemPath: string[]) => void;
}

/**
 * Recursive component for rendering collection items (folders and requests)
 * Supports arbitrary nesting depth
 */
const CollectionTreeItem: React.FC<CollectionTreeItemProps> = ({
  item,
  depth,
  collectionFilename,
  collectionName,
  itemPath,
  currentRequestId,
  expandedFolders,
  onToggleFolder,
  onRequestSelect,
}) => {
  // Generate unique key for this folder
  const folderKey = `${collectionFilename}:${[...itemPath, item.name].join('/')}`;
  const isFolderExpanded = expandedFolders.has(folderKey);
  
  // Calculate indentation based on depth
  const paddingLeft = depth * 16; // 16px per level

  if (isFolder(item)) {
    const childCount = item.item?.length || 0;
    
    return (
      <div className="space-y-1">
        {/* Folder Header */}
        <div 
          className="flex items-center py-2 px-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer rounded-md group transition-colors"
          style={{ paddingLeft: `${paddingLeft + 8}px` }}
          onClick={() => onToggleFolder(folderKey)}
        >
          <div className="flex items-center flex-1 min-w-0">
            {isFolderExpanded ? (
              <ChevronDownIcon className="h-4 w-4 text-slate-500 mr-1 flex-shrink-0" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-slate-500 mr-1 flex-shrink-0" />
            )}
            <FolderIcon className="h-4 w-4 text-amber-600 mr-2 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
              {item.name}
            </span>
          </div>
          <span className="text-xs text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-full ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {childCount}
          </span>
        </div>
        
        {/* Folder Children - recursive rendering */}
        {isFolderExpanded && item.item && (
          <div className="space-y-1">
            {item.item.map((childItem) => (
              <CollectionTreeItem
                key={childItem.id}
                item={childItem}
                depth={depth + 1}
                collectionFilename={collectionFilename}
                collectionName={collectionName}
                itemPath={[...itemPath, item.name]}
                currentRequestId={currentRequestId}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
                onRequestSelect={onRequestSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isRequest(item) && item.request) {
    const isActive = item.id === currentRequestId;
    const method = item.request.method?.toUpperCase() || 'GET';
    
    return (
      <div
        className={`flex items-center py-2 px-2 cursor-pointer rounded-md group transition-colors ${
          isActive 
            ? 'bg-blue-100 dark:bg-blue-900/40 border-l-2 border-blue-500' 
            : 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
        }`}
        style={{ paddingLeft: `${paddingLeft + 8}px` }}
        onClick={() => onRequestSelect(item, collectionFilename, collectionName, itemPath)}
      >
        <div className="flex items-center flex-1 min-w-0">
          <span className={`text-xs font-medium mr-2 px-2 py-1 rounded-full flex-shrink-0 ${getHttpMethodColor(method)}`}>
            {method}
          </span>
          <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
            {item.name}
          </span>
        </div>
      </div>
    );
  }

  // Unknown item type
  return null;
};

export default CollectionTreeItem;
