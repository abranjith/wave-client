/**
 * ArenaChatInput Component
 * 
 * Chat input with command palette support.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Command, X } from 'lucide-react';
import { cn } from '../../utils/styling';
import type { ArenaCommandId, ArenaCommand } from '../../types/arena';

// ============================================================================
// Types
// ============================================================================

export interface ArenaChatInputProps {
  commands: ArenaCommand[];
  onSend: (content: string, command?: ArenaCommandId) => void;
  isLoading?: boolean;
  placeholder?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ArenaChatInput({
  commands,
  onSend,
  isLoading,
  placeholder = 'Type a message...',
}: ArenaChatInputProps): React.ReactElement {
  const [input, setInput] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [activeCommand, setActiveCommand] = useState<ArenaCommand | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Filter commands based on input
  const filteredCommands = input.startsWith('/')
    ? commands.filter((cmd) =>
        cmd.id.toLowerCase().includes(input.toLowerCase())
      )
    : commands;

  // Show command palette when typing /
  useEffect(() => {
    if (input.startsWith('/') && !activeCommand) {
      setShowCommands(true);
      setSelectedCommandIndex(0);
    } else if (!input.startsWith('/')) {
      setShowCommands(false);
    }
  }, [input, activeCommand]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredCommands[selectedCommandIndex];
        if (cmd) {
          selectCommand(cmd);
        }
      } else if (e.key === 'Escape') {
        setShowCommands(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [showCommands, filteredCommands, selectedCommandIndex]);

  const selectCommand = (cmd: ArenaCommand) => {
    setActiveCommand(cmd);
    setInput('');
    setShowCommands(false);
    inputRef.current?.focus();
  };

  const clearCommand = () => {
    setActiveCommand(null);
    setInput('');
    inputRef.current?.focus();
  };

  const handleSend = () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    // Check if input starts with a command
    let command: ArenaCommandId | undefined;
    let message = trimmedInput;

    if (activeCommand) {
      command = activeCommand.id;
    } else {
      const matchedCommand = commands.find((cmd) =>
        trimmedInput.toLowerCase().startsWith(cmd.id.toLowerCase())
      );
      if (matchedCommand) {
        command = matchedCommand.id;
        message = trimmedInput.substring(matchedCommand.id.length).trim();
      }
    }

    onSend(message || command || '', command);
    setInput('');
    setActiveCommand(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  return (
    <div className="relative border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      {/* Command Palette */}
      {showCommands && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-2 max-h-60 overflow-y-auto bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-lg">
          <div className="p-2 border-b border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Command size={12} />
              Commands
            </p>
          </div>
          <div className="p-1">
            {filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                onClick={() => selectCommand(cmd)}
                className={cn(
                  'w-full flex items-start gap-2 px-3 py-2 rounded text-left transition-colors',
                  idx === selectedCommandIndex
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                )}
              >
                <code className="text-sm font-mono text-blue-600 dark:text-blue-400 flex-shrink-0">
                  {cmd.id}
                </code>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {cmd.label}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {cmd.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active Command Badge */}
      {activeCommand && (
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
            {activeCommand.id}
            <button
              onClick={clearCommand}
              className="ml-1 hover:text-blue-900 dark:hover:text-blue-100"
            >
              <X size={12} />
            </button>
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {activeCommand.description}
          </span>
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={activeCommand?.placeholder || placeholder}
            disabled={isLoading}
            rows={1}
            className={cn(
              'w-full px-4 py-2 pr-12 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              'text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400',
              isLoading && 'opacity-50 cursor-not-allowed'
            )}
          />
          <div className="absolute right-2 bottom-2 text-xs text-slate-400">
            {input.length > 0 && `${input.length}`}
          </div>
        </div>

        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-lg transition-colors',
            input.trim() && !isLoading
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
          )}
        >
          {isLoading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </div>

      {/* Hint */}
      <p className="mt-2 text-xs text-slate-400">
        Type <code className="px-1 bg-slate-200 dark:bg-slate-700 rounded">/</code> for commands, or press Enter to send
      </p>
    </div>
  );
}

export default ArenaChatInput;
