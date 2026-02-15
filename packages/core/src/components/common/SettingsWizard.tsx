import React, { useState, useEffect, useCallback } from 'react';
import { SaveIcon, XIcon, FolderOpenIcon, RotateCcwIcon, InfoIcon, AlertTriangleIcon, ShieldAlertIcon, CheckCircleIcon, XCircleIcon, Key, Globe, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { Button } from '../ui/button';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '../../utils/styling';
import { AppSettings, DEFAULT_SETTINGS, ArenaAppSettings, DEFAULT_ARENA_APP_SETTINGS } from '../../hooks/store/createSettingsSlice';
import {
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

interface SettingsWizardProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onCancel: () => void;
  onBrowseDirectory?: () => void; // Optional callback for directory selection
  defaultSaveLocation?: string; // Default location from extension (homeDir/.waveclient)
}

const SettingsWizard: React.FC<SettingsWizardProps> = ({
  settings,
  onSave,
  onCancel,
  onBrowseDirectory,
  defaultSaveLocation = ''
}) => {
  // Form state
  const [saveFilesLocation, setSaveFilesLocation] = useState(settings.saveFilesLocation || defaultSaveLocation);
  const [maxRedirects, setMaxRedirects] = useState(settings.maxRedirects);
  const [requestTimeoutSeconds, setRequestTimeoutSeconds] = useState(settings.requestTimeoutSeconds);
  const [maxHistoryItems, setMaxHistoryItems] = useState(settings.maxHistoryItems);
  const [commonHeaderNames, setCommonHeaderNames] = useState((settings.commonHeaderNames || []).join(', '));
  const [encryptionKeyEnvVar, setEncryptionKeyEnvVar] = useState(settings.encryptionKeyEnvVar);
  const [ignoreCertificateValidation, setIgnoreCertificateValidation] = useState(settings.ignoreCertificateValidation);

  // Arena / AI form state
  const [arenaDefaultProvider, setArenaDefaultProvider] = useState<ArenaProviderType>(settings.arena?.defaultProvider ?? DEFAULT_ARENA_APP_SETTINGS.defaultProvider);
  const [arenaDefaultModel, setArenaDefaultModel] = useState(settings.arena?.defaultModel ?? DEFAULT_ARENA_APP_SETTINGS.defaultModel);
  const [arenaEnableStreaming, setArenaEnableStreaming] = useState(settings.arena?.enableStreaming ?? DEFAULT_ARENA_APP_SETTINGS.enableStreaming);
  const [arenaMaxSessions, setArenaMaxSessions] = useState(settings.arena?.maxSessions ?? DEFAULT_ARENA_APP_SETTINGS.maxSessions);
  const [arenaMaxMessages, setArenaMaxMessages] = useState(settings.arena?.maxMessagesPerSession ?? DEFAULT_ARENA_APP_SETTINGS.maxMessagesPerSession);
  const [arenaProviders, setArenaProviders] = useState<ArenaProviderSettingsMap>(settings.arena?.providers ?? getDefaultProviderSettings());
  const [expandedProvider, setExpandedProvider] = useState<ArenaProviderType | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sync state when settings prop changes
  useEffect(() => {
    setSaveFilesLocation(settings.saveFilesLocation || defaultSaveLocation);
    setMaxRedirects(settings.maxRedirects);
    setRequestTimeoutSeconds(settings.requestTimeoutSeconds);
    setMaxHistoryItems(settings.maxHistoryItems);
    setCommonHeaderNames((settings.commonHeaderNames || []).join(', '));
    setEncryptionKeyEnvVar(settings.encryptionKeyEnvVar);
    setIgnoreCertificateValidation(settings.ignoreCertificateValidation);
    // Sync arena state
    setArenaDefaultProvider(settings.arena?.defaultProvider ?? DEFAULT_ARENA_APP_SETTINGS.defaultProvider);
    setArenaDefaultModel(settings.arena?.defaultModel ?? DEFAULT_ARENA_APP_SETTINGS.defaultModel);
    setArenaEnableStreaming(settings.arena?.enableStreaming ?? DEFAULT_ARENA_APP_SETTINGS.enableStreaming);
    setArenaMaxSessions(settings.arena?.maxSessions ?? DEFAULT_ARENA_APP_SETTINGS.maxSessions);
    setArenaMaxMessages(settings.arena?.maxMessagesPerSession ?? DEFAULT_ARENA_APP_SETTINGS.maxMessagesPerSession);
    setArenaProviders(settings.arena?.providers ?? getDefaultProviderSettings());
  }, [settings, defaultSaveLocation]);

  /** Update a single field in a provider's settings */
  const handleProviderFieldChange = useCallback(
    <K extends keyof ArenaProviderSettingsMap[ArenaProviderType]>(
      providerId: ArenaProviderType,
      key: K,
      value: ArenaProviderSettingsMap[ArenaProviderType][K],
    ) => {
      setArenaProviders((prev) => ({
        ...prev,
        [providerId]: { ...prev[providerId], [key]: value },
      }));
    },
    [],
  );

  /** Toggle a model's disabled state for a provider */
  const handleToggleModel = useCallback(
    (providerId: ArenaProviderType, modelId: string) => {
      setArenaProviders((prev) => {
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

  /** Only providers that have a working implementation */
  const implementedProviders = PROVIDER_DEFINITIONS.filter((p) => p.available);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (maxRedirects < 0) {
      newErrors.maxRedirects = 'Redirects must be 0 or greater';
    }

    if (requestTimeoutSeconds < 0) {
      newErrors.requestTimeoutSeconds = 'Timeout must be 0 or greater';
    }

    if (maxHistoryItems < 1) {
      newErrors.maxHistoryItems = 'History items must be at least 1';
    }

    if (!encryptionKeyEnvVar.trim()) {
      newErrors.encryptionKeyEnvVar = 'Encryption key environment variable is required';
    } else if (!/^[A-Z_][A-Z0-9_]*$/i.test(encryptionKeyEnvVar.trim())) {
      newErrors.encryptionKeyEnvVar = 'Invalid environment variable name format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) return;

    // Parse comma-separated header names and filter out empty values
    const parsedHeaderNames = commonHeaderNames
      .split(',')
      .map(h => h.trim())
      .filter(h => h.length > 0);

    const updatedSettings: AppSettings = {
      saveFilesLocation: saveFilesLocation.trim(),
      maxRedirects,
      requestTimeoutSeconds,
      maxHistoryItems,
      commonHeaderNames: parsedHeaderNames,
      encryptionKeyEnvVar: encryptionKeyEnvVar.trim(),
      encryptionKeyValidationStatus: settings.encryptionKeyValidationStatus,
      ignoreCertificateValidation,
      arena: {
        defaultProvider: arenaDefaultProvider,
        defaultModel: arenaDefaultModel,
        enableStreaming: arenaEnableStreaming,
        maxSessions: arenaMaxSessions,
        maxMessagesPerSession: arenaMaxMessages,
        providers: arenaProviders,
      },
    };

    onSave(updatedSettings);
  };

  const handleReset = () => {
    setSaveFilesLocation(defaultSaveLocation || DEFAULT_SETTINGS.saveFilesLocation);
    setMaxRedirects(DEFAULT_SETTINGS.maxRedirects);
    setRequestTimeoutSeconds(DEFAULT_SETTINGS.requestTimeoutSeconds);
    setMaxHistoryItems(DEFAULT_SETTINGS.maxHistoryItems);
    setCommonHeaderNames('');
    setEncryptionKeyEnvVar(DEFAULT_SETTINGS.encryptionKeyEnvVar);
    setIgnoreCertificateValidation(DEFAULT_SETTINGS.ignoreCertificateValidation);
    // Reset arena settings
    setArenaDefaultProvider(DEFAULT_ARENA_APP_SETTINGS.defaultProvider);
    setArenaDefaultModel(DEFAULT_ARENA_APP_SETTINGS.defaultModel);
    setArenaEnableStreaming(DEFAULT_ARENA_APP_SETTINGS.enableStreaming);
    setArenaMaxSessions(DEFAULT_ARENA_APP_SETTINGS.maxSessions);
    setArenaMaxMessages(DEFAULT_ARENA_APP_SETTINGS.maxMessagesPerSession);
    setArenaProviders(getDefaultProviderSettings());
    setExpandedProvider(null);
    setErrors({});
  };

  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
      {/* General Settings Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b pb-2">
          General Settings
        </h3>
        
        <div>
          <Label htmlFor="saveFilesLocation">Data Storage Location</Label>
          <div className="flex gap-2 mt-1">
            <Input
              id="saveFilesLocation"
              value={saveFilesLocation}
              onChange={(e) => setSaveFilesLocation(e.target.value)}
              placeholder="Defaults to ~/.waveclient if left empty"
              className="flex-1"
            />
            {onBrowseDirectory && (
              <Button
                variant="outline"
                size="sm"
                onClick={onBrowseDirectory}
                title="Browse for directory"
              >
                <FolderOpenIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
          {errors.saveFilesLocation && (
            <p className="text-xs text-red-500 mt-1">{errors.saveFilesLocation}</p>
          )}
          <div className="flex items-start gap-2 mt-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
            <InfoIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Ensure you have read/write access to this location. This is where your collections, environments, and other data will be stored.
            </p>
          </div>
        </div>
      </div>

      {/* Request Settings Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b pb-2">
          Request Settings
        </h3>
        
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="maxRedirects">Max Redirects</Label>
            <Input
              id="maxRedirects"
              type="number"
              min={0}
              value={maxRedirects}
              onChange={(e) => setMaxRedirects(parseInt(e.target.value) || 0)}
              className="mt-1"
            />
            {errors.maxRedirects && (
              <p className="text-xs text-red-500 mt-1">{errors.maxRedirects}</p>
            )}
            <p className="text-xs text-slate-500 mt-1">HTTP redirects to follow (0 = none)</p>
          </div>

          <div>
            <Label htmlFor="requestTimeoutSeconds">Request Timeout (sec)</Label>
            <Input
              id="requestTimeoutSeconds"
              type="number"
              min={0}
              value={requestTimeoutSeconds}
              onChange={(e) => setRequestTimeoutSeconds(parseInt(e.target.value) || 0)}
              className="mt-1"
            />
            {errors.requestTimeoutSeconds && (
              <p className="text-xs text-red-500 mt-1">{errors.requestTimeoutSeconds}</p>
            )}
            <p className="text-xs text-slate-500 mt-1">Timeout in seconds (0 = none)</p>
          </div>

          <div>
            <Label htmlFor="maxHistoryItems">Max History Items</Label>
            <Input
              id="maxHistoryItems"
              type="number"
              min={1}
              max={100}
              value={maxHistoryItems}
              onChange={(e) => setMaxHistoryItems(parseInt(e.target.value) || 10)}
              className="mt-1"
            />
            {errors.maxHistoryItems && (
              <p className="text-xs text-red-500 mt-1">{errors.maxHistoryItems}</p>
            )}
            <p className="text-xs text-slate-500 mt-1">Requests to keep in history</p>
          </div>
        </div>

        <div>
          <Label htmlFor="commonHeaderNames">Common Header Names (optional)</Label>
          <Input
            id="commonHeaderNames"
            value={commonHeaderNames}
            onChange={(e) => setCommonHeaderNames(e.target.value)}
            placeholder="e.g., Authorization, X-API-Key, X-Request-ID"
            className="mt-1"
          />
          <p className="text-xs text-slate-500 mt-1">
            Comma-separated header names that will be suggested when adding headers to requests.
          </p>
        </div>
      </div>

      {/* Security Settings Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b pb-2">
          Security Settings
        </h3>
        
        <div>
          <div className="flex items-center gap-2">
            <Label htmlFor="encryptionKeyEnvVar">Encryption Key Environment Variable *</Label>
            {settings.encryptionKeyValidationStatus === 'valid' && (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                Valid
              </span>
            )}
            {settings.encryptionKeyValidationStatus === 'invalid' && (
              <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                <XCircleIcon className="h-3.5 w-3.5" />
                Not Found
              </span>
            )}
          </div>
          <Input
            id="encryptionKeyEnvVar"
            value={encryptionKeyEnvVar}
            onChange={(e) => setEncryptionKeyEnvVar(e.target.value)}
            placeholder="WAVECLIENT_SECRET_KEY"
            className="mt-1"
          />
          {errors.encryptionKeyEnvVar && (
            <p className="text-xs text-red-500 mt-1">{errors.encryptionKeyEnvVar}</p>
          )}
          
          {/* Show error message if env var is invalid */}
          {settings.encryptionKeyValidationStatus === 'invalid' && (
            <div className="flex items-start gap-2 mt-2 p-2 bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-800">
              <XCircleIcon className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-300">
                <strong>Environment variable not found:</strong> The environment variable <code className="px-1 py-0.5 bg-red-100 dark:bg-red-900/50 rounded text-red-700 dark:text-red-300">{settings.encryptionKeyEnvVar}</code> is not set or is empty. 
                Encryption will not work until this variable is configured in your system environment. As a result, data will be stored unencrypted, which poses a security risk.
                Restart VS Code after setting the environment variable.
              </p>
            </div>
          )}
          
          {/* Warning about changing encryption key */}
          <div className="flex items-start gap-2 mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
            <AlertTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-700 dark:text-amber-300">
              <strong>IMPORTANT:</strong> Changing the environment variable name or its value is <strong>not recommended</strong> as it may result in data loss.
              <ul className="mt-1.5 ml-4 list-disc space-y-1">
                <li>If you must change the encryption key, <strong>export all your data first</strong> (collections, environments, auth stores, etc.)</li>
                <li>Changing the key value will trigger re-encryption of all data, which may take a while</li>
                <li>If an error occurs during re-encryption, it could result in data corruption</li>
                <li>Always back up your data storage directory before making changes</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <div className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-md">
            <div className="flex-1">
              <Label htmlFor="ignoreCertificateValidation" className="cursor-pointer">
                Ignore Certificate Validation
              </Label>
              <p className="text-xs text-slate-500 mt-1">
                Skip SSL/TLS certificate verification when making requests
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="ignoreCertificateValidation"
                checked={ignoreCertificateValidation}
                onChange={(e) => setIgnoreCertificateValidation(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
          
          {ignoreCertificateValidation && (
            <div className="flex items-start gap-2 mt-2 p-2 bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-800">
              <ShieldAlertIcon className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-300">
                <strong>SECURITY WARNING:</strong> Disabling certificate validation is highly NOT recommended for production use. Only enable this for testing purposes with self-signed certificates in development environments. This makes your connection vulnerable to man-in-the-middle attacks.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* Arena / AI Settings Section                                      */}
      {/* ================================================================ */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b pb-2">
          Arena / AI Settings
        </h3>

        {/* Default Provider & Model */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="arenaDefaultProvider">Default Provider</Label>
            <select
              id="arenaDefaultProvider"
              value={arenaDefaultProvider}
              onChange={(e) => {
                const pid = e.target.value as ArenaProviderType;
                const def = PROVIDER_DEFINITIONS.find((p) => p.id === pid);
                setArenaDefaultProvider(pid);
                setArenaDefaultModel(def?.defaultModel ?? '');
              }}
              className="w-full mt-1 px-2 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {implementedProviders
                .filter((p) => arenaProviders[p.id]?.enabled !== false)
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">Provider used by default in new chats</p>
          </div>
          <div>
            <Label htmlFor="arenaDefaultModel">Default Model</Label>
            <select
              id="arenaDefaultModel"
              value={arenaDefaultModel}
              onChange={(e) => setArenaDefaultModel(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {getModelsForProvider(arenaDefaultProvider)
                .filter((m) => !arenaProviders[arenaDefaultProvider]?.disabledModels.includes(m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}{m.note ? ` (${m.note})` : ''}
                  </option>
                ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">Model used by default in new chats</p>
          </div>
        </div>

        {/* Streaming toggle */}
        <div className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-md">
          <div className="flex-1">
            <Label htmlFor="arenaEnableStreaming" className="cursor-pointer">
              Enable Streaming Responses
            </Label>
            <p className="text-xs text-slate-500 mt-1">
              Stream AI responses token-by-token instead of waiting for the full response
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              id="arenaEnableStreaming"
              checked={arenaEnableStreaming}
              onChange={(e) => setArenaEnableStreaming(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {/* Session Limits */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="arenaMaxSessions">Max Sessions</Label>
            <Input
              id="arenaMaxSessions"
              type="number"
              min={1}
              max={20}
              value={arenaMaxSessions}
              onChange={(e) => setArenaMaxSessions(parseInt(e.target.value) || 5)}
              className="mt-1"
            />
            <p className="text-xs text-slate-500 mt-1">Chat sessions to keep (1–20)</p>
          </div>
          <div>
            <Label htmlFor="arenaMaxMessages">Max Messages per Session</Label>
            <Input
              id="arenaMaxMessages"
              type="number"
              min={5}
              max={50}
              value={arenaMaxMessages}
              onChange={(e) => setArenaMaxMessages(parseInt(e.target.value) || 10)}
              className="mt-1"
            />
            <p className="text-xs text-slate-500 mt-1">Messages per session (5–50)</p>
          </div>
        </div>

        {/* Provider Configuration — collapsible cards */}
        <div>
          <Label className="mb-2 block">Provider Configuration</Label>
          <p className="text-xs text-slate-500 mb-3">
            Set API keys, custom URLs, and enable or disable providers &amp; individual models.
          </p>
          <div className="space-y-2">
            {implementedProviders.map((provider) => (
              <ArenaProviderCard
                key={provider.id}
                provider={provider}
                providerConfig={arenaProviders[provider.id]}
                isExpanded={expandedProvider === provider.id}
                onToggleExpand={() =>
                  setExpandedProvider((prev) => (prev === provider.id ? null : provider.id))
                }
                onFieldChange={(key, value) => handleProviderFieldChange(provider.id, key, value)}
                onToggleModel={(modelId) => handleToggleModel(provider.id, modelId)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between pt-4 border-t sticky bottom-0 bg-white dark:bg-slate-900 pb-2">
        <SecondaryButton
          size="sm"
          onClick={handleReset}
          colorTheme="main"
          icon={<RotateCcwIcon />}
          text="Reset"
          tooltip="Reset to defaults"
        />
        
        <div className="flex gap-2">
          <SecondaryButton
            size="sm"
            onClick={onCancel}
            colorTheme="warning"
            icon={<XIcon />}
            text="Cancel"
            tooltip="Cancel"
          />
          <PrimaryButton
            size="sm"
            onClick={handleSave}
            colorTheme="success"
            icon={<SaveIcon />}
            text="Save"
            tooltip="Save settings"
          />
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ArenaProviderCard — collapsible provider configuration card
// ============================================================================

interface ArenaProviderCardProps {
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

function ArenaProviderCard({
  provider,
  providerConfig,
  isExpanded,
  onToggleExpand,
  onFieldChange,
  onToggleModel,
}: ArenaProviderCardProps) {
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
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={providerConfig.enabled}
          onChange={() => onFieldChange('enabled', !providerConfig.enabled)}
          className="accent-blue-600 flex-shrink-0"
          aria-label={`Enable ${provider.label}`}
        />
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-2 text-left"
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
        </button>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t border-slate-100 dark:border-slate-700/60">
          {/* API Key */}
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
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
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

          {/* API URL */}
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

export default SettingsWizard;
