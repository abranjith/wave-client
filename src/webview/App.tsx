import React, { useState, useEffect, useRef } from 'react';
import ConfigPanel from './ConfigPanel';
import RequestPanel from './RequestPanel';
import ResponsePanel, { ResponseData } from './ResponsePanel';
import CollectionsPane from '../components/common/CollectionsPane';
import { ParsedCollection, ParsedRequest, Collection } from '../types/collection';
import { parseCollection } from '../utils/collectionParser';

const App: React.FC = () => {
  const [responseData, setResponseData] = useState<ResponseData | undefined>(undefined);
  const [collections, setCollections] = useState<ParsedCollection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionsError, setCollectionsError] = useState<string | undefined>();
  const [selectedRequest, setSelectedRequest] = useState<ParsedRequest | undefined>();
  const vsCodeRef = useRef<any>(null);

  // Initialize VS Code API once
  useEffect(() => {
    if (typeof acquireVsCodeApi !== 'undefined' && !vsCodeRef.current) {
      vsCodeRef.current = acquireVsCodeApi();
      
      // Load collections on startup
      vsCodeRef.current.postMessage({ type: 'loadCollections' });
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
          "collections request"
          "collections response"
        `,
        height: '100vh',
      }}
    >
      {/* Left Collections Panel */}
      <div style={{ gridArea: 'collections' }}>
        <CollectionsPane 
          collections={collections}
          onRequestSelect={handleRequestSelect}
          isLoading={collectionsLoading}
          error={collectionsError}
        />
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
