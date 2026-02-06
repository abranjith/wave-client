/**
 * ArenaSessionList Component
 * 
 * Displays a list of chat sessions in the sidebar.
 */

import React from 'react';
import { MessageSquare, BookOpen, Trash2, Loader2 } from 'lucide-react';
import { cn } from '../../utils/styling';
import type { ArenaSession } from '../../types/arena';
import { ARENA_AGENTS } from '../../types/arena';

// ============================================================================
// Types
// ============================================================================

export interface ArenaSessionListProps {
  sessions: ArenaSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  isLoading?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ArenaSessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  isLoading,
}: ArenaSessionListProps): React.ReactElement {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No chat sessions yet.
        </p>
      </div>
    );
  }

  // Sort sessions by most recent
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="p-2 space-y-1">
      {sortedSessions.map((session) => (
        <ArenaSessionItem
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          onSelect={() => onSelectSession(session.id)}
          onDelete={() => onDeleteSession(session.id)}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Session Item
// ============================================================================

interface ArenaSessionItemProps {
  session: ArenaSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function ArenaSessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
}: ArenaSessionItemProps): React.ReactElement {
  const [showDelete, setShowDelete] = React.useState(false);

  const AgentIcon = session.agent === ARENA_AGENTS.LEARN ? BookOpen : MessageSquare;
  const agentColor = session.agent === ARENA_AGENTS.LEARN ? 'text-green-500' : 'text-purple-500';

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors',
        isActive
          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
      )}
      onClick={onSelect}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <AgentIcon size={16} className={cn('flex-shrink-0', agentColor)} />
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{session.title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {formatDate(session.updatedAt)} · {session.messageCount} messages
        </p>
      </div>
      
      {showDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
          title="Delete session"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

export default ArenaSessionList;
