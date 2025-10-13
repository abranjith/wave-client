import React, { useState } from 'react';
import { FileIcon, UploadIcon, XIcon } from 'lucide-react';
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
import useAppStateStore from '../../hooks/store/useAppStateStore';

interface CollectionsImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  vsCodeApi: any;
}

type CollectionType = 'json' | 'http';

const CollectionsImportWizard: React.FC<CollectionsImportWizardProps> = ({
  isOpen,
  onClose,
  vsCodeApi,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [collectionType, setCollectionType] = useState<CollectionType>('json');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const refreshCollections = useAppStateStore((state) => state.refreshCollections);

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
   * Handles file selection
   */
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      setCollectionType(getCollectionTypeFromFile(file));
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
      setSelectedFile(file);
      setCollectionType(getCollectionTypeFromFile(file));
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

      // Send import request to extension host
      vsCodeApi.postMessage({
        type: 'importCollection',
        data: {
          fileName: selectedFile.name,
          fileContent,
          collectionType,
        },
      });

      // Close the dialog
      handleClose();

      // Refresh collections after a short delay to allow file to be saved
      setTimeout(() => {
        refreshCollections(vsCodeApi);
      }, 500);
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
            Import Collection
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
            Upload a collection file to add it to your collections directory
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
                Drag and drop a collection file here, or click to browse
              </p>
              <input
                type="file"
                id="collection-file-input"
                accept=".json,.http"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('collection-file-input')?.click()}
                className="mt-2"
              >
                Browse Files
              </Button>
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

export default CollectionsImportWizard;
