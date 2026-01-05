import React, { useState, useEffect, JSX } from 'react';
import { Trash2Icon, PlusIcon } from 'lucide-react';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Switch } from '../ui/switch';
import StyledInput from "../ui/styled-input"
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { renderParameterizedText } from '../../utils/styling';
import { ParamRow } from '../../types/collection';

const RequestParams: React.FC = () => {
  const activeTab = useAppStateStore((state) => state.getActiveTab());
  const params: ParamRow[] = activeTab?.params || [];
  const addEmptyParam = useAppStateStore((state) => state.addEmptyParam);
  const upsertParam = useAppStateStore((state) => state.upsertParam);
  const removeParam = useAppStateStore((state) => state.removeParam);
  const toggleParamEnabled = useAppStateStore((state) => state.toggleParamEnabled);
  const getActiveEnvVariableKeys = useAppStateStore((state) => state.getActiveEnvVariableKeys);
  
  // Get merged environment variables (global + tab's environment)
  const activeEnvVariables = React.useMemo(() => {
    return getActiveEnvVariableKeys(activeTab?.environmentId);
  }, [activeTab?.environmentId, getActiveEnvVariableKeys]);

  // Local state to track input values for all params
  const [localParams, setLocalParams] = useState<{ [id: string]: { key: string; value: string } }>({});
  const [styledLocalParams, setStyledLocalParams] = useState<{ [id: string]: { key: JSX.Element; value: JSX.Element } }>({});

  // Initialize local params only when params structure changes (new params added/removed)
  useEffect(() => {
    const newLocalParams: { [id: string]: { key: string; value: string } } = {};
    
    params.forEach((param: ParamRow) => {
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
            {params.map((param, index) => {
              const isDisabled = param.disabled;
              const hasContent = Boolean(param.key) || Boolean(param.value);
              
              return (
                <TableRow 
                  key={param.id}
                >
                  <TableCell>
                    {hasContent && (
                      <Switch
                        checked={!isDisabled}
                        onCheckedChange={() => toggleParamEnabled(param.id, param.disabled)}
                      />
                    )}
                  </TableCell>
                  <TableCell className={isDisabled ? 'opacity-40' : ''}>
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
                  </TableCell>
                  <TableCell className={isDisabled ? 'opacity-40' : ''}>
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
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {params.length > 1 && (
                        <SecondaryButton
                          size="sm"
                          onClick={() => removeParam(param.id)}
                          colorTheme="error"
                          icon={<Trash2Icon />}
                          tooltip="Delete parameter"
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
      
      <div className="flex justify-start border border-t-0 border-slate-200 dark:border-slate-700 rounded-b-lg p-3 bg-slate-50 dark:bg-slate-800">
        <SecondaryButton
          size="sm"
          onClick={addEmptyParam}
          colorTheme="main"
          icon={<PlusIcon />}
          text="Add Parameter"
        />
      </div>
    </div>
  );
};

export default RequestParams;
