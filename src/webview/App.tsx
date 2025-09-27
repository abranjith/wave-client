import React, { useState, useEffect, useRef } from 'react';
import ConfigPanel from './ConfigPanel';
import RequestPanel from './RequestPanel';
import ResponsePanel, { ResponseData } from './ResponsePanel';
import EnvironmentGrid from '../components/common/EnvironmentGrid';
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
  const [selectedEnvironment, setSelectedEnvironment] = useState<Environment | undefined>();
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
    setSelectedEnvironment(undefined); // Clear environment selection when selecting a request
  };

  const handleEnvironmentSelect = (environment: Environment) => {
    setSelectedEnvironment(environment);
  };

  const handleBackFromEnvironment = () => {
    setSelectedEnvironment(undefined);
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
        gridTemplateColumns: selectedEnvironment ? '400px 1fr' : '400px 1fr',
        gridTemplateRows: selectedEnvironment ? '1fr' : '1fr 1fr',
        gridTemplateAreas: selectedEnvironment 
          ? `"config environment"` 
          : `
            "config request"
            "config response"
          `,
        height: '100vh',
      }}
    >
      {/* Left Sidebar with Tabs */}
      <div style={{ gridArea: 'config' }}>
        <ConfigPanel 
          collectionsProps={{
            collections,
            onRequestSelect: handleRequestSelect,
            isLoading: collectionsLoading,
            error: collectionsError
          }}
          environmentProps={{
            environments,
            onEnvironmentSelect: handleEnvironmentSelect,
            isLoading: environmentsLoading,
            error: environmentsError
          }}
        />
      </div>

      {selectedEnvironment ? (
        /* Environment Grid - Full Height */
        <div style={{ gridArea: 'environment' }}>
          <EnvironmentGrid 
            environment={selectedEnvironment}
            onBack={handleBackFromEnvironment}
          />
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
};

export default App;
