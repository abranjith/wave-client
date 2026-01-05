import React, { useState, useEffect, JSX, useMemo } from 'react';
import { Trash2Icon, PlusIcon, XIcon, PaperclipIcon } from 'lucide-react';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Switch } from '../ui/switch';
import StyledInput from '../ui/styled-input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../ui/select';
import {MultiPartFormField} from '../../types/collection';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { renderParameterizedText } from '../../utils/styling';

type FieldType = 'text' | 'file';

interface MultiPartFormBodyProps {
  dropdownElement?: React.ReactNode;
}

const MultiPartFormBody: React.FC<MultiPartFormBodyProps> = ({ dropdownElement }) => {
  const activeTab = useAppStateStore((state) => state.getActiveTab());
  const updateBody = useAppStateStore((state) => state.updateMultiPartFormBody);
  const toggleMultiPartFormFieldEnabled = useAppStateStore((state) => state.toggleMultiPartFormFieldEnabled);
  const body = activeTab?.body;
  const getActiveEnvVariableKeys = useAppStateStore((state) => state.getActiveEnvVariableKeys);
  
  // Get merged environment variables (global + tab's environment)
  const activeEnvVariables = useMemo(() => {
    return getActiveEnvVariableKeys(activeTab?.environmentId);
  }, [activeTab?.environmentId, getActiveEnvVariableKeys]);

  // Get form fields from store - use useMemo to prevent creating new array reference
  const formFields: MultiPartFormField[] = useMemo(() => {
    return body?.multiPartFormData?.data || [{ id: crypto.randomUUID(), key: '', value: '', fieldType: 'text' as const, disabled: false }];
  }, [body?.multiPartFormData?.data]);

  const [localFields, setLocalFields] = useState<{ [id: string]: { key: string; value: string | File | null, disabled: boolean } }>({});
  const [styledLocalFields, setStyledLocalFields] = useState<{ [id: string]: { key: JSX.Element; value: JSX.Element } }>({});
  const [pendingFileCommit, setPendingFileCommit] = useState<string | null>(null);
  const [fileInputKeys, setFileInputKeys] = useState<{ [id: string]: number }>({});

  // Initialize local fields only when formFields structure changes (new fields added/removed)
  useEffect(() => {
    const newLocalFields: { [id: string]: { key: string; value: string | File | null, disabled: boolean } } = {};
    
    formFields.forEach((field: MultiPartFormField) => {
      // Preserve existing local values (which may contain File objects), or initialize from formFields
      if (localFields[field.id]) {
        newLocalFields[field.id] = localFields[field.id];
      } else {
        newLocalFields[field.id] = { key: field.key, value: field.value, disabled: field.disabled };
      }
    });
    
    // Only update if fields were added or removed
    const fieldIdsChanged = 
      formFields.length !== Object.keys(localFields).length ||
      formFields.some((field: MultiPartFormField) => !localFields[field.id]);
    
    if (fieldIdsChanged) {
      setLocalFields(newLocalFields);
    }
  }, [formFields]);

  // Regenerate styled fields whenever localFields or activeEnvVariables change
  useEffect(() => {
    const newStyledLocalFields: { [id: string]: { key: JSX.Element; value: JSX.Element } } = {};
    
    Object.keys(localFields).forEach(id => {
      const localValue = localFields[id].value;
      newStyledLocalFields[id] = {
        key: renderParameterizedText(localFields[id].key, activeEnvVariables),
        value: typeof localValue === 'string' 
          ? renderParameterizedText(localValue, activeEnvVariables) 
          : renderParameterizedText('', activeEnvVariables)
      };
    });
    
    setStyledLocalFields(newStyledLocalFields);
  }, [localFields, activeEnvVariables]);

  // Handle pending file commit after state update
  //TODO may not work when multiple files are added quickly
  useEffect(() => {
    if (pendingFileCommit) {
      commitField(pendingFileCommit);
      setPendingFileCommit(null);
    }
  }, [localFields, pendingFileCommit]);

  const updateLocalField = (id: string, field: 'key' | 'value', newValue: string | File | null) => {
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
    
    if (localField) {
      const updatedFields = formFields.map((field: MultiPartFormField) =>
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
        const hasEmptyRow = updatedFields.some((f: MultiPartFormField) => {
          const isEmpty = !f.key.trim() && (
            typeof f.value === 'string' ? !f.value.trim() : !f.value
          );
          return isEmpty;
        });

        if (isLastRow && !hasEmptyRow) {
          // Add empty field to the updated array before committing
          const fieldsWithEmpty = [...updatedFields, { id: crypto.randomUUID(), key: '', value: '', fieldType: 'text' as const, disabled: false }];
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
    const updatedFields = formFields.map((field: MultiPartFormField) =>
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
      updateLocalField(id, 'value', file);
      // Queue the commit to run after state update
      setPendingFileCommit(id);
    }
  };

  const clearFile = (id: string) => {
    updateLocalField(id, 'value', null);
    const updatedFields = formFields.map((field: MultiPartFormField) =>
      field.id === id
        ? { ...field, value: null }
        : field
    );
    
    updateBody(updatedFields);
    
    // Force remount of file input by changing its key
    setFileInputKeys(prev => ({
      ...prev,
      [id]: (prev[id] || 0) + 1
    }));
  };

  const addEmptyField = () => {
    updateBody([...formFields, { id: crypto.randomUUID(), key: '', value: '', fieldType: 'text', disabled: false }]);
  };

  const removeField = (id: string) => {
    if (formFields.length > 1) {
      const filteredFields = formFields.filter((field: MultiPartFormField) => field.id !== id);
      updateBody(filteredFields);
      setLocalFields(prev => {
        const newFields = { ...prev };
        delete newFields[id];
        return newFields;
      });
    }
  };

  const clearAll = () => {
    updateBody([{ id: crypto.randomUUID(), key: '', value: '', fieldType: 'text', disabled: false }]);
    setLocalFields({});
  };

  const hasData = formFields.some((field: MultiPartFormField) => {
    const hasKey = field.key.trim();
    const hasValue = typeof field.value === 'string' 
      ? field.value.trim() 
      : field.value instanceof File;
    return hasKey || hasValue;
  });

  const validFieldCount = formFields.filter((field: MultiPartFormField) => {
    const hasKey = field.key.trim();
    const hasValue = typeof field.value === 'string' 
      ? field.value.trim() 
      : field.value instanceof File;
    return hasKey && hasValue && !field.disabled;
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
            key={`file-${field.id}-${fileInputKeys[field.id] || 0}`}
            type="file"
            onChange={e => {
              const file = e.target.files?.[0] || null;
              handleFileChange(field.id, file);
            }}
            className="w-full text-sm rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-300 hover:file:bg-slate-200 dark:hover:file:bg-slate-700"
          />
          {currentFile && (
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap">
              <PaperclipIcon
                className="text-blue-600 dark:text-blue-400 size-4 shrink-0 opacity-60"
                aria-hidden="true"
              />
              <span className="max-w-[100px] truncate">{currentFile.name}</span>
            </div>
          )}
        </div>
      );
    }

    // For text fields, use StyledInput with parameterized text support
    return (
      <StyledInput
        type="text"
        placeholder="Field value (e.g., john_doe)"
        value={localFields[field.id]?.value as string ?? field.value as string ?? ''}
        styledValue={styledLocalFields[field.id]?.value ?? renderParameterizedText(field.value as string ?? '', activeEnvVariables)}
        onChange={e => updateLocalField(field.id, 'value', e.target.value)}
        onBlur={() => commitField(field.id)}
        onKeyDown={e => handleKeyDown(e, field.id)}
        className="bg-white border-slate-300 focus:border-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:focus:border-blue-400"
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
            <SecondaryButton
              size="sm"
              onClick={clearAll}
              colorTheme="error"
              text="Clear All"
            />
          )}
        </div>
      </div>

      {/* Main Content Area - Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[6%]">Enabled</TableHead>
              <TableHead className="w-[22%]">Key</TableHead>
              <TableHead className="w-[14%]">Field Type</TableHead>
              <TableHead className="w-[42%]">Value</TableHead>
              <TableHead className="w-[16%]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {formFields.map((field: MultiPartFormField, index: number) => {
              const isDisabled = field.disabled;
              const hasContent = Boolean(field.key) || Boolean(field.value);
              
              return (
                <TableRow 
                  key={field.id}
                >
                  <TableCell>
                    {hasContent && (
                      <Switch
                        checked={!isDisabled}
                        onCheckedChange={() => toggleMultiPartFormFieldEnabled(field.id, field.disabled)}
                      />
                    )}
                  </TableCell>
                  <TableCell className={isDisabled ? 'opacity-40' : ''}>
                  <StyledInput
                    type="text"
                    placeholder="Field name (e.g., username)"
                    value={localFields[field.id]?.key ?? field.key}
                    styledValue={styledLocalFields[field.id]?.key ?? renderParameterizedText(field.key, activeEnvVariables)}
                    onChange={e => updateLocalField(field.id, 'key', e.target.value)}
                    onBlur={() => commitField(field.id)}
                    onKeyDown={e => handleKeyDown(e, field.id)}
                    className="bg-white border-slate-300 focus:border-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:focus:border-blue-400"
                  />
                </TableCell>
                <TableCell className={isDisabled ? 'opacity-40' : ''}>
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
                </TableCell>
                <TableCell className={isDisabled ? 'opacity-40' : ''}>
                  {renderValueInput(field)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {field.fieldType === 'file' && field.value instanceof File && (
                      <SecondaryButton
                        size="sm"
                        onClick={() => clearFile(field.id)}
                        colorTheme="warning"
                        icon={<XIcon />}
                        tooltip="Clear file"
                      />
                    )}
                    {formFields.length > 1 && (
                      <SecondaryButton
                        size="sm"
                        onClick={() => removeField(field.id)}
                        colorTheme="error"
                        icon={<Trash2Icon />}
                        tooltip="Delete field"
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Add Field Button */}
      <div className="flex-shrink-0 flex justify-start mt-4">
        <SecondaryButton
          size="sm"
          onClick={addEmptyField}
          colorTheme="main"
          icon={<PlusIcon />}
          text="Add Field"
        />
      </div>
    </div>
  );
};

export default MultiPartFormBody;
