import React, { useState, useEffect, JSX, useMemo } from 'react';
import { Trash2Icon, CopyIcon, ClipboardPasteIcon, PlusIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Switch } from '../ui/switch';
import StyledInput from "../ui/styled-input";
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { renderParameterizedText } from '../../utils/styling';
import { FormField } from '../../types/collection';

interface FormBodyProps {
  dropdownElement?: React.ReactNode;
}

const FormBody: React.FC<FormBodyProps> = ({ dropdownElement }) => {
  const activeTab = useAppStateStore((state) => state.getActiveTab());
  const updateBody = useAppStateStore((state) => state.updateUrlencodedBody);
  const toggleFormFieldEnabled = useAppStateStore((state) => state.toggleFormFieldEnabled);
  const body = activeTab?.body;
  const getActiveEnvVariableKeys = useAppStateStore((state) => state.getActiveEnvVariableKeys);
  
  // Get merged environment variables (global + tab's environment)
  const activeEnvVariables = useMemo(() => {
    return getActiveEnvVariableKeys(activeTab?.environmentId);
  }, [activeTab?.environmentId, getActiveEnvVariableKeys]);
  
  // Get form fields from store - use useMemo to prevent creating new array reference
  const formFields: FormField[] = useMemo(() => {
    if (body?.mode === 'urlencoded' && body.urlencoded) {
      return body.urlencoded;
    }
    return [{ id: crypto.randomUUID(), key: '', value: '', disabled: false }];
  }, [body]);
  
  const [localFields, setLocalFields] = useState<{ [id: string]: { key: string; value: string | null, disabled: boolean } }>({});
  const [styledLocalFields, setStyledLocalFields] = useState<{ [id: string]: { key: JSX.Element; value: JSX.Element } }>({});

  // Initialize local fields only when formFields structure changes (new fields added/removed)
  useEffect(() => {
    const newLocalFields: { [id: string]: { key: string; value: string | null, disabled: boolean } } = {};
    
    formFields.forEach((field: FormField) => {
      // Preserve existing local values, or initialize from formFields
      if (localFields[field.id]) {
        newLocalFields[field.id] = localFields[field.id];
      } else {
        newLocalFields[field.id] = { key: field.key, value: field.value, disabled: field.disabled };
      }
    });
    
    // Only update if fields were added or removed
    const fieldIdsChanged = 
      formFields.length !== Object.keys(localFields).length ||
      formFields.some((field: FormField) => !localFields[field.id]);
    
    if (fieldIdsChanged) {
      setLocalFields(newLocalFields);
    }
  }, [formFields]);

  // Regenerate styled fields whenever localFields or activeEnvVariables change
  useEffect(() => {
    const newStyledLocalFields: { [id: string]: { key: JSX.Element; value: JSX.Element } } = {};
    
    Object.keys(localFields).forEach(id => {
      newStyledLocalFields[id] = {
        key: renderParameterizedText(localFields[id].key, activeEnvVariables),
        value: renderParameterizedText(localFields[id].value || '', activeEnvVariables)
      };
    });
    
    setStyledLocalFields(newStyledLocalFields);
  }, [localFields, activeEnvVariables]);

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
      const updatedFields = formFields.map((field: FormField) =>
        field.id === id
          ? { ...field, key: localField.key, value: localField.value }
          : field
      );

      // If both key and value are present, add an empty row for next entry
      if (localField.key.trim() && localField.value?.trim()) {
        const isLastRow = updatedFields[updatedFields.length - 1].id === id;
        const hasEmptyRow = updatedFields.some((f: FormField) => !f.key.trim() && !f.value?.trim());

        if (isLastRow && !hasEmptyRow) {
          // Add empty field to the updated array before committing
          const fieldsWithEmpty = [...updatedFields, { id: crypto.randomUUID(), key: '', value: '', disabled: false }];
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
    let emptyRow = { id: crypto.randomUUID(), key: '', value: '', disabled: false };
    updateBody([...formFields, emptyRow]);
  };

  const removeField = (id: string) => {
    if (formFields.length > 1) {
      const filteredFields = formFields.filter((field: FormField) => field.id !== id);
      updateBody(filteredFields);
      setLocalFields(prev => {
        const newFields = { ...prev };
        delete newFields[id];
        return newFields;
      });
    }
  };

  const clearAll = () => {
    updateBody([{ id: crypto.randomUUID(), key: '', value: '', disabled: false }]);
    setLocalFields({});
  };

  const copyFormData = async () => {
    const data = formFields
      .filter((field: FormField) => field.key.trim() && field.value?.trim())
      .map((field: FormField) => `${field.key}=${field.value}`)
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
          value: decodeURIComponent(value || ''),
          disabled: false
        };
      }).filter(pair => pair.key);

      if (pairs.length > 0) {
        updateBody([...pairs, { id: crypto.randomUUID(), key: '', value: '', disabled: false }]);
      }
    } catch (err) {
      console.error('Failed to paste:', err);
    }
  };

  const hasData = formFields.some((field: FormField) => field.key.trim() || field.value?.trim());
  const validFieldCount = formFields.filter((field: FormField) => field.key.trim() && field.value?.trim() && !field.disabled).length;

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
              <TableHead className="w-[8%]">Enabled</TableHead>
              <TableHead className="w-[38%]">Key</TableHead>
              <TableHead className="w-[38%]">Value</TableHead>
              <TableHead className="w-[16%]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {formFields.map((field: FormField, index: number) => {
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
                        onCheckedChange={() => toggleFormFieldEnabled(field.id, field.disabled)}
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
                    <StyledInput
                      type="text"
                      placeholder="Field value (e.g., john_doe)"
                      value={(localFields[field.id]?.value ?? field.value) || ''}
                      styledValue={styledLocalFields[field.id]?.value ?? renderParameterizedText(field.value || '', activeEnvVariables)}
                      onChange={e => updateLocalField(field.id, 'value', e.target.value)}
                      onBlur={() => commitField(field.id)}
                      onKeyDown={e => handleKeyDown(e, field.id)}
                      className="bg-white border-slate-300 focus:border-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:focus:border-blue-400"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
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

export default FormBody;
