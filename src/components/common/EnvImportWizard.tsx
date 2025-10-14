import React, { useState } from 'react';
import { FileIcon, UploadIcon, XIcon } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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
   * Handles file selection
   */
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (!isJsonFile(file)) {
        setError('Please select a JSON file');
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  /**
   * Handles drag and drop
   */
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (!isJsonFile(file)) {
        setError('Please select a JSON file');
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
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
      const fileContent = await selectedFile.text();

      // Validate JSON format
      try {
        JSON.parse(fileContent);
      } catch (e) {
        throw new Error('Invalid JSON file');
      }

      // Send import request to extension host
      onImportEnvironments(selectedFile.name, fileContent);

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

  /**
   * Removes selected file
   */
  const handleRemoveFile = () => {
    setSelectedFile(null);
    setError(null);
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
          {!selectedFile ? (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
              }`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <UploadIcon className="mx-auto h-12 w-12 text-slate-400 dark:text-slate-500 mb-4" />
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                Drag and drop a JSON file here, or click to browse
              </p>
              <input
                type="file"
                id="environment-file-input"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('environment-file-input')?.click()}
                className="mt-2"
              >
                Browse Files
              </Button>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
                Only JSON files are supported
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileIcon className="h-8 w-8 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {(selectedFile.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveFile}
                  className="h-8 w-8 p-0 flex-shrink-0"
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>
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
