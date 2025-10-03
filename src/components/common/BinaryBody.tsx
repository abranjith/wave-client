import React from 'react';
import { FileInput } from '../ui/fileinput';
import { FileWithPreview } from '../../hooks/useFileUpload';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { getContentTypeFromFileName } from '../../utils/utils';

interface BinaryBodyProps {
  dropdownElement?: React.ReactNode;
}

const BinaryBody: React.FC<BinaryBodyProps> = ({ dropdownElement }) => {
  const { binaryBody, updateBinaryBody, updateBody } = useAppStateStore();
  
  //enhance function to accept array of files
  const handleFileSelect = async (addedFiles: FileWithPreview[]) => {
    const fileWithPreview = addedFiles[0];
    if (!fileWithPreview || !fileWithPreview.file) return;
    
    // Check if file is a File object (not FileMetadata)
    const file = fileWithPreview.file;
    if (!(file instanceof File)) return;
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const contentType = getContentTypeFromFileName(file.name);
      
      updateBinaryBody({
        data: arrayBuffer,
        fileName: file.name,
        contentType: contentType
      });
      
      // Clear text body when binary body is set
      updateBody('');
    } catch (error) {
      console.error('Error reading file:', error);
      // You might want to show an error message to the user here
    }
  };

  const handleRemoveFile = (removedFile: FileWithPreview) => {
    updateBinaryBody(undefined);
  };


  return (
    <div className="flex flex-col h-full">
      {/* Dropdown at the top */}
      {dropdownElement && (
        <div className="flex-shrink-0 mb-4">{dropdownElement}</div>
      )}
      
      {/* File upload area */}
      <div className="flex-1 flex flex-col gap-4">
        <FileInput onFilesAdded={handleFileSelect} onFileRemoved={handleRemoveFile} />
      </div>
    </div>
  );
};

export default BinaryBody;
