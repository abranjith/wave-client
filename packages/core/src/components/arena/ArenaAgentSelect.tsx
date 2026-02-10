/**
 * ArenaAgentSelect Component
 *
 * Agent selection page shown when the user first opens Arena or
 * navigates back from a chat session. Displays the three agents
 * (learn-web, learn-docs, wave-client) as a compact list with
 * icon, name and description.
 */

import React from 'react';
import { Globe, FileText, Zap, ArrowRight } from 'lucide-react';
import { cn } from '../../utils/styling';
import { SecondaryButton } from '../ui/SecondaryButton';
import { ARENA_AGENT_DEFINITIONS } from '../../config/arenaConfig';
import type { ArenaAgentId, ArenaAgentDefinition } from '../../config/arenaConfig';

// ============================================================================
// Icon resolver
// ============================================================================

const ICON_MAP = {
  Globe,
  FileText,
  Zap,
} as const;

function AgentIcon({ name, className }: { name: ArenaAgentDefinition['iconName']; className?: string }) {
  const Icon = ICON_MAP[name];
  return <Icon size={22} className={className} />;
}

// ============================================================================
// Types
// ============================================================================

export interface ArenaAgentSelectProps {
  /** Called when the user picks an agent */
  onSelectAgent: (agentId: ArenaAgentId) => void;
  /** Optional CSS class name */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ArenaAgentSelect({ onSelectAgent, className }: ArenaAgentSelectProps): React.ReactElement {
  return (
    <div className={cn('flex flex-col items-center justify-center h-full px-6 py-10', className)}>
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
          Choose an Agent
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
          Select an AI agent to start a conversation. Each agent is specialised for a different task.
        </p>
      </div>

      {/* Agent list */}
      <div className="w-full max-w-md space-y-2">
        {ARENA_AGENT_DEFINITIONS.map((agent) => (
          <SecondaryButton
            key={agent.id}
            onClick={() => onSelectAgent(agent.id)}
            className={cn(
              'group w-full justify-start gap-4 px-4 py-3.5 rounded-lg border transition-all text-left h-auto',
              'border-slate-200 dark:border-slate-700',
              'text-slate-900 dark:text-slate-100',
              'hover:border-blue-400 dark:hover:border-blue-500',
              'hover:bg-blue-50/50 dark:hover:bg-blue-900/20',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            )}
          >
            {/* Icon */}
            <div
              className={cn(
                'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                'bg-slate-100 dark:bg-slate-800 group-hover:bg-white dark:group-hover:bg-slate-700',
              )}
            >
              <AgentIcon name={agent.iconName} className={agent.iconColor} />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {agent.label}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                {agent.description}
              </p>
            </div>

            {/* Arrow */}
            <ArrowRight
              size={16}
              className="flex-shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors"
            />
          </SecondaryButton>
        ))}
      </div>
    </div>
  );
}

export default ArenaAgentSelect;
