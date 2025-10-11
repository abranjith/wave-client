import React, { useState, useEffect } from 'react';
import { Trash2Icon, PlusIcon, FileIcon, XIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../ui/select';
import {MultiPartFormField} from '../../types/collection';
import useAppStateStore from '../../hooks/store/useAppStateStore';

type FieldType = 'text' | 'file';

interface MultiPartFormBodyProps {
  dropdownElement?: React.ReactNode;
}

const MultiPartFormBody: React.FC<MultiPartFormBodyProps> = ({ dropdownElement }) => {
  const updateBody = useAppStateStore((state) => state.updateMultiPartFormBody);
  const body = useAppStateStore((state) => state.body);

  // Get form fields from store, with fallback to empty array with one field
  const formFields = body.multiPartFormData?.data || [{ id: crypto.randomUUID(), key: '', value: '', fieldType: 'text' as const }];
  
  const [localFields, setLocalFields] = useState<{ [id: string]: { key: string; value: string | File | null } }>({});
  const [pendingFileCommit, setPendingFileCommit] = useState<string | null>(null);

  // Sync local state when form fields change
  useEffect(() => {
    console.log('Form Fields length changed:', formFields);
    console.log('Form Fields length changed, before local fields:', localFields);
    const newLocalFields: { [id: string]: { key: string; value: string | File | null } } = {};
    formFields.forEach(field => {
      if (!localFields[field.id]) {
        newLocalFields[field.id] = { key: field.key, value: field.value };
      } else {
        // Preserve existing local fields (which may contain File objects)
        newLocalFields[field.id] = localFields[field.id];
      }
    });
    setLocalFields(newLocalFields);
    console.log('Form Fields length changed, after local fields:', newLocalFields);
  }, [formFields.length]);

  // Handle pending file commit after state update
  //TODO may not work when multiple files are added quickly
  useEffect(() => {
    if (pendingFileCommit) {
      console.log(`Processing pending file commit for field ${pendingFileCommit}`);
      commitField(pendingFileCommit);
      setPendingFileCommit(null);
    }
  }, [localFields, pendingFileCommit]);

  const updateLocalField = (id: string, field: 'key' | 'value', newValue: string | File | null) => {
    console.log(`Updating local field ${id}: ${field} = ${newValue}`, newValue instanceof File ? 'File' : typeof newValue);
    setLocalFields(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: newValue
      }
    }));
  };

  const commitField = (id: string) => {
    const localField = localFields[id];
    console.log(`Committing field ${id}:`, localField);
    console.log(`Committing With field value type:`, localField?.value instanceof File ? 'File' : typeof localField?.value);
    
    if (localField) {
      const updatedFields = formFields.map(field =>
        field.id === id
          ? { ...field, key: localField.key, value: localField.value }
          : field
      );
      
      // If both key and value are present, add an empty row for next entry
      const hasKey = localField.key.trim();
      const hasValue = typeof localField.value === 'string' 
        ? localField.value.trim() 
        : localField.value instanceof File;

      if (hasKey && hasValue) {
        const isLastRow = updatedFields[updatedFields.length - 1].id === id;
        const hasEmptyRow = updatedFields.some(f => {
          const isEmpty = !f.key.trim() && (
            typeof f.value === 'string' ? !f.value.trim() : !f.value
          );
          return isEmpty;
        });

        if (isLastRow && !hasEmptyRow) {
          // Add empty field to the updated array before committing
          const fieldsWithEmpty = [...updatedFields, { id: crypto.randomUUID(), key: '', value: '', fieldType: 'text' as const }];
          updateBody(fieldsWithEmpty);
          return;
        }
      }
      
      // Only update if we didn't add an empty field above
      updateBody(updatedFields);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      commitField(id);
    }
  };

  const handleFieldTypeChange = (id: string, newType: FieldType) => {
    console.log(`Field ${id} type changed to ${newType}`);
    const updatedFields = formFields.map(field =>
      field.id === id
        ? { ...field, fieldType: newType, value: null }
        : field
    );
    
    updateBody(updatedFields);
    
    setLocalFields(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        value: null
      }
    }));
  };

  const handleFileChange = (id: string, file: File | null) => {
    if (file) {
      console.log(`File selected for field ${id}:`, file, file instanceof File ? 'File' : typeof file);
      updateLocalField(id, 'value', file);
      // Queue the commit to run after state update
      setPendingFileCommit(id);
    }
  };

  const clearFile = (id: string) => {
    updateLocalField(id, 'value', null);
    const updatedFields = formFields.map(field =>
      field.id === id
        ? { ...field, value: null }
        : field
    );
    
    updateBody(updatedFields);
  };

  const addEmptyField = () => {
    updateBody([...formFields, { id: crypto.randomUUID(), key: '', value: '', fieldType: 'text' }]);
  };

  const removeField = (id: string) => {
    if (formFields.length > 1) {
      const filteredFields = formFields.filter(field => field.id !== id);
      updateBody(filteredFields);
      setLocalFields(prev => {
        const newFields = { ...prev };
        delete newFields[id];
        return newFields;
      });
    }
  };

  const clearAll = () => {
    updateBody([{ id: crypto.randomUUID(), key: '', value: '', fieldType: 'text' }]);
    setLocalFields({});
  };

  const hasData = formFields.some(field => {
    const hasKey = field.key.trim();
    const hasValue = typeof field.value === 'string' 
      ? field.value.trim() 
      : field.value instanceof File;
    return hasKey || hasValue;
  });

  const validFieldCount = formFields.filter(field => {
    const hasKey = field.key.trim();
    const hasValue = typeof field.value === 'string' 
      ? field.value.trim() 
      : field.value instanceof File;
    return hasKey && hasValue;
  }).length;

  const getFieldTypeLabel = (type: FieldType): string => {
    return type === 'text' ? 'Text' : 'File';
  };

  //TODO - need better file input component here
  const renderValueInput = (field: MultiPartFormField) => {
    if (field.fieldType === 'file') {
      const currentFile = localFields[field.id]?.value instanceof File 
        ? localFields[field.id].value as File
        : field.value instanceof File 
          ? field.value 
          : null;

      return (
        <div className="flex items-center gap-2 w-full">
          <Input
            type="file"
            onChange={e => {
              const file = e.target.files?.[0] || null;
              handleFileChange(field.id, file);
            }}
            className="w-full text-sm rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-300 hover:file:bg-slate-200 dark:hover:file:bg-slate-700"
          />
          {currentFile && (
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-400 whitespace-nowrap">
              <FileIcon size={14} />
              <span className="max-w-[100px] truncate">{currentFile.name}</span>
              <button
                onClick={() => clearFile(field.id)}
                className="ml-1 hover:text-blue-900 dark:hover:text-blue-300"
              >
                <XIcon size={14} />
              </button>
            </div>
          )}
        </div>
      );
    }

    return (
      <Input
        type="text"
        placeholder="Field value (e.g., john_doe)"
        value={localFields[field.id]?.value as string ?? field.value as string}
        onChange={e => updateLocalField(field.id, 'value', e.target.value)}
        onBlur={() => commitField(field.id)}
        onKeyDown={e => handleKeyDown(e, field.id)}
        className="w-full text-sm rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
      />
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with Dropdown and Actions */}
      <div className="flex-shrink-0 flex items-center justify-between mb-4">
        {/* Left side - Dropdown and Stats */}
        <div className="flex items-center gap-2">
          {dropdownElement}
          {validFieldCount > 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {validFieldCount} {validFieldCount === 1 ? 'field' : 'fields'}
            </span>
          )}
        </div>

        {/* Right side - Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Clear Button */}
          {hasData && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Area - Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-white dark:bg-slate-800 z-10">
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left py-2 px-3 text-sm font-medium text-slate-700 dark:text-slate-300 w-3/12">Key</th>
              <th className="text-left py-2 px-3 text-sm font-medium text-slate-700 dark:text-slate-300 w-2/12">Field Type</th>
              <th className="text-left py-2 px-3 text-sm font-medium text-slate-700 dark:text-slate-300 w-5/12">Value</th>
              <th className="text-left py-2 px-3 text-sm font-medium text-slate-700 dark:text-slate-300 w-2/12">Actions</th>
            </tr>
          </thead>
          <tbody>
            {formFields.map((field, index) => (
              <tr key={field.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="py-2 px-3">
                  <Input
                    type="text"
                    placeholder="Field name (e.g., username)"
                    value={localFields[field.id]?.key ?? field.key}
                    onChange={e => updateLocalField(field.id, 'key', e.target.value)}
                    onBlur={() => commitField(field.id)}
                    onKeyDown={e => handleKeyDown(e, field.id)}
                    className="w-full text-sm rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                </td>
                <td className="py-2 px-3">
                  <Select 
                    value={getFieldTypeLabel(field.fieldType)} 
                    onValueChange={(value) => handleFieldTypeChange(field.id, value.toLowerCase() as FieldType)}
                  >
                    <SelectTrigger className="w-full text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Text">Text</SelectItem>
                      <SelectItem value="File">File</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-2 px-3">
                  {renderValueInput(field)}
                </td>
                <td className="py-2 px-3">
                  {formFields.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeField(field.id)}
                      className="text-red-600 hover:text-red-700 hover:border-red-300 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Field Button */}
      <div className="flex-shrink-0 flex justify-start mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={addEmptyField}
          className="text-blue-600 hover:text-blue-700 hover:border-blue-300 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <PlusIcon className="h-2 w-2 mr-0.2" />Add Field
        </Button>
      </div>
    </div>
  );
};

export default MultiPartFormBody;
