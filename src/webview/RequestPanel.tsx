import React, { useState, useId } from 'react';
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Square } from "../components/common/square"
import RequestParams from "../components/common/RequestParams"
import RequestHeaders from "../components/common/RequestHeaders"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select"

// VS Code API will be passed as a prop

const HTTP_METHODS = [
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'
];

const PROTOCOLS = [
  'HTTP', 'HTTPS'
];

interface RequestPanelProps {
  onSendRequest: (request: { method: string; url: string; params?: string; headers?: Record<string, string | string[]> }) => void;
}

const RequestPanel: React.FC<RequestPanelProps> = ({ onSendRequest }) => {
  const [protocol, setProtocol] = useState('HTTPS');
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [requestParams, setRequestParams] = useState<URLSearchParams>(new URLSearchParams());
  const [requestHeaders, setRequestHeaders] = useState<Record<string, string | string[]>>({});

  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body'>('params');
  const urlInputId = useId();
  const httpMethodSelectId = useId();


  return (
    <div className="w-full bg-white border-b border-gray-200">
      {/* Top Bar */}
      <div className="px-6 py-4 flex items-center gap-3">
        {/* Protocol Dropdown 
        <select
          className="px-2 py-1 rounded border border-gray-300 bg-gray-50 text-gray-700 focus:outline-none"
          value={protocol}
          onChange={e => setProtocol(e.target.value)}
        >
          {PROTOCOLS.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        */}

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

        {/* HTTP Method Dropdown
        <div className="*:not-first:mt-2">
          <Select defaultValue="1">
            <SelectTrigger
              id={httpMethodSelectId}
              className="ps-2 [&>span]:flex [&>span]:items-center [&>span]:gap-2 [&>span_[data-square]]:shrink-0"
            >
              <SelectValue placeholder="Select Method" />
            </SelectTrigger>
            <SelectContent className="[&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8 [&_*[role=option]>span]:start-auto [&_*[role=option]>span]:end-2 [&_*[role=option]>span]:flex [&_*[role=option]>span]:items-center [&_*[role=option]>span]:gap-2">
              <SelectGroup>
                <SelectLabel className="ps-2">Select Method</SelectLabel>
                {HTTP_METHODS.map(m => (
                  <SelectItem value={m}>
                    <Square className="bg-indigo-400/20 text-indigo-500">F</Square>
                    <span className="truncate">{m}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        */}

        {/* URL Input */}
        <input
          type="text"
          className="flex-1 px-3 py-1 rounded border border-gray-300 bg-gray-50 text-gray-800 focus:outline-none"
          placeholder="Enter request URL..."
          value={url}
          onChange={e => setUrl(e.target.value)}
        />

        {/* URL Input
        <div className="*:not-first:mt-2">
          <div className="flex gap-2">
            <Input id={urlInputId} className="flex-1" placeholder="URL" type="url" />
            <Button variant="outline">Send</Button>
          </div>
        </div>
         */}

        {/* Send Button */}
        <button
          className="px-5 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
          onClick={() => {
            const request = {
              method,
              url,
              params: requestParams.toString(),
              headers: requestHeaders,
              // Add body when implemented
            };
            onSendRequest(request);
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
          <RequestParams 
            onStateChange={setRequestParams}
            initialParams={requestParams}
          />
        )}
        {activeTab === 'headers' && (
          <RequestHeaders 
            onStateChange={setRequestHeaders}
            initialHeaders={requestHeaders}
          />
        )}
        {activeTab === 'body' && (
          <div className="text-gray-700">Body editor placeholder</div>
        )}
      </div>
    </div>
  );
};

export default RequestPanel;
