/**
 * ArenaSettings Component
 *
 * Full settings panel for Arena configuration. Includes:
 *   - **Provider Configuration**: API key, API URL, enable/disable per provider
 *   - **Model Management**: enable/disable individual models
 *   - **Default Provider & Model**: set the defaults used when starting new chats
 *   - **General Preferences**: streaming toggle, session limits
 */

import React, { useState, useCallback } from 'react';
import { Save, X, Eye, EyeOff, Key, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../utils/styling';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import type { ArenaSettings as ArenaSettingsType } from '../../types/arena';
import {
  DEFAULT_ARENA_SETTINGS,
  PROVIDER_DEFINITIONS,
  getModelsForProvider,
  getDefaultProviderSettings,
  OLLAMA_DEFAULT_BASE_URL,
} from '../../config/arenaConfig';
import type {
  ArenaProviderType,
  ArenaProviderSettingsMap,
  ProviderDefinition,
} from '../../config/arenaConfig';

// ============================================================================
// Types
// ============================================================================

export interface ArenaSettingsProps {
  settings: ArenaSettingsType;
  providerSettings: ArenaProviderSettingsMap;
  onSave: (settings: ArenaSettingsType, providerSettings: ArenaProviderSettingsMap) => Promise<void>;
  onCancel: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ArenaSettings({
  settings,
  providerSettings,
  onSave,
  onCancel,
}: ArenaSettingsProps): React.ReactElement {
  const [formState, setFormState] = useState<ArenaSettingsType>({ ...settings });
  const [providerState, setProviderState] = useState<ArenaProviderSettingsMap>({ ...providerSettings });
  const [isSaving, setIsSaving] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<ArenaProviderType | null>(null);

  const handleChange = <K extends keyof ArenaSettingsType>(
    key: K,
    value: ArenaSettingsType[K],
  ) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  /** Update a field in one provider's settings */
  const handleProviderFieldChange = useCallback(
    <K extends keyof ArenaProviderSettingsMap[ArenaProviderType]>(
      providerId: ArenaProviderType,
      key: K,
      value: ArenaProviderSettingsMap[ArenaProviderType][K],
    ) => {
      setProviderState((prev) => ({
        ...prev,
        [providerId]: { ...prev[providerId], [key]: value },
      }));
    },
    [],
  );

  /** Toggle a model's disabled state for a provider */
  const handleToggleModel = useCallback(
    (providerId: ArenaProviderType, modelId: string) => {
      setProviderState((prev) => {
        const current = prev[providerId];
        const disabled = new Set(current.disabledModels);
        if (disabled.has(modelId)) {
          disabled.delete(modelId);
        } else {
          disabled.add(modelId);
        }
        return {
          ...prev,
          [providerId]: { ...current, disabledModels: Array.from(disabled) },
        };
      });
    },
    [],
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(formState, providerState);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setFormState({ ...DEFAULT_ARENA_SETTINGS });
    setProviderState(getDefaultProviderSettings());
  };

  /** Get providers that are "implemented" (available in code) */
  const implementedProviders = PROVIDER_DEFINITIONS.filter((p) => p.available);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Arena Settings
        </h2>
        <SecondaryButton
          onClick={onCancel}
          size="icon"
          variant="ghost"
          className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          aria-label="Close settings"
        >
          <X size={20} />
        </SecondaryButton>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">

        {/* ================================================== */}
        {/* Default Provider & Model */}
        {/* ================================================== */}
        <section>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
            Default Provider & Model
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            The provider and model selected by default when you open a new chat.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
                Provider
              </label>
              <select
                value={formState.provider}
                onChange={(e) => {
                  const pid = e.target.value as ArenaProviderType;
                  const def = PROVIDER_DEFINITIONS.find((p) => p.id === pid);
                  handleChange('provider', pid);
                  handleChange('model', def?.defaultModel);
                }}
                className="w-full px-2 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {implementedProviders
                  .filter((p) => providerState[p.id]?.enabled !== false)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
                Model
              </label>
              <select
                value={formState.model || ''}
                onChange={(e) => handleChange('model', e.target.value)}
                className="w-full px-2 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {getModelsForProvider(formState.provider)
                  .filter((m) => !providerState[formState.provider]?.disabledModels.includes(m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}{m.note ? ` (${m.note})` : ''}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </section>

        <hr className="border-slate-200 dark:border-slate-700" />

        {/* ================================================== */}
        {/* Provider Configuration */}
        {/* ================================================== */}
        <section>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
            Provider Configuration
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Set API keys, custom URLs, and enable or disable providers and individual models.
          </p>

          <div className="space-y-2">
            {implementedProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                providerConfig={providerState[provider.id]}
                isExpanded={expandedProvider === provider.id}
                onToggleExpand={() =>
                  setExpandedProvider((prev) => (prev === provider.id ? null : provider.id))
                }
                onFieldChange={(key, value) => handleProviderFieldChange(provider.id, key, value)}
                onToggleModel={(modelId) => handleToggleModel(provider.id, modelId)}
              />
            ))}
          </div>
        </section>

        <hr className="border-slate-200 dark:border-slate-700" />

        {/* ================================================== */}
        {/* General Preferences */}
        {/* ================================================== */}
        <section>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            General Preferences
          </h3>

          {/* Session Limits */}
          <div className="mb-4">
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
              onChange={(e) =>
                handleChange('maxMessagesPerSession', parseInt(e.target.value) || 10)
              }
              className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Maximum messages in each session (5-50)
            </p>
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <SecondaryButton
          onClick={handleReset}
          variant="ghost"
          size="sm"
          className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          Reset to Defaults
        </SecondaryButton>
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={onCancel} size="sm">
            Cancel
          </SecondaryButton>
          <PrimaryButton
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
          >
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Provider Card (collapsible)
// ============================================================================

interface ProviderCardProps {
  provider: ProviderDefinition;
  providerConfig: ArenaProviderSettingsMap[ArenaProviderType];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onFieldChange: <K extends keyof ArenaProviderSettingsMap[ArenaProviderType]>(
    key: K,
    value: ArenaProviderSettingsMap[ArenaProviderType][K],
  ) => void;
  onToggleModel: (modelId: string) => void;
}

function ProviderCard({
  provider,
  providerConfig,
  isExpanded,
  onToggleExpand,
  onFieldChange,
  onToggleModel,
}: ProviderCardProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const models = getModelsForProvider(provider.id);
  const disabledSet = new Set(providerConfig.disabledModels);

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        providerConfig.enabled
          ? 'border-slate-200 dark:border-slate-700'
          : 'border-slate-200/60 dark:border-slate-700/60 opacity-60',
      )}
    >
      {/* Provider header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Enable toggle */}
        <input
          type="checkbox"
          checked={providerConfig.enabled}
          onChange={() => onFieldChange('enabled', !providerConfig.enabled)}
          className="accent-blue-600 flex-shrink-0"
          aria-label={`Enable ${provider.label}`}
        />

        {/* Name + description */}
        <SecondaryButton
          onClick={onToggleExpand}
          variant="ghost"
          size="sm"
          className="flex-1 justify-start items-center gap-2 text-left h-auto px-0"
        >
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {provider.label}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {provider.description}
          </span>
          <span className="ml-auto text-slate-400">
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </SecondaryButton>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t border-slate-100 dark:border-slate-700/60">
          {/* API Key (cloud providers) */}
          {provider.requiresApiKey && (
            <div className="mt-3">
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
                API Key
              </label>
              <div className="relative">
                <Key size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={providerConfig.apiKey || ''}
                  onChange={(e) => onFieldChange('apiKey', e.target.value || undefined)}
                  placeholder="Enter API key..."
                  className="w-full pl-7 pr-8 py-1.5 text-xs bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <SecondaryButton
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  size="icon"
                  variant="ghost"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 text-slate-400 hover:text-slate-600"
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? <EyeOff size={12} /> : <Eye size={12} />}
                </SecondaryButton>
              </div>
              {provider.id === 'gemini' && (
                <p className="mt-1 text-[10px] text-slate-400">
                  Get your key from{' '}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    Google AI Studio
                  </a>
                </p>
              )}
            </div>
          )}

          {/* API URL (e.g. Ollama base URL, or custom endpoint) */}
          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
              <Globe size={10} className="inline mr-1" />
              API URL
            </label>
            <input
              type="url"
              value={providerConfig.apiUrl || ''}
              onChange={(e) => onFieldChange('apiUrl', e.target.value || undefined)}
              placeholder={provider.id === 'ollama' ? OLLAMA_DEFAULT_BASE_URL : 'https://...'}
              className="w-full px-2 py-1.5 text-xs bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Model enable/disable */}
          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
              Models
            </label>
            <div className="space-y-1">
              {models.map((m) => (
                <label
                  key={m.id}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs transition-colors',
                    disabledSet.has(m.id)
                      ? 'text-slate-400 dark:text-slate-500'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={!disabledSet.has(m.id)}
                    onChange={() => onToggleModel(m.id)}
                    className="accent-blue-600"
                  />
                  <span>{m.label}</span>
                  {m.note && (
                    <span className="text-[10px] text-slate-400">{m.note}</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ArenaSettings;
