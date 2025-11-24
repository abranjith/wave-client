import React from 'react';
import { CookieIcon, KeyRoundIcon, NetworkIcon, ShieldCheckIcon } from 'lucide-react';

interface StorePaneProps {
  onStoreSelect: (storeType: 'cookie' | 'auth' | 'proxy' | 'cert') => void;
}

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

const StorePane: React.FC<StorePaneProps> = ({ onStoreSelect }) => {
  const handleStoreClick = (storeType: 'cookie' | 'auth' | 'proxy' | 'cert') => {
    if (onStoreSelect) {
      onStoreSelect(storeType);
    }
  };

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
            </div>
          </div>

          {/* Proxy Store Option */}
          <div 
            className="border border-slate-200 dark:border-slate-700 rounded-lg hover:shadow-sm transition-shadow cursor-pointer"
            onClick={() => handleStoreClick('proxy')}
          >
            <div className="flex items-center p-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg group transition-colors">
              <div className="flex items-center flex-1">
                <NetworkIcon className="h-4 w-4 text-purple-600 mr-2 flex-shrink-0" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-words">
                  Proxy Store
                </h3>
              </div>
            </div>
          </div>

          {/* Certificate Store Option */}
          <div 
            className="border border-slate-200 dark:border-slate-700 rounded-lg hover:shadow-sm transition-shadow cursor-pointer"
            onClick={() => handleStoreClick('cert')}
          >
            <div className="flex items-center p-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg group transition-colors">
              <div className="flex items-center flex-1">
                <ShieldCheckIcon className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-words">
                  Certificate Store
                </h3>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export type { StorePaneProps as CredsPaneProps };
export default StorePane;
