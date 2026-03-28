/**
 * ArenaInputBar Component
 *
 * Modern chat input bar for the Arena experience. Sits at the bottom of the
 * main chat column and provides:
 *
 *   - Auto-resizing textarea with Shift+Enter for newlines
 *   - Active command badge with clear button (set via quick-action chips or /command prefix)
 *   - Slash-command autocomplete dropdown when user types `/`
 *   - Quick-action buttons for common commands
 *   - Character count and keyboard hints
 *   - Loading / streaming state awareness
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Loader2, X, StopCircle } from 'lucide-react';
import ContextCircle from './ContextCircle';
import { cn } from '../../utils/styling';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import type { ArenaCommandId, ArenaCommand } from '../../types/arena';
import type { ArenaAgentId } from '../../config/arenaConfig';

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
  /**
   * Whether the input bar is in a busy state (agent is connecting or streaming).
   * When `true`: textarea is disabled, send button is dimmed, Enter is suppressed,
   * and the stop button is shown if `onCancel` is provided.
   */
  isBusy?: boolean;
  /** Input placeholder text */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
  /** Text to pre-populate the input (from example question chips) */
  suggestedInput?: string;
  /**
   * Increment this key each time `suggestedInput` is set so the same
   * suggestion can be applied twice in a row (avoids stale dependency trap).
   */
  suggestKey?: number;
  /** Command to pre-select in the input bar (from welcome screen command chips) */
  suggestedCommand?: ArenaCommand;
  /**
   * Increment this key each time `suggestedCommand` is set so the same
   * command can be applied twice in a row.
   */
  suggestCommandKey?: number;
  /** Estimated word count for the current session (drives the context circle) */
  contextWords?: number;
  /** Context budget in words (default 150 000) */
  contextBudget?: number;
}

// ============================================================================
// Main Component
// ============================================================================

export function ArenaInputBar({
  commands,
  onSend,
  onCancel,
  agentId,
  isBusy = false,
  placeholder = 'Type / for commands…',
  className,
  suggestedInput,
  suggestKey,
  suggestedCommand,
  suggestCommandKey,
  contextWords,
  contextBudget,
}: ArenaInputBarProps): React.ReactElement {
  const [input, setInput] = useState('');
  const [activeCommand, setActiveCommand] = useState<ArenaCommand | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ---- Command autocomplete state ---------------------------------
  const [showCommandDropdown, setShowCommandDropdown] = useState(false);
  /** Index of the highlighted item in the filtered command list (-1 = none) */
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /** Filtered commands based on the current `/` prefix typed by the user */
  const filteredCommands = useMemo(() => {
    if (!showCommandDropdown) return [];
    // Extract the slash prefix (e.g. "/col" from "/col some text")
    const slashMatch = input.match(/^\/(\S*)$/);
    if (!slashMatch) return [];
    const query = slashMatch[1].toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.id.toLowerCase().includes(query) ||
        cmd.label.toLowerCase().includes(query),
    );
  }, [input, commands, showCommandDropdown]);

  // Show dropdown when input starts with `/` and no command is active
  useEffect(() => {
    const shouldShow = !activeCommand && /^\/\S*$/.test(input);
    setShowCommandDropdown(shouldShow);
    if (shouldShow) {
      setHighlightedIndex(0);
    }
  }, [input, activeCommand]);

  // Sync suggested input into the textarea whenever suggestKey increments
  useEffect(() => {
    if (suggestedInput) {
      setInput(suggestedInput);
      // Reset textarea auto-height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        textareaRef.current.focus();
      }
    }
  // suggestKey intentionally included so clicking the same chip twice re-fires the effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestKey]);

  // Sync suggested command into the active command badge
  useEffect(() => {
    if (suggestedCommand) {
      setActiveCommand(suggestedCommand);
      setInput('');
      textareaRef.current?.focus();
    }
  // suggestCommandKey intentionally included so clicking the same chip twice re-fires
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestCommandKey]);

  // ---- Keyboard navigation ----------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Command dropdown navigation
      if (showCommandDropdown && filteredCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedIndex((i) => (i + 1) % filteredCommands.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
          const cmd = filteredCommands[idx];
          if (cmd) {
            selectCommand(cmd);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowCommandDropdown(false);
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, activeCommand, isBusy, showCommandDropdown, filteredCommands, highlightedIndex],
  );

  // ---- Command selection ------------------------------------------
  const selectCommand = (cmd: ArenaCommand) => {
    setActiveCommand(cmd);
    setInput('');
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
    if (!trimmed || busy) return;

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

  const busy = isBusy;

  return (
    <div
      className={cn(
        'border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 relative',
        className,
      )}
    >
      {/* Slash-command autocomplete dropdown */}
      {showCommandDropdown && filteredCommands.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-4 right-4 mb-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden z-10"
        >
          {filteredCommands.map((cmd, idx) => (
            <button
              key={cmd.id}
              type="button"
              onClick={() => selectCommand(cmd)}
              onMouseEnter={() => setHighlightedIndex(idx)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors',
                idx === highlightedIndex
                  ? 'bg-blue-50 dark:bg-blue-900/30'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/50',
              )}
            >
              <span className="font-mono text-blue-600 dark:text-blue-400 text-xs flex-shrink-0">
                {cmd.id}
              </span>
              <span className="text-slate-600 dark:text-slate-400 text-xs truncate">
                {cmd.description}
              </span>
            </button>
          ))}
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
              'w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl resize-none',
              'focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500',
              'text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500',
              'min-h-[88px]',
              busy && 'opacity-50 cursor-not-allowed',
            )}
          />
          {input.length > 0 && (
            <span className="absolute right-2 bottom-2 text-[10px] text-slate-300 dark:text-slate-600">
              {input.length}
            </span>
          )}
        </div>

        {/* Send / Stop button + Context circle — stacked, aligned with the textarea */}
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
          {isBusy && onCancel ? (
            <SecondaryButton
              onClick={onCancel}
              size="icon"
              className="h-9 w-9 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
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
                'h-9 w-9',
                !(input.trim() && !busy) && 'opacity-40 cursor-not-allowed',
              )}
              aria-label="Send message"
            >
              {isBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </PrimaryButton>
          )}
          <ContextCircle currentWords={contextWords ?? 0} budgetWords={contextBudget} className="h-9 w-9" />
        </div>
      </div>

      {/* Bottom row: keyboard hints */}
      <div className="flex items-center px-4 pb-2 text-[10px] text-slate-400">
        <span>
          <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[9px]">/</kbd>{' '}
          commands · <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[9px]">↵</kbd>{' '}
          send · <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[9px]">⇧↵</kbd>{' '}
          newline
        </span>
      </div>
    </div>
  );
}

export default ArenaInputBar;
