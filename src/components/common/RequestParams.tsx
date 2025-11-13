import React, { useState, useEffect, JSX } from 'react';
import { Trash2Icon, PlusIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react';
import { Button } from '../ui/button';
import StyledInput from "../ui/styled-input"
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { renderParameterizedText } from '../../utils/styling';

const RequestParams: React.FC = () => {
  const params = useAppStateStore((state) => state.params || []);
  const addEmptyParam = useAppStateStore((state) => state.addEmptyParam);
  const upsertParam = useAppStateStore((state) => state.upsertParam);
  const removeParam = useAppStateStore((state) => state.removeParam);
  const toggleParamEnabled = useAppStateStore((state) => state.toggleParamEnabled);
  const activeEnvironment = useAppStateStore((state) => state.activeEnvironment);
  
  // Memoize active environment variables to avoid creating new Set on every render
  const activeEnvVariables = React.useMemo(() => {
    const vars = new Set<string>();
    if (activeEnvironment && activeEnvironment.values) {
      activeEnvironment.values.forEach((envVar) => {
        if (envVar.enabled && envVar.value) {
          vars.add(envVar.key);
        }
      });
    }
    return vars;
  }, [activeEnvironment]);

  // Local state to track input values for all params
  const [localParams, setLocalParams] = useState<{ [id: string]: { key: string; value: string } }>({});
  const [styledLocalParams, setStyledLocalParams] = useState<{ [id: string]: { key: JSX.Element; value: JSX.Element } }>({});

  // Initialize local params only when params structure changes (new params added/removed)
  useEffect(() => {
    const newLocalParams: { [id: string]: { key: string; value: string } } = {};
    
    params.forEach(param => {
      // Preserve existing local values, or initialize from params
      if (localParams[param.id]) {
        newLocalParams[param.id] = localParams[param.id];
      } else {
        newLocalParams[param.id] = { key: param.key, value: param.value };
      }
    });
    
    // Only update if params were added or removed
    const paramIdsChanged = 
      params.length !== Object.keys(localParams).length ||
      params.some(param => !localParams[param.id]);
    
    if (paramIdsChanged) {
      setLocalParams(newLocalParams);
    }
  }, [params]);

  // Regenerate styled params whenever localParams or activeEnvVariables change
  useEffect(() => {
    const newStyledLocalParams: { [id: string]: { key: JSX.Element; value: JSX.Element } } = {};
    
    Object.keys(localParams).forEach(id => {
      newStyledLocalParams[id] = {
        key: renderParameterizedText(localParams[id].key, activeEnvVariables),
        value: renderParameterizedText(localParams[id].value, activeEnvVariables)
      };
    });
    
    setStyledLocalParams(newStyledLocalParams);
  }, [localParams, activeEnvVariables]);

  const updateLocalParam = (id: string, field: 'key' | 'value', newValue: string) => {
    setLocalParams(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: newValue
      }
    }));
  };

  const commitParam = (id: string) => {
    const localParam = localParams[id];
    if (localParam) {
      upsertParam(id, localParam.key, localParam.value);
      
      // If both key and value are present, add an empty row for next entry
      if (localParam.key.trim() && localParam.value.trim()) {
        const isLastRow = params[params.length - 1].id === id;
        const hasEmptyRow = params.some(p => !p.key.trim() && !p.value.trim());
        
        if (isLastRow && !hasEmptyRow) {
          addEmptyParam();
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      commitParam(id);
    }
  };

  return (
    <div className="space-y-0">
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-t-lg">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-white dark:bg-slate-800 z-10">
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left py-2 px-3 text-sm font-medium text-slate-700 dark:text-slate-300 w-5/12">Key</th>
              <th className="text-left py-2 px-3 text-sm font-medium text-slate-700 dark:text-slate-300 w-5/12">Value</th>
              <th className="text-left py-2 px-3 text-sm font-medium text-slate-700 dark:text-slate-300 w-2/12">Actions</th>
            </tr>
          </thead>
          <tbody>
            {params.map((param, index) => {
              const isDisabled = param.disabled;
              
              return (
                <tr 
                  key={param.id} 
                  className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                    isDisabled ? 'opacity-40' : ''
                  }`}
                >
                  <td className="py-2 px-3">
                    <StyledInput
                      type="text"
                      placeholder="Parameter key"
                      value={localParams[param.id]?.key ?? param.key}
                      styledValue={styledLocalParams[param.id]?.key ?? renderParameterizedText(param.key, activeEnvVariables)}
                      onChange={e => updateLocalParam(param.id, 'key', e.target.value)}
                      onBlur={() => commitParam(param.id)}
                      onKeyDown={e => handleKeyDown(e, param.id)}
                      className="bg-white border-slate-300 focus:border-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:focus:border-blue-400"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <StyledInput
                      type="text"
                      placeholder="Parameter value"
                      value={localParams[param.id]?.value ?? param.value}
                      styledValue={styledLocalParams[param.id]?.value ?? renderParameterizedText(param.value, activeEnvVariables)}
                      onChange={e => updateLocalParam(param.id, 'value', e.target.value)}
                      onBlur={() => commitParam(param.id)}
                      onKeyDown={e => handleKeyDown(e, param.id)}
                      className="bg-white border-slate-300 focus:border-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:focus:border-blue-400"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      {(Boolean(param.key) || Boolean(param.value)) && (<Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleParamEnabled(param.id, param.disabled)}
                        className={`${
                          !isDisabled
                            ? 'text-green-600 hover:text-green-700 hover:border-green-300'
                            : 'text-slate-400 hover:text-slate-600 hover:border-slate-300'
                        }`}
                        title={!isDisabled ? 'Disable parameter' : 'Enable parameter'}
                      >
                        {!isDisabled ? (
                          <CheckCircleIcon className="h-4 w-4" />
                        ) : (
                          <XCircleIcon className="h-4 w-4" />
                        )}
                      </Button>)}
                      {params.length > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeParam(param.id)}
                          className="text-red-600 hover:text-red-700 hover:border-red-300"
                          title="Delete parameter"
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
          onClick={addEmptyParam}
          className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
        >
          <PlusIcon className="h-2 w-2 mr-0.2" />Add Parameter
        </Button>
      </div>
    </div>
  );
};

export default RequestParams;
