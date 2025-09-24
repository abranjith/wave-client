import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface RequestHeadersProps {
  onStateChange: (headers: Record<string, string | string[]>) => void;
  initialHeaders?: Record<string, string | string[]>;
}

interface HeaderRow {
  id: string;
  key: string;
  value: string;
}

const RequestHeaders: React.FC<RequestHeadersProps> = ({ 
  onStateChange, 
  initialHeaders = {} 
}) => {
  const [headers, setHeaders] = useState<HeaderRow[]>(() => {
    // Initialize with existing headers or start with one empty row
    const initialRows: HeaderRow[] = [];
    Object.entries(initialHeaders).forEach(([key, value], index) => {
      if (Array.isArray(value)) {
        value.forEach((v, vIndex) => {
          initialRows.push({
            id: `header-${index}-${vIndex}`,
            key: key,
            value: v
          });
        });
      } else {
        initialRows.push({
          id: `header-${index}`,
          key: key,
          value: value
        });
      }
    });
    return initialRows.length > 0 ? [...initialRows, { id: `header-${initialRows.length}`, key: '', value: '' }] : [{ id: 'header-0', key: '', value: '' }];
  });

  // Convert headers to object with multiple value support and notify parent
  useEffect(() => {
    const requestHeaders: Record<string, string | string[]> = {};
    
    headers.forEach(header => {
      if (header.key.trim()) {
        const key = header.key.trim();
        const value = header.value;
        
        if (requestHeaders[key]) {
          // Key already exists, convert to array or add to existing array
          if (Array.isArray(requestHeaders[key])) {
            (requestHeaders[key] as string[]).push(value);
          } else {
            requestHeaders[key] = [requestHeaders[key] as string, value];
          }
        } else {
          requestHeaders[key] = value;
        }
      }
    });
    
    onStateChange(requestHeaders);
  }, [headers, onStateChange]);

  const updateHeader = (id: string, field: 'key' | 'value', newValue: string) => {
    setHeaders(prev => {
      const updated = prev.map(header => 
        header.id === id ? { ...header, [field]: newValue } : header
      );
      
      // Auto-add new row if the last row has content
      const lastHeader = updated[updated.length - 1];
      if (lastHeader && (lastHeader.key.trim() && lastHeader.value.trim())) {
        updated.push({ id: `header-${Date.now()}`, key: '', value: '' });
      }
      
      return updated;
    });
  };

  const removeHeader = (id: string) => {
    setHeaders(prev => {
      const filtered = prev.filter(header => header.id !== id);
      // Ensure at least one empty row exists
      if (filtered.length === 0) {
        return [{ id: `header-${Date.now()}`, key: '', value: '' }];
      }
      return filtered;
    });
  };

  const addHeader = () => {
    setHeaders(prev => [...prev, { id: `header-${Date.now()}`, key: '', value: '' }]);
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
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
          onClick={addHeader}
          className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
        >
          + Add Header
        </Button>
      </div>
    </div>
  );
};

export default RequestHeaders;
