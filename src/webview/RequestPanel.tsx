import React, { useState, useId } from 'react';
import { SendHorizonalIcon, SaveIcon } from 'lucide-react';
import { Button } from "../components/ui/button"
import { StyledInput } from "../components/ui/styledinput"
import RequestParams from "../components/common/RequestParams"
import RequestHeaders from "../components/common/RequestHeaders"
import RequestBody from "../components/common/RequestBody"
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "../components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../components/ui/breadcrumb"
import useAppStateStore from '../hooks/store/useAppStateStore';
import { renderParameterizedText } from '../utils/styling';

interface RequestPanelProps {
  onSendRequest: () => void;
}

const HTTP_METHODS = [
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'
];

const PROTOCOLS = [
  'HTTP', 'HTTPS'
];

const TABS = [
  'Params', 'Headers', 'Body'
];

const RequestPanel: React.FC<RequestPanelProps> = ({ onSendRequest })  => {
  const protocol = useAppStateStore((state) => state.protocol || 'HTTPS');
  const setProtocol = useAppStateStore((state) => state.updateProtocol);
  const method = useAppStateStore((state) => state.method || 'GET');
  const setMethod = useAppStateStore((state) => state.updateMethod);
  const url = useAppStateStore((state) => state.url || '');
  const setUrl = useAppStateStore((state) => state.updateUrl);
  const folderPath = useAppStateStore((state) => state.folderPath);
  const environments = useAppStateStore((state) => state.environments);
  const activeEnvironment = useAppStateStore((state) => state.activeEnvironment);
  const setActiveEnvironment = useAppStateStore((state) => state.setActiveEnvironment);
  const saveRequestToCollection = useAppStateStore((state) => state.saveRequestToCollection);
  const getParsedRequest = useAppStateStore((state) => state.getParsedRequest);
  const requestName = useAppStateStore((state) => state.name || 'Untitled Request');

  const [activeTab, setActiveTab] = useState<'Params' | 'Headers' | 'Body'>('Params');
  const urlInputId = useId();
  const httpMethodSelectId = useId();
  const protocolSelectId = useId();
  const environmentSelectId = useId();

  const getUrlWithoutProtocol = (fullUrl: string) => {
    if (!fullUrl) {
      return '';
    }
    // Remove protocol (http:// or https://)
    const withoutProtocol = fullUrl.replace(/^https?:\/\//, '');
    // If the result is empty or just '/', return empty string
    return withoutProtocol === '/' ? '' : withoutProtocol;
  }

  const handleParameterizedTextStyling = (text: string) => {
    return renderParameterizedText(text, new Set());
  };

  const handleSaveRequest = () => {
    // Get collection and folder names from folderPath
    // folderPath format: [collectionName, folderName1, folderName2, ...]
    if (!folderPath || folderPath.length === 0) {
      // TODO: Show error or prompt to select a collection
      console.error('No collection selected');
      return;
    }

    const collectionName = folderPath[0];
    const folderName = folderPath.length > 1 ? folderPath[folderPath.length - 1] : null;
    const currentRequest = getParsedRequest();

    saveRequestToCollection(currentRequest, collectionName, folderName);
  };

  const handleEnvironmentChange = (value: string) => {
    if (value === 'none') {
      setActiveEnvironment(null);
    } else {
      const selectedEnv = environments?.find((env) => env.id === value);
      if (selectedEnv) {
        setActiveEnvironment(selectedEnv);
      }
    }
  };

  return (
    <div className="w-full bg-background border-b">
      {/* Breadcrumb and Environment Bar */}
      <div className="px-6 py-2 flex items-center justify-between border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
        {/* Breadcrumb on the left */}
        <Breadcrumb>
          <BreadcrumbList>
            {folderPath && folderPath.length > 0 ? (
              <>
                {folderPath.map((item, index) => (
                      <>
                        <BreadcrumbItem>
                          <BreadcrumbLink>{item}</BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                      </>
                ))}
                <BreadcrumbItem>
                  <BreadcrumbPage>{requestName}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage>{requestName}</BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        {/* Environment Selector and Save Button on the right */}
        <div className="flex items-center gap-3">
          {/* Environment Dropdown */}
          <Select 
            value={activeEnvironment?.id || 'none'} 
            onValueChange={handleEnvironmentChange}
          >
            <SelectTrigger 
              id={environmentSelectId} 
              className="w-auto max-w-full min-w-40 bg-white border-slate-300 text-slate-900 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <SelectValue placeholder="Select Environment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="hover:bg-slate-100 dark:hover:bg-slate-700">
                None
              </SelectItem>
              {environments && environments.map((env) => (
                <SelectItem 
                  key={env.id} 
                  value={env.id} 
                  className="hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  {env.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Save Button */}
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleSaveRequest}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-2 transition-colors dark:bg-green-500 dark:hover:bg-green-600"
                >
                  <SaveIcon size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="px-2 py-1 text-xs">
                Save to Collection
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

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
        <div className="*:not-first:mt-2">
          <Select defaultValue='HTTPS' value={protocol.toUpperCase()} onValueChange={setProtocol}>
            <SelectTrigger id={protocolSelectId} className="w-auto max-w-full min-w-24 bg-white border-slate-300 text-slate-900 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700">
              <SelectValue placeholder="Select Protocol" />
            </SelectTrigger>
            <SelectContent>
            {PROTOCOLS.map(m => (
              <SelectItem key={m} value={m} className="hover:bg-slate-100 dark:hover:bg-slate-700">
                {m}
              </SelectItem>
            ))}
            </SelectContent>
          </Select>
        </div>

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
            <SelectTrigger id={httpMethodSelectId} className="w-auto max-w-full min-w-24 bg-white border-slate-300 text-slate-900 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700">
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

        {/* URL Input */}
        <StyledInput
          id={urlInputId}
          type="text"
          className="bg-white border-slate-300 focus:border-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:focus:border-blue-400" 
          value={getUrlWithoutProtocol(url)}
          onChange={setUrl}
          handleTextStyling={handleParameterizedTextStyling}
          placeholder="Enter request URL..."
        />

        {/* Send Button */}
         <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => {
                  onSendRequest();
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
      <div className="border-b border-slate-200 flex gap-0 bg-slate-50 px-6 dark:border-slate-700 dark:bg-slate-900">
        {TABS.map(tab => (
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
      <div className="px-6 py-4 bg-white dark:bg-slate-900">
        {activeTab === 'Params' && (
          <RequestParams/>
        )}
        {activeTab === 'Headers' && (
          <RequestHeaders/>
        )}
        {activeTab === 'Body' && (
          <RequestBody/>
        )}
      </div>
    </div>
  );
};

export default RequestPanel;
