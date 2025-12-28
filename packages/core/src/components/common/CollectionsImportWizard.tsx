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
import { IMPORT_FORMAT_OPTIONS, ImportFormatType, detectFormatFromFilename } from '../../utils/transformers';

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
  const [collectionType, setCollectionType] = useState<ImportFormatType>('wave');
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  /**
   * Determines collection type from file extension
   */
  const getCollectionTypeFromFile = (file: File): ImportFormatType => {
    const detectedType = detectFormatFromFilename(file.name);
    return detectedType || 'wave'; // Default to wave for .json files
  };

  /**
   * Handles file selection from FileInput
   */
  const handleFilesAdded = (addedFiles: FileWithPreview[]) => {
    if (addedFiles.length > 0) {
      const file = addedFiles[0];
      setSelectedFile(file);
      // Get the actual File object to determine type
      if (file.file instanceof File) {
        setCollectionType(getCollectionTypeFromFile(file.file));
      }
      setError(null);
    }
  };

  /**
   * Handles file removal from FileInput
   */
  const handleFileRemoved = () => {
    setSelectedFile(null);
    setError(null);
  };

  /**
   * Handles import action
   */
  const handleImport = async () => {
    if (!selectedFile) {
      setError('Please select a file to import');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      // Read file content
      let fileContent: string;
      let fileName: string;

      if (selectedFile.file instanceof File) {
        fileContent = await selectedFile.file.text();
        fileName = selectedFile.file.name;
      } else {
        // Handle FileMetadata case (shouldn't happen in this flow, but for type safety)
        setError('Invalid file type');
        setIsImporting(false);
        return;
      }

      // Send import request to extension host
      onImportCollection(fileName, fileContent, collectionType);

      // Close the dialog
      handleClose();
    } catch (err: any) {
      setError(`Failed to import collection: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * Handles dialog close
   */
  const handleClose = () => {
    setSelectedFile(null);
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
                Type is automatically detected based on the file. Select manually if detection is incorrect.
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
            colorTheme="warning"
            icon={<XIcon />}
            text="Cancel"
          />
          <PrimaryButton
            onClick={handleImport}
            disabled={!selectedFile || isImporting}
            colorTheme="main"
            icon={<ImportIcon />}
            text={isImporting ? 'Importing...' : 'Import'}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CollectionsImportWizard;
