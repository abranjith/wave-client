import React from 'react';
import { CloudIcon, SettingsIcon } from 'lucide-react';
import { Environment } from '../../types/collection';
import useAppStateStore from '../../hooks/store/useAppStateStore';

interface EnvironmentsPaneProps {
  onEnvSelect?: (environment: Environment) => void;
}

const EnvironmentsPane: React.FC<EnvironmentsPaneProps> = ({ onEnvSelect }) => {
  const environments = useAppStateStore((state) => state.environments);
  const isLoading = useAppStateStore((state) => state.isEnvironmentsLoading);
  const error = useAppStateStore((state) => state.environmentLoadError);

  const handleEnvironmentClick = (environment: Environment) => {
    if (onEnvSelect) {
      onEnvSelect(environment);
    }
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
    <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
      <div className="h-full overflow-auto p-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Environments</h2>
        
        <div className="space-y-2">
          {environments.map(environment => {
            const enabledVariables = environment.values.filter(v => v.enabled !== false);
            
            return (
              <div 
                key={environment.id} 
                className="border border-slate-200 dark:border-slate-700 rounded-lg hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => handleEnvironmentClick(environment)}
              >
                {/* Environment Header */}
                <div className="flex items-center p-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg group transition-colors">
                  <div className="flex items-center flex-1">
                    <SettingsIcon className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-words">
                      {environment.name}
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-full ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {enabledVariables.length}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export type { EnvironmentsPaneProps };
export default EnvironmentsPane;