/**
 * ArenaPane Component
 * 
 * Main component for the Wave Arena AI chat experience.
 * Contains the chat interface with sessions, messages, and commands.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { MessageSquare, Plus, Settings, Trash2, Sparkles, BookOpen } from 'lucide-react';
import { cn } from '../../utils/styling';
import { useArenaAdapter, useNotificationAdapter, useAdapterEvent } from '../../hooks/useAdapter';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { createArenaSession, createArenaMessage } from '../../hooks/store/createArenaSlice';
import { ARENA_AGENTS, ARENA_COMMAND_DEFINITIONS } from '../../types/arena';
import type { ArenaAgentId, ArenaCommandId, ArenaSession, ArenaSettings as ArenaSettingsType } from '../../types/arena';
import ArenaSessionList from './ArenaSessionList';
import ArenaChatView from './ArenaChatView';
import ArenaSettings from './ArenaSettings';

// ============================================================================
// Types
// ============================================================================

export interface ArenaPaneProps {
  /** Optional CSS class name */
  className?: string;
}

type ArenaView = 'chat' | 'settings';

// ============================================================================
// Component
// ============================================================================

export function ArenaPane({ className }: ArenaPaneProps): React.ReactElement {
  const arenaAdapter = useArenaAdapter();
  const notification = useNotificationAdapter();
  
  // Local state
  const [view, setView] = useState<ArenaView>('chat');
  const [showNewSession, setShowNewSession] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  
  // Global state from store
  const {
    arenaSessions,
    arenaActiveSessionId,
    arenaMessages,
    arenaSettings,
    arenaIsLoading,
    arenaIsStreaming,
    arenaStreamingContent,
    arenaError,
    setArenaSessions,
    addArenaSession,
    removeArenaSession,
    setArenaActiveSessionId,
    setArenaMessages,
    addArenaMessage,
    updateArenaMessage,
    setArenaSettings,
    setArenaIsLoading,
    setArenaIsStreaming,
    setArenaStreamingContent,
    appendArenaStreamingContent,
    setArenaStreamingMessageId,
    setArenaError,
    clearArenaError,
  } = useAppStateStore();

  // ============================================================================
  // Effects
  // ============================================================================

  // Load sessions on mount
  useEffect(() => {
    async function loadData() {
      setArenaIsLoading(true);
      
      const [sessionsResult, settingsResult] = await Promise.all([
        arenaAdapter.loadSessions(),
        arenaAdapter.loadSettings(),
      ]);
      
      if (sessionsResult.isOk) {
        setArenaSessions(sessionsResult.value);
      } else {
        setArenaError(sessionsResult.error);
      }
      
      if (settingsResult.isOk) {
        setArenaSettings(settingsResult.value);
      }
      
      setArenaIsLoading(false);
    }
    
    loadData();
  }, [arenaAdapter, setArenaSessions, setArenaSettings, setArenaIsLoading, setArenaError]);

  // Load messages when active session changes
  useEffect(() => {
    async function loadMessages() {
      if (!arenaActiveSessionId) {
        setArenaMessages([]);
        return;
      }
      
      const result = await arenaAdapter.loadMessages(arenaActiveSessionId);
      
      if (result.isOk) {
        setArenaMessages(result.value);
      } else {
        notification.showNotification('error', `Failed to load messages: ${result.error}`);
      }
    }
    
    loadMessages();
  }, [arenaActiveSessionId, arenaAdapter, setArenaMessages, notification]);

  // Subscribe to streaming chunks
  useAdapterEvent('arenaStreamChunk', (chunk) => {
    if (chunk.done) {
      setArenaIsStreaming(false);
      // Update the final message
      updateArenaMessage(chunk.messageId, {
        content: arenaStreamingContent + chunk.content,
        status: 'complete',
        sources: chunk.sources,
        tokenCount: chunk.tokenCount,
      });
    } else {
      appendArenaStreamingContent(chunk.content);
    }
  });

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleCreateSession = useCallback(async (agent: ArenaAgentId) => {
    // Prevent duplicate creation while request is in flight
    if (isCreatingSession) return;
    
    setIsCreatingSession(true);
    
    const session = createArenaSession(agent);
    
    // Save to adapter
    const result = await arenaAdapter.saveSession(session);
    
    setIsCreatingSession(false);
    
    if (result.isOk) {
      addArenaSession(session);
      setArenaActiveSessionId(session.id);
      setShowNewSession(false);
    } else {
      notification.showNotification('error', `Failed to create session: ${result.error}`);
    }
  }, [isCreatingSession, arenaAdapter, addArenaSession, setArenaActiveSessionId, setShowNewSession, notification]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    const result = await arenaAdapter.deleteSession(sessionId);
    
    if (result.isOk) {
      removeArenaSession(sessionId);
      notification.showNotification('success', 'Session deleted');
    } else {
      notification.showNotification('error', `Failed to delete session: ${result.error}`);
    }
  }, [arenaAdapter, removeArenaSession, notification]);

  const handleSelectSession = useCallback((sessionId: string) => {
    setArenaActiveSessionId(sessionId);
    setView('chat');
  }, [setArenaActiveSessionId]);

  const handleSendMessage = useCallback(async (content: string, command?: ArenaCommandId) => {
    if (!arenaActiveSessionId) return;
    
    const activeSession = arenaSessions.find(s => s.id === arenaActiveSessionId);
    if (!activeSession) return;
    
    // Create user message
    const userMessage = createArenaMessage(arenaActiveSessionId, 'user', content, { command });
    addArenaMessage(userMessage);
    
    // Save user message
    await arenaAdapter.saveMessage(userMessage);
    
    // Create pending assistant message
    const assistantMessage = createArenaMessage(arenaActiveSessionId, 'assistant', '', { status: 'streaming' });
    addArenaMessage(assistantMessage);
    setArenaStreamingMessageId(assistantMessage.id);
    
    // Start streaming
    setArenaIsStreaming(true);
    setArenaStreamingContent('');
    
    const request = {
      sessionId: arenaActiveSessionId,
      message: content,
      command,
      agent: activeSession.agent,
      history: arenaMessages.slice(-10), // Last 10 messages for context
      settings: arenaSettings,
    };
    
    if (arenaSettings.enableStreaming) {
      // Stream the response
      const result = await arenaAdapter.streamMessage(request, (chunk) => {
        // Handled by the event listener
      });
      
      if (result.isErr) {
        updateArenaMessage(assistantMessage.id, {
          status: 'error',
          error: result.error,
        });
        setArenaIsStreaming(false);
        notification.showNotification('error', result.error);
      } else {
        // Final message update with sources
        await arenaAdapter.saveMessage({
          ...assistantMessage,
          content: result.value.content,
          status: 'complete',
          sources: result.value.sources,
          tokenCount: result.value.tokenCount,
        });
      }
    } else {
      // Non-streaming response
      const result = await arenaAdapter.sendMessage(request);
      
      setArenaIsStreaming(false);
      
      if (result.isOk) {
        updateArenaMessage(assistantMessage.id, {
          content: result.value.content,
          status: 'complete',
          sources: result.value.sources,
          tokenCount: result.value.tokenCount,
        });
        
        await arenaAdapter.saveMessage({
          ...assistantMessage,
          content: result.value.content,
          status: 'complete',
          sources: result.value.sources,
          tokenCount: result.value.tokenCount,
        });
      } else {
        updateArenaMessage(assistantMessage.id, {
          status: 'error',
          error: result.error,
        });
        notification.showNotification('error', result.error);
      }
    }
  }, [
    arenaActiveSessionId,
    arenaSessions,
    arenaMessages,
    arenaSettings,
    arenaAdapter,
    addArenaMessage,
    updateArenaMessage,
    setArenaIsStreaming,
    setArenaStreamingContent,
    setArenaStreamingMessageId,
    notification,
  ]);

  const handleCancelMessage = useCallback(() => {
    if (arenaActiveSessionId) {
      arenaAdapter.cancelChat(arenaActiveSessionId);
      setArenaIsStreaming(false);
    }
  }, [arenaActiveSessionId, arenaAdapter, setArenaIsStreaming]);

  // ============================================================================
  // Render
  // ============================================================================

  const activeSession = arenaSessions.find(s => s.id === arenaActiveSessionId);

  return (
    <div className={cn('flex h-full w-full overflow-hidden', className)}>
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-slate-50 dark:bg-slate-900">
        {/* Header */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sparkles size={16} className="text-blue-500" />
              Wave Arena
            </h2>
            <button
              onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Settings"
            >
              <Settings size={16} />
            </button>
          </div>
          
          {/* New Session Button */}
          <button
            onClick={() => setShowNewSession(!showNewSession)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            <Plus size={16} />
            New Chat
          </button>
          
          {/* Agent Selection */}
          {showNewSession && (
            <div className="mt-2 p-2 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-600 space-y-1">
              <button
                onClick={() => handleCreateSession(ARENA_AGENTS.LEARN)}
                disabled={isCreatingSession}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <BookOpen size={14} className="text-green-500" />
                Learn Agent
              </button>
              <button
                onClick={() => handleCreateSession(ARENA_AGENTS.DISCOVER)}
                disabled={isCreatingSession}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <MessageSquare size={14} className="text-purple-500" />
                Discover Agent
              </button>
            </div>
          )}
        </div>
        
        {/* Session List */}
        <div className="flex-1 overflow-y-auto">
          <ArenaSessionList
            sessions={arenaSessions}
            activeSessionId={arenaActiveSessionId}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            isLoading={arenaIsLoading}
          />
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {view === 'settings' ? (
          <ArenaSettings
            settings={arenaSettings}
            onSave={async (newSettings: ArenaSettingsType) => {
              const result = await arenaAdapter.saveSettings(newSettings);
              if (result.isOk) {
                setArenaSettings(newSettings);
                notification.showNotification('success', 'Settings saved');
                setView('chat');
              } else {
                notification.showNotification('error', `Failed to save settings: ${result.error}`);
              }
            }}
            onCancel={() => setView('chat')}
          />
        ) : activeSession ? (
          <ArenaChatView
            session={activeSession}
            messages={arenaMessages}
            streamingContent={arenaStreamingContent}
            isStreaming={arenaIsStreaming}
            onSendMessage={handleSendMessage}
            onCancelMessage={handleCancelMessage}
          />
        ) : (
          <ArenaEmptyState onCreateSession={() => setShowNewSession(true)} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

interface ArenaEmptyStateProps {
  onCreateSession: () => void;
}

function ArenaEmptyState({ onCreateSession }: ArenaEmptyStateProps): React.ReactElement {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
        <Sparkles size={32} className="text-blue-500" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        Welcome to Wave Arena
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
        Your AI-powered assistant for learning web technologies and discovering Wave Client features.
      </p>
      <button
        onClick={onCreateSession}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
      >
        <Plus size={16} />
        Start a New Chat
      </button>
      
      {/* Quick Commands */}
      <div className="mt-8 grid grid-cols-2 gap-3 max-w-md">
        {ARENA_COMMAND_DEFINITIONS.slice(0, 4).map((cmd) => (
          <div
            key={cmd.id}
            className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-left"
          >
            <code className="text-xs font-mono text-blue-600 dark:text-blue-400">{cmd.id}</code>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{cmd.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ArenaPane;
