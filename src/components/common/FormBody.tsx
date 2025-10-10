import React, { useState, useEffect } from 'react';
import { Trash2Icon, CopyIcon, ClipboardPasteIcon, PlusIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import useAppStateStore from '../../hooks/store/useAppStateStore';

interface FormBodyProps {
  dropdownElement?: React.ReactNode;
}

const FormBody: React.FC<FormBodyProps> = ({ dropdownElement }) => {
  const updateBody = useAppStateStore((state) => state.updateFormBody);
  const body = useAppStateStore((state) => state.body);
  
  // Get form fields from store, with fallback to empty array with one field
  const formFields = body.formData?.data || [{ id: crypto.randomUUID(), key: '', value: '' }];
  
  const [localFields, setLocalFields] = useState<{ [id: string]: { key: string; value: string | null } }>({});

  // Sync local state when form fields change
  useEffect(() => {
    const newLocalFields: { [id: string]: { key: string; value: string | null } } = {};
    formFields.forEach(field => {
      if (!localFields[field.id]) {
        newLocalFields[field.id] = { key: field.key, value: field.value };
      } else {
        newLocalFields[field.id] = localFields[field.id];
      }
    });
    setLocalFields(newLocalFields);
  }, [formFields.length]);

  const updateLocalField = (id: string, field: 'key' | 'value', newValue: string | null) => {
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
      const updatedFields = formFields.map(field =>
        field.id === id
          ? { ...field, key: localField.key, value: localField.value }
          : field
      );

      // If both key and value are present, add an empty row for next entry
      if (localField.key.trim() && localField.value?.trim()) {
        const isLastRow = updatedFields[updatedFields.length - 1].id === id;
        const hasEmptyRow = updatedFields.some(f => !f.key.trim() && !f.value?.trim());

        if (isLastRow && !hasEmptyRow) {
          // Add empty field to the updated array before committing
          const fieldsWithEmpty = [...updatedFields, { id: crypto.randomUUID(), key: '', value: '' }];
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

  const addEmptyField = () => {
    let emptyRow = { id: crypto.randomUUID(), key: '', value: '' };
    updateBody([...formFields, emptyRow]);
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
    updateBody([{ id: crypto.randomUUID(), key: '', value: '' }]);
    setLocalFields({});
  };

  const copyFormData = async () => {
    const data = formFields
      .filter(field => field.key.trim() && field.value?.trim())
      .map(field => `${field.key}=${field.value}`)
      .join('&');
    
    try {
      await navigator.clipboard.writeText(data);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const pasteFormData = async () => {
    try {
      const text = await navigator.clipboard.readText();
      // Parse URL-encoded form data
      const pairs = text.split('&').map(pair => {
        const [key, value] = pair.split('=');
        return {
          id: crypto.randomUUID(),
          key: decodeURIComponent(key || ''),
          value: decodeURIComponent(value || '')
        };
      }).filter(pair => pair.key);

      if (pairs.length > 0) {
        updateBody([...pairs, { id: crypto.randomUUID(), key: '', value: '' }]);
      }
    } catch (err) {
      console.error('Failed to paste:', err);
    }
  };

  const hasData = formFields.some(field => field.key.trim() || field.value?.trim());
  const validFieldCount = formFields.filter(field => field.key.trim() && field.value?.trim()).length;

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

        {/* Right side - Action Icons and Buttons */}
        <div className="flex items-center gap-2">
          {/* Action Icons */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={copyFormData}
                disabled={validFieldCount === 0}
                className="h-9 w-9 p-0 flex items-center justify-center"
              >
                <CopyIcon size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="px-2 py-1 text-xs">Copy form data</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={pasteFormData}
                className="h-9 w-9 p-0 flex items-center justify-center"
              >
                <ClipboardPasteIcon size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="px-2 py-1 text-xs">Paste form data</TooltipContent>
          </Tooltip>

          {/* Divider */}
          {hasData && (
            <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-1" />
          )}

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
              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 w-5/12">Key</th>
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
                  <Input
                    type="text"
                    placeholder="Field value (e.g., john_doe)"
                    value={(localFields[field.id]?.value ?? field.value) || ''}
                    onChange={e => updateLocalField(field.id, 'value', e.target.value)}
                    onBlur={() => commitField(field.id)}
                    onKeyDown={e => handleKeyDown(e, field.id)}
                    className="w-full text-sm rounded bg-gray-50 text-gray-800 focus:outline-none"
                  />
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
          <PlusIcon className="h-2 w-2 mr-0.2" />Add Field
        </Button>
      </div>
    </div>
  );
};

export default FormBody;
