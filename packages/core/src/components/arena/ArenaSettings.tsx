/**
 * ArenaSettings Component
 * 
 * Settings panel for Arena configuration.
 */

import React, { useState } from 'react';
import { Save, X, Key, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '../../utils/styling';
import type { ArenaSettings as ArenaSettingsType, ArenaProviderType } from '../../types/arena';
import { DEFAULT_ARENA_SETTINGS } from '../../types/arena';

// ============================================================================
// Types
// ============================================================================

export interface ArenaSettingsProps {
  settings: ArenaSettingsType;
  onSave: (settings: ArenaSettingsType) => Promise<void>;
  onCancel: () => void;
}

const PROVIDERS: { value: ArenaProviderType; label: string; available: boolean }[] = [
  { value: 'gemini', label: 'Google Gemini', available: true },
  { value: 'openai', label: 'OpenAI', available: false },
  { value: 'anthropic', label: 'Anthropic Claude', available: false },
  { value: 'ollama', label: 'Ollama (Local)', available: true },
  { value: 'copilot', label: 'GitHub Copilot', available: false },
];

const GEMINI_MODELS = [
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Recommended)' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
];

const OLLAMA_MODELS = [
  { value: 'llama2', label: 'Llama 2' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'neural-chat', label: 'Neural Chat' },
  { value: 'dolphin-mixtral', label: 'Dolphin Mixtral' },
  { value: 'openchat', label: 'OpenChat' },
  { value: 'wizardlm2', label: 'WizardLM 2' },
];

// ============================================================================
// Component
// ============================================================================

export function ArenaSettings({
  settings,
  onSave,
  onCancel,
}: ArenaSettingsProps): React.ReactElement {
  const [formState, setFormState] = useState<ArenaSettingsType>(settings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<'untested' | 'valid' | 'invalid'>('untested');

  const handleChange = <K extends keyof ArenaSettingsType>(
    key: K,
    value: ArenaSettingsType[K]
  ) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
    if (key === 'apiKey') {
      setApiKeyStatus('untested');
    }
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
    setApiKeyStatus('untested');
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
        {/* Provider Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            AI Provider
          </label>
          <select
            value={formState.provider}
            onChange={(e) => handleChange('provider', e.target.value as ArenaProviderType)}
            className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PROVIDERS.map((provider) => (
              <option
                key={provider.value}
                value={provider.value}
                disabled={!provider.available}
              >
                {provider.label} {!provider.available && '(Coming Soon)'}
              </option>
            ))}
          </select>
        </div>

        {/* API Key */}
        {formState.provider !== 'ollama' && formState.provider !== 'copilot' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              API Key
            </label>
            <div className="relative">
              <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showApiKey ? 'text' : 'password'}
                value={formState.apiKey || ''}
                onChange={(e) => handleChange('apiKey', e.target.value)}
                placeholder="Enter your API key..."
                className="w-full pl-10 pr-20 py-2 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                {apiKeyStatus === 'valid' && (
                  <CheckCircle size={16} className="text-green-500" />
                )}
                {apiKeyStatus === 'invalid' && (
                  <AlertCircle size={16} className="text-red-500" />
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {formState.provider === 'gemini' && (
                <>Get your API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Google AI Studio</a></>
              )}
            </p>
          </div>
        )}

        {/* Model Selection */}
        {formState.provider === 'gemini' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Model
            </label>
            <select
              value={formState.model || 'gemini-2.0-flash'}
              onChange={(e) => handleChange('model', e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {GEMINI_MODELS.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Ollama Settings */}
        {formState.provider === 'ollama' && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Ollama Base URL
              </label>
              <input
                type="url"
                value={formState.ollamaBaseUrl || 'http://localhost:11434'}
                onChange={(e) => handleChange('ollamaBaseUrl', e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                Make sure Ollama is running locally. <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Get Ollama</a>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Model
              </label>
              <select
                value={formState.model || 'llama2'}
                onChange={(e) => handleChange('model', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {OLLAMA_MODELS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Pull models with: <code className="text-xs bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">ollama pull {formState.model || 'llama2'}</code>
              </p>
            </div>
          </>
        )}

        <hr className="border-slate-200 dark:border-slate-700" />

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
