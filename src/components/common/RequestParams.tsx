import React from 'react';
import { Trash2Icon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import useAppStateStore from '../../hooks/store/useAppStateStore';

const RequestParams: React.FC = () => {
  const [params, addEmptyParam, upsertParam, removeParam] = useAppStateStore((state) => [state.params || [], state.addEmptyParam, state.upsertParam, state.removeParam]);

  const updateParam = (id: string, field: 'key' | 'value', newValue: string) => {
    upsertParam(id, field === 'key' ? newValue : undefined, field === 'value' ? newValue : undefined);
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto overflow-y-auto max-h-80 border border-gray-200 rounded-lg">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-white z-10">
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
                    <Trash2Icon className="h-4 w-4" />
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
          onClick={addEmptyParam}
          className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
        >
          + Add Parameter
        </Button>
      </div>
    </div>
  );
};

export default RequestParams;
