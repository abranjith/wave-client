import React, { useState, useMemo } from 'react';
import { SaveIcon, SearchIcon } from 'lucide-react';
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
              autoFocus
            />
          </div>

          {/* Collection Search/Input Field */}
          <div className="space-y-2">
            <Label htmlFor="collection-search" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Collection Name <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <Input
                id="collection-search"
                type="text"
                placeholder="Search or enter new collection name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-10"
              />
            </div>
            {searchQuery.trim() && !isExistingCollection && (
              <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <SaveIcon className="h-3 w-3" />
                Press Enter or click Save to create new collection "{searchQuery.trim()}"
              </p>
            )}
          </div>

          {/* Collection List */}
          {filteredCollectionNames.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                {searchQuery.trim() ? 'Matching Collections' : 'Available Collections'}
              </Label>
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-[240px] overflow-y-auto">
                {filteredCollectionNames.map((collection, index) => (
                  <button
                    key={index}
                    onClick={() => handleCollectionSelect(collection)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors border-b border-slate-100 dark:border-slate-700 last:border-b-0 ${
                      searchQuery.toLowerCase() === collection.toLowerCase()
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {collection}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No Results Message */}
          {searchQuery.trim() && filteredCollectionNames.length === 0 && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No matching collections found
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                A new collection will be created
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
