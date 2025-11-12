import React, { useState, useEffect, JSX } from 'react';
import { Trash2Icon, PlusIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react';
import { Button } from '../ui/button';
import StyledInput from "../ui/styled-input";
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { renderParameterizedText } from '../../utils/styling';

const RequestHeaders: React.FC = () => {
  const headers = useAppStateStore((state) => state.headers || []);
  const addEmptyHeader = useAppStateStore((state) => state.addEmptyHeader);
  const upsertHeader = useAppStateStore((state) => state.upsertHeader);
  const removeHeader = useAppStateStore((state) => state.removeHeader);
  const toggleHeaderEnabled = useAppStateStore((state) => state.toggleHeaderEnabled);
  const activeEnvironment = useAppStateStore((state) => state.activeEnvironment);
  const activeEnvVariables = new Set<string>();
    if (activeEnvironment && activeEnvironment.values) {
      activeEnvironment.values.forEach((envVar) => {
        if (envVar.enabled && envVar.value) {
          activeEnvVariables.add(envVar.key);
        }
      });
    }

  // Local state to track input values for all headers
  const [localHeaders, setLocalHeaders] = useState<{ [id: string]: { key: string; value: string } }>({});
  const [styledLocalHeaders, setStyledLocalHeaders] = useState<{ [id: string]: { key: JSX.Element; value: JSX.Element } }>({});

  // Sync local state when global headers change (e.g., when adding/removing headers)
  useEffect(() => {
    const newLocalHeaders: { [id: string]: { key: string; value: string } } = {};
    const newStyledLocalHeaders: { [id: string]: { key: JSX.Element; value: JSX.Element } } = {};
    headers.forEach(header => {
      if (!localHeaders[header.id]) {
        newLocalHeaders[header.id] = { key: header.key, value: header.value };
        newStyledLocalHeaders[header.id] = { key: renderParameterizedText(header.key, activeEnvVariables), value: renderParameterizedText(header.value, activeEnvVariables) };
      } else {
        newLocalHeaders[header.id] = localHeaders[header.id];
        newStyledLocalHeaders[header.id] = { key: renderParameterizedText(localHeaders[header.id].key, activeEnvVariables), value: renderParameterizedText(localHeaders[header.id].value, activeEnvVariables) };
      }
    });
    setLocalHeaders(newLocalHeaders);
    setStyledLocalHeaders(newStyledLocalHeaders);
  }, [headers.length]); // Only trigger when headers are added/removed

  useEffect(() => {
    const newStyledLocalHeaders: { [id: string]: { key: JSX.Element; value: JSX.Element } } = {};
    Object.keys(localHeaders).forEach(id => {
      newStyledLocalHeaders[id] = {
        key: renderParameterizedText(localHeaders[id].key, activeEnvVariables),
        value: renderParameterizedText(localHeaders[id].value, activeEnvVariables)
      };
    });
    setStyledLocalHeaders(newStyledLocalHeaders);
  }, [activeEnvVariables]);

  const updateLocalHeader = (id: string, field: 'key' | 'value', newValue: string) => {
    setLocalHeaders(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: newValue
      }
    }));
    setStyledLocalHeaders(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: renderParameterizedText(newValue, activeEnvVariables)
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
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-white dark:bg-slate-800 z-10">
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left py-2 px-3 text-sm font-medium text-slate-700 dark:text-slate-300 w-5/12">Header Name</th>
              <th className="text-left py-2 px-3 text-sm font-medium text-slate-700 dark:text-slate-300 w-5/12">Header Value</th>
              <th className="text-left py-2 px-3 text-sm font-medium text-slate-700 dark:text-slate-300 w-2/12">Actions</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((header, index) => {
              const isDisabled = header.disabled;
              
              return (
                <tr 
                  key={header.id} 
                  className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                    isDisabled ? 'opacity-40' : ''
                  }`}
                >
                  <td className="py-2 px-3">
                    <StyledInput
                      type="text"
                      placeholder="Header name (e.g., Content-Type)"
                      value={localHeaders[header.id]?.key ?? header.key}
                      styledValue={styledLocalHeaders[header.id]?.key ?? renderParameterizedText(header.key, activeEnvVariables)}
                      onChange={e => updateLocalHeader(header.id, 'key', e.target.value)}
                      onBlur={() => commitHeader(header.id)}
                      onKeyDown={e => handleKeyDown(e, header.id)}
                      className="bg-white border-slate-300 focus:border-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:focus:border-blue-400"
                    />
                  </td>
                  <td className="py-2 px-3">
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
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      {(Boolean(header.key) || Boolean(header.value)) && (<Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleHeaderEnabled(header.id, header.disabled)}
                        className={`${
                          !isDisabled
                            ? 'text-green-600 hover:text-green-700 hover:border-green-300'
                            : 'text-slate-400 hover:text-slate-600 hover:border-slate-300'
                        }`}
                        title={!isDisabled ? 'Disable header' : 'Enable header'}
                      >
                        {!isDisabled ? (
                          <CheckCircleIcon className="h-4 w-4" />
                        ) : (
                          <XCircleIcon className="h-4 w-4" />
                        )}
                      </Button>)}
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
