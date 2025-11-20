import React, { useState, useEffect, useRef } from 'react';
import ConfigPanel from './ConfigPanel';
import RequestPanel from './RequestPanel';
import ResponsePanel from './ResponsePanel';
import EnvironmentGrid from '../components/common/EnvironmentGrid';
import CookieStoreGrid from '../components/common/CookieStoreGrid';
import AuthStoreGrid from '../components/common/AuthStoreGrid';
import { ParsedRequest, Collection, Environment, Cookie } from '../types/collection';
import { parseCollection, transformToCollectionRequest } from '../utils/collectionParser';
import useAppStateStore from '../hooks/store/useAppStateStore';
import { Auth } from '../hooks/store/createAuthSlice';

const App: React.FC = () => {
  const [selectedEnvironment, setSelectedEnvironment] = useState<Environment | null>(null);
  const [selectedStore, setSelectedStore] = useState<'cookie' | 'auth' | null>(null);

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
  const setErrorMessage = useAppStateStore((state) => state.setErrorMessage);
  const setCookies = useAppStateStore((state) => state.setCookies);
  const setAuths = useAppStateStore((state) => state.setAuths);
  const getCurrentRequest = useAppStateStore((state) => state.getParsedRequest);
  const addHistory = useAppStateStore((state) => state.addHistory);
  const refreshHistory = useAppStateStore((state) => state.refreshHistory);
  const setHistory = useAppStateStore((state) => state.setHistory);
  const setHistoryLoadError = useAppStateStore((state) => state.setHistoryLoadError);
  const activeEnvironment = useAppStateStore((state) => state.activeEnvironment);
  const vsCodeRef = useRef<any>(null);

  // Initialize Collections and Environments
  useEffect(() => {
    if (typeof acquireVsCodeApi !== 'undefined' && !vsCodeRef.current) {
      vsCodeRef.current = acquireVsCodeApi();
      refreshEnvironments(vsCodeRef.current);
      refreshCollections(vsCodeRef.current);
      refreshHistory(vsCodeRef.current);
      if (vsCodeRef.current) {
        vsCodeRef.current.postMessage({ type: 'loadCookies' });
        vsCodeRef.current.postMessage({ type: 'loadAuths' });
      }
    }
  }, []);

  const handleRequestSelect = (request: ParsedRequest) => {
    setCurrentRequest(request);
    setSelectedEnvironment(null); // Clear environment selection when selecting a request
    setSelectedStore(null); // Clear store selection when selecting a request
  };

  const handleEnvironmentSelect = (environment: Environment) => {
    setSelectedEnvironment(environment);
    setSelectedStore(null); // Clear store selection when selecting an environment
  };

  const handleStoreSelect = (storeType: 'cookie' | 'auth') => {
    setSelectedStore(storeType);
    setSelectedEnvironment(null); // Clear environment selection when selecting a store
  };

  const handleBackFromEnvironment = () => {
    setSelectedEnvironment(null);
  };

  const handleBackFromStore = () => {
    setSelectedStore(null);
  };

  const handleSendRequest = () => {
    if (vsCodeRef.current) {
      addHistory(getCurrentRequest(), vsCodeRef.current);
      useAppStateStore.getState().setIsRequestProcessing(true);
      onSendRequest(vsCodeRef.current, activeEnvironment?.values);
    }
    else{
      console.error('VS Code API is not available.');
    }
  };

  const handleSaveRequest = (request: ParsedRequest, saveToCollectionName: string | undefined) => {
    const collectionRequest = transformToCollectionRequest(request);
    //if newCollectionName exists in collections, we are updating an existing collection s use filename & collection name from there
    const currentCollections = useAppStateStore.getState().collections;
    const existingCollection =  saveToCollectionName && currentCollections.find((collection) => collection.name === saveToCollectionName);
    if (existingCollection) {
      const duplicateRequest = existingCollection.requests.find((req) => req.name === request.name);
      if (duplicateRequest) {
        setErrorMessage(`Request with name "${request.name}" already exists in collection "${existingCollection.name}".`);
        return;
      }
    }

    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'saveRequestToCollection',
        data: {
          requestContent: JSON.stringify(collectionRequest, null, 2),
          requestName: request.name,
          collectionFileName: existingCollection ? existingCollection.filename : request.sourceRef.collectionFilename,
          folderPath: request.sourceRef.itemPath,
          newCollectionName: existingCollection ? undefined : saveToCollectionName,
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

  const handleSaveCookies = (cookies: Cookie[]) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'saveCookies',
        data: {
          cookies: JSON.stringify(cookies, null, 2)
        }
      });
    }
  };

  const handleSaveAuths = (auths: Auth[]) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'saveAuths',
        data: {
          auths: JSON.stringify(auths, null, 2)
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
    const currentCollections = useAppStateStore.getState().collections;
    const collection =  collectionName && currentCollections.find((collection) => collection.name === collectionName);
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
        useAppStateStore.getState().setIsRequestProcessing(false);
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
          // Get current collections from the store to avoid stale closure
          const currentCollections = useAppStateStore.getState().collections;
          const existingCollection = currentCollections.find((c) => c.name === collection.name);
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
      } else if (message.type === 'environmentUpdated') {
        try {
          updateEnvironment(message.environment.id, message.environment);
        } catch (error: any) {
          console.error('Error updating environment:', error);
        }
      } else if (message.type === 'cookiesLoaded') {
        setCookies(message.cookies);
      } else if (message.type === 'cookiesError') {
        console.error('Cookies error:', message.error);
      } else if (message.type === 'authsLoaded') {
        setAuths(message.auths);
      } else if (message.type === 'authsError') {
        console.error('Auths error:', message.error);
      } else if (message.type === 'historyLoaded') {
        setHistory(message.history);
      } else if (message.type === 'historyError') {
        setHistoryLoadError(message.error);
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
        gridTemplateColumns: (selectedEnvironment || selectedStore) ? '400px 1fr' : '400px 1fr',
        gridTemplateRows: (selectedEnvironment || selectedStore) ? '1fr' : '1fr 1fr',
        gridTemplateAreas: (selectedEnvironment || selectedStore)
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
          onStoreSelect={handleStoreSelect}
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
      ) : selectedStore ? (
        /* Store Grid - Full Height */
        <div style={{ gridArea: 'environment' }} className="overflow-hidden">
          {selectedStore === 'cookie' ? (
            <CookieStoreGrid onBack={handleBackFromStore} onSaveCookies={handleSaveCookies} />
          ) : (
            <AuthStoreGrid onBack={handleBackFromStore} onSaveAuths={handleSaveAuths} />
          )}
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
