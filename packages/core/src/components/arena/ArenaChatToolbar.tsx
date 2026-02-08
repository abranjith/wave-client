/**
 * ArenaChatToolbar Component
 *
 * Persistent horizontal bar at the top of the chat area (below the header,
 * above the message list). Contains three sections:
 *
 * Left — **References**: single accent-coloured icon. Clicking it opens the
 *   `ArenaReferencesModal` (managed by the parent).
 *
 * Centre — **Provider / Model**: compact dropdown showing the current
 *   provider + model. Clicking opens a lightweight popover for provider /
 *   model selection only. All config (API keys, URLs, enable/disable) is
 *   handled in the Settings panel.
 *
 * Right — **Metadata**: live session stats (messages, tokens, duration).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  BookOpen,
  ChevronDown,
  X,
  MessageSquare,
  Hash,
  Clock,
} from 'lucide-react';
import { cn } from '../../utils/styling';
import {
  getProviderDefinition,
} from '../../config/arenaConfig';
import type {
  ArenaProviderType,
  ArenaSettings,
  ArenaSessionMetadata,
  ArenaProviderSettingsMap,
  ProviderDefinition,
  ModelDefinition,
} from '../../config/arenaConfig';
import {
  getEnabledProviders,
  getEnabledModels,
} from '../../config/arenaConfig';

// ============================================================================
// Types
// ============================================================================

export interface ArenaChatToolbarProps {
  /** Number of enabled references (shown as badge on the icon) */
  referenceCount: number;
  /** Open the references modal */
  onOpenReferences: () => void;
  /** Current arena settings (contains provider, model) */
  settings: ArenaSettings;
  /** Per-provider settings (for filtering enabled providers/models) */
  providerSettings: ArenaProviderSettingsMap;
  /** Session metadata for stats display */
  metadata?: ArenaSessionMetadata;
  /** Callback when provider / model selection changes */
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
  referenceCount,
  onOpenReferences,
  settings,
  providerSettings,
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
      {/* ---- LEFT: References icon ---- */}
      <button
        onClick={onOpenReferences}
        className={cn(
          'relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors',
          'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30',
          'border border-blue-200 dark:border-blue-700',
        )}
        title="Manage references"
      >
        <BookOpen size={14} />
        <span className="text-xs font-medium">References</span>
        {referenceCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-blue-600 text-white dark:bg-blue-500">
            {referenceCount}
          </span>
        )}
      </button>

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
            providerSettings={providerSettings}
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
// Provider Popover (selection only — config is in Settings)
// ============================================================================

interface ProviderPopoverProps {
  settings: ArenaSettings;
  providerSettings: ArenaProviderSettingsMap;
  onSettingsChange: (updates: Partial<ArenaSettings>) => void;
  onClose: () => void;
}

function ProviderPopover({ settings, providerSettings, onSettingsChange, onClose }: ProviderPopoverProps) {
  const enabledProviders: ProviderDefinition[] = getEnabledProviders(providerSettings);
  const enabledModels: ModelDefinition[] = getEnabledModels(settings.provider, providerSettings);
  const providerDef = getProviderDefinition(settings.provider);

  const handleProviderChange = useCallback(
    (providerId: ArenaProviderType) => {
      const def = getProviderDefinition(providerId);
      onSettingsChange({
        provider: providerId,
        model: def?.defaultModel,
      });
    },
    [onSettingsChange],
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
          {enabledProviders.length === 0 ? (
            <p className="text-xs text-slate-400 py-1">No providers enabled. Configure in Settings.</p>
          ) : (
            enabledProviders.map((p) => (
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
            ))
          )}
        </div>

        {/* Model select */}
        <div>
          <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
            Model
          </label>
          {enabledModels.length === 0 ? (
            <p className="text-xs text-slate-400 py-1">No models available. Configure in Settings.</p>
          ) : (
            <select
              value={settings.model || providerDef?.defaultModel}
              onChange={(e) => onSettingsChange({ model: e.target.value })}
              className="w-full px-2 py-1.5 text-xs bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {enabledModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.note ? ` (${m.note})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}

export default ArenaChatToolbar;
