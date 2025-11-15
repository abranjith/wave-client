import React, { useState } from 'react';
import { Button } from '../ui/button';
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

interface EnvImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onImportEnvironments: (fileName: string, fileContent: string) => void;
}

const EnvImportWizard: React.FC<EnvImportWizardProps> = ({
  isOpen,
  onClose,
  onImportEnvironments,
}) => {
  const [selectedFile, setSelectedFile] = useState<FileWithPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  /**
   * Validates if file is a JSON file
   */
  const isJsonFile = (file: File): boolean => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return extension === 'json';
  };

  /**
   * Handles file selection from FileInput
   */
  const handleFilesAdded = (addedFiles: FileWithPreview[]) => {
    if (addedFiles.length > 0) {
      const file = addedFiles[0];
      // Validate JSON file
      if (file.file instanceof File && !isJsonFile(file.file)) {
        setError('Please select a JSON file');
        return;
      }
      setSelectedFile(file);
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

      // Validate JSON format
      try {
        JSON.parse(fileContent);
      } catch (e) {
        throw new Error('Invalid JSON file');
      }

      // Send import request to extension host
      onImportEnvironments(fileName, fileContent);

      // Close the dialog
      handleClose();
    } catch (err: any) {
      setError(`Failed to import environments: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * Handles dialog close
   */
  const handleClose = () => {
    setSelectedFile(null);
    setError(null);
    setIsImporting(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Import Environments
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
            Upload a JSON file containing environments to add to your environments directory
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

          {/* Helper Text */}
          {!selectedFile && (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Only JSON files are supported
            </p>
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

export default EnvImportWizard;
