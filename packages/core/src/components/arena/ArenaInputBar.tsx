/**
 * ArenaInputBar Component
 *
 * Modern chat input bar for the Arena experience. Sits at the bottom of the
 * main chat column and provides:
 *
 *   - Auto-resizing textarea with Shift+Enter for newlines
 *   - Slash-command palette (/ prefix triggers filterable command list)
 *   - Active command badge with clear button
 *   - Quick-action buttons for common commands
 *   - Agent indicator showing which agent will respond
 *   - Character count and keyboard hints
 *   - Loading / streaming state awareness
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Send,
  Loader2,
  Command,
  X,
  StopCircle,
  Zap,
  Globe,
  Cpu,
} from 'lucide-react';
import { cn } from '../../utils/styling';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import type { ArenaCommandId, ArenaCommand } from '../../types/arena';
import type { ArenaAgentId } from '../../config/arenaConfig';
import { getAgentDefinition, ARENA_AGENT_IDS } from '../../config/arenaConfig';

// ============================================================================
// Types
// ============================================================================

export interface ArenaInputBarProps {
  /** Available slash-commands for the current agent */
  commands: ArenaCommand[];
  /** Send handler — receives trimmed content + optional command */
  onSend: (content: string, command?: ArenaCommandId) => void;
  /** Cancel (stop) the in-progress message */
  onCancel?: () => void;
  /** Currently selected agent (shown as indicator) */
  agentId?: ArenaAgentId | null;
  /** Whether the AI is generating a response */
  isLoading?: boolean;
  /** Whether the AI is actively streaming tokens */
  isStreaming?: boolean;
  /** Input placeholder text */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// Agent icon mapping
// ============================================================================

const AGENT_ICON_MAP: Record<string, React.ReactNode> = {
  [ARENA_AGENT_IDS.WAVE_CLIENT]: <Zap size={14} className="text-violet-400" />,
  [ARENA_AGENT_IDS.WEB_EXPERT]: <Globe size={14} className="text-emerald-400" />,
};

// ============================================================================
// Main Component
// ============================================================================

export function ArenaInputBar({
  commands,
  onSend,
  onCancel,
  agentId,
  isLoading = false,
  isStreaming = false,
  placeholder = 'Ask anything…',
  className,
}: ArenaInputBarProps): React.ReactElement {
  const [input, setInput] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [activeCommand, setActiveCommand] = useState<ArenaCommand | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const agentDef = agentId ? getAgentDefinition(agentId) : null;

  // ---- Filter commands based on input after "/" --------------------
  const filteredCommands = useMemo(() => {
    if (!input.startsWith('/')) return commands;
    const query = input.slice(1).toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.id.toLowerCase().includes(query) ||
        cmd.label.toLowerCase().includes(query),
    );
  }, [input, commands]);

  // ---- Show / hide command palette --------------------------------
  useEffect(() => {
    if (input.startsWith('/') && !activeCommand) {
      setShowCommands(true);
      setSelectedCommandIndex(0);
    } else if (!input.startsWith('/')) {
      setShowCommands(false);
    }
  }, [input, activeCommand]);

  // ---- Quick-action commands (first 4 for current agent) ----------
  const quickCommands = useMemo(() => commands.slice(0, 4), [commands]);

  // ---- Keyboard navigation ----------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showCommands && filteredCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedCommandIndex((prev) =>
            prev < filteredCommands.length - 1 ? prev + 1 : 0,
          );
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedCommandIndex((prev) =>
            prev > 0 ? prev - 1 : filteredCommands.length - 1,
          );
        } else if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          const cmd = filteredCommands[selectedCommandIndex];
          if (cmd) selectCommand(cmd);
        } else if (e.key === 'Escape') {
          setShowCommands(false);
        }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showCommands, filteredCommands, selectedCommandIndex, input, activeCommand, isLoading],
  );

  // ---- Command selection ------------------------------------------
  const selectCommand = (cmd: ArenaCommand) => {
    setActiveCommand(cmd);
    setInput('');
    setShowCommands(false);
    textareaRef.current?.focus();
  };

  const clearCommand = () => {
    setActiveCommand(null);
    setInput('');
    textareaRef.current?.focus();
  };

  // ---- Send -------------------------------------------------------
  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    let command: ArenaCommandId | undefined;
    let message = trimmed;

    if (activeCommand) {
      command = activeCommand.id;
    } else {
      // Auto-detect command from input prefix
      const matched = commands.find((cmd) =>
        trimmed.toLowerCase().startsWith(cmd.id.toLowerCase()),
      );
      if (matched) {
        command = matched.id;
        message = trimmed.substring(matched.id.length).trim();
      }
    }

    onSend(message || command || '', command);
    setInput('');
    setActiveCommand(null);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // ---- Auto-resize ------------------------------------------------
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  // ---- Quick action click -----------------------------------------
  const handleQuickCommand = (cmd: ArenaCommand) => {
    // If the command has a placeholder, select it; otherwise just send it
    if (cmd.placeholder) {
      selectCommand(cmd);
    } else {
      onSend(cmd.id, cmd.id);
    }
  };

  const busy = isLoading || isStreaming;

  return (
    <div
      className={cn(
        'border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900',
        className,
      )}
    >
      {/* Quick-action chips (only when input is empty and no active chat) */}
      {!busy && !input && !activeCommand && quickCommands.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-1 overflow-x-auto">
          {quickCommands.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              onClick={() => handleQuickCommand(cmd)}
              className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Command size={10} />
              {cmd.label}
            </button>
          ))}
        </div>
      )}

      {/* Command Palette popover */}
      {showCommands && filteredCommands.length > 0 && (
        <div className="mx-4 mb-2 max-h-52 overflow-y-auto bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-lg">
          <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-700">
            <p className="text-[10px] text-slate-400 flex items-center gap-1 uppercase tracking-wide font-semibold">
              <Command size={10} />
              Commands
            </p>
          </div>
          <div className="p-1">
            {filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                type="button"
                onClick={() => selectCommand(cmd)}
                className={cn(
                  'w-full flex items-start gap-2 px-3 py-2 rounded-md text-left transition-colors',
                  idx === selectedCommandIndex
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50',
                )}
              >
                <code className="text-xs font-mono text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5">
                  {cmd.id}
                </code>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    {cmd.label}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {cmd.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active command badge */}
      {activeCommand && (
        <div className="flex items-center gap-2 px-4 pt-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
            {activeCommand.id}
            <button
              type="button"
              onClick={clearCommand}
              className="ml-0.5 text-blue-500 hover:text-blue-700 dark:hover:text-blue-100"
              aria-label="Clear command"
            >
              <X size={10} />
            </button>
          </span>
          <span className="text-[10px] text-slate-400 truncate">
            {activeCommand.description}
          </span>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 px-4 py-3">
        {/* Agent indicator */}
        {agentDef && (
          <div
            className="flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            title={agentDef.label}
          >
            {AGENT_ICON_MAP[agentId ?? ''] ?? <Cpu size={14} />}
          </div>
        )}

        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={activeCommand?.placeholder ?? placeholder}
            disabled={busy}
            rows={1}
            className={cn(
              'w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl resize-none',
              'focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500',
              'text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500',
              busy && 'opacity-50 cursor-not-allowed',
            )}
          />
          {input.length > 0 && (
            <span className="absolute right-2 bottom-2 text-[10px] text-slate-300 dark:text-slate-600">
              {input.length}
            </span>
          )}
        </div>

        {/* Send / Stop button */}
        {isStreaming && onCancel ? (
          <SecondaryButton
            onClick={onCancel}
            size="icon"
            className="h-9 w-9 flex-shrink-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            aria-label="Stop generating"
          >
            <StopCircle size={18} />
          </SecondaryButton>
        ) : (
          <PrimaryButton
            onClick={handleSend}
            disabled={busy || !input.trim()}
            size="icon"
            className={cn(
              'h-9 w-9 flex-shrink-0',
              !(input.trim() && !busy) && 'opacity-40 cursor-not-allowed',
            )}
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </PrimaryButton>
        )}
      </div>

      {/* Bottom hint */}
      <div className="flex items-center justify-between px-4 pb-2 text-[10px] text-slate-400">
        <span>
          <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[9px]">/</kbd>{' '}
          commands · <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[9px]">↵</kbd>{' '}
          send · <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[9px]">⇧↵</kbd>{' '}
          newline
        </span>
        {agentDef && (
          <span className="text-slate-300 dark:text-slate-600">
            {agentDef.label}
          </span>
        )}
      </div>
    </div>
  );
}

export default ArenaInputBar;
