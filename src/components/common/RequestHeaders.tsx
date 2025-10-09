import React, { useState, useEffect } from 'react';
import { Trash2Icon, PlusIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import useAppStateStore from '../../hooks/store/useAppStateStore';

const RequestHeaders: React.FC = () => {
  const headers = useAppStateStore((state) => state.headers || []);
  const addEmptyHeader = useAppStateStore((state) => state.addEmptyHeader);
  const upsertHeader = useAppStateStore((state) => state.upsertHeader);
  const removeHeader = useAppStateStore((state) => state.removeHeader);

  // Local state to track input values for all headers
  const [localHeaders, setLocalHeaders] = useState<{ [id: string]: { key: string; value: string } }>({});

  // Sync local state when global headers change (e.g., when adding/removing headers)
  useEffect(() => {
    const newLocalHeaders: { [id: string]: { key: string; value: string } } = {};
    headers.forEach(header => {
      if (!localHeaders[header.id]) {
        newLocalHeaders[header.id] = { key: header.key, value: header.value };
      } else {
        newLocalHeaders[header.id] = localHeaders[header.id];
      }
    });
    setLocalHeaders(newLocalHeaders);
  }, [headers.length]); // Only trigger when headers are added/removed

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
                    value={localHeaders[header.id]?.key ?? header.key}
                    onChange={e => updateLocalHeader(header.id, 'key', e.target.value)}
                    onBlur={() => commitHeader(header.id)}
                    onKeyDown={e => handleKeyDown(e, header.id)}
                    className="w-full text-sm rounded bg-gray-50 text-gray-800 focus:outline-none"
                  />
                </td>
                <td className="py-2 px-3">
                  <Input
                    type="text"
                    placeholder="Header value (e.g., application/json)"
                    value={localHeaders[header.id]?.value ?? header.value}
                    onChange={e => updateLocalHeader(header.id, 'value', e.target.value)}
                    onBlur={() => commitHeader(header.id)}
                    onKeyDown={e => handleKeyDown(e, header.id)}
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
          <PlusIcon className="h-2 w-2 mr-0.3" />Add Header
        </Button>
      </div>
    </div>
  );
};

export default RequestHeaders;
