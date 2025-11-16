import React, { useState } from 'react';
import { CloudIcon, SettingsIcon, ImportIcon, DownloadIcon } from 'lucide-react';
import { Environment } from '../../types/collection';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { Button } from '../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import EnvImportWizard from './EnvImportWizard';

interface EnvironmentsPaneProps {
  onEnvSelect: (environment: Environment) => void;
  onImportEnvironments: (fileName: string, fileContent: string) => void;
  onExportEnvironments: () => void;
}

interface EnvironmentsPaneHeaderProps {
  label: string;
  onImportClick: () => void;
  onExportClick: () => void;
}

const EnvironmentsPaneHeader: React.FC<EnvironmentsPaneHeaderProps> = ({ label, onImportClick, onExportClick }) => {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{label}</h2>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onImportClick}
              className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <ImportIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Import Environments</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onExportClick}
              className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <DownloadIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export Environments</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};

const EnvironmentsPane: React.FC<EnvironmentsPaneProps> = ({ onEnvSelect, onImportEnvironments, onExportEnvironments }) => {
  const environments = useAppStateStore((state) => state.environments);
  const isLoading = useAppStateStore((state) => state.isEnvironmentsLoading);
  const error = useAppStateStore((state) => state.environmentLoadError);
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);

  const handleEnvironmentClick = (environment: Environment) => {
    if (onEnvSelect) {
      onEnvSelect(environment);
    }
  };

  const handleImport = (fileName: string, fileContent: string) => {
    if (onImportEnvironments) {
      onImportEnvironments(fileName, fileContent);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-4">
          <EnvironmentsPaneHeader 
            label="Environments" 
            onImportClick={() => setIsImportWizardOpen(true)} 
            onExportClick={onExportEnvironments}
          />
        </div>
        <div className="flex items-center justify-center h-[calc(100%-5rem)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Loading environments...</p>
          </div>
        </div>
        <EnvImportWizard
          isOpen={isImportWizardOpen}
          onClose={() => setIsImportWizardOpen(false)}
          onImportEnvironments={handleImport}
        />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-4">
          <EnvironmentsPaneHeader 
            label="Environments" 
            onImportClick={() => setIsImportWizardOpen(true)} 
            onExportClick={onExportEnvironments}
          />
        </div>
        <div className="flex items-center justify-center h-[calc(100%-5rem)] p-4">
          <div className="text-center">
            <div className="text-red-500 mb-2">⚠️</div>
            <p className="text-sm text-red-600 dark:text-red-400 mb-2">Error loading environments</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{error}</p>
          </div>
        </div>
        <EnvImportWizard
          isOpen={isImportWizardOpen}
          onClose={() => setIsImportWizardOpen(false)}
          onImportEnvironments={handleImport}
        />
      </div>
    );
  }
  
  if (environments.length === 0) {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-4">
          <EnvironmentsPaneHeader 
            label="Environments" 
            onImportClick={() => setIsImportWizardOpen(true)} 
            onExportClick={onExportEnvironments}
          />
        </div>
        <div className="flex items-center justify-center h-[calc(100%-5rem)] p-4">
          <div className="text-center">
            <CloudIcon className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">No environments found</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Add environment files to ~/.waveclient/environments
            </p>
          </div>
        </div>
        <EnvImportWizard
          isOpen={isImportWizardOpen}
          onClose={() => setIsImportWizardOpen(false)}
          onImportEnvironments={handleImport}
        />
      </div>
    );
  }
  
  return (
    <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
      <div className="h-full overflow-auto p-4">
        <EnvironmentsPaneHeader 
          label="Environments" 
          onImportClick={() => setIsImportWizardOpen(true)} 
          onExportClick={onExportEnvironments}
        />
        
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
      <EnvImportWizard
        isOpen={isImportWizardOpen}
        onClose={() => setIsImportWizardOpen(false)}
        onImportEnvironments={handleImport}
      />
    </div>
  );
};

export type { EnvironmentsPaneProps };
export default EnvironmentsPane;
