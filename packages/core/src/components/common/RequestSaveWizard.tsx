import React, { useState, useMemo } from 'react';
import { XIcon, SaveIcon } from 'lucide-react';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import SearchableSelect from '../ui/searchable-select';
import { getFolderPathOptions } from '../../utils/collectionParser';
import { Collection, FolderPathOption } from '../../types/collection';

interface RequestSaveWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (collectionName: string, requestName: string, folderPath: string[]) => void;
}

const RequestSaveWizard: React.FC<RequestSaveWizardProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [requestName, setRequestName] = useState('');
  const [selectedFolderPath, setSelectedFolderPath] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const collections = useAppStateStore((state) => state.collections);
  const collectionNames = collections.map((col) => col.info.name);
  const [isCollectionInput, setIsCollectionInput] = useState(false);

  /**
   * Get folder path options for the selected collection
   */
  const folderPathOptions = useMemo(() => {
    const selectedCollection = collections.find(
      (col) => col.info.name.toLowerCase() === searchQuery.trim().toLowerCase()
    );
    
    if (!selectedCollection) {
      return [];
    }
    
    return getFolderPathOptions(selectedCollection);
  }, [collections, searchQuery]);

  /**
   * Filter collections based on search query
   */
  const filteredCollectionNames = useMemo(() => {
    if (!searchQuery.trim()) {
      return collectionNames;
    }
    const query = searchQuery.toLowerCase();
    return collectionNames.filter((collection) =>
      collection.toLowerCase().includes(query)
    );
  }, [collectionNames, searchQuery]);

  /**
   * Check if the search query matches an existing collection exactly
   */
  const isExistingCollection = useMemo(() => {
    return collectionNames.some(
      (collection) => collection.toLowerCase() === searchQuery.trim().toLowerCase()
    );
  }, [collectionNames, searchQuery]);

  /**
   * Handles save action
   */
  const handleSave = async () => {
    const collectionName = searchQuery.trim();
    const reqName = requestName.trim();

    if (!reqName) {
      setError('Please enter a request name');
      return;
    }

    if (!collectionName) {
      setError('Please enter a collection name');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Call the onSave callback with the collection name, request name, and folder path
      onSave(collectionName, reqName, selectedFolderPath);

      // Close the dialog
      handleClose();
    } catch (err: any) {
      setError(`Failed to save request: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Handles dialog close
   */
  const handleClose = () => {
    setSearchQuery('');
    setRequestName('');
    setSelectedFolderPath([]);
    setError(null);
    setIsSaving(false);
    onClose();
  };

  /**
   * Handles collection selection from the list
   */
  const handleCollectionSelect = (collectionName: string) => {
    setSearchQuery(collectionName);
    setError(null);
  };

  /**
   * Handles Enter key press
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Save Request to Collection
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
            Enter a request name and select an existing collection or create a new one
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Request Name Field */}
          <div className="space-y-2">
            <Label htmlFor="request-name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Request Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="request-name"
              type="text"
              placeholder="Enter request name..."
              value={requestName}
              onChange={(e) => setRequestName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full text-sm rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Collection Search/Input Field */}
          <div className="space-y-2">
            <Label htmlFor="collection-search" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Collection Name <span className="text-red-500">*</span>
            </Label>
            <SearchableSelect
              id="collection-search"
              name="Collection"
              options={collectionNames.map((name) => ({
                label: name,
                value: name,
              }))}
              setSelectedValue={(value) => {
                setSearchQuery(value);
                setSelectedFolderPath([]); // Reset folder path when collection changes
              }}
              selectedValue={searchQuery}
              includeOptionToCreateNew
              onCreateNewOption={(isSelected) => {
                setSearchQuery('');
                setSelectedFolderPath([]);
                setError(null);
                setIsCollectionInput(isSelected);
              }}
            />
            {isCollectionInput && (
              <Input
                id="collection-name"
                type="text"
                placeholder="Enter new collection name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full text-sm rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
              />
            )}
          </div>

          {/* Folder Path Selector - Only show for existing collections with folders */}
          {isExistingCollection && folderPathOptions.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="folder-path" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Save to Folder (optional)
              </Label>
              <SearchableSelect
                id="folder-path"
                name="Folder"
                options={folderPathOptions.map((opt) => ({
                  label: opt.displayPath,
                  value: opt.path.join('/'),
                }))}
                setSelectedValue={(value) => {
                  const path = value ? value.split('/') : [];
                  setSelectedFolderPath(path.length === 1 && path[0] === '' ? [] : path);
                }}
                selectedValue={selectedFolderPath.join('/')}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select a folder to save the request in, or leave as "(Root)" for top-level
              </p>
            </div>
          )}
         
          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <SecondaryButton
            onClick={handleClose}
            disabled={isSaving}
            colorTheme="warning"
            icon={<XIcon />}
            text="Cancel"
          />
          <PrimaryButton
            onClick={handleSave}
            disabled={!searchQuery.trim() || !requestName.trim() || isSaving}
            colorTheme="main"
            icon={<SaveIcon />}
            text={isSaving ? 'Saving...' : 'Save'}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RequestSaveWizard;
