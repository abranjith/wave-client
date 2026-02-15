/**
 * ArenaWelcomeScreen Component
 *
 * Full-height landing page displayed when the Arena has no active session.
 * Allows the user to pick an agent and start chatting immediately.
 *
 * Layout:
 *   - Central hero with gradient background
 *   - Agent selection cards
 *   - Optional quick-start prompt presets
 */

import React from 'react';
import { Globe, Zap, Cpu, ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '../../utils/styling';
import { SecondaryButton } from '../ui/SecondaryButton';
import { ARENA_AGENT_DEFINITIONS, ARENA_AGENT_IDS } from '../../config/arenaConfig';
import type { ArenaAgentId } from '../../config/arenaConfig';

// ============================================================================
// Types
// ============================================================================

export interface ArenaWelcomeScreenProps {
  /** Called when the user picks an agent */
  onSelectAgent: (agentId: ArenaAgentId) => void;
  /** Optional additional CSS classes */
  className?: string;
}

// ============================================================================
// Icon mapping
// ============================================================================

const ICON_MAP: Record<string, React.ReactNode> = {
  [ARENA_AGENT_IDS.WAVE_CLIENT]: <Zap size={28} className="text-violet-400" />,
  [ARENA_AGENT_IDS.WEB_EXPERT]: <Globe size={28} className="text-emerald-400" />,
};

const COLOR_MAP: Record<string, string> = {
  [ARENA_AGENT_IDS.WAVE_CLIENT]: 'from-violet-500/10 to-violet-500/5 border-violet-300/30 dark:border-violet-700/30 hover:border-violet-400/60 dark:hover:border-violet-500/60',
  [ARENA_AGENT_IDS.WEB_EXPERT]: 'from-emerald-500/10 to-emerald-500/5 border-emerald-300/30 dark:border-emerald-700/30 hover:border-emerald-400/60 dark:hover:border-emerald-500/60',
};

// ============================================================================
// Quick start prompts (per agent)
// ============================================================================

const QUICK_STARTS: Record<string, string[]> = {
  [ARENA_AGENT_IDS.WAVE_CLIENT]: [
    'Create a new collection from an OpenAPI spec',
    'Generate auth headers for my API',
    'Help me debug a failing request',
    'Set up an environment for staging',
  ],
  [ARENA_AGENT_IDS.WEB_EXPERT]: [
    'Explain HTTP/2 server push',
    'Compare REST vs GraphQL for mobile',
    'How does OAuth 2.0 PKCE work?',
    'What are WebSocket sub-protocols?',
  ],
};

// ============================================================================
// Component
// ============================================================================

export function ArenaWelcomeScreen({
  onSelectAgent,
  className,
}: ArenaWelcomeScreenProps): React.ReactElement {
  return (
    <div
      className={cn(
        'flex-1 flex flex-col items-center justify-center px-6 py-10 overflow-y-auto',
        'bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950',
        className,
      )}
    >
      {/* Hero */}
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={20} className="text-amber-400" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Wave Arena
        </h1>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md text-center mb-8">
        Your AI-powered assistant for API development and web technologies.
        Choose an agent to get started.
      </p>

      {/* Agent cards */}
      <div className="grid gap-4 w-full max-w-lg">
        {ARENA_AGENT_DEFINITIONS.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => onSelectAgent(agent.id)}
            className={cn(
              'group flex items-start gap-4 p-4 rounded-xl border bg-gradient-to-br transition-all duration-200 text-left',
              COLOR_MAP[agent.id] ?? 'from-slate-500/10 to-slate-500/5 border-slate-300/30',
            )}
          >
            {/* Icon */}
            <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
              {ICON_MAP[agent.id] ?? <Cpu size={28} />}
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-0.5 flex items-center gap-2">
                {agent.label}
                <ArrowRight
                  size={14}
                  className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 text-slate-400"
                />
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {agent.description}
              </p>

              {/* Quick starts */}
              {QUICK_STARTS[agent.id] && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {QUICK_STARTS[agent.id].slice(0, 2).map((prompt, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-600/50"
                    >
                      {prompt}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Footer tip */}
      <p className="mt-8 text-[10px] text-slate-400 text-center">
        Type <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[9px]">/</kbd> in the chat for slash commands
      </p>
    </div>
  );
}

export default ArenaWelcomeScreen;
