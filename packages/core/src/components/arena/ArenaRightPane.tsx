/**
 * ArenaRightPane Component
 *
 * Contextual side pane rendered to the right of the main chat area.
 * Replaces the old left sidebar (ArenaSessionList) and references modal
 * with a unified, collapsible panel showing:
 *
 *   1. **Session Info** – Active agent, session title, model, provider, timestamp
 *   2. **Sources**      – Currently enabled source configurations for the agent
 *   3. **References**   – Toggleable list of web references; add / remove user refs
 *   4. **Sessions**     – Quick session switcher list
 *
 * The pane is controlled by the parent via `isOpen` / `onToggle`.
 */

import React, { useState, useCallback } from 'react';
import {
  X,
  Plus,
  Trash2,
  Globe,
  FileText,
  Wrench,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageSquare,
  Zap,
  Clock,
  Cpu,
} from 'lucide-react';
import { cn } from '../../utils/styling';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import type { ArenaSession, ArenaView } from '../../types/arena';
import type {
  ArenaAgentId,
  ArenaReference,
  ArenaSourceConfig,
  ArenaSourceType,
  ArenaSessionMetadata,
} from '../../config/arenaConfig';
import { getAgentDefinition, ARENA_AGENT_DEFINITIONS } from '../../config/arenaConfig';

// ============================================================================
// Types
// ============================================================================

export interface ArenaRightPaneProps {
  /** Whether the pane is open */
  isOpen: boolean;
  /** Toggle visibility */
  onToggle: () => void;

  // Session info
  /** Currently selected agent */
  selectedAgent: ArenaAgentId | null;
  /** Session list */
  sessions: ArenaSession[];
  /** Active session ID */
  activeSessionId: string | null;
  /** Session metadata (model, provider, timings) */
  sessionMetadata: ArenaSessionMetadata | null;

  // Sources & references
  /** Active sources for the current agent */
  activeSources: ArenaSourceConfig[];
  /** Reference list (default + user-added) */
  references: ArenaReference[];

  // Callbacks
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onReferencesChange: (references: ArenaReference[]) => void;
  onSourcesChange: (sources: ArenaSourceConfig[]) => void;
}

// ============================================================================
// Icon helpers
// ============================================================================

const SOURCE_TYPE_ICONS: Record<ArenaSourceType, React.ReactNode> = {
  web: <Globe size={14} />,
  document: <FileText size={14} />,
  mcp: <Wrench size={14} />,
};

const AGENT_ICONS: Record<string, React.ReactNode> = {
  'wave-client': <Zap size={14} className="text-violet-400" />,
  'web-expert': <Globe size={14} className="text-emerald-400" />,
};

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Collapsible section wrapper used throughout the pane.
 */
function Section({
  title,
  icon,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-slate-200 dark:border-slate-700/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      >
        {icon}
        <span className="flex-1">{title}</span>
        {badge !== undefined && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            {badge}
          </span>
        )}
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

/**
 * Inline form to add a new reference.
 */
function AddReferenceForm({
  onAdd,
}: {
  onAdd: (name: string, url: string) => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl) return;
    onAdd(trimmedName, trimmedUrl);
    setName('');
    setUrl('');
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-1.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Reference name"
        className="w-full px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://..."
        className="w-full px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <PrimaryButton
        type="submit"
        size="sm"
        disabled={!name.trim() || !url.trim()}
        className="w-full text-xs"
      >
        <Plus size={12} /> Add Reference
      </PrimaryButton>
    </form>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function ArenaRightPane({
  isOpen,
  onToggle,
  selectedAgent,
  sessions,
  activeSessionId,
  sessionMetadata,
  activeSources,
  references,
  onSelectSession,
  onDeleteSession,
  onReferencesChange,
  onSourcesChange,
}: ArenaRightPaneProps): React.ReactElement | null {
  const [showAddRef, setShowAddRef] = useState(false);

  const agentDef = selectedAgent ? getAgentDefinition(selectedAgent) : null;
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const enabledRefs = references.filter((r) => r.enabled).length;

  // ---- Reference handlers ------------------------------------------------

  const handleToggleRef = useCallback(
    (refId: string) => {
      onReferencesChange(
        references.map((r) => (r.id === refId ? { ...r, enabled: !r.enabled } : r)),
      );
    },
    [references, onReferencesChange],
  );

  const handleRemoveRef = useCallback(
    (refId: string) => {
      onReferencesChange(references.filter((r) => r.id !== refId));
    },
    [references, onReferencesChange],
  );

  const handleAddRef = useCallback(
    (name: string, url: string) => {
      const newRef: ArenaReference = {
        id: `user-ref-${Date.now()}`,
        name,
        url,
        type: 'web',
        category: 'Custom',
        enabled: true,
        isDefault: false,
      };
      onReferencesChange([...references, newRef]);
      setShowAddRef(false);
    },
    [references, onReferencesChange],
  );

  // ---- Source toggle handler ------------------------------------------------

  const handleToggleSource = useCallback(
    (idx: number) => {
      const updated = activeSources.map((s, i) =>
        i === idx ? { ...s, enabled: !s.enabled } : s,
      );
      onSourcesChange(updated);
    },
    [activeSources, onSourcesChange],
  );

  // ---- Render ---------------------------------------------------------------

  if (!isOpen) return null;

  return (
    <div className="w-72 flex-shrink-0 flex flex-col border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Context
        </h3>
        <SecondaryButton
          onClick={onToggle}
          size="icon"
          variant="ghost"
          className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          aria-label="Close context pane"
        >
          <X size={14} />
        </SecondaryButton>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* ======== Session Info ======== */}
        {agentDef && activeSession && (
          <Section title="Session" icon={<MessageSquare size={12} />}>
            <div className="space-y-2">
              {/* Agent badge */}
              <div className="flex items-center gap-2">
                {AGENT_ICONS[selectedAgent ?? ''] ?? <Cpu size={14} />}
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {agentDef.label}
                </span>
              </div>

              {/* Session title */}
              <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                {activeSession.title}
              </p>

              {/* Metadata row */}
              {sessionMetadata && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Cpu size={10} />
                    {sessionMetadata.provider}/{sessionMetadata.model}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(activeSession.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ======== Active Sources ======== */}
        {activeSources.length > 0 && (
          <Section
            title="Sources"
            icon={<Globe size={12} />}
            badge={activeSources.filter((s) => s.enabled).length}
          >
            <div className="space-y-1">
              {activeSources.map((src, idx) => (
                <label
                  key={idx}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors',
                    src.enabled
                      ? 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      : 'text-slate-400 dark:text-slate-500',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={src.enabled}
                    onChange={() => handleToggleSource(idx)}
                    className="accent-blue-600"
                  />
                  {SOURCE_TYPE_ICONS[src.type] ?? <Globe size={14} />}
                  <span className="truncate flex-1">{src.label}</span>
                </label>
              ))}
            </div>
          </Section>
        )}

        {/* ======== References ======== */}
        <Section
          title="References"
          icon={<FileText size={12} />}
          badge={`${enabledRefs}/${references.length}`}
        >
          {references.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No references configured</p>
          ) : (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {references.map((ref) => (
                <div
                  key={ref.id}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors group',
                    ref.enabled
                      ? 'text-slate-700 dark:text-slate-300'
                      : 'text-slate-400 dark:text-slate-500',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={ref.enabled}
                    onChange={() => handleToggleRef(ref.id)}
                    className="accent-blue-600 flex-shrink-0"
                  />
                  {SOURCE_TYPE_ICONS[ref.type] ?? <Globe size={14} />}
                  <span className="truncate flex-1">{ref.name}</span>

                  {/* External link */}
                  {ref.url && (
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hidden group-hover:block text-slate-400 hover:text-blue-500"
                      aria-label={`Open ${ref.name}`}
                    >
                      <ExternalLink size={10} />
                    </a>
                  )}

                  {/* Delete (user-added only) */}
                  {!ref.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRef(ref.id)}
                      className="hidden group-hover:block text-slate-400 hover:text-red-500"
                      aria-label={`Remove ${ref.name}`}
                    >
                      <Trash2 size={10} />
                    </button>
                  )}

                  {/* Default badge */}
                  {ref.isDefault && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400">
                      default
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add reference toggle */}
          <div className="mt-2">
            {showAddRef ? (
              <AddReferenceForm onAdd={handleAddRef} />
            ) : (
              <SecondaryButton
                size="sm"
                variant="ghost"
                onClick={() => setShowAddRef(true)}
                className="w-full text-xs justify-center"
              >
                <Plus size={12} /> Add Reference
              </SecondaryButton>
            )}
          </div>
        </Section>

        {/* ======== Sessions ======== */}
        <Section
          title="Sessions"
          icon={<MessageSquare size={12} />}
          defaultOpen={false}
          badge={sessions.length}
        >
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No sessions yet</p>
          ) : (
            <div className="space-y-1 max-h-44 overflow-y-auto">
              {sessions.map((s) => {
                const isActive = s.id === activeSessionId;
                const sDef = getAgentDefinition(s.agent);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors group',
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40',
                    )}
                    onClick={() => onSelectSession(s.id)}
                  >
                    {AGENT_ICONS[s.agent] ?? <Cpu size={12} />}
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{s.title}</p>
                      <p className="text-[10px] text-slate-400">
                        {sDef?.label} · {s.messageCount} msgs
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(s.id);
                      }}
                      className="hidden group-hover:block text-slate-400 hover:text-red-500 flex-shrink-0"
                      aria-label="Delete session"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

export default ArenaRightPane;
