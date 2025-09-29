import React from 'react';
import { Trash2Icon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import useAppStateStore from '../../hooks/store/useAppStateStore';

const RequestHeaders: React.FC = () => {
  const [headers, addEmptyHeader, upsertHeader, removeHeader] = useAppStateStore((state) => [state.headers || [], state.addEmptyHeader, state.upsertHeader, state.removeHeader]);

  const updateHeader = (id: string, field: 'key' | 'value', newValue: string) => {
    upsertHeader(id, field === 'key' ? newValue : undefined, field === 'value' ? newValue : undefined);
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto overflow-y-auto max-h-80 border border-gray-200 rounded-lg">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 w-5/12">Header Name</th>
              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 w-5/12">Header Value</th>
              <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 w-2/12">Actions</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((header, index) => (
              <tr key={header.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3">
                  <Input
                    type="text"
                    placeholder="Header name (e.g., Content-Type)"
                    value={header.key}
                    onChange={e => updateHeader(header.id, 'key', e.target.value)}
                    className="w-full text-sm rounded bg-gray-50 text-gray-800 focus:outline-none"
                  />
                </td>
                <td className="py-2 px-3">
                  <Input
                    type="text"
                    placeholder="Header value (e.g., application/json)"
                    value={header.value}
                    onChange={e => updateHeader(header.id, 'value', e.target.value)}
                    className="w-full text-sm rounded bg-gray-50 text-gray-800 focus:outline-none"
                  />
                </td>
                <td className="py-2 px-3">
                  {headers.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeHeader(header.id)}
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
          onClick={addEmptyHeader}
          className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
        >
          + Add Header
        </Button>
      </div>
    </div>
  );
};

export default RequestHeaders;
