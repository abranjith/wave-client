import React, { useState } from 'react';

// VS Code API bridge
const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

const HTTP_METHODS = [
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'
];

const PROTOCOLS = [
  'HTTP', 'HTTPS'
];

const RequestPanel: React.FC = () => {
  const [protocol, setProtocol] = useState('HTTP');
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');

  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body'>('params');

  return (
    <div className="w-full bg-white border-b border-gray-200">
      {/* Top Bar */}
      <div className="px-6 py-4 flex items-center gap-3">
        {/* Protocol Dropdown */}
        <select
          className="px-2 py-1 rounded border border-gray-300 bg-gray-50 text-gray-700 focus:outline-none"
          value={protocol}
          onChange={e => setProtocol(e.target.value)}
        >
          {PROTOCOLS.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {/* HTTP Method Dropdown */}
        <select
          className="px-2 py-1 rounded border border-gray-300 bg-gray-50 text-gray-700 focus:outline-none"
          value={method}
          onChange={e => setMethod(e.target.value)}
        >
          {HTTP_METHODS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* URL Input */}
        <input
          type="text"
          className="flex-1 px-3 py-1 rounded border border-gray-300 bg-gray-50 text-gray-800 focus:outline-none"
          placeholder="Enter request URL..."
          value={url}
          onChange={e => setUrl(e.target.value)}
        />

        {/* Send Button */}
        <button
          className="px-5 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
          onClick={() => {
            const request = {
              protocol,
              method,
              url,
              // Add params, headers, body when implemented
            };
            if (vscode) {
              vscode.postMessage({ type: 'sendRequest', request });
            }
          }}
        >
          Send
        </button>
      </div>

      {/* Horizontal Tabs */}
      <div className="border-b border-gray-200 flex gap-0">
        {['params', 'headers', 'body'].map(tab => (
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
      <div className="p-6">
        {activeTab === 'params' && (
          <div className="text-gray-700">Params editor placeholder</div>
        )}
        {activeTab === 'headers' && (
          <div className="text-gray-700">Headers editor placeholder</div>
        )}
        {activeTab === 'body' && (
          <div className="text-gray-700">Body editor placeholder</div>
        )}
      </div>
    </div>
  );
};

export default RequestPanel;
