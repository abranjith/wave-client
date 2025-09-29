import React, { useState } from 'react';
import { ResponseData } from '../types/collection';
import useAppStateStore from '../hooks/store/useAppStateStore';


function getStatusColor(status: number) {
  if (status >= 200 && status < 300) return 'text-green-600';
  if (status >= 400 && status < 500) return 'text-yellow-600';
  if (status >= 500) return 'text-red-600';
  return 'text-gray-600';
}

const ResponsePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'body' | 'headers'>('body');
  const response = useAppStateStore((state) => state.responseData);

  // Show a placeholder when no response is available
  if (!response) {
    return (
      <div className="w-full h-full bg-white flex items-center justify-center">
        <div className="text-gray-500 text-center">
          <div className="text-lg font-medium mb-2">No response yet</div>
          <div className="text-sm">Send a request to see the response here</div>
        </div>
      </div>
    );
  }

  const status = response.status;
  const statusText = response.statusText;
  const time = response.elapsedTime;
  const size = response.size;
  const body = response.body;
  const headers = response.headers;

  return (
    <div className="w-full h-full bg-white flex flex-col">
      {/* Metadata Display */}
      <div className="flex gap-8 px-6 py-3 border-b border-gray-200 bg-gray-50 text-xs font-mono">
        <div className={`flex items-center gap-1 ${getStatusColor(status)}`}>
          <span className="font-bold">Status:</span>
          <span>{status} {statusText}</span>
        </div>
        <div className="flex items-center gap-1 text-blue-600">
          <span className="font-bold">Elapsed Time:</span>
          <span>{time} ms</span>
        </div>
        <div className="flex items-center gap-1 text-gray-600">
          <span className="font-bold">Size:</span>
          <span>{size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`}</span>
        </div>
      </div>

      {/* Horizontal Tabs */}
      <div className="border-b border-gray-200 flex gap-0">
        {['body', 'headers'].map(tab => (
          <button
            key={tab}
            className={`px-6 py-2 text-sm font-medium focus:outline-none transition-all ${
              activeTab === tab
                ? 'border-b-2 border-blue-600 text-blue-600 bg-white'
                : 'text-gray-500 bg-gray-50 hover:text-blue-600'
            }`}
            onClick={() => setActiveTab(tab as any)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-6 flex-1 overflow-auto">
        {activeTab === 'body' && (
          <pre className="bg-gray-100 rounded p-4 text-xs text-gray-800 overflow-x-auto whitespace-pre-wrap">
            {body}
          </pre>
        )}
        {activeTab === 'headers' && (
          <div className="text-xs text-gray-700">
            {Object.entries(headers).map(([key, value]) => (
              <div key={key} className="flex gap-2 py-1">
                <span className="font-mono font-bold text-gray-500 w-40">{key}</span>
                <span className="font-mono text-gray-800">{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResponsePanel;
