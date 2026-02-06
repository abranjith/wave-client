/**
 * ArenaChatView Component
 * 
 * Displays the chat interface with messages and input.
 */

import React, { useRef, useEffect } from 'react';
import { BookOpen, MessageSquare, User, Bot, ExternalLink, Loader2, Square, AlertCircle } from 'lucide-react';
import { cn } from '../../utils/styling';
import type { ArenaSession, ArenaMessage, ArenaMessageSource, ArenaCommandId } from '../../types/arena';
import { ARENA_AGENTS, ARENA_COMMAND_DEFINITIONS } from '../../types/arena';
import ArenaChatInput from './ArenaChatInput';

// ============================================================================
// Types
// ============================================================================

export interface ArenaChatViewProps {
  session: ArenaSession;
  messages: ArenaMessage[];
  streamingContent: string;
  isStreaming: boolean;
  onSendMessage: (content: string, command?: ArenaCommandId) => void;
  onCancelMessage: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ArenaChatView({
  session,
  messages,
  streamingContent,
  isStreaming,
  onSendMessage,
  onCancelMessage,
}: ArenaChatViewProps): React.ReactElement {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const AgentIcon = session.agent === ARENA_AGENTS.LEARN ? BookOpen : MessageSquare;
  const agentColor = session.agent === ARENA_AGENTS.LEARN ? 'text-green-500' : 'text-purple-500';
  const agentName = session.agent === ARENA_AGENTS.LEARN ? 'Learn Agent' : 'Discover Agent';

  // Get commands for this agent
  const agentCommands = ARENA_COMMAND_DEFINITIONS.filter(cmd => cmd.agent === session.agent);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <AgentIcon size={20} className={agentColor} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {session.title}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{agentName}</p>
        </div>
        {isStreaming && (
          <button
            onClick={onCancelMessage}
            className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
          >
            <Square size={12} />
            Stop
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <ArenaWelcomeMessage
            agentName={agentName}
            agentIcon={<AgentIcon size={24} className={agentColor} />}
            commands={agentCommands}
            onCommandClick={(cmd) => onSendMessage(`${cmd} `)}
          />
        )}

        {messages.map((message) => (
          <ArenaMessageBubble
            key={message.id}
            message={message}
            isStreaming={isStreaming && message.status === 'streaming'}
            streamingContent={message.status === 'streaming' ? streamingContent : undefined}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ArenaChatInput
        commands={agentCommands}
        onSend={onSendMessage}
        isLoading={isStreaming}
        placeholder={`Ask ${agentName}...`}
      />
    </div>
  );
}

// ============================================================================
// Welcome Message
// ============================================================================

interface ArenaWelcomeMessageProps {
  agentName: string;
  agentIcon: React.ReactNode;
  commands: typeof ARENA_COMMAND_DEFINITIONS;
  onCommandClick: (command: string) => void;
}

function ArenaWelcomeMessage({
  agentName,
  agentIcon,
  commands,
  onCommandClick,
}: ArenaWelcomeMessageProps): React.ReactElement {
  return (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
        {agentIcon}
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        Chat with {agentName}
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
        {agentName === 'Learn Agent'
          ? 'Ask questions about HTTP, REST, WebSocket, GraphQL, and other web technologies.'
          : 'Get help with Wave Client features, collections, environments, flows, and tests.'}
      </p>

      {/* Quick Commands */}
      <div className="flex flex-wrap justify-center gap-2">
        {commands.slice(0, 4).map((cmd) => (
          <button
            key={cmd.id}
            onClick={() => onCommandClick(cmd.id)}
            className="px-3 py-1.5 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            {cmd.id}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Message Bubble
// ============================================================================

interface ArenaMessageBubbleProps {
  message: ArenaMessage;
  isStreaming?: boolean;
  streamingContent?: string;
}

function ArenaMessageBubble({
  message,
  isStreaming,
  streamingContent,
}: ArenaMessageBubbleProps): React.ReactElement {
  const isUser = message.role === 'user';
  const content = isStreaming ? (streamingContent || '') : message.content;

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser
            ? 'bg-blue-100 dark:bg-blue-900/30'
            : 'bg-slate-100 dark:bg-slate-800'
        )}
      >
        {isUser ? (
          <User size={16} className="text-blue-600 dark:text-blue-400" />
        ) : (
          <Bot size={16} className="text-slate-600 dark:text-slate-400" />
        )}
      </div>

      {/* Content */}
      <div className={cn('flex-1 max-w-[80%]', isUser && 'flex flex-col items-end')}>
        {/* Command badge */}
        {message.command && (
          <span className="text-xs font-mono text-blue-600 dark:text-blue-400 mb-1">
            {message.command}
          </span>
        )}

        {/* Message content */}
        <div
          className={cn(
            'px-4 py-2 rounded-lg text-sm',
            isUser
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
          )}
        >
          {message.status === 'error' ? (
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle size={16} />
              <span>{message.error || 'An error occurred'}</span>
            </div>
          ) : (
            <>
              {/* Render markdown-like content */}
              <MessageContent content={content} />

              {/* Streaming indicator */}
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-slate-600 dark:bg-slate-400 animate-pulse ml-1" />
              )}
            </>
          )}
        </div>

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.sources.map((source, idx) => (
              <SourceBadge key={idx} source={source} />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <p className="text-xs text-slate-400 mt-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Message Content (simple markdown rendering)
// ============================================================================

interface MessageContentProps {
  content: string;
}

function MessageContent({ content }: MessageContentProps): React.ReactElement {
  // Simple markdown-like rendering
  const lines = content.split('\n');

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {lines.map((line, idx) => {
        // Code blocks
        if (line.startsWith('```')) {
          return null; // Simplified - would need proper code block handling
        }

        // Headers
        if (line.startsWith('### ')) {
          return <h3 key={idx} className="text-base font-semibold mt-2">{line.substring(4)}</h3>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={idx} className="text-lg font-semibold mt-2">{line.substring(3)}</h2>;
        }
        if (line.startsWith('# ')) {
          return <h1 key={idx} className="text-xl font-bold mt-2">{line.substring(2)}</h1>;
        }

        // Bullet points
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return <li key={idx} className="ml-4">{line.substring(2)}</li>;
        }

        // Empty lines
        if (line.trim() === '') {
          return <br key={idx} />;
        }

        // Regular text with inline code
        const parts = line.split(/`([^`]+)`/);
        return (
          <p key={idx}>
            {parts.map((part, i) =>
              i % 2 === 1 ? (
                <code key={i} className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs">
                  {part}
                </code>
              ) : (
                part
              )
            )}
          </p>
        );
      })}
    </div>
  );
}

// ============================================================================
// Source Badge
// ============================================================================

interface SourceBadgeProps {
  source: ArenaMessageSource;
}

function SourceBadge({ source }: SourceBadgeProps): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
      {source.url ? (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-blue-600"
        >
          {source.title}
          <ExternalLink size={10} />
        </a>
      ) : (
        source.title
      )}
    </span>
  );
}

export default ArenaChatView;
