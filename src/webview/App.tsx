import React, { useState, useEffect, useRef } from 'react';
import ConfigPanel from './ConfigPanel';
import RequestPanel from './RequestPanel';
import ResponsePanel from './ResponsePanel';
import EnvironmentGrid from '../components/common/EnvironmentGrid';
import { ParsedRequest, Collection, Environment } from '../types/collection';
import { parseCollection, transformToCollectionRequest } from '../utils/collectionParser';
import useAppStateStore from '../hooks/store/useAppStateStore';

const App: React.FC = () => {
  const [selectedEnvironment, setSelectedEnvironment] = useState<Environment | null>(null);

  const refreshCollections = useAppStateStore((state) => state.refreshCollections);
  const setCollections = useAppStateStore((state) => state.setCollections);
  const updateCollection = useAppStateStore((state) => state.updateCollection);
  const addCollection = useAppStateStore((state) => state.addCollection);
  const setCollectionLoadError = useAppStateStore((state) => state.setCollectionLoadError);
  const refreshEnvironments = useAppStateStore((state) => state.refreshEnvironments);
  const setEnvironments = useAppStateStore((state) => state.setEnvironments);
  const setEnvironmentLoadError = useAppStateStore((state) => state.setEnvironmentLoadError);
  const setCurrentRequest = useAppStateStore((state) => state.setCurrentRequest);
  const setResponseData = useAppStateStore((state) => state.setResponseData);
  const onSendRequest = useAppStateStore((state) => state.handleSendRequest);
  const updateEnvironment = useAppStateStore((state) => state.updateEnvironment);
  const collections = useAppStateStore((state) => state.collections);
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
    else{
      console.error('VS Code API is not available.');
    }
  };

  const handleSaveRequest = (request: ParsedRequest, newCollectionName: string | undefined) => {
    const collectionRequest = transformToCollectionRequest(request);
    //if newCollectionName exists in collections, we are updating an existing collection s use filename & collection name from there
    const existingCollection =  newCollectionName && collections.find((collection) => collection.name === newCollectionName);
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'saveRequestToCollection',
        data: {
          requestContent: JSON.stringify(collectionRequest, null, 2),
          requestName: request.name,
          collectionFileName: existingCollection ? existingCollection.filename : request.sourceRef.collectionFilename,
          folderPath: request.sourceRef.itemPath,
          newCollectionName: existingCollection ? undefined : newCollectionName
        }
      });
    }
  }

  const handleSaveEnvironment = (environment: Environment) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'saveEnvironment',
        data: {
          environment: JSON.stringify(environment, null, 2)
        }
      });
    }
  };

  const handleDownloadResponse = (data: string) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
          type: 'downloadResponse',
          data: data
        });
    }
  };

  const handleImportCollection = (fileName: string, fileContent: string, collectionType: string) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'importCollection',
        data: { fileName, fileContent, collectionType }
      });
    }
  };

  const handleExportCollection = (collectionName: string) => {
    const collection =  collectionName && collections.find((collection) => collection.name === collectionName);
    if (vsCodeRef.current && collection) {
      vsCodeRef.current.postMessage({
        type: 'exportCollection',
        data: { fileName : collection.filename }
      });
    }
  };

  const handleImportEnvironments = (fileName: string, fileContent: string) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'importEnvironments',
        data: { fileName, fileContent }
      });
    }
  };

  const handleExportEnvironments = () => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'exportEnvironments'
      });
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
      } else if (message.type === 'collectionUpdated') {
        try {
          const collection = parseCollection(message.collection, message.collection.filename);
          //if collection does not exist, add it
          const existingCollection = collections.find((c) => c.name === collection.name);
          if (!existingCollection) {
            addCollection(collection);
            return;
          }
          updateCollection(collection.name, collection);
        } catch (error: any) {
          console.error('Error updating collection:', error);
        }
      } else if (message.type === 'collectionsError') {
        setCollectionLoadError(message.error);
      } else if (message.type === 'environmentsLoaded') {
        setEnvironments(message.environments);
      } else if (message.type === 'environmentsError') {
        setEnvironmentLoadError(message.error);
      }
      else if (message.type === 'environmentUpdated') {
        try {
          updateEnvironment(message.environment.id, message.environment);
        } catch (error: any) {
          console.error('Error updating environment:', error);
        }
      }
    };

    window.addEventListener('message', messageHandler);

    return () => {
      window.removeEventListener('message', messageHandler);
    };
  }, []);

  return (
    <div
      className="min-h-screen h-screen w-screen bg-slate-50 dark:bg-slate-900 grid"
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
      <div style={{ gridArea: 'config' }} className="overflow-hidden">
        <ConfigPanel 
          onRequestSelect={handleRequestSelect}
          onEnvSelect={handleEnvironmentSelect}
          onImportCollection={handleImportCollection}
          onExportCollection={handleExportCollection}
          onImportEnvironments={handleImportEnvironments}
          onExportEnvironments={handleExportEnvironments}
        />
      </div>

      {selectedEnvironment ? (
        /* Environment Grid - Full Height */
        <div style={{ gridArea: 'environment' }} className="overflow-hidden">
          <EnvironmentGrid 
            environment={selectedEnvironment}
            onBack={handleBackFromEnvironment}
            onSaveEnvironment={handleSaveEnvironment}
          />
        </div>
      ) : (
        <>
          {/* Top-right RequestPanel */}
          <div style={{ gridArea: 'request' }} className="overflow-hidden">
            <RequestPanel 
              onSendRequest={handleSendRequest}
              onSaveRequest={handleSaveRequest}
            />
          </div>

          {/* Bottom-right ResponsePanel */}
          <div style={{ gridArea: 'response' }} className="overflow-hidden">
            <ResponsePanel onDownloadResponse={handleDownloadResponse} />
          </div>
        </>
      )}
    </div>
  );
};

export default App;
