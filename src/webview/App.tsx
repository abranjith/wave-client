import React, { useState, useEffect, useRef } from 'react';
import ConfigPanel from './ConfigPanel';
import RequestPanel from './RequestPanel';
import ResponsePanel from './ResponsePanel';
import EnvironmentGrid from '../components/common/EnvironmentGrid';
import { ParsedRequest, Collection, Environment } from '../types/collection';
import { parseCollection } from '../utils/collectionParser';
import useAppStateStore from '../hooks/store/useAppStateStore';

const App: React.FC = () => {
  const [selectedEnvironment, setSelectedEnvironment] = useState<Environment | null>(null);

  const refreshCollections = useAppStateStore((state) => state.refreshCollections);
  const setCollections = useAppStateStore((state) => state.setCollections);
  const setCollectionLoadError = useAppStateStore((state) => state.setCollectionLoadError);
  const refreshEnvironments = useAppStateStore((state) => state.refreshEnvironments);
  const setEnvironments = useAppStateStore((state) => state.setEnvironments);
  const setEnvironmentLoadError = useAppStateStore((state) => state.setEnvironmentLoadError);
  const setCurrentRequest = useAppStateStore((state) => state.setCurrentRequest);
  const setResponseData = useAppStateStore((state) => state.setResponseData);
  const onSendRequest = useAppStateStore((state) => state.handleSendRequest);
  const vsCodeRef = useRef<any>(null);

  // Initialize Collections and Environments
  useEffect(() => {
    if (typeof acquireVsCodeApi !== 'undefined' && !vsCodeRef.current) {
      vsCodeRef.current = acquireVsCodeApi();
      refreshEnvironments(vsCodeRef.current);
      refreshCollections(vsCodeRef.current);
    }
  }, []);

  const handleRequestSelect = (request: ParsedRequest) => {
    setCurrentRequest(request);
    setSelectedEnvironment(null); // Clear environment selection when selecting a request
  };

  const handleEnvironmentSelect = (environment: Environment) => {
    setSelectedEnvironment(environment);
  };

  const handleBackFromEnvironment = () => {
    setSelectedEnvironment(null);
  };

  const handleSendRequest = () => {
    if (vsCodeRef.current) {
      onSendRequest(vsCodeRef.current);
    }
  };

  useEffect(() => {
    // Listen for messages from the VS Code extension
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'httpResponse') {
        setResponseData(message.response);
      } else if (message.type === 'collectionsLoaded') {
        try {
          const parsedCollections = message.collections.map((collection: Collection & { filename: string }) => 
            parseCollection(collection, collection.filename)
          );
          setCollections(parsedCollections);
        } catch (error: any) {
          setCollectionLoadError(`Error parsing collections: ${error.message}`);
        }
      } else if (message.type === 'collectionsError') {
        setCollectionLoadError(message.error);
      } else if (message.type === 'environmentsLoaded') {
        setEnvironments(message.environments);
      } else if (message.type === 'environmentsError') {
        setEnvironmentLoadError(message.error);
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
          onRequestSelect={handleRequestSelect}
          onEnvSelect={handleEnvironmentSelect}
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
            />
          </div>

          {/* Bottom-right ResponsePanel */}
          <div style={{ gridArea: 'response' }}>
            <ResponsePanel/>
          </div>
        </>
      )}
    </div>
  );
};

export default App;
