/**
 * ArenaChatView Component
 * 
 * Displays the chat interface with messages and input.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Globe, Zap, User, Bot, ExternalLink, Square, AlertCircle, Cpu, HelpCircle } from 'lucide-react';
import { cn } from '../../utils/styling';
import type { ArenaSession, ArenaMessage, ArenaMessageSource, ArenaCommandId, ArenaChatBlock } from '../../types/arena';
import { ARENA_COMMAND_DEFINITIONS } from '../../types/arena';
import { ARENA_AGENT_IDS, getAgentDefinition } from '../../config/arenaConfig';
import type { ArenaAgentId } from '../../config/arenaConfig';
import { SecondaryButton } from '../ui/SecondaryButton';
import ArenaInputBar from './ArenaInputBar';
import { ArenaBlockRenderer } from './blocks';
import type { BlockCallbacks } from './blocks/ArenaBlockRenderer';

// ============================================================================
// Types
// ============================================================================

export interface ArenaChatViewProps {
  session: ArenaSession;
  messages: ArenaMessage[];
  streamingContent: string;
  isStreaming: boolean;
  isLoading?: boolean;
  onSendMessage: (content: string, command?: ArenaCommandId) => void;
  onCancelMessage: () => void;
  /** Optional callbacks for interactive block components */
  blockCallbacks?: BlockCallbacks;
}

// ============================================================================
// Component
// ============================================================================

export function ArenaChatView({
  session,
  messages,
  streamingContent,
  isStreaming,
  isLoading,
  onSendMessage,
  onCancelMessage,
  blockCallbacks,
}: ArenaChatViewProps): React.ReactElement {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    [ARENA_AGENT_IDS.WAVE_CLIENT]: Zap,
    [ARENA_AGENT_IDS.WEB_EXPERT]: Globe,
  };
  const agentDef = getAgentDefinition(session.agent as ArenaAgentId);
  const AgentIcon = ICON_MAP[session.agent] ?? Cpu;
  const agentColor = agentDef?.iconColor ?? 'text-blue-500';
  const agentName = agentDef?.label ?? 'AI Agent';

  // Memoised block callbacks for message rendering
  const mergedBlockCallbacks: BlockCallbacks = useCallback(() => blockCallbacks ?? {}, [blockCallbacks])() as unknown as BlockCallbacks;

  // Get commands for this agent, including universal commands (e.g. /help)
  const agentCommands = ARENA_COMMAND_DEFINITIONS.filter(
    cmd => cmd.agent === session.agent || cmd.universal === true,
  );

  // Suggested input state — populated when user clicks an example question chip
  const [suggestedInput, setSuggestedInput] = useState('');
  const [suggestKey, setSuggestKey] = useState(0);

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
          <SecondaryButton
            size="sm"
            onClick={onCancelMessage}
            colorTheme="error"
          >
            <Square size={12} />
            Stop
          </SecondaryButton>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <ArenaWelcomeMessage
            agentName={agentName}
            agentIcon={<AgentIcon size={24} className={agentColor} />}
            agentId={session.agent}
            commands={agentCommands}
            onExampleClick={(q) => {
              setSuggestedInput(q);
              setSuggestKey(k => k + 1);
            }}
            onCommandClick={(cmd) => onSendMessage(`${cmd} `)}
          />
        )}

        {messages.map((message) => (
          <ArenaMessageBubble
            key={message.id}
            message={message}
            isStreaming={isStreaming && message.status === 'streaming'}
            streamingContent={message.status === 'streaming' ? streamingContent : undefined}
            blockCallbacks={mergedBlockCallbacks}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ArenaInputBar
        commands={agentCommands}
        onSend={onSendMessage}
        onCancel={onCancelMessage}
        agentId={session.agent as ArenaAgentId}
        isLoading={isLoading}
        isStreaming={isStreaming}
        placeholder={`Ask ${agentName}…`}
        suggestedInput={suggestedInput}
        suggestKey={suggestKey}
      />
    </div>
  );
}

// ============================================================================
// Welcome Message
// ============================================================================

// ============================================================================
// Agent example questions shown on the welcome screen
// ============================================================================

const AGENT_EXAMPLE_QUESTIONS: Record<string, readonly string[]> = {
  [ARENA_AGENT_IDS.WAVE_CLIENT]: [
    'How do I set up an environment for staging?',
    'Create a new collection from an OpenAPI spec',
    'Run my test suite and show the results',
  ],
  [ARENA_AGENT_IDS.WEB_EXPERT]: [
    'Explain HTTP/2 server push and when to use it',
    'How does OAuth 2.0 PKCE differ from the standard code flow?',
    'Compare REST vs GraphQL for mobile clients',
  ],
};

interface ArenaWelcomeMessageProps {
  agentName: string;
  agentIcon: React.ReactNode;
  agentId: string;
  commands: typeof ARENA_COMMAND_DEFINITIONS;
  onExampleClick: (question: string) => void;
  onCommandClick: (command: string) => void;
}

function ArenaWelcomeMessage({
  agentName,
  agentIcon,
  agentId,
  commands,
  onExampleClick,
  onCommandClick,
}: ArenaWelcomeMessageProps): React.ReactElement {
  const examples = AGENT_EXAMPLE_QUESTIONS[agentId] ?? [];
  // Only show command chips for wave-client (web-expert has no agent-specific commands)
  const agentSpecificCommands = commands.filter(cmd => !cmd.universal);

  return (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
        {agentIcon}
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        Chat with {agentName}
      </h3>

      {/* Example question chips */}
      {examples.length > 0 && (
        <div className="flex flex-col items-center gap-2 mb-6">
          {examples.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onExampleClick(question)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-full border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors max-w-sm text-left"
            >
              <HelpCircle size={14} className="flex-shrink-0 text-slate-400" />
              {question}
            </button>
          ))}
        </div>
      )}

      {/* Quick Commands — wave-client only */}
      {agentSpecificCommands.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-2">Quick commands</p>
          <div className="flex flex-wrap justify-center gap-2">
            {agentSpecificCommands.slice(0, 4).map((cmd) => (
              <SecondaryButton
                key={cmd.id}
                size="sm"
                onClick={() => onCommandClick(cmd.id)}
                className="rounded-full font-mono"
              >
                {cmd.id}
              </SecondaryButton>
            ))}
          </div>
        </div>
      )}
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
  blockCallbacks?: BlockCallbacks;
}

function ArenaMessageBubble({
  message,
  isStreaming,
  streamingContent,
  blockCallbacks,
}: ArenaMessageBubbleProps): React.ReactElement {
  const isUser = message.role === 'user';
  const content = isStreaming ? (streamingContent || '') : message.content;

  /** True if the message has structured block content to render */
  const hasBlocks = message.blocks && message.blocks.length > 0;

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
      <div className={cn('flex-1 max-w-[88%]', isUser && 'flex flex-col items-end')}>
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
              {/* Structured block content (takes precedence) */}
              {hasBlocks && (
                <div className="space-y-2">
                  {message.blocks!.map((block: ArenaChatBlock, idx: number) => (
                    <ArenaBlockRenderer
                      key={idx}
                      block={block}
                      callbacks={blockCallbacks ?? {}}
                    />
                  ))}
                </div>
              )}

              {/* Fallback: plain text / markdown content */}
              {!hasBlocks && <MessageContent content={content} />}

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
