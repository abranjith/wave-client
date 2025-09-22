import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface RequestParamsProps {
  onStateChange: (params: URLSearchParams) => void;
  initialParams?: URLSearchParams;
}

interface ParamRow {
  id: string;
  key: string;
  value: string;
}

const RequestParams: React.FC<RequestParamsProps> = ({ 
  onStateChange, 
  initialParams = null
}) => {
  const [params, setParams] = useState<ParamRow[]>(() => {
    if (!initialParams) {
      // Initialize with existing params or start with one empty row
      return [{ id: 'param-0', key: '', value: '' }];
    }

    const initialRows = Array.from(initialParams.entries()).map(([key, value], index) => ({
      id: `param-${index}`,
      key: decodeURIComponent(key),
      value: decodeURIComponent(value)
    }));
    return initialRows.length > 0 ? [...initialRows, { id: `param-${initialRows.length}`, key: '', value: '' }] : [{ id: 'param-0', key: '', value: '' }];
  });

  // Convert params to URLSearchParams and notify parent
  useEffect(() => {
    const urlSearchParams = new URLSearchParams();
    params.forEach(param => {
      if (param.key.trim()) {
        urlSearchParams.append(param.key, param.value);
      }
    });
    
    onStateChange(urlSearchParams);
  }, [params, onStateChange]);

  const updateParam = (id: string, field: 'key' | 'value', newValue: string) => {
    setParams(prev => {
      const updated = prev.map(param => 
        param.id === id ? { ...param, [field]: newValue } : param
      );
      
      // Auto-add new row if the last row has content
      const lastParam = updated[updated.length - 1];
      if (lastParam && (lastParam.key.trim() && lastParam.value.trim())) {
        updated.push({ id: `param-${Date.now()}`, key: '', value: '' });
      }
      
      return updated;
    });
  };

  const removeParam = (id: string) => {
    setParams(prev => {
      const filtered = prev.filter(param => param.id !== id);
      // Ensure at least one empty row exists
      if (filtered.length === 0) {
        return [{ id: `param-${Date.now()}`, key: '', value: '' }];
      }
      return filtered;
    });
  };

  const addParam = () => {
    setParams(prev => [...prev, { id: `param-${Date.now()}`, key: '', value: '' }]);
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 w-5/12">Key</th>
              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 w-5/12">Value</th>
              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 w-2/12">Actions</th>
            </tr>
          </thead>
          <tbody>
            {params.map((param, index) => (
              <tr key={param.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3">
                  <Input
                    type="text"
                    placeholder="Parameter key"
                    value={param.key}
                    onChange={e => updateParam(param.id, 'key', e.target.value)}
                    className="w-full text-sm rounded bg-gray-50 text-gray-800 focus:outline-none"
                  />
                </td>
                <td className="py-2 px-3">
                  <Input
                    type="text"
                    placeholder="Parameter value"
                    value={param.value}
                    onChange={e => updateParam(param.id, 'value', e.target.value)}
                    className="w-full text-sm rounded bg-gray-50 text-gray-800 focus:outline-none"
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
                      X
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="flex justify-start">
        <Button
          variant="outline"
          size="sm"
          onClick={addParam}
          className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
        >
          + Add Parameter
        </Button>
      </div>
    </div>
  );
};

export default RequestParams;
