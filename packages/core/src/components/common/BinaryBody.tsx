import React from 'react';
import { FileInput } from '../ui/fileinput';
import { FileWithPreview } from '../../hooks/useFileUpload';
import { FileReference } from '../../types/collection';
import useAppStateStore from '../../hooks/store/useAppStateStore';

interface BinaryBodyProps {
  dropdownElement?: React.ReactNode;
}

/**
 * Converts a FileWithPreview to a FileReference for storage.
 * Reads the file content and stores it as base64 for browser files.
 */
async function fileToReference(fileWithPreview: FileWithPreview): Promise<FileReference> {
  const file = fileWithPreview.file;
  
  // Ensure it's a real File object (not FileMetadata)
  if (!(file instanceof File)) {
    throw new Error('Cannot convert FileMetadata to FileReference - must be a File object');
  }
  
  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  // Convert to base64
  const base64 = btoa(
    Array.from(uint8Array)
      .map(byte => String.fromCharCode(byte))
      .join('')
  );
  
  return {
    path: '', // Not needed for browser files
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    pathType: 'browser',
    storageType: 'local',
    fileData: base64,
  };
}

//TODO - error handling to the user
const BinaryBody: React.FC<BinaryBodyProps> = ({ dropdownElement }) => {
  const activeTab = useAppStateStore((state) => state.getActiveTab());
  const updateFileBody = useAppStateStore((state) => state.updateFileBody);
  const body = activeTab?.body;
  
  const handleFileSelect = async (addedFiles: FileWithPreview[]) => {
    const fileWithPreview = addedFiles[0];
    if (!fileWithPreview || !fileWithPreview.file) return;
    
    const file = fileWithPreview.file;
    if (!(file instanceof File)) return;

    // Convert to FileReference for storage
    const fileRef = await fileToReference(fileWithPreview);
    updateFileBody(fileRef);
  };

  const handleRemoveFile = (_removedFile: FileWithPreview) => {
    updateFileBody(null);
  };

  const getInitialFiles = (): FileWithPreview[] => {
    // In the new design, we only store FileReference (metadata)
    // We can't recreate the actual File from metadata alone
    // This is a limitation - files need to be re-selected after reload
    if (body?.mode === 'file' && body.file) {
      // Return a placeholder that shows the file info
      const fileRef = body.file;
      // Note: We can't create a real File from FileReference
      // This is for display purposes only - using FileMetadata format
      return [{
        id: `file-${fileRef.fileName}-${fileRef.size}`,
        file: {
          name: fileRef.fileName || 'Selected file',
          size: fileRef.size || 0,
          type: fileRef.contentType || 'application/octet-stream',
        } as File,
        preview: fileRef.path || '',
      }];
    }
    return [];
  };

  return (
    <div className="flex flex-col h-full">
      {/* Dropdown at the top */}
      {dropdownElement && (
        <div className="flex-shrink-0 mb-4">{dropdownElement}</div>
      )}
      
      {/* File upload area */}
      <div className="flex-1 flex flex-col gap-4">
        <FileInput onFilesAdded={handleFileSelect} onFileRemoved={handleRemoveFile} initialFiles={getInitialFiles()} />
      </div>
    </div>
  );
};

export default BinaryBody;
