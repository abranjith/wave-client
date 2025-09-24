import React, { useState, useId } from 'react';
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Square } from "../components/common/square"
import RequestParams from "../components/common/RequestParams"
import RequestHeaders from "../components/common/RequestHeaders"
import RequestBody from "../components/common/RequestBody"
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
  onSendRequest: (request: { method: string; url: string; params?: string; headers?: Record<string, string | string[]>; body?: string }) => void;
}

const RequestPanel: React.FC<RequestPanelProps> = ({ onSendRequest }) => {
  const [protocol, setProtocol] = useState('HTTPS');
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [requestParams, setRequestParams] = useState<URLSearchParams>(new URLSearchParams());
  const [requestHeaders, setRequestHeaders] = useState<Record<string, string | string[]>>({});
  const [requestBody, setRequestBody] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body'>('params');
  const urlInputId = useId();
  const httpMethodSelectId = useId();


  return (
    <div className="w-full bg-background border-b">
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

        {/* HTTP Method Dropdown
        <select
          className="px-2 py-1 rounded border border-gray-300 bg-gray-50 text-gray-700 focus:outline-none"
          value={method}
          onChange={e => setMethod(e.target.value)}
        >
          {HTTP_METHODS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select> */}

        {/* HTTP Method Dropdown */}
        <div className="*:not-first:mt-2">
          <Select defaultValue={method} onValueChange={setMethod}>
            <SelectTrigger id={httpMethodSelectId} className="w-auto max-w-full min-w-48">
              <SelectValue placeholder="Select Method" />
            </SelectTrigger>
            <SelectContent>
                {HTTP_METHODS.map(m => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* URL Input
        <input
          type="text"
          className="flex-1 px-3 py-1 rounded border border-gray-300 bg-gray-50 text-gray-800 focus:outline-none"
          placeholder="Enter request URL..."
          value={url}
          onChange={e => setUrl(e.target.value)}
        /> */}

        {/* URL Input */}
        <div className="flex-1">
          <div className="flex gap-2">
            <Input 
              id={urlInputId} 
              className="flex-1" 
              placeholder="Enter request URL..." 
              type="url" 
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
          </div>
        </div>

        {/* Send Button */}
        <Button
          onClick={() => {
            const request = {
              method,
              url,
              params: requestParams.toString(),
              headers: requestHeaders,
              body: requestBody,
            };
            onSendRequest(request);
          }}
        >
          Send
        </Button>
        
      </div>

      {/* Horizontal Tabs */}
      <div className="border-b flex gap-0">
        {['params', 'headers', 'body'].map(tab => (
          <button
            key={tab}
            className={`px-6 py-2 text-sm font-medium focus:outline-none transition-all ${
              activeTab === tab
                ? 'border-b-2 border-primary text-primary bg-background'
                : 'text-muted-foreground bg-muted hover:text-primary'
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
          <RequestBody 
            onStateChange={setRequestBody}
            initialBody={requestBody}
          />
        )}
      </div>
    </div>
  );
};

export default RequestPanel;
