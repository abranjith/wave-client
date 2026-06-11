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
import useAppStateStore from '../../hooks/store/useAppStateStore';
import SearchableSelect from '../ui/searchable-select';
import { getFolderPathOptions } from '../../utils/collectionParser';

const pathsEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((segment, index) => segment === right[index]);
};

export type RequestSaveWizardMode = 'save' | 'move';

/** A selectable destination: a collection root or a folder within a collection. */
interface DestinationOption {
  collectionName: string;
  folderPath: string[];
  label: string;
}

interface SelectedDestination {
  collectionName: string;
  folderPath: string[];
}

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
  /** Destination collection prefill used for move workflows. */
  initialCollectionName?: string;
  /** Source/destination folder prefill used for move workflows. */
  currentPath?: string[];
  /** Source collection display name shown in move mode current location text. */
  sourceCollectionName?: string;
  /** Existing request name used when mode is move. */
  initialRequestName?: string;
}

const RequestSaveWizard: React.FC<RequestSaveWizardProps> = ({
  isOpen,
  onClose,
  onSave,
  mode = 'save',
  initialCollectionName,
  currentPath,
  sourceCollectionName,
  initialRequestName,
}) => {
  const isMoveMode = mode === 'move';
  const [requestName, setRequestName] = useState('');
  const [selectedDestination, setSelectedDestination] = useState<SelectedDestination | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [isCollectionInput, setIsCollectionInput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const collections = useAppStateStore((state) => state.collections);

  /**
   * One flat list of every destination: each collection root plus every folder
   * (any depth) within it, labelled "Collection / Folder / Subfolder".
   */
  const destinationOptions = useMemo(() => {
    const options: DestinationOption[] = [];

    for (const collection of collections) {
      const collectionName = collection.info.name;
      for (const folderOption of getFolderPathOptions(collection)) {
        options.push({
          collectionName,
          folderPath: folderOption.path,
          label:
            folderOption.path.length === 0
              ? collectionName
              : `${collectionName} / ${folderOption.displayPath}`,
        });
      }
    }

    return options;
  }, [collections]);

  const selectedDestinationIndex = useMemo(() => {
    if (!selectedDestination) {
      return -1;
    }

    return destinationOptions.findIndex(
      (option) =>
        option.collectionName === selectedDestination.collectionName &&
        pathsEqual(option.folderPath, selectedDestination.folderPath)
    );
  }, [destinationOptions, selectedDestination]);

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
    const reqName = isMoveMode
      ? (initialRequestName || requestName).trim()
      : requestName.trim();

    if (!reqName) {
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
            {isMoveMode ? 'Move Request to Collection' : 'Save Request to Collection'}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
            {isMoveMode
              ? 'Select a destination collection or folder for this request.'
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
            <SearchableSelect
              id="destination-select"
              name="Collection"
              placeholder="Select destination..."
              options={destinationOptions.map((option, index) => ({
                label: option.label,
                // Use stable indexes so names containing '/' remain intact.
                value: String(index),
              }))}
              setSelectedValue={(value) => {
                const parsedIndex = Number.parseInt(value, 10);
                const option = Number.isNaN(parsedIndex)
                  ? undefined
                  : destinationOptions[parsedIndex];
                setSelectedDestination(
                  option
                    ? { collectionName: option.collectionName, folderPath: option.folderPath }
                    : null
                );
                setError(null);
              }}
              selectedValue={selectedDestinationIndex >= 0 ? String(selectedDestinationIndex) : ''}
              includeOptionToCreateNew
              onCreateNewOption={(isSelected) => {
                setIsCollectionInput(isSelected);
                // Only reset state when entering create-new mode; a regular
                // selection must survive the (false) notification.
                if (isSelected) {
                  setSelectedDestination(null);
                  setNewCollectionName('');
                  setError(null);
                }
              }}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pick a collection or a folder within it
            </p>
            {isCollectionInput && (
              <Input
                id="collection-name"
                type="text"
                placeholder="Enter new collection name..."
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
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
            text={isSaving ? (isMoveMode ? 'Moving...' : 'Saving...') : (isMoveMode ? 'Move' : 'Save')}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RequestSaveWizard;
