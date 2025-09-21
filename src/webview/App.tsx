import React, { useState, useEffect, useRef } from 'react';
import ConfigPanel from './ConfigPanel';
import RequestPanel from './RequestPanel';
import ResponsePanel, { ResponseData } from './ResponsePanel';

const App: React.FC = () => {
  const [responseData, setResponseData] = useState<ResponseData | undefined>(undefined);
  const vsCodeRef = useRef<any>(null);

  // Initialize VS Code API once
  useEffect(() => {
    if (typeof acquireVsCodeApi !== 'undefined' && !vsCodeRef.current) {
      vsCodeRef.current = acquireVsCodeApi();
    }
  }, []);

  const handleSendRequest = (request: { method: string; url: string }) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({ type: 'httpRequest', request });
    }
  };

  useEffect(() => {
    // Listen for messages from the VS Code extension
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'httpResponse') {
        setResponseData(message.response);
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
        gridTemplateColumns: '250px 1fr',
        gridTemplateRows: '1fr 1fr',
        gridTemplateAreas: `
          "config request"
          "config response"
        `,
        height: '100vh',
      }}
    >
      {/* Left ConfigPanel */}
      <div style={{ gridArea: 'config' }}>
        <ConfigPanel />
      </div>

      {/* Top-right RequestPanel */}
      <div style={{ gridArea: 'request' }}>
        <RequestPanel onSendRequest={handleSendRequest} />
      </div>

      {/* Bottom-right ResponsePanel */}
      <div style={{ gridArea: 'response' }}>
        <ResponsePanel response={responseData} />
      </div>
    </div>
  );
};

export default App;
