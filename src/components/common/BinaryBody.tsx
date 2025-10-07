import React from 'react';
import { FileInput } from '../ui/fileinput';
import { FileWithPreview } from '../../hooks/useFileUpload';
import useAppStateStore from '../../hooks/store/useAppStateStore';

interface BinaryBodyProps {
  dropdownElement?: React.ReactNode;
}

//TODO - error handling to the user
const BinaryBody: React.FC<BinaryBodyProps> = ({ dropdownElement }) => {
  const updateBody = useAppStateStore((state) => state.updateBody);
  const body = useAppStateStore((state) => state.body);
  
  //enhance function to accept array of files
  const handleFileSelect = async (addedFiles: FileWithPreview[]) => {
    const fileWithPreview = addedFiles[0];
    if (!fileWithPreview || !fileWithPreview.file) return;
    
    // Check if file is a File object (not FileMetadata)
    const file = fileWithPreview.file;
    if (!(file instanceof File)) return;

    updateBody(fileWithPreview, 'binary', 'none'); // Clear existing body before setting new binary body
  };

  const handleRemoveFile = (removedFile: FileWithPreview) => {
    updateBody(null, body.bodyType, 'none');
  };

  const getInitialFiles = (): FileWithPreview[] => {
    if (body && body.bodyType === 'binary' && body.data && typeof body.data !== 'string' && 'file' in body.data) {
      return [body.data as FileWithPreview];
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
