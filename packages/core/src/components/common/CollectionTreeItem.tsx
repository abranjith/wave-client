import React, { useState, useCallback } from 'react';
import { ChevronRightIcon, ChevronDownIcon, FolderIcon, MoreVertical, PencilIcon, PlayIcon, Trash2Icon } from 'lucide-react';
import { CollectionItem, isFolder, isRequest } from '../../types/collection';
import { isWsRequest } from '../../utils/requestTypeGuards';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { getHttpMethodColor } from '../../utils/common';
import { urlToString } from '../../utils/collectionParser';

interface CollectionTreeItemProps {
  item: CollectionItem;
  depth: number;
  collectionFilename: string;
  collectionName: string;
  /** Path of folder names from the collection root to this item's parent folder. */
  itemPath: string[];
  currentRequestId: string | undefined;
  expandedFolders: Set<string>;
  onToggleFolder: (folderKey: string) => void;
  onRequestSelect: (item: CollectionItem, collectionFilename: string, collectionName: string, itemPath: string[]) => void;
  onRunFolder?: (items: CollectionItem[], folderPath: string[]) => void;
  /**
   * Called when the user commits a rename for this item.
   * @param itemId - The ID of the item being renamed
   * @param newName - The committed new name
   * @param parentItemPath - `itemPath` of this component (path to the item's parent)
   */
  onRenameItem: (itemId: string, newName: string, parentItemPath: string[]) => Promise<void>;
  /**
   * Called when the user triggers a delete on this item (before confirmation).
   * @param item - The CollectionItem to delete
   * @param parentItemPath - `itemPath` of this component (path to the item's parent)
   */
  onDeleteItem: (item: CollectionItem, parentItemPath: string[]) => void;
}

/**
 * Recursive component for rendering collection items (folders and requests).
 * Supports arbitrary nesting depth, inline rename, and delete confirmation wiring.
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
  onRunFolder,
  onRenameItem,
  onDeleteItem,
}) => {
  // Generate unique key for this folder
  const folderKey = `${collectionFilename}:${[...itemPath, item.name].join('/')}`;
  const isFolderExpanded = expandedFolders.has(folderKey);
  
  // Calculate indentation based on depth
  const paddingLeft = depth * 16; // 16px per level

  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false);
  const [isRequestMenuOpen, setIsRequestMenuOpen] = useState(false);
  /** True when this item's name is being edited inline. */
  const [isEditing, setIsEditing] = useState(false);
  /** The current draft text while editing. */
  const [editingDraft, setEditingDraft] = useState('');

  const handleRenameInputFocus = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    const end = event.currentTarget.value.length;
    event.currentTarget.setSelectionRange(end, end);
  }, []);

  /** Initiates inline rename for this item. */
  const handleRenameStart = useCallback(() => {
    setEditingDraft(item.name);
    setIsEditing(true);
  }, [item.name]);

  /**
   * Commits the inline rename: calls the parent callback if the name changed,
   * then exits editing mode regardless of outcome.
   */
  const handleRenameEnd = useCallback(async () => {
    if (!isEditing) return;
    setIsEditing(false);
    const trimmedName = editingDraft.trim();
    if (trimmedName && trimmedName !== item.name) {
      await onRenameItem(item.id, trimmedName, itemPath);
    }
  }, [isEditing, editingDraft, item.id, item.name, itemPath, onRenameItem]);

  if (isFolder(item)) {
    const childCount = item.item?.length || 0;
    
    return (
      <div className="space-y-1">
        {/* Folder Header */}
        <div 
          className={`flex items-center py-2 px-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer rounded-md group transition-colors ${
            isFolderMenuOpen ? 'bg-slate-100 dark:bg-slate-700' : ''
          }`}
          style={{ paddingLeft: `${paddingLeft + 8}px` }}
          onClick={() => !isEditing && onToggleFolder(folderKey)}
        >
          <div className="flex items-center flex-1 min-w-0">
            {isFolderExpanded ? (
              <ChevronDownIcon className="h-4 w-4 text-slate-500 mr-1 flex-shrink-0" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-slate-500 mr-1 flex-shrink-0" />
            )}
            <FolderIcon className="h-4 w-4 text-amber-600 mr-2 flex-shrink-0" />
            {isEditing ? (
              <Input
                value={editingDraft}
                onChange={(e) => setEditingDraft(e.target.value)}
                onBlur={handleRenameEnd}
                onFocus={handleRenameInputFocus}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameEnd();
                  if (e.key === 'Escape') setIsEditing(false);
                }}
                onClick={(e) => e.stopPropagation()}
                className="h-6 text-sm py-0 font-medium flex-1 border border-amber-300/80 dark:border-amber-500/70 bg-white dark:bg-slate-900 ring-2 ring-amber-500/20 shadow-sm"
                autoFocus
              />
            ) : (
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                {item.name}
              </span>
            )}
          </div>
          <span className={`text-xs text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-full ml-2 transition-opacity ${
            isFolderMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}>
            {childCount}
          </span>
          <div className={`ml-1 transition-opacity ${isFolderMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} onClick={(e) => e.stopPropagation()}>
            <DropdownMenu onOpenChange={setIsFolderMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-6 w-6 p-0 hover:bg-slate-300 dark:hover:bg-slate-600">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-32">
                <DropdownMenuItem onClick={() => onRunFolder?.(item.item || [], [...itemPath, item.name])}>
                  <PlayIcon className="h-4 w-4 mr-2" />
                  Run
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRenameStart(); }}>
                  <PencilIcon className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
                  onClick={(e) => { e.stopPropagation(); onDeleteItem(item, itemPath); }}
                >
                  <Trash2Icon className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
                onRunFolder={onRunFolder}
                onRenameItem={onRenameItem}
                onDeleteItem={onDeleteItem}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isRequest(item) && item.request) {
    const isActive = item.id === currentRequestId;
    const method = isWsRequest(item.request) ? 'WS' : item.request.method?.toUpperCase() || 'GET';
    const requestUrl = item.request.url ? urlToString(item.request.url) : '';
    
    return (
      <TooltipProvider delayDuration={500}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`flex items-center py-2 px-2 cursor-pointer rounded-md group transition-colors ${
                isActive 
                  ? 'bg-blue-100 dark:bg-blue-900/40 border-l-2 border-blue-500' 
                  : isRequestMenuOpen
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
              }`}
              style={{ paddingLeft: `${paddingLeft + 8}px` }}
              onClick={() => !isEditing && onRequestSelect(item, collectionFilename, collectionName, itemPath)}
            >
              <div className="flex items-center flex-1 min-w-0">
                <span className={`text-xs font-medium mr-2 px-2 py-1 rounded-full flex-shrink-0 ${getHttpMethodColor(method)}`}>
                  {method}
                </span>
                {isEditing ? (
                  <Input
                    value={editingDraft}
                    onChange={(e) => setEditingDraft(e.target.value)}
                    onBlur={handleRenameEnd}
                    onFocus={handleRenameInputFocus}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameEnd();
                      if (e.key === 'Escape') setIsEditing(false);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-6 text-sm py-0 flex-1 border border-blue-300/80 dark:border-blue-500/70 bg-white dark:bg-slate-900 ring-2 ring-blue-500/20 shadow-sm"
                    autoFocus
                  />
                ) : (
                  <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                    {item.name}
                  </span>
                )}
              </div>
              <div className={`ml-1 transition-opacity ${isRequestMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} onClick={(e) => e.stopPropagation()}>
                <DropdownMenu onOpenChange={setIsRequestMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-6 w-6 p-0 hover:bg-slate-300 dark:hover:bg-slate-600">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-32">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRenameStart(); }}>
                      <PencilIcon className="h-4 w-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
                      onClick={(e) => { e.stopPropagation(); onDeleteItem(item, itemPath); }}
                    >
                      <Trash2Icon className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent className="px-2 py-1 text-xs max-w-xs">
            <div className="font-medium">{item.name}</div>
            {requestUrl && <div className="text-slate-400 dark:text-slate-500 truncate">{requestUrl}</div>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Unknown item type
  return null;
};

export default CollectionTreeItem;

