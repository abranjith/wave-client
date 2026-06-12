import React, { useEffect, useMemo, useState } from 'react';
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
import CollectionDestinationPicker, { type SelectedDestination } from './CollectionDestinationPicker';

export type RequestSaveWizardMode = 'save' | 'move';

interface RequestSaveWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (collectionName: string, requestName: string, folderPath: string[]) => void;
  /**
   * Dialog mode.
   * - save: create/save request to a destination
   * - move: move an existing request to a destination
   */
  mode?: RequestSaveWizardMode;
  /**
   * Item kind being moved/saved.
   * - request: moving/saving a request
   * - folder: moving a folder (only valid in move mode)
   */
  itemKind?: 'request' | 'folder';
  /** Destination collection prefill used for move workflows. */
  initialCollectionName?: string;
  /** Source/destination folder prefill used for move workflows. */
  currentPath?: string[];
  /** Source collection display name shown in move mode current location text. */
  sourceCollectionName?: string;
  /** Existing request name used when mode is move. */
  initialRequestName?: string;
  /**
   * Optional filter function for CollectionDestinationPicker.
   * Used to exclude invalid destinations (e.g., moving a folder into itself or its descendants).
   */
  filterDestination?: (collectionFilename: string, collectionName: string, folderPath: string[]) => boolean;
}

const RequestSaveWizard: React.FC<RequestSaveWizardProps> = ({
  isOpen,
  onClose,
  onSave,
  mode = 'save',
  itemKind = 'request',
  initialCollectionName,
  currentPath,
  sourceCollectionName,
  initialRequestName,
  filterDestination,
}) => {
  const isMoveMode = mode === 'move';
  const isFolderMove = isMoveMode && itemKind === 'folder';
  const [requestName, setRequestName] = useState('');
  const [selectedDestination, setSelectedDestination] = useState<SelectedDestination | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [isCollectionInput, setIsCollectionInput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const currentLocationText = useMemo(() => {
    if (!isMoveMode) {
      return '';
    }

    const resolvedCollectionName =
      sourceCollectionName?.trim() || initialCollectionName?.trim() || 'Unknown Collection';
    if (!currentPath || currentPath.length === 0) {
      return `Current location: ${resolvedCollectionName} (root)`;
    }

    return `Current location: ${resolvedCollectionName} / ${currentPath.join(' / ')}`;
  }, [currentPath, initialCollectionName, isMoveMode, sourceCollectionName]);

  const hasDestination = isCollectionInput
    ? Boolean(newCollectionName.trim())
    : selectedDestination !== null;

  /**
   * Handles save action
   */
  const handleSave = async () => {
    const collectionName = isCollectionInput
      ? newCollectionName.trim()
      : selectedDestination?.collectionName ?? '';
    const folderPath = isCollectionInput ? [] : selectedDestination?.folderPath ?? [];
    const reqName = isFolderMove
      ? '' // Folders don't have a request name
      : isMoveMode
      ? (initialRequestName || requestName).trim()
      : requestName.trim();

    // Only validate request name for request operations
    if (!isFolderMove && !reqName) {
      setError('Please enter a request name');
      return;
    }

    if (!collectionName) {
      setError(
        isCollectionInput ? 'Please enter a collection name' : 'Please select a destination'
      );
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Call the onSave callback with the collection name, request name, and folder path
      onSave(collectionName, reqName, folderPath);

      // Close the dialog
      handleClose();
    } catch (err: any) {
      setError(`Failed to save request: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedDestination(
      initialCollectionName
        ? { collectionName: initialCollectionName, folderPath: currentPath || [] }
        : null
    );
    setNewCollectionName('');
    setRequestName(initialRequestName || '');
    setError(null);
    setIsSaving(false);
    setIsCollectionInput(false);
  }, [isOpen, initialCollectionName, currentPath, initialRequestName]);

  /**
   * Handles dialog close
   */
  const handleClose = () => {
    setSelectedDestination(null);
    setNewCollectionName('');
    setRequestName('');
    setError(null);
    setIsSaving(false);
    setIsCollectionInput(false);
    onClose();
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
            {isMoveMode
              ? (isFolderMove ? 'Move Folder to Collection' : 'Move Request to Collection')
              : 'Save Request to Collection'
            }
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
            {isMoveMode
              ? (isFolderMove
                  ? 'Select a destination collection or folder for this folder.'
                  : 'Select a destination collection or folder for this request.')
              : 'Enter a request name and select a destination collection or folder, or create a new collection'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!isMoveMode && (
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
          )}

          {isMoveMode && (
            <p className="rounded bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {currentLocationText}
            </p>
          )}

          {/* Destination Selector — collection roots and folders in one searchable list */}
          <div className="space-y-2">
            <Label htmlFor="destination-select" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Destination <span className="text-red-500">*</span>
            </Label>
            <CollectionDestinationPicker
              selected={selectedDestination}
              onSelectedChange={(dest) => {
                setSelectedDestination(dest);
                setError(null);
              }}
              isCreatingNew={isCollectionInput}
              onIsCreatingNewChange={(isCreating) => {
                setIsCollectionInput(isCreating);
                // Only reset state when entering create-new mode; a regular
                // selection must survive the (false) notification.
                if (isCreating) {
                  setNewCollectionName('');
                  setError(null);
                }
              }}
              newCollectionName={newCollectionName}
              onNewCollectionNameChange={setNewCollectionName}
              includeCreateNew
              onKeyDown={handleKeyDown}
              filterDestination={filterDestination}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pick a collection or a folder within it
            </p>
          </div>

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
            icon={<XIcon />}
            text="Cancel"
          />
          <PrimaryButton
            onClick={handleSave}
            disabled={!hasDestination || (!isMoveMode && !requestName.trim()) || isSaving}
            icon={<SaveIcon />}
            text={isSaving
              ? (isMoveMode ? (isFolderMove ? 'Moving folder...' : 'Moving...') : 'Saving...')
              : (isMoveMode ? 'Move' : 'Save')
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RequestSaveWizard;
