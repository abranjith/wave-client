/**
 * EnvironmentsPane Component
 *
 * Sidebar pane for browsing and managing environment files.
 * Supports per-row actions: Rename (inline, uniqueness-validated) and
 * Delete (confirm-gated, adapter-backed).
 *
 * FEAT-005: Adds DropdownMenu with Rename and Delete actions to each row.
 * Rename: validates case-insensitive uniqueness, persists via saveEnvironment,
 *         then updates the store via updateEnvironment.
 * Delete: routes through useConfirmDialog; adapter deleteEnvironment is called
 *         only after explicit user confirmation; store is mutated on success only.
 */

import React, { useState, useCallback } from 'react';
import {
    CloudIcon,
    SettingsIcon,
    ImportIcon,
    DownloadIcon,
    PlusIcon,
    MoreVerticalIcon,
    PencilIcon,
    Trash2Icon,
} from 'lucide-react';
import { Environment } from '../../types/collection';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { useStorageAdapter, useNotificationAdapter } from '../../hooks/useAdapter';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import EnvImportWizard from './EnvImportWizard';
import EnvAddWizard from './EnvAddWizard';

interface EnvironmentsPaneProps {
  onEnvSelect: (environment: Environment) => void;
  onImportEnvironments: (fileName: string, fileContent: string) => void;
  onExportEnvironments: () => void;
  onRetry?: () => void;
}

interface EnvironmentsPaneHeaderProps {
  label: string;
  onAddClick: () => void;
  onImportClick: () => void;
  onExportClick: () => void;
}

const EnvironmentsPaneHeader: React.FC<EnvironmentsPaneHeaderProps> = ({ label, onAddClick, onImportClick, onExportClick }) => {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{label}</h2>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddClick}
              className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <PlusIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add Environment</TooltipContent>
        </Tooltip>
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

const EnvironmentsPane: React.FC<EnvironmentsPaneProps> = ({ onEnvSelect, onImportEnvironments, onExportEnvironments, onRetry }) => {
  const environments = useAppStateStore((state) => state.environments);
  const isLoading = useAppStateStore((state) => state.isEnvironmentsLoading);
  const error = useAppStateStore((state) => state.environmentLoadError);
  const addEnvironment = useAppStateStore((state) => state.addEnvironment);
  const updateEnvironment = useAppStateStore((state) => state.updateEnvironment);
  const removeEnvironment = useAppStateStore((state) => state.removeEnvironment);

  const storageAdapter = useStorageAdapter();
  const notification = useNotificationAdapter();
  const { openConfirmDialog, ConfirmDialogComponent } = useConfirmDialog();

  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);
  const [isAddWizardOpen, setIsAddWizardOpen] = useState(false);
  // Tracks which environment row is being renamed; null when no rename is active.
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null);
  // Holds the current text of the inline rename input.
  const [editingName, setEditingName] = useState('');

  const handleRenameInputFocus = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    const end = event.currentTarget.value.length;
    event.currentTarget.setSelectionRange(end, end);
  }, []);

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

  const handleAddEnvironment = (name: string): { success: boolean; error?: string } => {
    const result = addEnvironment({
      id: crypto.randomUUID(),
      name: name,
      values: []
    });

    if (result.isOk) {
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  };

  /** Opens the inline rename editor for the given environment row. */
  const handleRenameStart = useCallback((environment: Environment) => {
    setEditingEnvironmentId(environment.id);
    setEditingName(environment.name);
  }, []);

  /**
   * Commits an in-progress rename after Enter, blur, or any other commit trigger.
   *
   * Ordering:
   *  1. Trim + empty-guard (revert to original name if blank).
   *  2. No-op if name unchanged.
   *  3. Case-insensitive uniqueness check against all OTHER environments.
   *  4. storageAdapter.saveEnvironment → persist first.
   *  5. updateEnvironment → mutate store only after successful persistence.
   */
  const handleRenameEnd = useCallback(async () => {
    if (!editingEnvironmentId) return;

    const environment = environments.find(e => e.id === editingEnvironmentId);
    if (!environment) {
      setEditingEnvironmentId(null);
      return;
    }

    const trimmedName = editingName.trim() || environment.name;

    // No-op when name is unchanged.
    if (trimmedName === environment.name) {
      setEditingEnvironmentId(null);
      return;
    }

    // Case-insensitive uniqueness: reject if another environment shares the same name.
    const isDuplicate = environments.some(
      e => e.id !== editingEnvironmentId && e.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      notification.showNotification('error', `An environment named "${trimmedName}" already exists.`);
      setEditingEnvironmentId(null);
      return;
    }

    const updatedEnvironment: Environment = { ...environment, name: trimmedName };
    const result = await storageAdapter.saveEnvironment(updatedEnvironment);

    if (result.isOk) {
      updateEnvironment(environment.id, { name: trimmedName });
    } else {
      notification.showNotification('error', result.error);
    }

    setEditingEnvironmentId(null);
  }, [editingEnvironmentId, editingName, environments, storageAdapter, notification, updateEnvironment]);

  /**
   * Opens a confirmation dialog before deleting an environment.
   * The adapter is called only after the user explicitly confirms.
   * The store is mutated only after the adapter succeeds.
   */
  const handleDeleteEnvironment = useCallback((environment: Environment) => {
    openConfirmDialog({
      title: 'Delete Environment',
      message: `Are you sure you want to delete "${environment.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      onConfirm: async () => {
        const result = await storageAdapter.deleteEnvironment(environment.id);
        if (!result.isOk) {
          notification.showNotification('error', result.error);
          throw new Error(result.error);
        }
        removeEnvironment(environment.id);
        notification.showNotification('success', `Deleted "${environment.name}"`);
      },
    });
  }, [openConfirmDialog, storageAdapter, notification, removeEnvironment]);

  if (isLoading) {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-4">
          <EnvironmentsPaneHeader 
            label="Environments" 
            onAddClick={() => setIsAddWizardOpen(true)}
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
        <EnvAddWizard
          isOpen={isAddWizardOpen}
          onClose={() => setIsAddWizardOpen(false)}
          onAddEnvironment={handleAddEnvironment}
        />
        <ConfirmDialogComponent />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-4">
          <EnvironmentsPaneHeader 
            label="Environments" 
            onAddClick={() => setIsAddWizardOpen(true)}
            onImportClick={() => setIsImportWizardOpen(true)} 
            onExportClick={onExportEnvironments}
          />
        </div>
        <div className="flex items-center justify-center h-[calc(100%-5rem)] p-4">
          <div className="text-center">
            <div className="text-red-500 mb-2">⚠️</div>
            <p className="text-sm text-red-600 dark:text-red-400 mb-2">Error loading environments</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{error}</p>
            {onRetry && (
              <Button
                onClick={onRetry}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                Retry
              </Button>
            )}
          </div>
        </div>
        <EnvImportWizard
          isOpen={isImportWizardOpen}
          onClose={() => setIsImportWizardOpen(false)}
          onImportEnvironments={handleImport}
        />
        <EnvAddWizard
          isOpen={isAddWizardOpen}
          onClose={() => setIsAddWizardOpen(false)}
          onAddEnvironment={handleAddEnvironment}
        />
        <ConfirmDialogComponent />
      </div>
    );
  }
  
  if (environments.length === 0) {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-4">
          <EnvironmentsPaneHeader 
            label="Environments" 
            onAddClick={() => setIsAddWizardOpen(true)}
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
        <EnvAddWizard
          isOpen={isAddWizardOpen}
          onClose={() => setIsAddWizardOpen(false)}
          onAddEnvironment={handleAddEnvironment}
        />
        <ConfirmDialogComponent />
      </div>
    );
  }
  
  environments.sort((a, b) => {
    if (a.name.toLowerCase() === 'global') return -1;
    if (b.name.toLowerCase() === 'global') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
      <div className="h-full overflow-auto p-4">
        <EnvironmentsPaneHeader 
          label="Environments" 
          onAddClick={() => setIsAddWizardOpen(true)}
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
                // Guard row click: do not trigger selection while a rename is active.
                onClick={() => { if (!editingEnvironmentId) handleEnvironmentClick(environment); }}
              >
                {/* Environment Header */}
                <div className="flex items-center p-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg group transition-colors">
                  <div className="flex items-center flex-1 min-w-0">
                    <SettingsIcon className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                    {editingEnvironmentId === environment.id ? (
                      /* Inline rename input — replaces the name label when active */
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={handleRenameEnd}
                        onFocus={handleRenameInputFocus}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameEnd();
                          if (e.key === 'Escape') setEditingEnvironmentId(null);
                        }}
                        // Prevent the row click handler from firing when interacting
                        // with the input.
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 text-sm py-0 flex-1 border border-emerald-300/80 dark:border-emerald-500/70 bg-white dark:bg-slate-900 ring-2 ring-emerald-500/20 shadow-sm"
                        autoFocus
                      />
                    ) : (
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-words flex-1 min-w-0 truncate">
                        {environment.name}
                      </h3>
                    )}
                  </div>

                  {/* Variable count badge + per-row action menu */}
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <span className="text-xs text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      {enabledVariables.length}
                    </span>

                    {/* Three-dots dropdown — visible on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVerticalIcon className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRenameStart(environment);
                            }}
                          >
                            <PencilIcon className="h-4 w-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteEnvironment(environment);
                            }}
                          >
                            <Trash2Icon className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
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
      <EnvAddWizard
        isOpen={isAddWizardOpen}
        onClose={() => setIsAddWizardOpen(false)}
        onAddEnvironment={handleAddEnvironment}
      />
      <ConfirmDialogComponent />
    </div>
  );
};

export type { EnvironmentsPaneProps };
export default EnvironmentsPane;
