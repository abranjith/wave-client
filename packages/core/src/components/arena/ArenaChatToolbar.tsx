/**
 * ArenaChatToolbar Component
 *
 * Persistent horizontal bar at the top of the chat area (below the header,
 * above the message list). Contains three sections:
 *
 * Left — **Sources**: pill/chip per active source (URLs, docs, MCP tools).
 *   A `+` button placeholder for future "add source" functionality.
 *
 * Centre — **Provider / Model**: compact dropdown showing the current
 *   provider + model. Clicking opens a popover with provider radio,
 *   model select, API key input, and Ollama URL fields.
 *
 * Right — **Metadata**: live session stats (messages, tokens, duration).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Globe,
  FileText,
  Wrench,
  Plus,
  ChevronDown,
  X,
  Eye,
  EyeOff,
  Key,
  MessageSquare,
  Hash,
  Clock,
} from 'lucide-react';
import { cn } from '../../utils/styling';
import {
  PROVIDER_DEFINITIONS,
  getModelsForProvider,
  getProviderDefinition,
  OLLAMA_DEFAULT_BASE_URL,
} from '../../config/arenaConfig';
import type {
  ArenaProviderType,
  ArenaSourceConfig,
  ArenaSettings,
  ArenaSessionMetadata,
} from '../../config/arenaConfig';

// ============================================================================
// Types
// ============================================================================

export interface ArenaChatToolbarProps {
  /** Active sources for the current agent */
  sources: ArenaSourceConfig[];
  /** Current arena settings (contains provider, model, apiKey, etc.) */
  settings: ArenaSettings;
  /** Session metadata for stats display */
  metadata?: ArenaSessionMetadata;
  /** Callback when provider / model / api key settings change */
  onSettingsChange: (updates: Partial<ArenaSettings>) => void;
  /** Open the full settings panel (gear icon) */
  onOpenSettings?: () => void;
  /** Optional CSS class name */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ArenaChatToolbar({
  sources,
  settings,
  metadata,
  onSettingsChange,
  onOpenSettings,
  className,
}: ArenaChatToolbarProps): React.ReactElement {
  const [showProviderPopover, setShowProviderPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowProviderPopover(false);
      }
    }
    if (showProviderPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProviderPopover]);

  const currentProvider = getProviderDefinition(settings.provider);
  const currentModel = settings.model || currentProvider?.defaultModel || '';

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 border-b border-slate-200 dark:border-slate-700',
        'bg-slate-50 dark:bg-slate-800/60 text-xs',
        className,
      )}
    >
      {/* ---- LEFT: Sources ---- */}
      <SourcesSection sources={sources} />

      {/* ---- Spacer ---- */}
      <div className="flex-1" />

      {/* ---- CENTRE: Provider / Model ---- */}
      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setShowProviderPopover((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors',
            'border border-slate-200 dark:border-slate-600',
            'hover:bg-slate-100 dark:hover:bg-slate-700',
            showProviderPopover && 'bg-slate-100 dark:bg-slate-700',
          )}
        >
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {currentProvider?.label ?? settings.provider}
          </span>
          <span className="text-slate-400 dark:text-slate-500">·</span>
          <span className="text-slate-500 dark:text-slate-400 max-w-[120px] truncate">
            {currentModel}
          </span>
          <ChevronDown size={12} className="text-slate-400" />
        </button>

        {/* ---- Provider popover ---- */}
        {showProviderPopover && (
          <ProviderPopover
            settings={settings}
            onSettingsChange={onSettingsChange}
            onClose={() => setShowProviderPopover(false)}
          />
        )}
      </div>

      {/* ---- RIGHT: Metadata ---- */}
      <MetadataSection metadata={metadata} />
    </div>
  );
}

// ============================================================================
// Sources Section
// ============================================================================

const SOURCE_ICON: Record<string, React.ReactNode> = {
  web: <Globe size={12} />,
  document: <FileText size={12} />,
  mcp: <Wrench size={12} />,
};

function SourcesSection({ sources }: { sources: ArenaSourceConfig[] }) {
  const enabledSources = sources.filter((s) => s.enabled);

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto max-w-[40%] scrollbar-thin">
      {enabledSources.length === 0 ? (
        <span className="text-slate-400 dark:text-slate-500 italic">No sources</span>
      ) : (
        enabledSources.map((source, idx) => (
          <span
            key={`${source.type}-${idx}`}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full whitespace-nowrap',
              'bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
            )}
            title={source.url || source.label}
          >
            {SOURCE_ICON[source.type] ?? null}
            {source.label}
          </span>
        ))
      )}

      {/* Placeholder add-source button */}
      <button
        disabled
        title="Add source (coming soon)"
        className="p-1 rounded text-slate-300 dark:text-slate-600 cursor-not-allowed"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

// ============================================================================
// Metadata Section
// ============================================================================

function MetadataSection({ metadata }: { metadata?: ArenaSessionMetadata }) {
  if (!metadata) return null;

  const formatDuration = (ms: number): string => {
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
    return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  };

  return (
    <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 flex-shrink-0">
      <span className="inline-flex items-center gap-1" title="Messages">
        <MessageSquare size={12} />
        {metadata.messageCount}
      </span>
      <span className="inline-flex items-center gap-1" title="Estimated tokens">
        <Hash size={12} />
        {metadata.totalTokenCount.toLocaleString()}
      </span>
      <span className="inline-flex items-center gap-1" title="Session duration">
        <Clock size={12} />
        {formatDuration(metadata.durationMs)}
      </span>
    </div>
  );
}

// ============================================================================
// Provider Popover
// ============================================================================

interface ProviderPopoverProps {
  settings: ArenaSettings;
  onSettingsChange: (updates: Partial<ArenaSettings>) => void;
  onClose: () => void;
}

function ProviderPopover({ settings, onSettingsChange, onClose }: ProviderPopoverProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const availableProviders = PROVIDER_DEFINITIONS.filter((p) => p.available);
  const models = getModelsForProvider(settings.provider);
  const providerDef = getProviderDefinition(settings.provider);

  const handleProviderChange = useCallback(
    (providerId: ArenaProviderType) => {
      const def = getProviderDefinition(providerId);
      onSettingsChange({
        provider: providerId,
        model: def?.defaultModel,
        // Reset api key when switching providers
        ...(providerId !== settings.provider ? { apiKey: undefined } : {}),
      });
    },
    [onSettingsChange, settings.provider],
  );

  return (
    <div
      className={cn(
        'absolute right-0 top-full mt-2 z-50 w-72 rounded-lg shadow-lg',
        'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Provider & Model</span>
        <button onClick={onClose} className="p-0.5 text-slate-400 hover:text-slate-600">
          <X size={14} />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Provider radio group */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Provider
          </label>
          {availableProviders.map((p) => (
            <label
              key={p.id}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors',
                settings.provider === p.id
                  ? 'bg-blue-50 dark:bg-blue-900/30'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/50',
              )}
            >
              <input
                type="radio"
                name="arena-provider"
                value={p.id}
                checked={settings.provider === p.id}
                onChange={() => handleProviderChange(p.id)}
                className="accent-blue-600"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300">{p.label}</span>
            </label>
          ))}
        </div>

        {/* Model select */}
        <div>
          <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
            Model
          </label>
          <select
            value={settings.model || providerDef?.defaultModel}
            onChange={(e) => onSettingsChange({ model: e.target.value })}
            className="w-full px-2 py-1.5 text-xs bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.note ? ` (${m.note})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* API Key (cloud providers only) */}
        {providerDef?.requiresApiKey && (
          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
              API Key
            </label>
            <div className="relative">
              <Key size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showApiKey ? 'text' : 'password'}
                value={settings.apiKey || ''}
                onChange={(e) => onSettingsChange({ apiKey: e.target.value })}
                placeholder="Enter API key..."
                className="w-full pl-7 pr-8 py-1.5 text-xs bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showApiKey ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            {settings.provider === 'gemini' && (
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

        {/* Ollama URL */}
        {settings.provider === 'ollama' && (
          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
              Ollama URL
            </label>
            <input
              type="url"
              value={settings.ollamaBaseUrl || OLLAMA_DEFAULT_BASE_URL}
              onChange={(e) => onSettingsChange({ ollamaBaseUrl: e.target.value })}
              placeholder={OLLAMA_DEFAULT_BASE_URL}
              className="w-full px-2 py-1.5 text-xs bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ArenaChatToolbar;
