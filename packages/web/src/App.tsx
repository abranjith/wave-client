/**
 * Wave Client Web Application
 * 
 * Main entry point for the standalone web version.
 * Uses the web platform adapter with localStorage persistence.
 */

import { AdapterProvider } from '@wave-client/core';
import { createWebAdapter } from './adapters';

// Create the web adapter instance
const webAdapter = createWebAdapter();

/**
 * Placeholder main content component
 * TODO: Import actual Wave Client UI components from @wave-client/core
 */
function WaveClientUI() {
  return (
    <div className="min-h-screen bg-zinc-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">Wave Client</h1>
        <p className="text-zinc-400 mb-8">
          A modern REST client for API testing and development.
        </p>
        
        <div className="bg-zinc-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Getting Started</h2>
          <p className="text-zinc-300 mb-4">
            The web version of Wave Client is under development.
          </p>
          <p className="text-zinc-400 text-sm">
            Data is stored locally in your browser using localStorage.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-800 rounded-lg p-4">
            <h3 className="font-semibold mb-2">📁 Collections</h3>
            <p className="text-zinc-400 text-sm">
              Organize your API requests into collections.
            </p>
          </div>
          <div className="bg-zinc-800 rounded-lg p-4">
            <h3 className="font-semibold mb-2">🌍 Environments</h3>
            <p className="text-zinc-400 text-sm">
              Manage variables for different environments.
            </p>
          </div>
          <div className="bg-zinc-800 rounded-lg p-4">
            <h3 className="font-semibold mb-2">📜 History</h3>
            <p className="text-zinc-400 text-sm">
              View and replay past requests.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Main App component with adapter provider
 */
function App() {
  return (
    <AdapterProvider adapter={webAdapter}>
      <WaveClientUI />
    </AdapterProvider>
  );
}

export default App;
