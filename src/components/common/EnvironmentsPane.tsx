import React, { useState } from 'react';
import { ChevronRightIcon, ChevronDownIcon, CloudIcon, SettingsIcon } from 'lucide-react';
import { Environment } from '../../types/collection';
import KeyValueList from './KeyValueList';

interface EnvironmentsPaneProps {
  environments: Environment[];
  isLoading?: boolean;
  error?: string;
}

const EnvironmentsPane: React.FC<EnvironmentsPaneProps> = ({ 
  environments, 
  isLoading = false,
  error 
}) => {
  const [selectedEnvironment, setSelectedEnvironment] = useState<string | null>(null);

  const toggleEnvironment = (environmentId: string) => {
    setSelectedEnvironment(selectedEnvironment === environmentId ? null : environmentId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-sm text-slate-600 dark:text-slate-400">Loading environments...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <div className="text-red-500 mb-2">⚠️</div>
          <p className="text-sm text-red-600 dark:text-red-400 mb-2">Error loading environments</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      </div>
    );
  }
  
  if (environments.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <CloudIcon className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">No environments found</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Add environment files to ~/.waveclient/environments
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full overflow-auto bg-white dark:bg-slate-900">
      <div className="p-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Environments</h2>
        
        <div className="space-y-2">
          {environments.map(environment => {
            const isSelected = selectedEnvironment === environment.id;
            const enabledVariables = environment.values.filter(v => v.enabled !== false);
            
            return (
              <div key={environment.id} className="border border-slate-200 dark:border-slate-700 rounded-lg">
                {/* Environment Header */}
                <div 
                  className="flex items-center p-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer rounded-t-lg group transition-colors"
                  onClick={() => toggleEnvironment(environment.id)}
                >
                  <div className="flex items-center flex-1">
                    {isSelected ? (
                      <ChevronDownIcon className="h-5 w-5 text-slate-500 mr-2 flex-shrink-0" />
                    ) : (
                      <ChevronRightIcon className="h-5 w-5 text-slate-500 mr-2 flex-shrink-0" />
                    )}
                    <SettingsIcon className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-words">
                      {environment.name}
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-full ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {enabledVariables.length}
                  </span>
                </div>
                
                {/* Environment Variables */}
                {isSelected && (
                  <div className="bg-white dark:bg-slate-900 rounded-b-lg">
                    <KeyValueList 
                      items={environment.values.map(v => ({
                        key: v.key,
                        value: v.value,
                        type: v.type,
                        enabled: v.enabled
                      }))}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default EnvironmentsPane;