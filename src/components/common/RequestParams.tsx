import React, { useState, useEffect } from 'react';
import { Trash2Icon, PlusIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import useAppStateStore from '../../hooks/store/useAppStateStore';

const RequestParams: React.FC = () => {
  const params = useAppStateStore((state) => state.params || []);
  const addEmptyParam = useAppStateStore((state) => state.addEmptyParam);
  const upsertParam = useAppStateStore((state) => state.upsertParam);
  const removeParam = useAppStateStore((state) => state.removeParam);

  // Local state to track input values for all params
  const [localParams, setLocalParams] = useState<{ [id: string]: { key: string; value: string } }>({});

  // Sync local state when global params change (e.g., when adding/removing params)
  useEffect(() => {
    const newLocalParams: { [id: string]: { key: string; value: string } } = {};
    params.forEach(param => {
      if (!localParams[param.id]) {
        newLocalParams[param.id] = { key: param.key, value: param.value };
      } else {
        newLocalParams[param.id] = localParams[param.id];
      }
    });
    setLocalParams(newLocalParams);
  }, [params.length]); // Only trigger when params are added/removed

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
            {params.map((param, index) => (
              <tr key={param.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="py-2 px-3">
                  <Input
                    type="text"
                    placeholder="Parameter key"
                    value={localParams[param.id]?.key ?? param.key}
                    onChange={e => updateLocalParam(param.id, 'key', e.target.value)}
                    onBlur={() => commitParam(param.id)}
                    onKeyDown={e => handleKeyDown(e, param.id)}
                    className="w-full text-sm rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                </td>
                <td className="py-2 px-3">
                  <Input
                    type="text"
                    placeholder="Parameter value"
                    value={localParams[param.id]?.value ?? param.value}
                    onChange={e => updateLocalParam(param.id, 'value', e.target.value)}
                    onBlur={() => commitParam(param.id)}
                    onKeyDown={e => handleKeyDown(e, param.id)}
                    className="w-full text-sm rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                </td>
                <td className="py-2 px-3">
                  {params.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeParam(param.id)}
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
