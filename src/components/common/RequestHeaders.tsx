import React, { useState, useEffect, useMemo, JSX } from 'react';
import { Trash2Icon, PlusIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Switch } from '../ui/switch';
import StyledInput from "../ui/styled-input";
import StyledAutocompleteInput from '../ui/styled-autocomplete-input';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { renderParameterizedText } from '../../utils/styling';
import { getCommonHeaderNames } from '../../utils/common';
import { HeaderRow } from '../../types/collection';

const RequestHeaders: React.FC = () => {
  const activeTab = useAppStateStore((state) => state.getActiveTab());
  const headers: HeaderRow[] = activeTab?.headers || [];
  const addEmptyHeader = useAppStateStore((state) => state.addEmptyHeader);
  const upsertHeader = useAppStateStore((state) => state.upsertHeader);
  const removeHeader = useAppStateStore((state) => state.removeHeader);
  const toggleHeaderEnabled = useAppStateStore((state) => state.toggleHeaderEnabled);
  const getActiveEnvVariableKeys = useAppStateStore((state) => state.getActiveEnvVariableKeys);
  const settingsCommonHeaderNames = useAppStateStore((state) => state.settings.commonHeaderNames);
  
  // Memoize merged header names from default list and user settings, removing duplicates
  const mergedHeaderNames = useMemo(() => {
    const defaultHeaders = getCommonHeaderNames();
    const combinedHeaders = [...defaultHeaders, ...settingsCommonHeaderNames];
    // Use Set to remove duplicates (case-sensitive)
    return [...new Set(combinedHeaders)];
  }, [settingsCommonHeaderNames]);
  
  // Get merged environment variables (global + tab's environment)
  const activeEnvVariables = useMemo(() => {
    return getActiveEnvVariableKeys(activeTab?.environmentId);
  }, [activeTab?.environmentId, getActiveEnvVariableKeys]);

  // Local state to track input values for all headers
  const [localHeaders, setLocalHeaders] = useState<{ [id: string]: { key: string; value: string } }>({});
  const [styledLocalHeaders, setStyledLocalHeaders] = useState<{ [id: string]: { key: JSX.Element; value: JSX.Element } }>({});

  // Initialize local headers only when headers structure changes (new headers added/removed)
  useEffect(() => {
    const newLocalHeaders: { [id: string]: { key: string; value: string } } = {};
    
    headers.forEach((header: HeaderRow) => {
      // Preserve existing local values, or initialize from headers
      if (localHeaders[header.id]) {
        newLocalHeaders[header.id] = localHeaders[header.id];
      } else {
        newLocalHeaders[header.id] = { key: header.key, value: header.value };
      }
    });
    
    // Only update if headers were added or removed
    const headerIdsChanged = 
      headers.length !== Object.keys(localHeaders).length ||
      headers.some(header => !localHeaders[header.id]);
    
    if (headerIdsChanged) {
      setLocalHeaders(newLocalHeaders);
    }
  }, [headers]);

  // Regenerate styled headers whenever localHeaders or activeEnvVariables change
  useEffect(() => {
    const newStyledLocalHeaders: { [id: string]: { key: JSX.Element; value: JSX.Element } } = {};
    
    Object.keys(localHeaders).forEach(id => {
      newStyledLocalHeaders[id] = {
        key: renderParameterizedText(localHeaders[id].key, activeEnvVariables),
        value: renderParameterizedText(localHeaders[id].value, activeEnvVariables)
      };
    });
    
    setStyledLocalHeaders(newStyledLocalHeaders);
  }, [localHeaders, activeEnvVariables]);

  const updateLocalHeader = (id: string, field: 'key' | 'value', newValue: string) => {
    setLocalHeaders(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: newValue
      }
    }));
  };

  const commitHeader = (id: string) => {
    const localHeader = localHeaders[id];
    if (localHeader) {
      upsertHeader(id, localHeader.key, localHeader.value);
      
      // If both key and value are present, add an empty row for next entry
      if (localHeader.key.trim() && localHeader.value.trim()) {
        const isLastRow = headers[headers.length - 1].id === id;
        const hasEmptyRow = headers.some(h => !h.key.trim() && !h.value.trim());
        
        if (isLastRow && !hasEmptyRow) {
          addEmptyHeader();
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      commitHeader(id);
    }
  };

  return (
    <div className="space-y-0">
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-t-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[8%]">Enabled</TableHead>
              <TableHead className="w-[38%]">Header Name</TableHead>
              <TableHead className="w-[38%]">Header Value</TableHead>
              <TableHead className="w-[16%]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {headers.map((header, index) => {
              const isDisabled = header.disabled;
              const hasContent = Boolean(header.key) || Boolean(header.value);
              
              return (
                <TableRow 
                  key={header.id}
                >
                  <TableCell>
                    {hasContent && (
                      <Switch
                        checked={!isDisabled}
                        onCheckedChange={() => toggleHeaderEnabled(header.id, header.disabled)}
                      />
                    )}
                  </TableCell>
                  <TableCell className={isDisabled ? 'opacity-40' : ''}>
                    <StyledAutocompleteInput
                      type="text"
                      placeholder="Header name (e.g., Content-Type)"
                      value={localHeaders[header.id]?.key ?? header.key}
                      styledValue={styledLocalHeaders[header.id]?.key ?? renderParameterizedText(header.key, activeEnvVariables)}
                      onValueChange={val => updateLocalHeader(header.id, 'key', val)}
                      onBlur={() => commitHeader(header.id)}
                      onKeyDown={e => handleKeyDown(e, header.id)}
                      className="bg-white border-slate-300 focus:border-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:focus:border-blue-400"
                      suggestions={mergedHeaderNames}
                    />
                  </TableCell>
                  <TableCell className={isDisabled ? 'opacity-40' : ''}>
                    <StyledInput
                      type="text"
                      placeholder="Header value (e.g., application/json)"
                      value={localHeaders[header.id]?.value ?? header.value}
                      styledValue={styledLocalHeaders[header.id]?.value ?? renderParameterizedText(header.value, activeEnvVariables)}
                      onChange={e => updateLocalHeader(header.id, 'value', e.target.value)}
                      onBlur={() => commitHeader(header.id)}
                      onKeyDown={e => handleKeyDown(e, header.id)}
                      className="bg-white border-slate-300 focus:border-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:focus:border-blue-400"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {headers.length > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeHeader(header.id)}
                          className="text-red-600 hover:text-red-700 hover:border-red-300"
                          title="Delete header"
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      
      <div className="flex justify-start border border-t-0 border-slate-200 dark:border-slate-700 rounded-b-lg p-3 bg-slate-50 dark:bg-slate-800">
        <Button
          variant="outline"
          size="sm"
          onClick={addEmptyHeader}
          className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
        >
          <PlusIcon className="h-2 w-2 mr-0.2" />Add Header
        </Button>
      </div>
    </div>
  );
};

export default RequestHeaders;
