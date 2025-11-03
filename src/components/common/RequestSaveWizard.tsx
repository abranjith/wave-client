import React, { useState, useMemo } from 'react';
import { Button } from '../ui/button';
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

interface RequestSaveWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (collectionName: string, requestName: string) => void;
}

const RequestSaveWizard: React.FC<RequestSaveWizardProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [requestName, setRequestName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const collections = useAppStateStore((state) => state.collections);
  const collectionNames = collections.map((col) => col.name);
  const [isCollectionInput, setIsCollectionInput] = useState(false);

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
      // Call the onSave callback with the collection name and request name
      onSave(collectionName, reqName);

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
              setSelectedValue={setSearchQuery}
              selectedValue={searchQuery}
              includeOptionToCreateNew
              onCreateNewOption={(isSelected) => {
                setSearchQuery('');
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
         
          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!searchQuery.trim() || !requestName.trim() || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RequestSaveWizard;
