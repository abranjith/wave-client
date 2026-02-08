/**
 * ArenaSettings Component
 *
 * Advanced settings panel for Arena configuration.
 * Provider, model, and API key selection now live in ArenaChatToolbar.
 * This panel handles session limits, streaming toggle, and other preferences.
 */

import React, { useState } from 'react';
import { Save, X } from 'lucide-react';
import { cn } from '../../utils/styling';
import type { ArenaSettings as ArenaSettingsType } from '../../types/arena';
import { DEFAULT_ARENA_SETTINGS } from '../../config/arenaConfig';

// ============================================================================
// Types
// ============================================================================

export interface ArenaSettingsProps {
  settings: ArenaSettingsType;
  onSave: (settings: ArenaSettingsType) => Promise<void>;
  onCancel: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ArenaSettings({
  settings,
  onSave,
  onCancel,
}: ArenaSettingsProps): React.ReactElement {
  const [formState, setFormState] = useState<ArenaSettingsType>(settings);
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = <K extends keyof ArenaSettingsType>(
    key: K,
    value: ArenaSettingsType[K],
  ) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(formState);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setFormState(DEFAULT_ARENA_SETTINGS);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Arena Settings
        </h2>
        <button
          onClick={onCancel}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Provider, model, and API key settings are managed in the chat toolbar.
        </p>

        {/* Streaming */}
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Streaming Responses
            </label>
            <p className="text-xs text-slate-500">
              Show AI responses as they're generated
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleChange('enableStreaming', !formState.enableStreaming)}
            className={cn(
              'relative w-11 h-6 rounded-full transition-colors',
              formState.enableStreaming ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform',
                formState.enableStreaming && 'translate-x-5'
              )}
            />
          </button>
        </div>

        <hr className="border-slate-200 dark:border-slate-700" />

        {/* Session Limits */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Max Sessions
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={formState.maxSessions}
            onChange={(e) => handleChange('maxSessions', parseInt(e.target.value) || 5)}
            className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            Maximum number of chat sessions to keep (1-20)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Max Messages per Session
          </label>
          <input
            type="number"
            min={5}
            max={50}
            value={formState.maxMessagesPerSession}
            onChange={(e) => handleChange('maxMessagesPerSession', parseInt(e.target.value) || 10)}
            className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            Maximum messages in each session (5-50)
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <button
          onClick={handleReset}
          className="px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          Reset to Defaults
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors"
          >
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ArenaSettings;
