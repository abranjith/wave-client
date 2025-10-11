import React, { useState } from 'react';
import useAppStateStore from '../hooks/store/useAppStateStore';
import ResponseBody from '../components/common/ResponseBody';

function getStatusColor(status: number) {
  if (status >= 200 && status < 300) return 'text-green-600';
  if (status >= 400 && status < 500) return 'text-yellow-600';
  if (status >= 500) return 'text-red-600';
  return 'text-gray-600';
}

interface ResponsePanelProps {
  onDownloadResponse: any;
}

const ResponsePanel: React.FC<ResponsePanelProps> = ({ onDownloadResponse }) => {
  const [activeTab, setActiveTab] = useState<'body' | 'headers'>('body');
  const response = useAppStateStore((state) => state.responseData);

  // Show a placeholder when no response is available
  if (!response) {
    return (
      <div className="w-full h-full bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-slate-500 dark:text-slate-400 text-center">
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
    <div className="w-full h-full bg-white dark:bg-slate-900 flex flex-col">
      {/* Metadata Display */}
      <div className="flex gap-8 px-6 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono">
        <div className={`flex items-center gap-1 ${getStatusColor(status)}`}>
          <span className="font-bold">Status:</span>
          <span>{status} {statusText}</span>
        </div>
        <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
          <span className="font-bold">Elapsed Time:</span>
          <span>{time} ms</span>
        </div>
        <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
          <span className="font-bold">Size:</span>
          <span>{size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`}</span>
        </div>
      </div>

      {/* Horizontal Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700 flex gap-0 bg-slate-50 dark:bg-slate-900">
        {['body', 'headers'].map(tab => (
          <button
            key={tab}
            className={`px-6 py-4 text-sm font-medium focus:outline-none transition-all relative ${
              activeTab === tab
                ? 'border-b-2 border-blue-500 text-blue-600 bg-white dark:bg-slate-800 dark:text-blue-400 dark:border-blue-400'
                : 'text-slate-600 bg-transparent hover:text-blue-600 hover:bg-white/50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-slate-800/50'
            }`}
            onClick={() => setActiveTab(tab as any)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto min-h-0">
        {activeTab === 'body' && (
          <div className="h-full">
            <ResponseBody 
              body={body}
              headers={headers}
              statusCode={status}
              onDownloadResponse={onDownloadResponse}
            />
          </div>
        )}
        {activeTab === 'headers' && (
          <div className="h-full overflow-auto p-6 bg-white dark:bg-slate-900">
            <div className="space-y-2">
              {Object.entries(headers).map(([key, value]) => (
                <div key={key} className="flex gap-2 py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="font-mono font-bold text-slate-500 dark:text-slate-400 w-40 flex-shrink-0">{key}</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 break-words">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResponsePanel;
