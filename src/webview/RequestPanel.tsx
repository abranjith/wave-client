import React, { useState, useId, useEffect, useMemo } from 'react';
import { SendHorizonalIcon, SaveIcon } from 'lucide-react';
import { Button } from "../components/ui/button"
import StyledInput from "../components/ui/styled-input"
import RequestParams from "../components/common/RequestParams"
import RequestHeaders from "../components/common/RequestHeaders"
import RequestBody from "../components/common/RequestBody"
import Banner from "../components/ui/banner"
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
import { ParsedRequest } from '../types/collection';
import RequestSaveWizard from '../components/common/RequestSaveWizard';

interface RequestPanelProps {
  onSendRequest: () => void;
  onSaveRequest: (request: ParsedRequest, newCollectionName: string | undefined) => void;
}

interface CollectionToSaveInfo {
  collectionName: string;
  requestName: string;
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

const RequestPanel: React.FC<RequestPanelProps> = ({ onSendRequest, onSaveRequest })  => {
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
  const getParsedRequest = useAppStateStore((state) => state.getParsedRequest);
  const requestName = useAppStateStore((state) => state.name || 'Untitled Request');
  const errorMessage = useAppStateStore((state) => state.errorMessage);
  const setErrorMessage = useAppStateStore((state) => state.setErrorMessage);

  const [isRequestSaveWizardOpen, setIsRequestSaveWizardOpen] = useState(false);
  const [collectionInfoToSave, setCollectionInfoToSave] = useState<CollectionToSaveInfo | undefined>(undefined);

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

  // Memoize the styled text so it updates when activeEnvironment or url changes
  const styledUrlText = useMemo(() => {
    const activeEnvVariables = new Set<string>();
    if (activeEnvironment && activeEnvironment.values) {
      activeEnvironment.values.forEach((envVar) => {
        if (envVar.enabled && envVar.value) {
          activeEnvVariables.add(envVar.key);
        }
      });
    }
    const urlWithoutProtocol = getUrlWithoutProtocol(url);
    return renderParameterizedText(urlWithoutProtocol, activeEnvVariables);
  }, [activeEnvironment, url]);

  const handleSaveRequest = () => {
    // Get collection and folder names from folderPath
    // folderPath format: [collectionName, folderName1, folderName2, ...]
    if (!folderPath || folderPath.length === 0) {
      //invoke Request Save Wizard to select collection
      setIsRequestSaveWizardOpen(true);
    }
    else {
      const currentRequest = getParsedRequest();
      onSaveRequest(currentRequest, undefined);
    }
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

  useEffect(() => {
    if (collectionInfoToSave) {
      const currentRequest = getParsedRequest();
      currentRequest.name = collectionInfoToSave.requestName || currentRequest.name;
      onSaveRequest(currentRequest, collectionInfoToSave.collectionName);
      setCollectionInfoToSave(undefined);
    }
  }, [collectionInfoToSave]);

  return (
    <div className="w-full h-full bg-background border-b flex flex-col">
      {/* Breadcrumb and Environment Bar */}
      <div className="px-6 py-2 flex items-center justify-between border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 flex-shrink-0">
        {/* Breadcrumb on the left */}
        <Breadcrumb>
          <BreadcrumbList>
            {folderPath && folderPath.length > 1 ? (
              <>
                {folderPath.slice(1).map((item, index) => (
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
      
      {/* Error Message Banner */}
      {errorMessage && (
        <div className="px-6 pb-2 flex-shrink-0">
          <Banner
            message={errorMessage}
            messageType="error"
            onClose={() => setErrorMessage('')}
          />
        </div>
      )}

      {/* Top Bar */}
      <div className="px-6 py-4 flex items-center gap-3 flex-shrink-0">
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
          onChange={e => setUrl(e.target.value)}
          styledValue={styledUrlText}
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
      <div className="border-b border-slate-200 flex gap-0 bg-slate-50 px-6 dark:border-slate-700 dark:bg-slate-900 flex-shrink-0">
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
      <div className="px-6 py-4 bg-white dark:bg-slate-900 overflow-y-auto flex-1 min-h-0">
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

      {isRequestSaveWizardOpen && (
        <RequestSaveWizard
          isOpen={isRequestSaveWizardOpen}
          onClose={() => setIsRequestSaveWizardOpen(false)}
          onSave={(newCollectionName, requestName) => {
            setCollectionInfoToSave({ collectionName: newCollectionName, requestName });
            setIsRequestSaveWizardOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default RequestPanel;
