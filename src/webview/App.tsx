import React from 'react';
import ConfigPanel from './ConfigPanel';
import RequestPanel from './RequestPanel';
import ResponsePanel from './ResponsePanel';

const App: React.FC = () => {
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
        <RequestPanel />
      </div>

      {/* Bottom-right ResponsePanel */}
      <div style={{ gridArea: 'response' }}>
        <ResponsePanel />
      </div>
    </div>
  );
};

export default App;
