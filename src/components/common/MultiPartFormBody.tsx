import React, { useState, useEffect } from 'react';
import { Trash2Icon, FileIcon, XIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../ui/select';

type FieldType = 'text' | 'file';

interface MultiPartFormField {
  id: string;
  key: string;
  value: string | File;
  fieldType: FieldType;
}

interface MultiPartFormBodyProps {
  dropdownElement?: React.ReactNode;
}

const MultiPartFormBody: React.FC<MultiPartFormBodyProps> = ({ dropdownElement }) => {
  const [formFields, setFormFields] = useState<MultiPartFormField[]>([
    { id: crypto.randomUUID(), key: '', value: '', fieldType: 'text' }
  ]);
  const [localFields, setLocalFields] = useState<{ [id: string]: { key: string; value: string | File } }>({});

  // Sync local state when form fields change
  useEffect(() => {
    const newLocalFields: { [id: string]: { key: string; value: string | File } } = {};
    formFields.forEach(field => {
      if (!localFields[field.id]) {
        newLocalFields[field.id] = { key: field.key, value: field.value };
      } else {
        newLocalFields[field.id] = localFields[field.id];
      }
    });
    setLocalFields(newLocalFields);
  }, [formFields.length]);

  const updateLocalField = (id: string, field: 'key' | 'value', newValue: string | File) => {
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
      setFormFields(prev =>
        prev.map(field =>
          field.id === id
            ? { ...field, key: localField.key, value: localField.value }
            : field
        )
      );

      // If both key and value are present, add an empty row for next entry
      const hasKey = localField.key.trim();
      const hasValue = typeof localField.value === 'string' 
        ? localField.value.trim() 
        : localField.value instanceof File;

      if (hasKey && hasValue) {
        const isLastRow = formFields[formFields.length - 1].id === id;
        const hasEmptyRow = formFields.some(f => {
          const isEmpty = !f.key.trim() && (
            typeof f.value === 'string' ? !f.value.trim() : false
          );
          return isEmpty;
        });

        if (isLastRow && !hasEmptyRow) {
          addEmptyField();
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      commitField(id);
    }
  };

  const handleFieldTypeChange = (id: string, newType: FieldType) => {
    setFormFields(prev =>
      prev.map(field =>
        field.id === id
          ? { ...field, fieldType: newType, value: '' }
          : field
      )
    );
    setLocalFields(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        value: ''
      }
    }));
  };

  const handleFileChange = (id: string, file: File | null) => {
    if (file) {
      updateLocalField(id, 'value', file);
      commitField(id);
    }
  };

  const clearFile = (id: string) => {
    updateLocalField(id, 'value', '');
    setFormFields(prev =>
      prev.map(field =>
        field.id === id
          ? { ...field, value: '' }
          : field
      )
    );
  };

  const addEmptyField = () => {
    setFormFields(prev => [...prev, { id: crypto.randomUUID(), key: '', value: '', fieldType: 'text' }]);
  };

  const removeField = (id: string) => {
    if (formFields.length > 1) {
      setFormFields(prev => prev.filter(field => field.id !== id));
      setLocalFields(prev => {
        const newFields = { ...prev };
        delete newFields[id];
        return newFields;
      });
    }
  };

  const clearAll = () => {
    setFormFields([{ id: crypto.randomUUID(), key: '', value: '', fieldType: 'text' }]);
    setLocalFields({});
  };

  // Get FormData for submission (for future use)
  const getFormData = (): FormData => {
    const formData = new FormData();
    formFields.forEach(field => {
      if (field.key.trim() && field.value) {
        if (typeof field.value === 'string' && field.value.trim()) {
          formData.append(field.key, field.value);
        } else if (field.value instanceof File) {
          formData.append(field.key, field.value);
        }
      }
    });
    return formData;
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
              const file = e.target.files?.[0];
              if (file) {
                handleFileChange(field.id, file);
              }
            }}
            className="w-full text-sm rounded bg-gray-50 text-gray-800 focus:outline-none file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          />
          {/*currentFile && (
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 rounded text-xs text-blue-700 whitespace-nowrap">
              <FileIcon size={14} />
              <span className="max-w-[100px] truncate">{currentFile.name}</span>
              <button
                onClick={() => clearFile(field.id)}
                className="ml-1 hover:text-blue-900"
              >
                <XIcon size={14} />
              </button>
            </div>
          )*/}
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
        className="w-full text-sm rounded bg-gray-50 text-gray-800 focus:outline-none"
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
      <div className="flex-1 overflow-x-auto overflow-y-auto border border-gray-200 rounded-lg">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 w-3/12">Key</th>
              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 w-2/12">Field Type</th>
              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 w-5/12">Value</th>
              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 w-2/12">Actions</th>
            </tr>
          </thead>
          <tbody>
            {formFields.map((field, index) => (
              <tr key={field.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3">
                  <Input
                    type="text"
                    placeholder="Field name (e.g., username)"
                    value={localFields[field.id]?.key ?? field.key}
                    onChange={e => updateLocalField(field.id, 'key', e.target.value)}
                    onBlur={() => commitField(field.id)}
                    onKeyDown={e => handleKeyDown(e, field.id)}
                    className="w-full text-sm rounded bg-gray-50 text-gray-800 focus:outline-none"
                  />
                </td>
                <td className="py-2 px-3">
                  <Select 
                    value={getFieldTypeLabel(field.fieldType)} 
                    onValueChange={(value) => handleFieldTypeChange(field.id, value.toLowerCase() as FieldType)}
                  >
                    <SelectTrigger className="w-full text-sm bg-gray-50 text-gray-800">
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
                      className="text-red-600 hover:text-red-700 hover:border-red-300"
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
          className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
        >
          + Add Field
        </Button>
      </div>
    </div>
  );
};

export default MultiPartFormBody;
