import React, { useEffect, useState } from 'react';
import { XIcon, ImportIcon } from 'lucide-react';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import Banner from '../ui/banner';
import { FileInput } from '../ui/fileinput';
import { FileWithPreview } from '../../hooks/useFileUpload';
import {
  IMPORT_FORMAT_OPTIONS,
  ImportFormatType,
  detectFormatFromContent,
  detectFormatFromFilename,
} from '../../utils/transformers';
import CollectionDestinationPicker, { type SelectedDestination } from './CollectionDestinationPicker';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import type { CollectionImportTarget } from '../../types/collection';

/** Extract a suggested collection display name from the raw file content, if parseable. */
function extractNameFromContent(content: string | null): string | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    const name = parsed?.info?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

/** Return the file basename without its final extension. */
function filenameStem(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx > 0 ? filename.slice(0, idx) : filename;
}

interface CollectionsImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onImportCollection: (
    fileName: string,
    fileContent: string,
    collectionType: string,
    target: CollectionImportTarget
  ) => void;
}

const CollectionsImportWizard: React.FC<CollectionsImportWizardProps> = ({
  isOpen,
  onClose,
  onImportCollection,
}) => {
  const [selectedFile, setSelectedFile] = useState<FileWithPreview | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [collectionType, setCollectionType] = useState<ImportFormatType>('wave');
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Destination mode
  const [importMode, setImportMode] = useState<'new' | 'existing'>('new');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [existingDestination, setExistingDestination] = useState<SelectedDestination | null>(null);

  const collections = useAppStateStore((state) => state.collections);

  /** Validate the new-collection name and surface inline error. Returns true when valid. */
  const validateNewName = (name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Please enter a collection name');
      return false;
    }
    const duplicate = collections.some(
      (c) => c.info.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setNameError(`A collection named "${trimmed}" already exists`);
      return false;
    }
    setNameError(null);
    return true;
  };

  /**
   * Handles file selection — reads content immediately for content-based detection.
   * Detection chain: content → filename → fallback 'wave'.
   * Prefills new-collection name from `info.name` (Wave/Postman JSON) or filename stem.
   */
  const handleFilesAdded = async (addedFiles: FileWithPreview[]) => {
    if (addedFiles.length === 0) return;

    const file = addedFiles[0];
    setSelectedFile(file);
    setError(null);
    setNameError(null);

    if (!(file.file instanceof File)) return;

    try {
      const text = await file.file.text();
      setFileContent(text);
      const detected =
        detectFormatFromContent(text) ??
        detectFormatFromFilename(file.file.name) ??
        'wave';
      setCollectionType(detected);
      const suggestedName = extractNameFromContent(text) ?? filenameStem(file.file.name);
      setNewCollectionName(suggestedName);
    } catch {
      setFileContent(null);
      const detected = detectFormatFromFilename(file.file.name) ?? 'wave';
      setCollectionType(detected);
      setNewCollectionName(filenameStem(file.file.name));
    }
  };

  const handleFileRemoved = () => {
    setSelectedFile(null);
    setFileContent(null);
    setNewCollectionName('');
    setNameError(null);
    setError(null);
  };

  const handleImport = async () => {
    if (!selectedFile) {
      setError('Please select a file to import');
      return;
    }

    if (importMode === 'new' && !validateNewName(newCollectionName)) {
      return;
    }

    if (importMode === 'existing' && !existingDestination) {
      setError('Please select a destination collection or folder');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      let content: string;
      let fileName: string;

      if (selectedFile.file instanceof File) {
        content = fileContent ?? (await selectedFile.file.text());
        fileName = selectedFile.file.name;
      } else {
        setError('Invalid file type');
        setIsImporting(false);
        return;
      }

      const target: CollectionImportTarget =
        importMode === 'new'
          ? { mode: 'new', collectionName: newCollectionName.trim() }
          : {
              mode: 'existing',
              collectionName: existingDestination!.collectionName,
              folderPath: existingDestination!.folderPath,
            };

      onImportCollection(fileName, content, collectionType, target);
      handleClose();
    } catch (err: any) {
      setError(`Failed to import collection: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setFileContent(null);
    setCollectionType('wave');
    setError(null);
    setIsImporting(false);
    setImportMode('new');
    setNewCollectionName('');
    setNameError(null);
    setExistingDestination(null);
    onClose();
  };

  // Re-validate the name when collections change (e.g. another import succeeded).
  useEffect(() => {
    if (importMode === 'new' && newCollectionName) {
      validateNewName(newCollectionName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections]);

  const isImportDisabled =
    !selectedFile ||
    isImporting ||
    (importMode === 'new' && (!newCollectionName.trim() || Boolean(nameError))) ||
    (importMode === 'existing' && !existingDestination);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Import Collection
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
            Upload a collection file to add it to your collections directory
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Upload Area */}
          <FileInput
            onFilesAdded={handleFilesAdded}
            onFileRemoved={handleFileRemoved}
            initialFiles={selectedFile ? [selectedFile] : []}
            useFileIcon={true}
          />

          {selectedFile && (
            <>
              {/* Collection Type Selection */}
              <div className="space-y-2">
                <Label htmlFor="collection-type" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Collection Type
                </Label>
                <Select value={collectionType} onValueChange={(value) => setCollectionType(value as ImportFormatType)}>
                  <SelectTrigger id="collection-type" className="w-full">
                    <SelectValue placeholder="Select collection type" />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPORT_FORMAT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {fileContent !== null
                    ? 'Detected from file content. Select manually to override.'
                    : 'Select the collection type manually.'}
                </p>
              </div>

              {/* Import Into */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Import Into
                </Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="import-mode"
                      value="new"
                      checked={importMode === 'new'}
                      onChange={() => {
                        setImportMode('new');
                        setError(null);
                      }}
                    />
                    Create new collection
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="import-mode"
                      value="existing"
                      checked={importMode === 'existing'}
                      onChange={() => {
                        setImportMode('existing');
                        setNameError(null);
                        setError(null);
                      }}
                    />
                    Existing collection
                  </label>
                </div>

                {importMode === 'new' && (
                  <div className="space-y-1">
                    <Input
                      id="new-collection-name"
                      type="text"
                      placeholder="Collection name..."
                      value={newCollectionName}
                      onChange={(e) => {
                        setNewCollectionName(e.target.value);
                        validateNewName(e.target.value);
                      }}
                      className="w-full text-sm rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
                    />
                    {nameError && (
                      <p className="text-xs text-red-500 dark:text-red-400">{nameError}</p>
                    )}
                  </div>
                )}

                {importMode === 'existing' && (
                  <CollectionDestinationPicker
                    selected={existingDestination}
                    onSelectedChange={(dest) => {
                      setExistingDestination(dest);
                      setError(null);
                    }}
                    isCreatingNew={false}
                    onIsCreatingNewChange={() => {}}
                    newCollectionName=""
                    onNewCollectionNameChange={() => {}}
                    includeCreateNew={false}
                    selectId="import-destination-select"
                  />
                )}
              </div>
            </>
          )}

          {/* Error Message */}
          {error && (
            <Banner
              message={error}
              messageType="error"
            />
          )}
        </div>

        <DialogFooter>
          <SecondaryButton
            onClick={handleClose}
            disabled={isImporting}
            icon={<XIcon />}
            text="Cancel"
          />
          <PrimaryButton
            onClick={handleImport}
            disabled={isImportDisabled}
            icon={<ImportIcon />}
            text={isImporting ? 'Importing...' : 'Import'}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CollectionsImportWizard;
