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
  ENVIRONMENT_IMPORT_FORMAT_OPTIONS,
  EnvironmentImportFormatType,
  detectEnvironmentFormat,
  transformEnvironments,
} from '../../utils/transformers';

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
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [environmentType, setEnvironmentType] = useState<EnvironmentImportFormatType>('wave');
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
   * Handles file selection — reads content immediately for content-based detection.
   * Detection chain: content → fallback 'wave'.
   */
  const handleFilesAdded = async (addedFiles: FileWithPreview[]) => {
    if (addedFiles.length === 0) return;

    const file = addedFiles[0];

    if (file.file instanceof File && !isJsonFile(file.file)) {
      setError('Please select a JSON file');
      return;
    }

    setSelectedFile(file);
    setError(null);

    if (!(file.file instanceof File)) return;

    try {
      const text = await file.file.text();
      setFileContent(text);
      const detected = detectEnvironmentFormat(text) ?? 'wave';
      setEnvironmentType(detected);
    } catch {
      setFileContent(null);
      setEnvironmentType('wave');
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
   * Handles import action — transforms to Wave format before calling onImportEnvironments.
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
        content = fileContent ?? (await selectedFile.file.text());
        fileName = selectedFile.file.name;
      } else {
        setError('Invalid file type');
        setIsImporting(false);
        return;
      }

      const result = transformEnvironments(content, environmentType);
      if (!result.isOk) {
        setError(result.error);
        setIsImporting(false);
        return;
      }

      onImportEnvironments(fileName, JSON.stringify(result.value));
      handleClose();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`Failed to import environments: ${message}`);
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
    setEnvironmentType('wave');
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

          {/* Environment Type Selection */}
          {selectedFile && (
            <div className="space-y-2">
              <Label htmlFor="environment-type" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Environment Type
              </Label>
              <Select value={environmentType} onValueChange={(value) => setEnvironmentType(value as EnvironmentImportFormatType)}>
                <SelectTrigger id="environment-type" className="w-full">
                  <SelectValue placeholder="Select environment type" />
                </SelectTrigger>
                <SelectContent>
                  {ENVIRONMENT_IMPORT_FORMAT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {fileContent !== null
                  ? 'Detected from file content. Select manually to override.'
                  : 'Select the environment type manually.'}
              </p>
            </div>
          )}

          {/* Helper Text */}
          {!selectedFile && (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Supported formats: Wave JSON (single env or array), Postman environment export
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

export default EnvImportWizard;
