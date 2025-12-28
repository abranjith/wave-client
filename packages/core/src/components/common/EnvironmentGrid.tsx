import React, { useState, useEffect, useRef } from 'react';
import { EyeIcon, EyeOffIcon, ArrowLeftIcon, PencilIcon, SaveIcon, XIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '../ui/button';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Switch } from '../ui/switch';
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
  // Track the current environment ID to detect when it changes
  const currentEnvironmentId = useRef<string>(environment.id);
  
  // Reset isInitialMount when the environment changes (user selects a different environment)
  useEffect(() => {
    if (currentEnvironmentId.current !== environment.id) {
      isInitialMount.current = true;
      currentEnvironmentId.current = environment.id;
    }
  }, [environment.id]);
  
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
        {allVariables.length === 0 && !isAddingNew && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-2">No variables</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                This environment has no variables to display.
              </p>
              <SecondaryButton
                size="sm"
                onClick={startAddingNew}
                colorTheme="main"
                icon={<PlusIcon />}
                text="Add Variable"
              />
            </div>
          </div>
        )}
        {(allVariables.length > 0 || isAddingNew) && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[8%]">Enabled</TableHead>
                  <TableHead className="w-[20%]">Variable Name</TableHead>
                  <TableHead className="w-[30%]">Value</TableHead>
                  <TableHead className="w-[27%]">Notes</TableHead>
                  <TableHead className="w-[15%]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allVariables.map((variable, index) => {
                  const isSecret = variable.type === 'secret';
                  const isVisible = visibleSecrets.has(variable.key);
                  const isEnabled = variable.enabled !== false;
                  const isEditing = editingRow === variable.key;
                  
                  if (isEditing && editingData) {
                    return (
                      <TableRow 
                        key={`${variable.key}-${index}`} 
                        className="bg-blue-50 dark:bg-blue-900/20"
                      >
                        <TableCell></TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            value={editingData.value}
                            onChange={(e) => setEditingData({ ...editingData, value: e.target.value })}
                            className="font-mono text-sm text-slate-800 dark:text-slate-200"
                            placeholder="Value"
                          />
                        </TableCell>
                        <TableCell>
                          <Textarea
                            value={editingData.notes}
                            onChange={(e) => setEditingData({ ...editingData, notes: e.target.value })}
                            className="text-sm min-h-[2.5rem] resize-none text-slate-800 dark:text-slate-200"
                            placeholder="Notes (optional)"
                            rows={1}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <SecondaryButton
                              size="sm"
                              onClick={saveEditing}
                              colorTheme="success"
                              icon={<SaveIcon />}
                              tooltip="Save changes"
                            />
                            <SecondaryButton
                              size="sm"
                              onClick={cancelEditing}
                              colorTheme="error"
                              icon={<XIcon />}
                              tooltip="Cancel editing"
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  
                  return (
                    <TableRow 
                      key={`${variable.key}-${index}`}
                    >
                      <TableCell>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={() => toggleVariableEnabled(variable.key, isEnabled)}
                          disabled={editingRow !== null}
                        />
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div className={`font-mono text-sm font-medium ${
                          isEnabled 
                            ? 'text-slate-700 dark:text-slate-300' 
                            : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {variable.key}
                        </div>
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
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
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div className={`text-sm ${
                          isEnabled 
                            ? 'text-slate-600 dark:text-slate-400' 
                            : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {variable.notes || '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <SecondaryButton
                            size="sm"
                            onClick={() => startEditing(variable)}
                            colorTheme="main"
                            icon={<PencilIcon />}
                            tooltip="Edit variable"
                            disabled={editingRow !== null}
                          />
                          <SecondaryButton
                            size="sm"
                            onClick={() => deleteVariable(variable.key)}
                            colorTheme="error"
                            icon={<Trash2Icon />}
                            tooltip="Delete variable"
                            disabled={editingRow !== null}
                          />
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
                      </TableCell>
                    </TableRow>
                  );
                })}
                
                {/* New Variable Row */}
                {isAddingNew && editingData && (
                  <TableRow className="bg-blue-50 dark:bg-blue-900/20">
                    <TableCell></TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={editingData.value}
                        onChange={(e) => setEditingData({ ...editingData, value: e.target.value })}
                        className="font-mono text-sm text-slate-800 dark:text-slate-200"
                        placeholder="Value"
                      />
                    </TableCell>
                    <TableCell>
                      <Textarea
                        value={editingData.notes}
                        onChange={(e) => setEditingData({ ...editingData, notes: e.target.value })}
                        className="text-sm min-h-[2.5rem] resize-none text-slate-800 dark:text-slate-200"
                        placeholder="Notes (optional)"
                        rows={1}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <SecondaryButton
                          size="sm"
                          onClick={saveEditing}
                          colorTheme="success"
                          icon={<SaveIcon />}
                          tooltip="Save changes"
                        />
                        <SecondaryButton
                          size="sm"
                          onClick={cancelEditing}
                          colorTheme="error"
                          icon={<XIcon />}
                          tooltip="Cancel editing"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
        
        {/* Add Variable Button - Only shown when there are existing variables */}
        {allVariables.length > 0 && (
          <div className="flex justify-start pt-3">
            <SecondaryButton
              size="sm"
              onClick={startAddingNew}
              disabled={editingRow !== null}
              colorTheme="main"
              icon={<PlusIcon />}
              text="Add Variable"
            />
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
