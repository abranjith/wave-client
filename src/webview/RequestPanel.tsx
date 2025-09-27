import React, { useState, useId, useEffect } from 'react';
import { SendHorizonalIcon } from 'lucide-react';
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Square } from "../components/common/square"
import RequestParams from "../components/common/RequestParams"
import RequestHeaders from "../components/common/RequestHeaders"
import RequestBody from "../components/common/RequestBody"
import { ParsedRequest } from '../types/collection'
import {
   Select,
   SelectContent,
   SelectGroup,
   SelectItem,
   SelectLabel,
   SelectTrigger,
   SelectValue,
 } from "../components/ui/select"
 import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip"

// VS Code API will be passed as a prop

const HTTP_METHODS = [
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'
];

const PROTOCOLS = [
  'HTTP', 'HTTPS'
];

interface RequestPanelProps {
  onSendRequest: (request: { method: string; url: string; params?: string; headers?: Record<string, string | string[]>; body?: string }) => void;
  selectedRequest?: ParsedRequest;
}

const RequestPanel: React.FC<RequestPanelProps> = ({ onSendRequest, selectedRequest }) => {
  const [protocol, setProtocol] = useState('HTTPS');
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [requestParams, setRequestParams] = useState<URLSearchParams>(new URLSearchParams());
  const [requestHeaders, setRequestHeaders] = useState<Record<string, string | string[]>>({});
  const [requestBody, setRequestBody] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body'>('params');
  const urlInputId = useId();
  const httpMethodSelectId = useId();

  // Effect to populate form when a request is selected
  useEffect(() => {
    if (selectedRequest) {
      setMethod(selectedRequest.method);
      setUrl(selectedRequest.url);
      setRequestParams(new URLSearchParams(selectedRequest.params));
      setRequestHeaders(selectedRequest.headers);
      setRequestBody(selectedRequest.body);
    }
  }, [selectedRequest]);


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
            <SelectTrigger id={httpMethodSelectId} className="w-auto max-w-full min-w-48 bg-white border-slate-300 text-slate-900 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700">
              <SelectValue placeholder="Select Method" />
            </SelectTrigger>
            <SelectContent>
                {HTTP_METHODS.map(m => (
                  <SelectItem key={m} value={m} className="hover:bg-slate-100 dark:hover:bg-slate-700">
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
              className="flex-1 bg-white border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-blue-400 dark:focus:ring-blue-400" 
              placeholder="Enter request URL..." 
              type="url" 
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
          </div>
        </div>

        {/* Send Button */}
         <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
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
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 transition-colors dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <SendHorizonalIcon/>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="px-2 py-1 text-xs">
              Send
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        
      </div>

      {/* Horizontal Tabs */}
      <div className="border-b border-slate-200 flex gap-0 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
        {['params', 'headers', 'body'].map(tab => (
          <button
            key={tab}
            className={`px-6 py-3 text-sm font-medium focus:outline-none transition-all relative ${
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
      <div className="p-6 bg-white dark:bg-slate-900">
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
