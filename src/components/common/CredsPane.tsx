import React, { useState } from 'react';
import { CookieIcon, KeyRoundIcon, ShieldIcon } from 'lucide-react';
import CookieStoreGrid from './CookieStoreGrid';
import AuthStoreGrid from './AuthStoreGrid';

interface CredsPaneProps {}

interface CredsPaneHeaderProps {
  label: string;
}

const CredsPaneHeader: React.FC<CredsPaneHeaderProps> = ({ label }) => {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{label}</h2>
    </div>
  );
};

type StoreType = 'cookie' | 'auth' | null;

const CredsPane: React.FC<CredsPaneProps> = () => {
  const [selectedStore, setSelectedStore] = useState<StoreType>(null);

  const handleStoreClick = (storeType: StoreType) => {
    setSelectedStore(storeType);
  };

  const handleBackClick = () => {
    setSelectedStore(null);
  };

  // If a store is selected, show its grid
  if (selectedStore === 'cookie') {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={handleBackClick}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              ← Back
            </button>
          </div>
          <CredsPaneHeader label="Cookie Store" />
        </div>
        <CookieStoreGrid />
      </div>
    );
  }

  if (selectedStore === 'auth') {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={handleBackClick}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              ← Back
            </button>
          </div>
          <CredsPaneHeader label="Auth Store" />
        </div>
        <AuthStoreGrid />
      </div>
    );
  }

  // Default view: show store options
  return (
    <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
      <div className="h-full overflow-auto p-4">
        <CredsPaneHeader label="Credential Store" />
        
        <div className="space-y-2">
          {/* Cookie Store Option */}
          <div 
            className="border border-slate-200 dark:border-slate-700 rounded-lg hover:shadow-sm transition-shadow cursor-pointer"
            onClick={() => handleStoreClick('cookie')}
          >
            <div className="flex items-center p-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg group transition-colors">
              <div className="flex items-center flex-1">
                <CookieIcon className="h-4 w-4 text-orange-600 mr-2 flex-shrink-0" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-words">
                  Cookie Store
                </h3>
              </div>
              <span className="text-xs text-slate-400 ml-2">→</span>
            </div>
          </div>

          {/* Auth Store Option */}
          <div 
            className="border border-slate-200 dark:border-slate-700 rounded-lg hover:shadow-sm transition-shadow cursor-pointer"
            onClick={() => handleStoreClick('auth')}
          >
            <div className="flex items-center p-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg group transition-colors">
              <div className="flex items-center flex-1">
                <KeyRoundIcon className="h-4 w-4 text-blue-600 mr-2 flex-shrink-0" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-words">
                  Auth Store
                </h3>
              </div>
              <span className="text-xs text-slate-400 ml-2">→</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export type { CredsPaneProps };
export default CredsPane;
