import React, { useState } from 'react';
import { Button } from '../ui/button';
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

interface CollectionsImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onImportCollection: (fileName: string, fileContent: string, collectionType: string) => void;
}

type CollectionType = 'json' | 'http';

const CollectionsImportWizard: React.FC<CollectionsImportWizardProps> = ({
  isOpen,
  onClose,
  onImportCollection,
}) => {
  const [selectedFile, setSelectedFile] = useState<FileWithPreview | null>(null);
  const [collectionType, setCollectionType] = useState<CollectionType>('json');
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  /**
   * Determines collection type from file extension
   */
  const getCollectionTypeFromFile = (file: File): CollectionType => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'json') {
      return 'json';
    } else if (extension === 'http') {
      return 'http';
    }
    return 'json'; // Default to json
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
    setCollectionType('json');
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
              <Select value={collectionType} onValueChange={(value) => setCollectionType(value as CollectionType)}>
                <SelectTrigger id="collection-type" className="w-full">
                  <SelectValue placeholder="Select collection type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="http">HTTP</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Type is automatically detected based on file extension
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
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!selectedFile || isImporting}
          >
            {isImporting ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CollectionsImportWizard;
