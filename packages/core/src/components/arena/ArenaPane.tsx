/**
 * ArenaPane Component
 *
 * Main component for the Wave Arena AI chat experience.
 * Three views:
 *   1. Agent selection — pick learn-web, learn-docs, or wave-client
 *   2. Chat — toolbar (sources + provider/model + metadata) + messages + input
 *   3. Settings — advanced settings (max sessions, streaming, etc.)
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Settings, Sparkles, ArrowLeft } from 'lucide-react';
import { cn } from '../../utils/styling';
import { useArenaAdapter, useNotificationAdapter, useAdapterEvent } from '../../hooks/useAdapter';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { createArenaSession, createArenaMessage, buildDefaultSources } from '../../hooks/store/createArenaSlice';
import { createSessionMetadata, getAgentDefinition, mergeReferences } from '../../config/arenaConfig';
import type { ArenaAgentId, ArenaReference } from '../../config/arenaConfig';
import type { ArenaProviderSettingsMap } from '../../config/arenaConfig';
import type { ArenaCommandId, ArenaSettings as ArenaSettingsType, ArenaView } from '../../types/arena';
import ArenaSessionList from './ArenaSessionList';
import ArenaChatView from './ArenaChatView';
import ArenaChatToolbar from './ArenaChatToolbar';
import ArenaSettings from './ArenaSettings';
import ArenaAgentSelect from './ArenaAgentSelect';
import ArenaReferencesModal from './ArenaReferencesModal';

// ============================================================================
// Types
// ============================================================================

export interface ArenaPaneProps {
  /** Optional CSS class name */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ArenaPane({ className }: ArenaPaneProps): React.ReactElement {
  const arenaAdapter = useArenaAdapter();
  const notification = useNotificationAdapter();
  
  // Local state
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [showReferencesModal, setShowReferencesModal] = useState(false);
  
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
    arenaSelectedAgent,
    arenaView,
    arenaActiveSources,
    arenaSessionMetadata,
    arenaReferences,
    arenaProviderSettings,
    setArenaSessions,
    addArenaSession,
    removeArenaSession,
    setArenaActiveSessionId,
    setArenaMessages,
    addArenaMessage,
    updateArenaMessage,
    setArenaSettings,
    updateArenaSettings,
    setArenaProviderSettings,
    setArenaIsLoading,
    setArenaIsStreaming,
    setArenaStreamingContent,
    appendArenaStreamingContent,
    setArenaStreamingMessageId,
    setArenaError,
    clearArenaError,
    selectArenaAgent,
    setArenaView,
    setArenaActiveSources,
    setArenaSessionMetadata,
    updateArenaSessionMetadata,
    setArenaReferences,
  } = useAppStateStore();

  // ============================================================================
  // Effects
  // ============================================================================

  // Load sessions, settings, and user references on mount
  useEffect(() => {
    async function loadData() {
      setArenaIsLoading(true);

      const [sessionsResult, settingsResult, refsResult, providerSettingsResult] = await Promise.all([
        arenaAdapter.loadSessions(),
        arenaAdapter.loadSettings(),
        arenaAdapter.loadReferences(),
        arenaAdapter.loadProviderSettings(),
      ]);

      if (sessionsResult.isOk) {
        setArenaSessions(sessionsResult.value);
      } else {
        setArenaError(sessionsResult.error);
      }

      if (settingsResult.isOk) {
        setArenaSettings(settingsResult.value);
      }

      if (refsResult.isOk) {
        setArenaReferences(mergeReferences(refsResult.value));
      }

      if (providerSettingsResult.isOk) {
        setArenaProviderSettings(providerSettingsResult.value);
      }

      setArenaIsLoading(false);
    }

    loadData();
  }, [arenaAdapter, setArenaSessions, setArenaSettings, setArenaReferences, setArenaProviderSettings, setArenaIsLoading, setArenaError]);

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

  // Initialize metadata when active session changes
  useEffect(() => {
    if (!arenaActiveSessionId) {
      setArenaSessionMetadata(null);
      return;
    }
    const session = arenaSessions.find((s) => s.id === arenaActiveSessionId);
    if (session?.metadata) {
      setArenaSessionMetadata(session.metadata);
    } else {
      setArenaSessionMetadata(
        createSessionMetadata(arenaSettings.provider, arenaSettings.model || ''),
      );
    }
  }, [arenaActiveSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Update metadata
      if (chunk.tokenCount) {
        updateArenaSessionMetadata({
          totalTokenCount: (arenaSessionMetadata?.totalTokenCount ?? 0) + chunk.tokenCount,
          lastActiveAt: Date.now(),
          durationMs: Date.now() - (arenaSessionMetadata?.startedAt ?? Date.now()),
        });
      }
    } else {
      appendArenaStreamingContent(chunk.content);
    }
  });

  // ============================================================================
  // Handlers
  // ============================================================================

  /** Called when the user modifies references in the modal (toggle, add, remove) */
  const handleReferencesChange = useCallback(
    async (updatedRefs: ArenaReference[]) => {
      setArenaReferences(updatedRefs);

      // Persist only user-added (non-default) references
      const userRefs = updatedRefs.filter((r) => !r.isDefault);
      const result = await arenaAdapter.saveReferences(userRefs);

      if (result.isErr) {
        notification.showNotification('error', `Failed to save references: ${result.error}`);
      }
    },
    [arenaAdapter, setArenaReferences, notification],
  );

  /** Called from the ArenaAgentSelect page */
  const handleSelectAgent = useCallback(
    async (agentId: ArenaAgentId) => {
      selectArenaAgent(agentId);

      // Automatically create a new session for the selected agent
      if (isCreatingSession) return;
      setIsCreatingSession(true);

      const session = createArenaSession(agentId);
      const result = await arenaAdapter.saveSession(session);

      setIsCreatingSession(false);

      if (result.isOk) {
        addArenaSession(session);
        setArenaActiveSessionId(session.id);
      } else {
        notification.showNotification('error', `Failed to create session: ${result.error}`);
      }
    },
    [isCreatingSession, arenaAdapter, addArenaSession, setArenaActiveSessionId, selectArenaAgent, notification],
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      const result = await arenaAdapter.deleteSession(sessionId);

      if (result.isOk) {
        removeArenaSession(sessionId);
        notification.showNotification('success', 'Session deleted');
      } else {
        notification.showNotification('error', `Failed to delete session: ${result.error}`);
      }
    },
    [arenaAdapter, removeArenaSession, notification],
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      const session = arenaSessions.find((s) => s.id === sessionId);
      if (session) {
        selectArenaAgent(session.agent);
        setArenaActiveSessionId(sessionId);
      }
    },
    [arenaSessions, selectArenaAgent, setArenaActiveSessionId],
  );

  const handleSendMessage = useCallback(
    async (content: string, command?: ArenaCommandId) => {
      if (!arenaActiveSessionId) return;

      const activeSession = arenaSessions.find((s) => s.id === arenaActiveSessionId);
      if (!activeSession) return;

      // Create user message
      const userMessage = createArenaMessage(arenaActiveSessionId, 'user', content, { command });
      addArenaMessage(userMessage);
      await arenaAdapter.saveMessage(userMessage);

      // Update metadata (message count)
      const currentMeta = arenaSessionMetadata;
      if (currentMeta) {
        updateArenaSessionMetadata({
          messageCount: currentMeta.messageCount + 1,
          lastActiveAt: Date.now(),
          durationMs: Date.now() - currentMeta.startedAt,
        });
      }

      // Create pending assistant message
      const assistantMessage = createArenaMessage(arenaActiveSessionId, 'assistant', '', {
        status: 'streaming',
      });
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
        history: arenaMessages.slice(-10),
        settings: arenaSettings,
      };

      if (arenaSettings.enableStreaming) {
        const result = await arenaAdapter.streamMessage(request, () => {
          // Handled by the event listener
        });

        if (result.isErr) {
          updateArenaMessage(assistantMessage.id, { status: 'error', error: result.error });
          setArenaIsStreaming(false);
          notification.showNotification('error', result.error);
        } else {
          await arenaAdapter.saveMessage({
            ...assistantMessage,
            content: result.value.content,
            status: 'complete',
            sources: result.value.sources,
            tokenCount: result.value.tokenCount,
          });
          // Update metadata after assistant response
          if (currentMeta) {
            updateArenaSessionMetadata({
              messageCount: currentMeta.messageCount + 2,
              totalTokenCount: currentMeta.totalTokenCount + (result.value.tokenCount ?? 0),
              lastActiveAt: Date.now(),
              durationMs: Date.now() - currentMeta.startedAt,
            });
          }
        }
      } else {
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
          if (currentMeta) {
            updateArenaSessionMetadata({
              messageCount: currentMeta.messageCount + 2,
              totalTokenCount: currentMeta.totalTokenCount + (result.value.tokenCount ?? 0),
              lastActiveAt: Date.now(),
              durationMs: Date.now() - currentMeta.startedAt,
            });
          }
        } else {
          updateArenaMessage(assistantMessage.id, { status: 'error', error: result.error });
          notification.showNotification('error', result.error);
        }
      }
    },
    [
      arenaActiveSessionId,
      arenaSessions,
      arenaMessages,
      arenaSettings,
      arenaAdapter,
      arenaSessionMetadata,
      addArenaMessage,
      updateArenaMessage,
      setArenaIsStreaming,
      setArenaStreamingContent,
      setArenaStreamingMessageId,
      updateArenaSessionMetadata,
      notification,
    ],
  );

  const handleCancelMessage = useCallback(() => {
    if (arenaActiveSessionId) {
      arenaAdapter.cancelChat(arenaActiveSessionId);
      setArenaIsStreaming(false);
    }
  }, [arenaActiveSessionId, arenaAdapter, setArenaIsStreaming]);

  /** Toolbar settings changes (provider / model / api key) */
  const handleToolbarSettingsChange = useCallback(
    async (updates: Partial<ArenaSettingsType>) => {
      const newSettings = { ...arenaSettings, ...updates };
      updateArenaSettings(updates);
      // Persist
      await arenaAdapter.saveSettings(newSettings);
    },
    [arenaSettings, updateArenaSettings, arenaAdapter],
  );

  const handleSaveAdvancedSettings = useCallback(
    async (newSettings: ArenaSettingsType, newProviderSettings: ArenaProviderSettingsMap) => {
      const [settingsResult, providerResult] = await Promise.all([
        arenaAdapter.saveSettings(newSettings),
        arenaAdapter.saveProviderSettings(newProviderSettings),
      ]);

      if (settingsResult.isOk && providerResult.isOk) {
        setArenaSettings(newSettings);
        setArenaProviderSettings(newProviderSettings);
        notification.showNotification('success', 'Settings saved');
        setArenaView('chat');
      } else {
        const errors = [
          settingsResult.isErr ? settingsResult.error : null,
          providerResult.isErr ? providerResult.error : null,
        ].filter(Boolean).join('; ');
        notification.showNotification('error', `Failed to save settings: ${errors}`);
      }
    },
    [arenaAdapter, setArenaSettings, setArenaProviderSettings, setArenaView, notification],
  );

  /** Navigate back to agent selection */
  const handleBackToAgentSelect = useCallback(() => {
    setArenaView('select-agent');
    setArenaActiveSessionId(null);
  }, [setArenaView, setArenaActiveSessionId]);

  // ============================================================================
  // Derived state
  // ============================================================================

  const activeSession = arenaSessions.find((s) => s.id === arenaActiveSessionId);
  const agentDef = arenaSelectedAgent ? getAgentDefinition(arenaSelectedAgent) : null;

  // Filter sessions for the sidebar: show all when on agent-select, or only agent-specific when in chat
  const filteredSessions = useMemo(
    () =>
      arenaSelectedAgent
        ? arenaSessions.filter((s) => s.agent === arenaSelectedAgent)
        : arenaSessions,
    [arenaSessions, arenaSelectedAgent],
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className={cn('flex h-full w-full overflow-hidden', className)}>
      {/* ---- Sidebar ---- */}
      <div className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-slate-50 dark:bg-slate-900">
        {/* Header */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sparkles size={16} className="text-blue-500" />
              Wave Arena
            </h2>
            <div className="flex items-center gap-1">
              {arenaView === 'chat' && (
                <button
                  onClick={handleBackToAgentSelect}
                  className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="Back to agents"
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              <button
                onClick={() => setArenaView(arenaView === 'settings' ? 'chat' : 'settings')}
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                title="Advanced settings"
              >
                <Settings size={16} />
              </button>
            </div>
          </div>

          {/* New chat for the current agent */}
          {arenaSelectedAgent && arenaView === 'chat' && (
            <button
              onClick={() => handleSelectAgent(arenaSelectedAgent)}
              disabled={isCreatingSession}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors"
            >
              New {agentDef?.label ?? ''} Chat
            </button>
          )}
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto">
          <ArenaSessionList
            sessions={filteredSessions}
            activeSessionId={arenaActiveSessionId}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            isLoading={arenaIsLoading}
          />
        </div>
      </div>

      {/* ---- Main Content ---- */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {arenaView === 'settings' ? (
          <ArenaSettings
            settings={arenaSettings}
            providerSettings={arenaProviderSettings}
            onSave={handleSaveAdvancedSettings}
            onCancel={() => setArenaView(arenaSelectedAgent ? 'chat' : 'select-agent')}
          />
        ) : arenaView === 'select-agent' || !arenaSelectedAgent ? (
          <ArenaAgentSelect onSelectAgent={handleSelectAgent} />
        ) : activeSession ? (
          <>
            {/* Toolbar */}
            <ArenaChatToolbar
              referenceCount={arenaReferences.filter((r) => r.enabled).length}
              onOpenReferences={() => setShowReferencesModal(true)}
              settings={arenaSettings}
              providerSettings={arenaProviderSettings}
              metadata={arenaSessionMetadata ?? undefined}
              onSettingsChange={handleToolbarSettingsChange}
              onOpenSettings={() => setArenaView('settings')}
            />
            {/* Chat */}
            <ArenaChatView
              session={activeSession}
              messages={arenaMessages}
              streamingContent={arenaStreamingContent}
              isStreaming={arenaIsStreaming}
              onSendMessage={handleSendMessage}
              onCancelMessage={handleCancelMessage}
            />
          </>
        ) : (
          <ArenaAgentSelect onSelectAgent={handleSelectAgent} />
        )}
      </div>

      {/* ---- References Modal ---- */}
      {showReferencesModal && (
        <ArenaReferencesModal
          references={arenaReferences}
          onReferencesChange={handleReferencesChange}
          onClose={() => setShowReferencesModal(false)}
        />
      )}
    </div>
  );
}

export default ArenaPane;