/**
 * RequestEditor Component
 * Unified component that displays both Request and Response panels for the active tab.
 * This replaces the separate RequestPanel and ResponsePanel components when in tab mode.
 */

import React, { useState, useId, useEffect, useMemo, useCallback } from 'react';
import { SendHorizonalIcon, SaveIcon, LoaderCircleIcon } from 'lucide-react';
import { Button } from '../components/ui/button';
import StyledInput from '../components/ui/styled-input';
import RequestParams from '../components/common/RequestParams';
import RequestHeaders from '../components/common/RequestHeaders';
import RequestBody from '../components/common/RequestBody';
import ResponseBody from '../components/common/ResponseBody';
import Banner from '../components/ui/banner';
import TabsBar from '../components/common/TabsBar';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../components/ui/tooltip';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '../components/ui/breadcrumb';
import useAppStateStore from '../hooks/store/useAppStateStore';
import { renderParameterizedText } from '../utils/styling';
import { ParsedRequest } from '../types/collection';
import { TabData, TAB_CONSTANTS } from '../types/tab';
import RequestSaveWizard from '../components/common/RequestSaveWizard';

// ==================== Helper Functions ====================

function getStatusColor(status: number) {
    if (status >= 200 && status < 300) return 'text-green-600';
    if (status >= 400 && status < 500) return 'text-yellow-600';
    if (status >= 500) return 'text-red-600';
    return 'text-gray-600';
}

// ==================== Constants ====================

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
const REQUEST_TABS = ['Params', 'Headers', 'Body'] as const;

// ==================== Props ====================

interface RequestEditorProps {
    onSendRequest: (tabId: string) => void;
    onSaveRequest: (request: ParsedRequest, newCollectionName: string | undefined) => void;
    onDownloadResponse: (data: string) => void;
}

interface CollectionToSaveInfo {
    collectionName: string;
    requestName: string;
}

// ==================== Component ====================

const RequestEditor: React.FC<RequestEditorProps> = ({
    onSendRequest,
    onSaveRequest,
    onDownloadResponse
}) => {
    // ==================== Store Selectors ====================
    
    // Active tab data
    const activeTab = useAppStateStore((state) => state.getActiveTab());
    const activeTabId = useAppStateStore((state) => state.activeTabId);
    
    // Tab update functions
    const updateMethod = useAppStateStore((state) => state.updateMethod);
    const updateUrl = useAppStateStore((state) => state.updateUrl);
    const setActiveRequestSection = useAppStateStore((state) => state.setActiveRequestSection);
    const setActiveResponseSection = useAppStateStore((state) => state.setActiveResponseSection);
    const setTabEnvironment = useAppStateStore((state) => state.setTabEnvironment);
    const setTabAuth = useAppStateStore((state) => state.setTabAuth);
    const setErrorMessage = useAppStateStore((state) => state.setErrorMessage);
    const getParsedRequest = useAppStateStore((state) => state.getParsedRequest);
    const getActiveEnvVariableKeys = useAppStateStore((state) => state.getActiveEnvVariableKeys);
    
    // Global data (shared across tabs)
    const environments = useAppStateStore((state) => state.environments);
    const auths = useAppStateStore((state) => state.auths);
    
    // ==================== Local State ====================
    
    const [isRequestSaveWizardOpen, setIsRequestSaveWizardOpen] = useState(false);
    const [collectionInfoToSave, setCollectionInfoToSave] = useState<CollectionToSaveInfo | undefined>(undefined);
    
    const urlInputId = useId();
    const httpMethodSelectId = useId();
    const environmentSelectId = useId();
    const authSelectId = useId();

    // ==================== Derived State ====================
    
    const tabAuth = useMemo(() => {
        if (!activeTab?.authId) return null;
        return auths.find(a => a.id === activeTab.authId) || null;
    }, [activeTab?.authId, auths]);

    // Memoize the styled URL text
    const styledUrlText = useMemo(() => {
        const activeEnvVariables = getActiveEnvVariableKeys(activeTab?.environmentId);
        return renderParameterizedText(activeTab?.url || '', activeEnvVariables);
    }, [activeTab?.environmentId, activeTab?.url, getActiveEnvVariableKeys]);

    // ==================== Event Handlers ====================
    
    const handleSaveRequest = useCallback(() => {
        if (!activeTab?.folderPath || activeTab.folderPath.length === 0) {
            setIsRequestSaveWizardOpen(true);
        } else {
            const currentRequest = getParsedRequest();
            onSaveRequest(currentRequest, undefined);
        }
    }, [activeTab?.folderPath, getParsedRequest, onSaveRequest]);

    const handleEnvironmentChange = useCallback((value: string) => {
        if (value === 'none') {
            setTabEnvironment(null);
        } else {
            setTabEnvironment(value);
        }
    }, [setTabEnvironment]);

    const handleAuthChange = useCallback((value: string) => {
        if (value === 'none') {
            setTabAuth(null);
        } else {
            setTabAuth(value);
        }
    }, [setTabAuth]);

    // Handle save wizard completion
    useEffect(() => {
        if (collectionInfoToSave) {
            const currentRequest = getParsedRequest();
            currentRequest.name = collectionInfoToSave.requestName || currentRequest.name;
            onSaveRequest(currentRequest, collectionInfoToSave.collectionName);
            setCollectionInfoToSave(undefined);
        }
    }, [collectionInfoToSave, getParsedRequest, onSaveRequest]);

    // ==================== Early Return ====================
    
    if (!activeTab) {
        return (
            <div className="w-full h-full bg-white dark:bg-slate-900 flex items-center justify-center">
                <div className="text-slate-500 dark:text-slate-400 text-center">
                    <div className="text-lg font-medium mb-2">No tab selected</div>
                    <div className="text-sm">Create a new tab to get started</div>
                </div>
            </div>
        );
    }

    // ==================== Render ====================
    
    const { 
        method, 
        url, 
        folderPath, 
        name: requestName, 
        errorMessage, 
        isRequestProcessing,
        responseData,
        activeRequestSection,
        activeResponseSection
    } = activeTab;

    return (
        <div className="w-full h-full flex flex-col overflow-hidden">
            {/* Tabs Bar */}
            <TabsBar />
            
            {/* Request Panel */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* Breadcrumb and Environment Bar */}
                <div className="px-6 py-2 flex items-center justify-between border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 flex-shrink-0">
                    {/* Breadcrumb on the left */}
                    <Breadcrumb>
                        <BreadcrumbList>
                            {folderPath && folderPath.length > 0 ? (
                                <>
                                    {folderPath.map((item, index) => (
                                        <React.Fragment key={`${item}-${index}`}>
                                            <BreadcrumbItem>
                                                <BreadcrumbLink>{item}</BreadcrumbLink>
                                            </BreadcrumbItem>
                                            <BreadcrumbSeparator />
                                        </React.Fragment>
                                    ))}
                                    <BreadcrumbItem>
                                        <BreadcrumbPage>{requestName || TAB_CONSTANTS.DEFAULT_NAME}</BreadcrumbPage>
                                    </BreadcrumbItem>
                                </>
                            ) : (
                                <BreadcrumbItem>
                                    <BreadcrumbPage>{requestName || TAB_CONSTANTS.DEFAULT_NAME}</BreadcrumbPage>
                                </BreadcrumbItem>
                            )}
                        </BreadcrumbList>
                    </Breadcrumb>

                    {/* Environment Selector and Save Button on the right */}
                    <div className="flex items-center gap-3">
                        {/* Auth Dropdown */}
                        <Select 
                            value={activeTab.authId || 'none'} 
                            onValueChange={handleAuthChange}
                        >
                            <SelectTrigger 
                                id={authSelectId} 
                                className="w-auto max-w-full min-w-40 bg-white border-slate-300 text-slate-900 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
                            >
                                <SelectValue placeholder="Select Auth" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none" className="hover:bg-slate-100 dark:hover:bg-slate-700">
                                    No Auth
                                </SelectItem>
                                {auths && auths.map((auth) => (
                                    <SelectItem 
                                        key={auth.id} 
                                        value={auth.id} 
                                        className="hover:bg-slate-100 dark:hover:bg-slate-700"
                                    >
                                        {auth.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Environment Dropdown */}
                        <Select 
                            value={activeTab.environmentId || 'none'} 
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
                                {environments && environments.filter(env => env.name.toLowerCase() !== 'global').map((env) => (
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
                                        className="bg-green-400 hover:bg-green-600 text-green-100 font-medium px-6 py-2 transition-colors dark:bg-green-500 dark:hover:bg-green-800 dark:text-slate-100"
                                        disabled={isRequestProcessing || !Boolean(url?.trim())}
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
                
                {/* Error Message Banner (per-tab) */}
                {errorMessage && (
                    <div className="px-6 pb-2 flex-shrink-0">
                        <Banner
                            message={errorMessage}
                            messageType="error"
                            onClose={() => setErrorMessage('')}
                        />
                    </div>
                )}

                {/* Top Bar - Method, URL, Send */}
                <div className="px-6 py-4 flex items-center gap-3 flex-shrink-0 border-b border-slate-200 dark:border-slate-700">
                    {/* HTTP Method Dropdown */}
                    <div className="*:not-first:mt-2">
                        <Select value={method || 'GET'} onValueChange={updateMethod}>
                            <SelectTrigger 
                                id={httpMethodSelectId} 
                                className="w-auto max-w-full min-w-24 bg-white border-slate-300 text-slate-900 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
                            >
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
                        value={url}
                        onChange={e => updateUrl(e.target.value)}
                        styledValue={styledUrlText}
                        placeholder="Enter request URL..."
                    />

                    {/* Send Button */}
                    <TooltipProvider delayDuration={0}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    onClick={() => onSendRequest(activeTabId)}
                                    className="bg-blue-400 hover:bg-blue-600 text-blue-100 font-medium px-6 py-2 transition-colors dark:bg-blue-500 dark:hover:bg-blue-800 dark:text-slate-100"
                                    disabled={isRequestProcessing || !Boolean(url?.trim())}
                                >
                                    {isRequestProcessing 
                                        ? <LoaderCircleIcon className="animate-spin" /> 
                                        : <SendHorizonalIcon />
                                    }
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="px-2 py-1 text-xs">
                                Send
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>

                {/* Split View: Request (top half) and Response (bottom half) */}
                <div className="flex-1 min-h-0 flex flex-col">
                    {/* Request Section */}
                    <div className="flex-1 min-h-0 flex flex-col border-b border-slate-300 dark:border-slate-600">
                        {/* Request Tabs */}
                        <div className="border-b border-slate-200 flex gap-0 bg-slate-50 px-6 dark:border-slate-700 dark:bg-slate-900 flex-shrink-0">
                            {REQUEST_TABS.map(tab => (
                                <button
                                    key={tab}
                                    className={`px-6 py-3 text-sm font-medium focus:outline-none transition-all relative ${
                                        activeRequestSection === tab
                                            ? 'border-b-2 border-blue-500 text-blue-600 bg-white dark:bg-slate-800 dark:text-blue-400 dark:border-blue-400'
                                            : 'text-slate-600 bg-transparent hover:text-blue-600 hover:bg-white/50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-slate-800/50'
                                    }`}
                                    onClick={() => setActiveRequestSection(tab)}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {/* Request Tab Content */}
                        <div className="px-6 py-4 bg-white dark:bg-slate-900 overflow-y-auto flex-1 min-h-0">
                            {activeRequestSection === 'Params' && <RequestParams />}
                            {activeRequestSection === 'Headers' && <RequestHeaders />}
                            {activeRequestSection === 'Body' && <RequestBody />}
                        </div>
                    </div>

                    {/* Response Section */}
                    <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900">
                        {!responseData ? (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-slate-500 dark:text-slate-400 text-center">
                                    <div className="text-lg font-medium mb-2">No response yet</div>
                                    <div className="text-sm">Send a request to see the response here</div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Response Metadata */}
                                <div className="flex gap-4 px-6 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono flex-shrink-0">
                                    <div className={`flex items-center gap-1 ${getStatusColor(responseData.status)}`}>
                                        <span className="font-bold">Status:</span>
                                        <span>{responseData.status} {responseData.statusText}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                        <span className="font-bold">Time:</span>
                                        <span>{responseData.elapsedTime} ms</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                                        <span className="font-bold">Size:</span>
                                        <span>{responseData.size >= 1024 ? `${(responseData.size / 1024).toFixed(1)} KB` : `${responseData.size} B`}</span>
                                    </div>
                                </div>

                                {/* Response Tabs */}
                                <div className="border-b border-slate-200 dark:border-slate-700 flex gap-0 bg-slate-50 dark:bg-slate-900 flex-shrink-0">
                                    {(['Body', 'Headers'] as const).map(tab => (
                                        <button
                                            key={tab}
                                            className={`px-6 py-3 text-sm font-medium focus:outline-none transition-all relative ${
                                                activeResponseSection === tab
                                                    ? 'border-b-2 border-blue-500 text-blue-600 bg-white dark:bg-slate-800 dark:text-blue-400 dark:border-blue-400'
                                                    : 'text-slate-600 bg-transparent hover:text-blue-600 hover:bg-white/50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-slate-800/50'
                                            }`}
                                            onClick={() => setActiveResponseSection(tab)}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>

                                {/* Response Tab Content */}
                                <div className="px-6 py-4 bg-white dark:bg-slate-900 overflow-auto min-h-0 flex-1">
                                    {activeResponseSection === 'Body' && (
                                        <ResponseBody 
                                            body={responseData.body}
                                            headers={responseData.headers}
                                            statusCode={responseData.status}
                                            onDownloadResponse={onDownloadResponse}
                                        />
                                    )}
                                    {activeResponseSection === 'Headers' && (
                                        <div className="space-y-2">
                                            {Object.entries(responseData.headers).map(([key, value]) => (
                                                <div key={key} className="flex gap-2 py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                                    <span className="font-mono font-bold text-slate-500 dark:text-slate-400 w-40 flex-shrink-0">{key}</span>
                                                    <span className="font-mono text-slate-800 dark:text-slate-200 break-words">{value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Save Wizard Modal */}
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

export default RequestEditor;
