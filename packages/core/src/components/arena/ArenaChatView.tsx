/**
 * ArenaChatView Component
 * 
 * Displays the chat interface with messages and input.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Globe, Zap, User, Bot, ExternalLink, AlertCircle, Cpu, HelpCircle } from 'lucide-react';
import { cn } from '../../utils/styling';
import type { ArenaSession, ArenaMessage, ArenaMessageSource, ArenaCommandId, ArenaChatBlock } from '../../types/arena';
import type { ArenaStreamState } from '../../types/arenaStreaming';
import { ARENA_COMMAND_DEFINITIONS } from '../../types/arena';
import { ARENA_AGENT_IDS, getAgentDefinition } from '../../config/arenaConfig';
import type { ArenaAgentId } from '../../config/arenaConfig';
import { SecondaryButton } from '../ui/SecondaryButton';
import ArenaInputBar from './ArenaInputBar';
import { ArenaBlockRenderer, MarkdownRenderer } from './blocks';
import type { BlockCallbacks } from './blocks/ArenaBlockRenderer';

// ============================================================================
// Types
// ============================================================================

export interface ArenaChatViewProps {
  session: ArenaSession;
  messages: ArenaMessage[];
  streamingContent: string;
  streamState: ArenaStreamState;
  onSendMessage: (content: string, command?: ArenaCommandId) => void;
  onCancelMessage: () => void;
  /** Optional callbacks for interactive block components */
  blockCallbacks?: BlockCallbacks;
  /** Estimated word count for the current session (passed to input bar context circle) */
  contextWords?: number;
}

// ============================================================================
// Component
// ============================================================================

export function ArenaChatView({
  session,
  messages,
  streamingContent,
  streamState,
  onSendMessage,
  onCancelMessage,
  blockCallbacks,
  contextWords,
}: ArenaChatViewProps): React.ReactElement {
  /** Stop button is shown while actively connecting or streaming. */
  const isActive = streamState === 'connecting' || streamState === 'streaming';
  /** Whether the input bar should be blocked (connecting or streaming). */
  const isBusy = isActive;

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

  // Suggested command state — populated when user clicks a command chip
  const [suggestedCommand, setSuggestedCommand] = useState<typeof ARENA_COMMAND_DEFINITIONS[number] | undefined>(undefined);
  const [suggestCommandKey, setSuggestCommandKey] = useState(0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isActive && (
          <ArenaWelcomeMessage
            agentName={agentName}
            agentIcon={<AgentIcon size={24} className={agentColor} />}
            agentId={session.agent}
            commands={agentCommands}
            onExampleClick={(q) => {
              setSuggestedInput(q);
              setSuggestKey(k => k + 1);
            }}
            onCommandClick={(cmd) => {
              const cmdDef = agentCommands.find(c => c.id === cmd);
              if (cmdDef) {
                setSuggestedCommand(cmdDef);
                setSuggestCommandKey(k => k + 1);
              }
            }}
          />
        )}

        {messages.map((message) => (
          <ArenaMessageBubble
            key={message.id}
            message={message}
            // Pass the full lifecycle state only to the actively streaming message;
            // all other messages receive undefined so they render statically.
            streamState={message.status === 'streaming' ? streamState : undefined}
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
        isBusy={isBusy}
        placeholder={`Ask ${agentName}… (Type / for commands)`}
        suggestedInput={suggestedInput}
        suggestKey={suggestKey}
        suggestedCommand={suggestedCommand}
        suggestCommandKey={suggestCommandKey}
        contextWords={contextWords}
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
  // Show agent-specific command chips (filter by current agent, exclude universal)
  const agentSpecificCommands = commands.filter(cmd => !cmd.universal && cmd.agent === agentId);

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

/**
 * Props for ArenaMessageBubble.
 *
 * `streamState` is set only on the message that is actively streaming
 * (`message.status === 'streaming'`).  All other messages receive `undefined`
 * and render as static content.
 */
interface ArenaMessageBubbleProps {
  message: ArenaMessage;
  /** Full lifecycle state for the active streaming message; undefined for static messages. */
  streamState?: ArenaStreamState;
  streamingContent?: string;
  blockCallbacks?: BlockCallbacks;
}

function ArenaMessageBubble({
  message,
  streamState,
  streamingContent,
  blockCallbacks,
}: ArenaMessageBubbleProps): React.ReactElement {
  const isUser = message.role === 'user';
  // Show live content from the stream while streaming; fall back to persisted message content.
  const content = streamState === 'streaming' ? (streamingContent ?? '') : message.content;

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

              {/* Fallback: render markdown content */}
              {!hasBlocks && <MarkdownRenderer content={content} streaming={streamState === 'streaming'} />}

              {/* Connecting indicator: pulsing ring + label (before first chunk arrives) */}
              {streamState === 'connecting' && (
                <div className="flex items-center gap-2 py-1">
                  <div className="relative flex items-center justify-center w-4 h-4">
                    <span className="absolute inline-flex w-full h-full rounded-full bg-slate-400 dark:bg-slate-500 animate-ping opacity-50" />
                    <span className="relative inline-flex w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-pulse" />
                  </div>
                  <span className="text-xs text-slate-400">Connecting…</span>
                </div>
              )}
              {/* Streaming indicator:
                  - No content yet → bouncing dots ("thinking" animation)
                  - Content is arriving → inline cursor after the text */}
              {streamState === 'streaming' && !content && (
                <div className="flex items-center gap-1 py-1">
                  <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce" />
                </div>
              )}
              {streamState === 'streaming' && content && (
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
