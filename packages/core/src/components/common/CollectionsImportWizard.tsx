import React, { useState } from 'react';
import { XIcon, ImportIcon } from 'lucide-react';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Label } from '../ui/label';
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

interface CollectionsImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onImportCollection: (fileName: string, fileContent: string, collectionType: string) => void;
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

  /**
   * Handles file selection — reads content immediately for content-based detection.
   * Detection chain: content → filename → fallback 'wave'.
   */
  const handleFilesAdded = async (addedFiles: FileWithPreview[]) => {
    if (addedFiles.length === 0) return;

    const file = addedFiles[0];
    setSelectedFile(file);
    setError(null);

    if (!(file.file instanceof File)) return;

    try {
      const text = await file.file.text();
      setFileContent(text);
      const detected =
        detectFormatFromContent(text) ??
        detectFormatFromFilename(file.file.name) ??
        'wave';
      setCollectionType(detected);
    } catch {
      // Read failed — fall back to filename-only detection
      setFileContent(null);
      const detected = detectFormatFromFilename(file.file.name) ?? 'wave';
      setCollectionType(detected);
    }
  };

  /**
   * Handles file removal.
   */
  const handleFileRemoved = () => {
    setSelectedFile(null);
    setFileContent(null);
    setError(null);
  };

  /**
   * Handles import action — uses the content cached at selection time.
   */
  const handleImport = async () => {
    if (!selectedFile) {
      setError('Please select a file to import');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      let content: string;
      let fileName: string;

      if (selectedFile.file instanceof File) {
        // Reuse cached content; fall back to a fresh read only if the cache is missing.
        content = fileContent ?? (await selectedFile.file.text());
        fileName = selectedFile.file.name;
      } else {
        setError('Invalid file type');
        setIsImporting(false);
        return;
      }

      onImportCollection(fileName, content, collectionType);
      handleClose();
    } catch (err: any) {
      setError(`Failed to import collection: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * Handles dialog close — resets all wizard state.
   */
  const handleClose = () => {
    setSelectedFile(null);
    setFileContent(null);
    setCollectionType('wave');
    setError(null);
    setIsImporting(false);
    onClose();
  };

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

          {/* Collection Type Selection */}
          {selectedFile && (
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
            disabled={!selectedFile || isImporting}
            icon={<ImportIcon />}
            text={isImporting ? 'Importing...' : 'Import'}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CollectionsImportWizard;
