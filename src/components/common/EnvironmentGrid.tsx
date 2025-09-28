import React, { useState } from 'react';
import { EyeIcon, EyeOffIcon, ArrowLeftIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Environment, EnvironmentVariable } from '../../types/collection';

interface EnvironmentGridProps {
  environment: Environment;
  onBack: () => void;
}

const EnvironmentGrid: React.FC<EnvironmentGridProps> = ({ environment, onBack }) => {
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

  const toggleSecretVisibility = (key: string) => {
    const newVisible = new Set(visibleSecrets);
    if (newVisible.has(key)) {
      newVisible.delete(key);
    } else {
      newVisible.add(key);
    }
    setVisibleSecrets(newVisible);
  };

  // Filter enabled variables
  const enabledVariables = environment.values.filter(variable => variable.enabled !== false);

  return (
    <div className="h-full bg-white dark:bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="text-slate-600 hover:text-slate-700 hover:border-slate-300"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
            {environment.name}
          </h1>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            ({enabledVariables.length} variables)
          </span>
        </div>
      </div>

      {/* Environment Variables Table */}
      <div className="flex-1 overflow-auto p-4">
        {enabledVariables.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-2">No enabled variables</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                This environment has no enabled variables to display.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-3/12">
                    Variable Name
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-6/12">
                    Value
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-1/12">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {enabledVariables.map((variable, index) => {
                  const isSecret = variable.type === 'secret';
                  const isVisible = visibleSecrets.has(variable.key);
                  
                  return (
                    <tr key={`${variable.key}-${index}`} className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-4">
                        <div className="font-mono text-sm text-slate-700 dark:text-slate-300 font-medium">
                          {variable.key}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-sm bg-gray-50 dark:bg-slate-800 p-2 rounded border min-h-[2.5rem] flex items-center">
                          <span className="text-slate-700 dark:text-slate-300 break-all">
                            {isSecret && !isVisible ? '••••••••••••••••' : variable.value}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {isSecret && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleSecretVisibility(variable.key)}
                            className="text-slate-600 hover:text-slate-700 hover:border-slate-300"
                            title={isVisible ? 'Hide value' : 'Show value'}
                          >
                            {isVisible ? (
                              <EyeOffIcon className="h-4 w-4" />
                            ) : (
                              <EyeIcon className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="border-t border-gray-200 dark:border-slate-700 p-4 bg-gray-50 dark:bg-slate-800">
        <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <span>Environment ID: {environment.id}</span>
          <span>{enabledVariables.length} of {environment.values.length} variables enabled</span>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentGrid;