import React, { useState, useEffect, useRef } from 'react';
import { EyeIcon, EyeOffIcon, ArrowLeftIcon, CheckCircleIcon, XCircleIcon, PencilIcon, SaveIcon, XIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Environment, EnvironmentVariable } from '../../types/collection';
import useAppStateStore from '../../hooks/store/useAppStateStore';

interface EnvironmentGridProps {
  environment: Environment;
  onBack: () => void;
  onSaveEnvironment: (request: Environment) => void;
}

interface EditingVariable {
  originalKey: string | null; // null for new variables
  key: string;
  value: string;
  notes: string;
}

const EnvironmentGrid: React.FC<EnvironmentGridProps> = ({ environment, onBack, onSaveEnvironment }) => {
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<EditingVariable | null>(null);
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const updateEnvironment = useAppStateStore((state) => state.updateEnvironment);
  const environments = useAppStateStore((state) => state.environments);
  
  // Get the latest environment data from the store instead of relying on the prop
  const currentEnvironment = environments.find(env => env.id === environment.id) || environment;
  
  // Track if this is the initial mount to avoid calling onSaveEnvironment on first render
  const isInitialMount = useRef(true);
  // Use a ref to track the last saved environment to avoid unnecessary saves
  const lastSavedEnvironment = useRef<Environment | null>(null);
  
  // Call onSaveEnvironment whenever currentEnvironment changes (except on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      lastSavedEnvironment.current = currentEnvironment;
      return;
    }
    
    // Only save if the environment actually changed
    if (JSON.stringify(lastSavedEnvironment.current) !== JSON.stringify(currentEnvironment)) {
      lastSavedEnvironment.current = currentEnvironment;
      onSaveEnvironment(currentEnvironment);
    }
  }, [currentEnvironment]);

  const toggleSecretVisibility = (key: string) => {
    const newVisible = new Set(visibleSecrets);
    if (newVisible.has(key)) {
      newVisible.delete(key);
    } else {
      newVisible.add(key);
    }
    setVisibleSecrets(newVisible);
  };

  const toggleVariableEnabled = (key: string, currentEnabled: boolean) => {
    const updatedValues = currentEnvironment.values.map((variable) =>
      variable.key === key ? { ...variable, enabled: !currentEnabled } : variable
    );
    updateEnvironment(currentEnvironment.id, { values: updatedValues });
  };

  const deleteVariable = (key: string) => {
    const updatedValues = currentEnvironment.values.filter((variable) => variable.key !== key);
    updateEnvironment(currentEnvironment.id, { values: updatedValues });
    
    // Remove from visibleSecrets if it was there
    if (visibleSecrets.has(key)) {
      const newVisible = new Set(visibleSecrets);
      newVisible.delete(key);
      setVisibleSecrets(newVisible);
    }
  };

  const startEditing = (variable: EnvironmentVariable) => {
    setEditingRow(variable.key);
    setEditingData({
      originalKey: variable.key,
      key: variable.key,
      value: variable.value,
      notes: variable.notes || ''
    });
    setKeyError(null);
  };

  const startAddingNew = () => {
    setIsAddingNew(true);
    setEditingRow('__new__');
    setEditingData({
      originalKey: null,
      key: '',
      value: '',
      notes: ''
    });
    setKeyError(null);
  };

  const cancelEditing = () => {
    setEditingRow(null);
    setEditingData(null);
    setIsAddingNew(false);
    setKeyError(null);
  };

  const saveEditing = () => {
    if (!editingData?.key.trim()) {
      setKeyError('Variable name is required');
      return;
    }

    // Check if key already exists (for new variables or renamed variables)
    const keyExists = currentEnvironment.values.some(
      (variable) => 
        variable.key === editingData.key && 
        variable.key !== editingData.originalKey
    );

    if (keyExists) {
      setKeyError('Variable name already exists');
      return;
    }

    if (isAddingNew) {
      // Add new variable
      const newVariable: EnvironmentVariable = {
        key: editingData.key,
        value: editingData.value,
        type: 'default',
        notes: editingData.notes || undefined,
        enabled: true
      };
      
      const updatedValues = [...currentEnvironment.values, newVariable];
      updateEnvironment(currentEnvironment.id, { values: updatedValues });
    } else {
      // Update existing variable
      const updatedValues = currentEnvironment.values.map((variable) =>
        variable.key === editingData.originalKey
          ? {
              ...variable,
              key: editingData.key,
              value: editingData.value,
              notes: editingData.notes || undefined
            }
          : variable
      );
      
      updateEnvironment(currentEnvironment.id, { values: updatedValues });
      
      // If the key changed, update the visibleSecrets set
      if (editingData.originalKey && editingData.originalKey !== editingData.key && visibleSecrets.has(editingData.originalKey)) {
        const newVisible = new Set(visibleSecrets);
        newVisible.delete(editingData.originalKey);
        newVisible.add(editingData.key);
        setVisibleSecrets(newVisible);
      }
    }
    
    setEditingRow(null);
    setEditingData(null);
    setIsAddingNew(false);
    setKeyError(null);
  };

  // Display all variables, not just enabled ones
  const allVariables = currentEnvironment.values;
  const enabledCount = allVariables.filter(v => v.enabled !== false).length;

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
            {currentEnvironment.name}
          </h1>
        </div>
      </div>

      {/* Environment Variables Table */}
      <div className="flex-1 overflow-auto p-4">
        {allVariables.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-2">No variables</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                This environment has no variables to display.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-2/12">
                    Variable Name
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-3/12">
                    Value
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-4/12">
                    Notes
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-3/12">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {allVariables.map((variable, index) => {
                  const isSecret = variable.type === 'secret';
                  const isVisible = visibleSecrets.has(variable.key);
                  const isEnabled = variable.enabled !== false;
                  const isEditing = editingRow === variable.key;
                  
                  if (isEditing && editingData) {
                    return (
                      <tr 
                        key={`${variable.key}-${index}`} 
                        className="border-b border-gray-100 dark:border-slate-800 bg-blue-50 dark:bg-blue-900/20"
                      >
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            <Input
                              type="text"
                              value={editingData.key}
                              onChange={(e) => {
                                setEditingData({ ...editingData, key: e.target.value });
                                if (keyError) setKeyError(null);
                              }}
                              className={`font-mono text-sm text-slate-800 dark:text-slate-200 ${
                                keyError ? 'border-red-500 focus:border-red-500' : ''
                              }`}
                              placeholder="Variable name"
                            />
                            {keyError && (
                              <p className="text-xs text-red-600 dark:text-red-400">{keyError}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Input
                            type="text"
                            value={editingData.value}
                            onChange={(e) => setEditingData({ ...editingData, value: e.target.value })}
                            className="font-mono text-sm text-slate-800 dark:text-slate-200"
                            placeholder="Value"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <Textarea
                            value={editingData.notes}
                            onChange={(e) => setEditingData({ ...editingData, notes: e.target.value })}
                            className="text-sm min-h-[2.5rem] resize-none text-slate-800 dark:text-slate-200"
                            placeholder="Notes (optional)"
                            rows={1}
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={saveEditing}
                              className="text-green-600 hover:text-green-700 hover:border-green-300"
                              title="Save changes"
                            >
                              <SaveIcon className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={cancelEditing}
                              className="text-red-600 hover:text-red-700 hover:border-red-300"
                              title="Cancel editing"
                            >
                              <XIcon className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  
                  return (
                    <tr 
                      key={`${variable.key}-${index}`} 
                      className={`border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 ${
                        !isEnabled ? 'opacity-40' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className={`font-mono text-sm font-medium ${
                          isEnabled 
                            ? 'text-slate-700 dark:text-slate-300' 
                            : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {variable.key}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className={`font-mono text-sm bg-gray-50 dark:bg-slate-800 p-2 rounded border min-h-[2.5rem] flex items-center ${
                          !isEnabled ? 'border-gray-200 dark:border-slate-700' : ''
                        }`}>
                          <span className={`break-all ${
                            isEnabled 
                              ? 'text-slate-700 dark:text-slate-300' 
                              : 'text-slate-500 dark:text-slate-400'
                          }`}>
                            {isSecret && !isVisible ? '••••••••••••••••' : variable.value}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className={`text-sm ${
                          isEnabled 
                            ? 'text-slate-600 dark:text-slate-400' 
                            : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {variable.notes || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEditing(variable)}
                            className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
                            title="Edit variable"
                            disabled={editingRow !== null}
                          >
                            <PencilIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleVariableEnabled(variable.key, isEnabled)}
                            className={`${
                              isEnabled
                                ? 'text-green-600 hover:text-green-700 hover:border-green-300'
                                : 'text-slate-400 hover:text-slate-600 hover:border-slate-300'
                            }`}
                            title={isEnabled ? 'Disable variable' : 'Enable variable'}
                            disabled={editingRow !== null}
                          >
                            {isEnabled ? (
                              <CheckCircleIcon className="h-4 w-4" />
                            ) : (
                              <XCircleIcon className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteVariable(variable.key)}
                            className="text-red-600 hover:text-red-700 hover:border-red-300"
                            title="Delete variable"
                            disabled={editingRow !== null}
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </Button>
                          {isSecret && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleSecretVisibility(variable.key)}
                              className="text-slate-600 hover:text-slate-700 hover:border-slate-300"
                              title={isVisible ? 'Hide value' : 'Show value'}
                              disabled={!isEnabled || editingRow !== null}
                            >
                              {isVisible ? (
                                <EyeOffIcon className="h-4 w-4" />
                              ) : (
                                <EyeIcon className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                
                {/* New Variable Row */}
                {isAddingNew && editingData && (
                  <tr className="border-b border-gray-100 dark:border-slate-800 bg-blue-50 dark:bg-blue-900/20">
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        <Input
                          type="text"
                          value={editingData.key}
                          onChange={(e) => {
                            setEditingData({ ...editingData, key: e.target.value });
                            if (keyError) setKeyError(null);
                          }}
                          className={`font-mono text-sm text-slate-800 dark:text-slate-200 ${
                            keyError ? 'border-red-500 focus:border-red-500' : ''
                          }`}
                          placeholder="Variable name"
                          autoFocus
                        />
                        {keyError && (
                          <p className="text-xs text-red-600 dark:text-red-400">{keyError}</p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Input
                        type="text"
                        value={editingData.value}
                        onChange={(e) => setEditingData({ ...editingData, value: e.target.value })}
                        className="font-mono text-sm text-slate-800 dark:text-slate-200"
                        placeholder="Value"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <Textarea
                        value={editingData.notes}
                        onChange={(e) => setEditingData({ ...editingData, notes: e.target.value })}
                        className="text-sm min-h-[2.5rem] resize-none text-slate-800 dark:text-slate-200"
                        placeholder="Notes (optional)"
                        rows={1}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={saveEditing}
                          className="text-green-600 hover:text-green-700 hover:border-green-300"
                          title="Save changes"
                        >
                          <SaveIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={cancelEditing}
                          className="text-red-600 hover:text-red-700 hover:border-red-300"
                          title="Cancel editing"
                        >
                          <XIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Add Variable Button - Beneath the data grid */}
        {allVariables.length > 0 && (
          <div className="flex justify-start pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={startAddingNew}
              disabled={editingRow !== null}
              className="text-blue-600 hover:text-blue-700 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Variable
            </Button>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="border-t border-gray-200 dark:border-slate-700 p-4 bg-gray-50 dark:bg-slate-800">
        <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <span>Environment ID: {currentEnvironment.id}</span>
          <span>{enabledCount} of {allVariables.length} variables enabled</span>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentGrid;