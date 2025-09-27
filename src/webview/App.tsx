import React, { useState, useEffect, useRef } from 'react';
import ConfigPanel from './ConfigPanel';
import RequestPanel from './RequestPanel';
import ResponsePanel, { ResponseData } from './ResponsePanel';
import CollectionsPane from '../components/common/CollectionsPane';
import EnvironmentsPane from '../components/common/EnvironmentsPane';
import { ParsedCollection, ParsedRequest, Collection, Environment } from '../types/collection';
import { parseCollection } from '../utils/collectionParser';

const App: React.FC = () => {
  const [responseData, setResponseData] = useState<ResponseData | undefined>(undefined);
  const [collections, setCollections] = useState<ParsedCollection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionsError, setCollectionsError] = useState<string | undefined>();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [environmentsLoading, setEnvironmentsLoading] = useState(true);
  const [environmentsError, setEnvironmentsError] = useState<string | undefined>();
  const [selectedRequest, setSelectedRequest] = useState<ParsedRequest | undefined>();
  const [activeTab, setActiveTab] = useState<'collections' | 'environments'>('collections');
  const vsCodeRef = useRef<any>(null);

  // Initialize VS Code API once
  useEffect(() => {
    if (typeof acquireVsCodeApi !== 'undefined' && !vsCodeRef.current) {
      vsCodeRef.current = acquireVsCodeApi();
      
      // Load collections and environments on startup
      vsCodeRef.current.postMessage({ type: 'loadCollections' });
      vsCodeRef.current.postMessage({ type: 'loadEnvironments' });
    }
  }, []);

  const handleSendRequest = (request: { method: string; url: string; params?: string; headers?: Record<string, string | string[]>; body?: string }) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({ type: 'httpRequest', request });
    }
  };

  const handleRequestSelect = (request: ParsedRequest) => {
    setSelectedRequest(request);
  };

  useEffect(() => {
    // Listen for messages from the VS Code extension
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'httpResponse') {
        setResponseData(message.response);
      } else if (message.type === 'collectionsLoaded') {
        setCollectionsLoading(false);
        try {
          const parsedCollections = message.collections.map((collection: Collection & { filename: string }) => 
            parseCollection(collection, collection.filename)
          );
          setCollections(parsedCollections);
        } catch (error: any) {
          setCollectionsError(`Error parsing collections: ${error.message}`);
        }
      } else if (message.type === 'collectionsError') {
        setCollectionsLoading(false);
        setCollectionsError(message.error);
      } else if (message.type === 'environmentsLoaded') {
        setEnvironmentsLoading(false);
        setEnvironments(message.environments);
      } else if (message.type === 'environmentsError') {
        setEnvironmentsLoading(false);
        setEnvironmentsError(message.error);
      }
    };

    window.addEventListener('message', messageHandler);

    return () => {
      window.removeEventListener('message', messageHandler);
    };
  }, []);

  return (
    <div
      className="min-h-screen h-screen w-screen bg-gray-50 grid"
      style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr',
        gridTemplateRows: '1fr 1fr',
        gridTemplateAreas: `
          "sidebar request"
          "sidebar response"
        `,
        height: '100vh',
      }}
    >
      {/* Left Sidebar with Tabs */}
      <div style={{ gridArea: 'sidebar' }} className="flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700">
        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'collections'
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            onClick={() => setActiveTab('collections')}
          >
            Collections
          </button>
          <button
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'environments'
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            onClick={() => setActiveTab('environments')}
          >
            Environments
          </button>
        </div>
        
        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'collections' && (
            <CollectionsPane 
              collections={collections}
              onRequestSelect={handleRequestSelect}
              isLoading={collectionsLoading}
              error={collectionsError}
            />
          )}
          {activeTab === 'environments' && (
            <EnvironmentsPane 
              environments={environments}
              isLoading={environmentsLoading}
              error={environmentsError}
            />
          )}
        </div>
      </div>

      {/* Top-right RequestPanel */}
      <div style={{ gridArea: 'request' }}>
        <RequestPanel 
          onSendRequest={handleSendRequest} 
          selectedRequest={selectedRequest}
        />
      </div>

      {/* Bottom-right ResponsePanel */}
      <div style={{ gridArea: 'response' }}>
        <ResponsePanel response={responseData} />
      </div>
    </div>
  );
};

export default App;
