import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronRightIcon, ChevronDownIcon, FolderIcon, FolderPlusIcon, LayoutGridIcon, ImportIcon, DownloadIcon, MoreVertical, PlayIcon, PencilIcon, Trash2Icon, PlusIcon } from 'lucide-react';
import { Collection, CollectionItem, AnyCollectionRequest, CollectionImportTarget } from '../../types/collection';
import { CURRENT_COLLECTION_SCHEMA_VERSION } from '../../schemas/collectionSchema';
import {
  addItemAtPath,
  countRequests,
  duplicateRequestItem,
  extractRequestFromItem,
  generateUniqueCopyName,
  getItemsAtPath,
  getSiblingsAtPath,
  isDescendantPath,
  renameItemInTree,
  validateItemName,
} from '../../utils/collectionParser';
import { generateUniqueId } from '../../utils/common';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { useStorageAdapter, useNotificationAdapter } from '../../hooks/useAdapter';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { Button } from '../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import CollectionsImportWizard from './CollectionsImportWizard';
import CollectionAddWizard from './CollectionAddWizard';
import FolderAddWizard from './FolderAddWizard';
import CollectionExportWizard from './CollectionExportWizard';
import CollectionTreeItem from './CollectionTreeItem';
import RunCollectionModal from './RunCollectionModal';
import RequestSaveWizard from './RequestSaveWizard';
import { Input } from '../ui/input';
import { SecondaryButton } from '../ui';

interface CollectionsPaneProps {
  onRequestSelect: (request: AnyCollectionRequest) => void;
  onImportCollection: (fileName: string, fileContent: string, collectionType: string, target: CollectionImportTarget) => void;
  onExportCollection: (collectionName: string, exportFormat: string) => void;
  onRetry?: () => void;
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

const pathsEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((segment, index) => segment === right[index]);
};

const toCollectionFilenameStem = (collectionName: string): string => {
  const stem = collectionName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return stem.length > 0 ? stem : 'new_collection';
};

const generateUniqueCollectionFilename = (collectionName: string, existingFilenames: string[]): string => {
  const baseStem = toCollectionFilenameStem(collectionName);
  const existing = new Set(existingFilenames.map((name) => name.toLowerCase()));

  let candidate = `${baseStem}.json`;
  let counter = 1;
  while (existing.has(candidate.toLowerCase())) {
    candidate = `${baseStem}_${counter}.json`;
    counter += 1;
  }

  return candidate;
};

interface MoveItemDraft {
  sourceCollectionFilename: string;
  sourceCollectionName: string;
  sourceParentPath: string[];
  item: CollectionItem;
}

interface FolderAddDraft {
  collectionFilename: string;
  /** Folder path within the collection where the new folder will be created. */
  parentPath: string[];
}

interface CollectionsPaneHeaderProps {
  label: string;
  onAddClick: () => void;
  onImportClick: () => void;
  onExportClick: () => void;
}

const CollectionsPaneHeader: React.FC<CollectionsPaneHeaderProps> = ({ label, onAddClick, onImportClick, onExportClick }) => {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{label}</h2>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddClick}
              className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              aria-label="Add Collection"
            >
              <PlusIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add Collection</TooltipContent>
        </Tooltip>
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
  onRetry
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
  const addCollection = useAppStateStore((state) => state.addCollection);
  const updateCollection = useAppStateStore((state) => state.updateCollection);
  const removeCollection = useAppStateStore((state) => state.removeCollection);

  const storageAdapter = useStorageAdapter();
  const notification = useNotificationAdapter();
  const { openConfirmDialog, ConfirmDialogComponent } = useConfirmDialog();

  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());
  const [sortedCollections, setSortedCollections] = useState<Collection[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isAddWizardOpen, setIsAddWizardOpen] = useState(false);
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
  const [moveItemDraft, setMoveItemDraft] = useState<MoveItemDraft | null>(null);
  const [folderAddDraft, setFolderAddDraft] = useState<FolderAddDraft | null>(null);
  /** Filename of the collection currently in inline-rename mode (null = no rename active). */
  const [editingCollectionFilename, setEditingCollectionFilename] = useState<string | null>(null);
  /** Draft text while a collection name is being edited inline. */
  const [editingCollectionNameDraft, setEditingCollectionNameDraft] = useState('');
  const wasSearchingRef = useRef(false);

  const handleRenameInputFocus = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    const end = event.currentTarget.value.length;
    event.currentTarget.setSelectionRange(end, end);
  }, []);

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
    const request = extractRequestFromItem(item, collectionFilename, collectionName, itemPath);
    onRequestSelect(request);
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

  /**
   * Starts inline rename for a collection header.
   * Sets the editing filename and prepopulates the draft with the current name.
   */
  const handleRenameCollectionStart = useCallback((filename: string, currentName: string) => {
    setEditingCollectionFilename(filename);
    setEditingCollectionNameDraft(currentName);
  }, []);

  /**
   * Commits or cancels an in-progress collection rename.
   * Performs uniqueness check before persisting via the storage adapter.
   */
  const handleRenameCollectionEnd = useCallback(async () => {
    if (!editingCollectionFilename) return;
    const collection = sortedCollections.find(c => c.filename === editingCollectionFilename);
    setEditingCollectionFilename(null);
    if (!collection) return;

    const trimmedName = editingCollectionNameDraft.trim() || 'Untitled Collection';
    if (trimmedName === collection.info.name) return; // no-op

    // Uniqueness check (case-insensitive) against all other collections
    const isDuplicate = collections.some(
      c => c.filename !== editingCollectionFilename && c.info.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      notification.showNotification('error', `A collection named "${trimmedName}" already exists.`);
      return;
    }

    const updatedCollection: Collection = {
      ...collection,
      info: { ...collection.info, name: trimmedName },
    };
    const result = await storageAdapter.saveCollection(updatedCollection);
    if (result.isOk) {
      // Keyed by filename (persistence key) — name is what just changed.
      updateCollection(collection.filename!, { info: { ...collection.info, name: trimmedName } });
    } else {
      notification.showNotification('error', result.error);
    }
  }, [editingCollectionFilename, editingCollectionNameDraft, collections, sortedCollections, storageAdapter, notification, updateCollection]);

  /**
   * Opens a confirm dialog and, on confirmation, deletes the whole collection.
   */
  const handleDeleteCollection = useCallback((collection: Collection) => {
    openConfirmDialog({
      title: 'Delete Collection',
      message: `Are you sure you want to delete "${collection.info.name}"? This cannot be undone.`,
      confirmText: 'Delete',
      onConfirm: async () => {
        const result = await storageAdapter.deleteCollection(collection.filename || '');
        if (!result.isOk) {
          notification.showNotification('error', result.error);
          throw new Error(result.error);
        }
        removeCollection(collection.filename || '');
      },
    });
  }, [openConfirmDialog, storageAdapter, notification, removeCollection]);

  /**
   * Opens the FolderAddWizard for a target location within a collection.
   *
   * @param collectionFilename - Owning collection's persistence key
   * @param parentPath         - Folder path where the new folder will be created
   */
  const handleAddFolder = useCallback((collectionFilename: string, parentPath: string[]) => {
    setFolderAddDraft({ collectionFilename, parentPath });
  }, []);

  /**
   * Creates and persists a new empty collection JSON file.
   * The saved collection is schema-valid (waveId/name/version + empty item array).
   */
  const handleAddCollection = useCallback(async (name: string): Promise<{ success: boolean; error?: string }> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return { success: false, error: 'Collection name cannot be empty' };
    }

    const duplicateName = collections.some(
      (collection) => collection.info.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicateName) {
      return { success: false, error: `A collection named "${trimmedName}" already exists` };
    }

    const filename = generateUniqueCollectionFilename(
      trimmedName,
      collections.map((collection) => collection.filename || '')
    );

    const newCollection: Collection = {
      filename,
      info: {
        waveId: generateUniqueId(),
        name: trimmedName,
        version: CURRENT_COLLECTION_SCHEMA_VERSION,
      },
      item: [],
    };

    const saveResult = await storageAdapter.saveCollection(newCollection);
    if (!saveResult.isOk) {
      return { success: false, error: saveResult.error };
    }

    const savedCollection: Collection = {
      ...newCollection,
      ...saveResult.value,
      filename: saveResult.value.filename || newCollection.filename,
    };

    addCollection(savedCollection);
    setExpandedCollections((previous) => new Set([...previous, savedCollection.filename || filename]));
    return { success: true };
  }, [addCollection, collections, storageAdapter]);

  /**
   * Persists a new empty folder at the current `folderAddDraft` location.
   * Returns null on success, or an error message string on failure.
   */
  const handleConfirmAddFolder = useCallback(async (name: string): Promise<string | null> => {
    if (!folderAddDraft) return 'No target selected';

    const collection = collections.find(c => c.filename === folderAddDraft.collectionFilename);
    if (!collection) return 'Collection not found';

    const newFolder: CollectionItem = {
      id: generateUniqueId(),
      name,
      item: [],
    };

    const updatedItems = addItemAtPath(collection.item, folderAddDraft.parentPath, newFolder);
    const updatedCollection: Collection = { ...collection, item: updatedItems };
    const result = await storageAdapter.saveCollection(updatedCollection);
    if (!result.isOk) {
      return result.error;
    }

    updateCollection(folderAddDraft.collectionFilename, { item: updatedItems });

    // Auto-expand the parent chain so the new folder is visible
    setExpandedCollections(prev => new Set([...prev, folderAddDraft.collectionFilename]));
    if (folderAddDraft.parentPath.length > 0) {
      setExpandedFolders(prev => {
        const next = new Set(prev);
        let cumPath: string[] = [];
        for (const segment of folderAddDraft.parentPath) {
          cumPath = [...cumPath, segment];
          next.add(`${folderAddDraft.collectionFilename}:${cumPath.join('/')}`);
        }
        return next;
      });
    }

    setFolderAddDraft(null);
    return null;
  }, [folderAddDraft, collections, storageAdapter, updateCollection]);

  /**
   * Renames a folder or request inside a collection, with sibling-level uniqueness check.
   * Called from CollectionTreeItem via onRenameItem callback.
   *
   * @param collectionFilename - Filename key of the owning collection
   * @param collectionName - Current name of the owning collection (for store update)
   * @param itemId - ID of the item to rename
   * @param parentItemPath - Path of folder names from collection root to the item's parent
   * @param newName - The new name to assign
   */
  const handleRenameItem = useCallback(async (
    collectionFilename: string,
    collectionName: string,
    itemId: string,
    parentItemPath: string[],
    newName: string
  ) => {
    const collection = collections.find(c => c.filename === collectionFilename);
    if (!collection) return;

    // Shared validation: non-empty + sibling-level uniqueness (case-insensitive)
    const siblings = getSiblingsAtPath(collection.item, parentItemPath);
    const nameValidation = validateItemName(newName, siblings, itemId);
    if (!nameValidation.isOk) {
      notification.showNotification('error', nameValidation.error);
      return;
    }
    const trimmedName = nameValidation.value;
    const renamedItem = siblings.find(s => s.id === itemId);
    const oldName = renamedItem?.name;

    const updatedItems = renameItemInTree(collection.item, itemId, trimmedName);
    const updatedCollection: Collection = { ...collection, item: updatedItems };
    const result = await storageAdapter.saveCollection(updatedCollection);
    if (result.isOk) {
      updateCollection(collectionFilename, { item: updatedItems });

      // Folder rename follow-through: name-based consumers must track the
      // new path or stale references would recreate the old folder on save.
      const isFolderRename = Boolean(renamedItem && Array.isArray(renamedItem.item)) && oldName && oldName !== trimmedName;
      if (isFolderRename) {
        // 1. Remap expanded-state keys (`filename:path/segments`) so the
        //    renamed folder and its expanded descendants stay open.
        const oldPrefix = `${collectionFilename}:${[...parentItemPath, oldName].join('/')}`;
        const newPrefix = `${collectionFilename}:${[...parentItemPath, trimmedName].join('/')}`;
        setExpandedFolders(prev => new Set(
          Array.from(prev).map(key =>
            key === oldPrefix || key.startsWith(`${oldPrefix}/`)
              ? `${newPrefix}${key.slice(oldPrefix.length)}`
              : key
          )
        ));

        // 2. Update open tabs whose collectionRef path runs through the
        //    renamed folder, so save-back targets the renamed folder.
        const { tabs, updateTabMetadata } = useAppStateStore.getState();
        const depth = parentItemPath.length;
        for (const tab of tabs) {
          const ref = tab.collectionRef;
          if (
            ref &&
            ref.collectionFilename === collectionFilename &&
            ref.itemPath.length > depth &&
            ref.itemPath[depth] === oldName &&
            parentItemPath.every((segment, i) => ref.itemPath[i] === segment)
          ) {
            const newItemPath = [...ref.itemPath];
            newItemPath[depth] = trimmedName;
            updateTabMetadata(tab.id, { collectionRef: { ...ref, itemPath: newItemPath } });
          }
        }
      }
    } else {
      notification.showNotification('error', result.error);
    }
  }, [collections, storageAdapter, notification, updateCollection]);

  /**
   * Opens a confirm dialog and, on confirmation, deletes a folder or request
   * from within a collection via the storage adapter.
   * Called from CollectionTreeItem via onDeleteItem callback.
   *
   * @param collection - The owning collection
   * @param parentItemPath - Path of folder names from collection root to the item's parent
   * @param item - The CollectionItem to delete
   */
  const handleDeleteItem = useCallback((
    collection: Collection,
    parentItemPath: string[],
    item: CollectionItem
  ) => {
    const isFolder = Array.isArray(item.item);
    openConfirmDialog({
      title: `Delete ${isFolder ? 'Folder' : 'Request'}`,
      message: `Are you sure you want to delete "${item.name}"?${isFolder ? ' All items inside will also be deleted.' : ''} This cannot be undone.`,
      confirmText: 'Delete',
      onConfirm: async () => {
        const result = await storageAdapter.deleteRequestFromCollection(
          collection.filename || '',
          parentItemPath,
          item.id
        );
        if (!result.isOk) {
          notification.showNotification('error', result.error);
          throw new Error(result.error);
        }
        updateCollection(collection.filename || '', { item: result.value.item });
      },
    });
  }, [openConfirmDialog, storageAdapter, notification, updateCollection]);

  /**
   * Opens the move wizard for a request item.
   */
  const handleMoveItem = useCallback((
    collection: Collection,
    parentItemPath: string[],
    item: CollectionItem
  ) => {
    if (!collection.filename) {
      return;
    }

    setMoveItemDraft({
      sourceCollectionFilename: collection.filename,
      sourceCollectionName: collection.info.name,
      sourceParentPath: [...parentItemPath],
      item,
    });
  }, []);

  /**
   * Executes a move operation after destination confirmation.
   * Save happens before delete to avoid data loss if source deletion fails.
   */
  const handleConfirmMove = useCallback(async (
    destinationCollectionName: string,
    _requestName: string,
    destinationFolderPath: string[]
  ) => {
    if (!moveItemDraft) {
      return;
    }

    const destinationCollectionNameTrimmed = destinationCollectionName.trim();
    if (!destinationCollectionNameTrimmed) {
      notification.showNotification('error', 'Please enter a collection name.');
      return;
    }

    const destinationCollection = collections.find(
      (collection) => collection.info.name.toLowerCase() === destinationCollectionNameTrimmed.toLowerCase()
    );
    const isCreatingNewCollection = !destinationCollection;
    const destinationFilename = destinationCollection?.filename
      || `${toCollectionFilenameStem(destinationCollectionNameTrimmed)}.json`;

    const sourcePath = moveItemDraft.sourceParentPath;
    const sourceFilename = moveItemDraft.sourceCollectionFilename;
    const isSameCollectionMove = !isCreatingNewCollection && sourceFilename === destinationFilename;

    // Client-side pre-checks (same as service-side validation, for early UX feedback)
    if (isSameCollectionMove && pathsEqual(sourcePath, destinationFolderPath)) {
      notification.showNotification('error', 'Cannot move to the same collection and folder path.');
      return;
    }

    const isFolder = Array.isArray(moveItemDraft.item.item);

    // Cycle detection for folders: prevent moving a folder into itself or its descendants
    if (isFolder && isSameCollectionMove) {
      const movedFolderFullPath = [...sourcePath, moveItemDraft.item.name];
      if (isDescendantPath(movedFolderFullPath, destinationFolderPath)) {
        notification.showNotification(
          'error',
          `Cannot move folder "${moveItemDraft.item.name}" into itself or its descendants.`
        );
        return;
      }
    }

    // Name conflict check
    if (destinationCollection) {
      const destinationItems = getItemsAtPath(destinationCollection, destinationFolderPath);
      const conflict = destinationItems.find(
        (item) =>
          item.id !== moveItemDraft.item.id
          && item.name.trim().toLowerCase() === moveItemDraft.item.name.trim().toLowerCase()
      );

      if (conflict) {
        notification.showNotification(
          'error',
          `Cannot move "${moveItemDraft.item.name}": destination already contains an item named "${conflict.name}".`
        );
        return;
      }
    }

    // Call the new atomic moveCollectionItem adapter method
    const moveResult = await storageAdapter.moveCollectionItem(
      sourceFilename,
      sourcePath,
      moveItemDraft.item.id,
      destinationFilename,
      destinationFolderPath,
      isCreatingNewCollection ? destinationCollectionNameTrimmed : undefined
    );

    if (!moveResult.isOk) {
      notification.showNotification('error', moveResult.error);
      return;
    }

    // Update store with both source and destination collections
    const { source, destination } = moveResult.value;

    // If destination is newly created, add it to the store
    const destinationAlreadyExistsInStore = collections.some(
      (c) => c.filename === destination.filename
    );
    if (destinationAlreadyExistsInStore) {
      updateCollection(destination.filename, { item: destination.item });
    } else {
      addCollection(destination);
    }

    // Update source collection (unless it's the same as destination)
    if (!isSameCollectionMove) {
      updateCollection(source.filename, { item: source.item });
    }

    // Folder move follow-through: update expanded folders and tabs
    if (isFolder) {
      // 1. Remap expanded-state keys for the moved folder and its descendants
      const oldPrefix = `${sourceFilename}:${[...sourcePath, moveItemDraft.item.name].join('/')}`;
      const newPrefix = `${destinationFilename}:${[...destinationFolderPath, moveItemDraft.item.name].join('/')}`;
      setExpandedFolders(prev => new Set(
        Array.from(prev).map(key =>
          key === oldPrefix || key.startsWith(`${oldPrefix}/`)
            ? `${newPrefix}${key.slice(oldPrefix.length)}`
            : key
        )
      ));

      // 2. Update open tabs whose collectionRef path runs through the moved folder
      const { tabs, updateTabMetadata } = useAppStateStore.getState();
      const oldFullPath = [...sourcePath, moveItemDraft.item.name];
      const newFullPath = [...destinationFolderPath, moveItemDraft.item.name];

      for (const tab of tabs) {
        const ref = tab.collectionRef;
        if (!ref || ref.collectionFilename !== sourceFilename) {
          continue;
        }

        // Check if this tab's itemPath runs through the moved folder
        if (isDescendantPath(oldFullPath, ref.itemPath) || pathsEqual(oldFullPath, ref.itemPath)) {
          // Remap the itemPath to the new destination
          const relativePathSuffix = ref.itemPath.slice(oldFullPath.length);
          const newItemPath = [...newFullPath, ...relativePathSuffix];
          const newFolderPath = [destinationCollection?.info.name || destinationCollectionNameTrimmed, ...newItemPath.slice(0, -1)];

          updateTabMetadata(tab.id, {
            collectionRef: {
              collectionFilename: destinationFilename,
              collectionName: destinationCollection?.info.name || destinationCollectionNameTrimmed,
              itemPath: newItemPath,
            },
            folderPath: newFolderPath,
          });
        }
      }
    } else {
      // Request move: update the single tab if it's open
      const { tabs, updateTabMetadata } = useAppStateStore.getState();
      const movedRequestTab = tabs.find(
        (tab) =>
          tab.collectionRef?.collectionFilename === sourceFilename &&
          pathsEqual(tab.collectionRef.itemPath, [...sourcePath, moveItemDraft.item.name])
      );

      if (movedRequestTab) {
        const newItemPath = [...destinationFolderPath, moveItemDraft.item.name];
        const newFolderPath = [destinationCollection?.info.name || destinationCollectionNameTrimmed, ...destinationFolderPath];

        updateTabMetadata(movedRequestTab.id, {
          collectionRef: {
            collectionFilename: destinationFilename,
            collectionName: destinationCollection?.info.name || destinationCollectionNameTrimmed,
            itemPath: newItemPath,
          },
          folderPath: newFolderPath,
        });
      }
    }

    setMoveItemDraft(null);
  }, [addCollection, collections, moveItemDraft, notification, storageAdapter, updateCollection]);

  /**
   * Duplicates a request in-place with a unique copy name and fresh identifiers.
   */
  const handleDuplicateItem = useCallback(async (
    collection: Collection,
    parentItemPath: string[],
    item: CollectionItem
  ) => {
    if (!item.request || !collection.filename) {
      return;
    }

    const siblings = getSiblingsAtPath(collection.item, parentItemPath);
    const duplicate = duplicateRequestItem(item);
    const uniqueCopyName = generateUniqueCopyName(item.name, siblings);
    duplicate.name = uniqueCopyName;
    if (duplicate.request) {
      duplicate.request.name = uniqueCopyName;
    }

    const saveResult = await storageAdapter.saveRequestToCollection(
      collection.filename,
      parentItemPath,
      duplicate
    );
    if (!saveResult.isOk) {
      notification.showNotification('error', saveResult.error);
      return;
    }

    updateCollection(collection.filename, { item: saveResult.value.item });
  }, [notification, storageAdapter, updateCollection]);

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
            onAddClick={() => setIsAddWizardOpen(true)}
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
        <CollectionAddWizard
          isOpen={isAddWizardOpen}
          onClose={() => setIsAddWizardOpen(false)}
          onAddCollection={handleAddCollection}
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
            onAddClick={() => setIsAddWizardOpen(true)}
            onImportClick={() => setIsImportWizardOpen(true)} 
            onExportClick={() => setIsExportWizardOpen(true)}
          />
        </div>
        <div className="flex items-center justify-center h-[calc(100%-5rem)] p-4">
          <div className="text-center">
            <div className="text-red-500 mb-2">⚠️</div>
            <p className="text-sm text-red-600 dark:text-red-400 mb-2">Error loading collections</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{error}</p>
            {onRetry && (
              <SecondaryButton
                onClick={onRetry}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                Retry
              </SecondaryButton>
            )}
          </div>
        </div>
        <CollectionsImportWizard
          isOpen={isImportWizardOpen}
          onClose={() => setIsImportWizardOpen(false)}
          onImportCollection={onImportCollection}
        />
        <CollectionAddWizard
          isOpen={isAddWizardOpen}
          onClose={() => setIsAddWizardOpen(false)}
          onAddCollection={handleAddCollection}
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
            onAddClick={() => setIsAddWizardOpen(true)}
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
        <CollectionAddWizard
          isOpen={isAddWizardOpen}
          onClose={() => setIsAddWizardOpen(false)}
          onAddCollection={handleAddCollection}
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
          onAddClick={() => setIsAddWizardOpen(true)}
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
                    onClick={() => editingCollectionFilename !== filename && toggleCollection(filename)}
                >
                <div className="flex items-center flex-1 mb-1">
                        {expandedCollections.has(filename) ? (
                        <ChevronDownIcon className="h-5 w-5 text-slate-500 mr-2 flex-shrink-0" />
                        ) : (
                        <ChevronRightIcon className="h-5 w-5 text-slate-500 mr-2 flex-shrink-0" />
                        )}
                        <LayoutGridIcon className="h-4 w-4 text-amber-600 mr-2 flex-shrink-0" />
                        {editingCollectionFilename === filename ? (
                          <Input
                            value={editingCollectionNameDraft}
                            onChange={(e) => setEditingCollectionNameDraft(e.target.value)}
                            onBlur={handleRenameCollectionEnd}
                            onFocus={handleRenameInputFocus}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameCollectionEnd();
                              if (e.key === 'Escape') setEditingCollectionFilename(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-7 text-sm py-0 font-semibold flex-1 border border-blue-300/80 dark:border-blue-500/70 bg-white dark:bg-slate-900 ring-2 ring-blue-500/20 shadow-sm"
                            autoFocus
                          />
                        ) : (
                          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-words">
                            {collection.info.name}
                          </h3>
                        )}
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
                    <DropdownMenuContent align="end" className="min-w-32">
                      <DropdownMenuItem onClick={() => handleRunCollection(collection.info.name, collection.item, [])}>
                        <PlayIcon className="h-4 w-4 mr-2" />
                        Run
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        handleAddFolder(filename, []);
                      }}>
                        <FolderPlusIcon className="h-4 w-4 mr-2" />
                        New Folder
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        handleRenameCollectionStart(filename, collection.info.name);
                      }}>
                        <PencilIcon className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCollection(collection);
                        }}
                      >
                        <Trash2Icon className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
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
                                onRenameItem={(itemId, newName, parentItemPath) =>
                                  handleRenameItem(filename, collection.info.name, itemId, parentItemPath, newName)
                                }
                                onDeleteItem={(deletedItem, parentItemPath) =>
                                  handleDeleteItem(collection, parentItemPath, deletedItem)
                                }
                                onMoveItem={(movedItem, parentItemPath) =>
                                  handleMoveItem(collection, parentItemPath, movedItem)
                                }
                                onDuplicateItem={(duplicatedItem, parentItemPath) =>
                                  handleDuplicateItem(collection, parentItemPath, duplicatedItem)
                                }
                                onAddFolder={(parentItemPath) =>
                                  handleAddFolder(filename, parentItemPath)
                                }
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
      <CollectionAddWizard
        isOpen={isAddWizardOpen}
        onClose={() => setIsAddWizardOpen(false)}
        onAddCollection={handleAddCollection}
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
      />
      <RequestSaveWizard
        isOpen={Boolean(moveItemDraft)}
        mode="move"
        itemKind={moveItemDraft && Array.isArray(moveItemDraft.item.item) ? 'folder' : 'request'}
        sourceCollectionName={moveItemDraft?.sourceCollectionName}
        initialCollectionName={moveItemDraft?.sourceCollectionName}
        currentPath={moveItemDraft?.sourceParentPath || []}
        initialRequestName={moveItemDraft?.item.name}
        onClose={() => setMoveItemDraft(null)}
        onSave={handleConfirmMove}
        filterDestination={(collectionFilename, collectionName, folderPath) => {
          // For folder moves: exclude the folder itself and all its descendants
          if (!moveItemDraft || !Array.isArray(moveItemDraft.item.item)) {
            return true; // No filtering for requests
          }

          const sourceCollection = collections.find(
            (c) => c.filename === moveItemDraft.sourceCollectionFilename
          );
          if (!sourceCollection) {
            return true;
          }

          // Only filter if moving within the same collection
          const isSameCollection = collectionFilename === moveItemDraft.sourceCollectionFilename;
          if (!isSameCollection) {
            return true;
          }

          // Exclude the folder itself and its descendants
          const movedFolderFullPath = [...moveItemDraft.sourceParentPath, moveItemDraft.item.name];
          return !isDescendantPath(movedFolderFullPath, folderPath) && !pathsEqual(movedFolderFullPath, folderPath);
        }}
      />
      {(() => {
        const draft = folderAddDraft;
        if (!draft) return null;
        const col = collections.find(c => c.filename === draft.collectionFilename);
        const siblings = col ? getSiblingsAtPath(col.item, draft.parentPath) : [];
        return (
          <FolderAddWizard
            isOpen
            onClose={() => setFolderAddDraft(null)}
            siblings={siblings}
            onAdd={handleConfirmAddFolder}
          />
        );
      })()}
      <ConfirmDialogComponent />
    </div>
  );
};

export type { CollectionsPaneProps };
export default CollectionsPane;
