/**
 * ArenaChatToolbar Component
 *
 * Persistent horizontal bar at the top of the chat area (below the header,
 * above the message list). Layout (left → right):
 *
 * Left  — **Back button** (arrow) + **Agent name & icon**
 * Right — **Provider / Model selector**, **Streaming toggle**,
 *          **Context-panel toggle** (PanelRight icon)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  X,
  Zap,
  Globe,
  PanelRight,
  Cpu,
} from 'lucide-react';
import { cn } from '../../utils/styling';
import {
  getProviderDefinition,
  getAgentDefinition,
} from '../../config/arenaConfig';
import type {
  ArenaAgentId,
  ArenaProviderType,
  ArenaSettings,
  ArenaProviderSettingsMap,
  ProviderDefinition,
  ModelDefinition,
} from '../../config/arenaConfig';
import {
  getEnabledProviders,
  getEnabledModels,
} from '../../config/arenaConfig';
import { SecondaryButton } from '../ui/SecondaryButton';

// ============================================================================
// Types
// ============================================================================

export interface ArenaChatToolbarProps {
  /** Current arena settings (contains provider, model) */
  settings: ArenaSettings;
  /** Per-provider settings (for filtering enabled providers/models) */
  providerSettings: ArenaProviderSettingsMap;
  /** Callback when provider / model selection changes */
  onSettingsChange: (updates: Partial<ArenaSettings>) => void;
  /** Whether streaming responses are enabled */
  enableStreaming: boolean;
  /** Callback to toggle streaming */
  onEnableStreamingChange: (enabled: boolean) => void;
  /** Navigate back to agent selection screen */
  onBack: () => void;
  /** Current agent id (for agent name & icon display) */
  agentId: ArenaAgentId | null;
  /** Whether the right context panel is open */
  showRightPane: boolean;
  /** Toggle the right context panel */
  onToggleRightPane: () => void;
  /** MCP server connection status (wave-client only) */
  mcpStatus?: import('../../types/arena').McpStatus;
  /** Callback when MCP status indicator is clicked (reconnect) */
  onMcpReconnect?: () => void;
  /** Optional CSS class name */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ArenaChatToolbar({
  settings,
  providerSettings,
  onSettingsChange,
  enableStreaming,
  onEnableStreamingChange,
  onBack,
  agentId,
  showRightPane,
  onToggleRightPane,
  mcpStatus,
  onMcpReconnect,
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
  const agentDef = agentId ? getAgentDefinition(agentId) : null;

  const AGENT_ICON_MAP: Record<string, React.ReactNode> = {
    'wave-client': <Zap size={14} className="text-violet-500" />,
    'web-expert': <Globe size={14} className="text-emerald-500" />,
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 border-b border-slate-200 dark:border-slate-700',
        'bg-slate-50 dark:bg-slate-800/60 text-xs',
        className,
      )}
    >
      {/* ---- LEFT: Back + Agent Name ---- */}
      <SecondaryButton
        onClick={onBack}
        size="icon"
        variant="ghost"
        className="h-7 w-7 p-0 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        title="Back to agents"
        aria-label="Back to agents"
      >
        <ArrowLeft size={16} />
      </SecondaryButton>

      {agentDef && (
        <div className="flex items-center gap-1.5">
          {AGENT_ICON_MAP[agentId ?? ''] ?? <Cpu size={14} />}
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {agentDef.label}
          </span>
          {/* MCP status dot — wave-client only */}
          {agentId === 'wave-client' && mcpStatus && (
            <button
              type="button"
              onClick={onMcpReconnect}
              title={
                mcpStatus === 'connected'
                  ? 'MCP connected'
                  : mcpStatus === 'connecting'
                    ? 'MCP connecting…'
                    : mcpStatus === 'error'
                      ? 'MCP error — click to reconnect'
                      : 'MCP disconnected — click to connect'
              }
              className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                mcpStatus === 'connected' && 'bg-emerald-500',
                mcpStatus === 'connecting' && 'bg-yellow-500 animate-pulse',
                mcpStatus === 'error' && 'bg-red-500',
                mcpStatus === 'disconnected' && 'bg-slate-400',
                (mcpStatus === 'disconnected' || mcpStatus === 'error') && 'cursor-pointer',
              )}
            />
          )}
        </div>
      )}

      {/* ---- Spacer ---- */}
      <div className="flex-1" />

      {/* ---- Provider / Model ---- */}
      <div className="relative" ref={popoverRef}>
        <SecondaryButton
          onClick={() => setShowProviderPopover((v) => !v)}
          size="sm"
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1',
            'border border-slate-200 dark:border-slate-600',
            'text-slate-700 dark:text-slate-300',
            'hover:bg-slate-100 dark:hover:bg-slate-700',
            showProviderPopover && 'bg-slate-100 dark:bg-slate-700',
          )}
        >
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {currentProvider?.label ?? settings.provider}
          </span>
          <span className="text-slate-400 dark:text-slate-500">&middot;</span>
          <span className="text-slate-500 dark:text-slate-400 max-w-[120px] truncate">
            {currentModel}
          </span>
          <ChevronDown size={12} className="text-slate-400" />
        </SecondaryButton>

        {showProviderPopover && (
          <ProviderPopover
            settings={settings}
            providerSettings={providerSettings}
            onSettingsChange={onSettingsChange}
            onClose={() => setShowProviderPopover(false)}
          />
        )}
      </div>

      {/* ---- Streaming Toggle ---- */}
      <button
        type="button"
        onClick={() => onEnableStreamingChange(!enableStreaming)}
        title={enableStreaming ? 'Streaming enabled' : 'Streaming disabled'}
        className={cn(
          'p-1.5 rounded-md transition-colors',
          enableStreaming
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
          'hover:bg-opacity-80 dark:hover:bg-opacity-80',
        )}
      >
        <Zap size={16} className={enableStreaming ? 'fill-current' : ''} />
      </button>

      {/* ---- Context Panel Toggle ---- */}
      <SecondaryButton
        onClick={onToggleRightPane}
        size="icon"
        variant="ghost"
        className={cn(
          'h-7 w-7 p-0',
          showRightPane
            ? 'text-blue-500 dark:text-blue-400'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
        )}
        title="Toggle context panel"
        aria-label="Toggle context panel"
      >
        <PanelRight size={16} />
      </SecondaryButton>
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
        'absolute left-0 top-full mt-2 z-50 w-72 rounded-lg shadow-lg',
        'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Provider & Model</span>
        <SecondaryButton
          onClick={onClose}
          size="icon"
          variant="ghost"
          className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          <X size={14} />
        </SecondaryButton>
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
