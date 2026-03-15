/**
 * ArenaPane Component
 *
 * Main component for the Wave Arena AI chat experience.
 * Three views:
 *   1. Agent selection — pick learn-web, learn-docs, or wave-client
 *   2. Chat — toolbar (sources + provider/model + metadata) + messages + input
 *   3. Settings — advanced settings (max sessions, streaming, etc.)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Settings, Sparkles, ArrowLeft, PanelRight } from 'lucide-react';
import { cn } from '../../utils/styling';
import { SecondaryButton } from '../ui/SecondaryButton';
import { useArenaAdapter, useNotificationAdapter } from '../../hooks/useAdapter';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { createArenaMessage } from '../../hooks/store/createArenaSlice';
import { useArenaStreamManager } from '../../hooks/useArenaStreamManager';
import { createSessionMetadata, mergeReferences, isProviderConfigured } from '../../config/arenaConfig';
import type { ArenaAgentId, ArenaReference, ArenaProviderSettingsMap, ArenaSettings as ArenaSettingsConfig } from '../../config/arenaConfig';
import type { ArenaCommandId } from '../../types/arena';
import type { ArenaAppSettings } from '../../hooks/store/createSettingsSlice';
import ArenaChatView from './ArenaChatView';
import ArenaChatToolbar from './ArenaChatToolbar';
import ArenaSettings from './ArenaSettings';
import ArenaRightPane from './ArenaRightPane';
import ArenaWelcomeScreen from './ArenaWelcomeScreen';
import ArenaReadinessOverlay from './ArenaReadinessOverlay';

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
  const [showRightPane, setShowRightPane] = useState(true);

  // Streaming state machine for this pane
  const { startStream, cancelStream, streamState, streamingContent } = useArenaStreamManager();
  
  // Global state from store
  const {
    arenaSessions,
    arenaActiveSessionId,
    arenaMessages,
    arenaReadiness,
    arenaSelectedAgent,
    arenaView,
    arenaActiveSources,
    arenaSessionMetadata,
    arenaReferences,
    settings,
    updateArenaSettings: updateArenaAppSettings,
    setArenaSessions,
    removeArenaSession,
    startNewArenaSession,
    setArenaActiveSessionId,
    setArenaMessages,
    addArenaMessage,
    updateArenaMessage,
    setArenaReadiness,
    setArenaError,
    selectArenaAgent,
    setArenaView,
    setArenaActiveSources,
    setArenaSessionMetadata,
    updateArenaSessionMetadata,
    setArenaReferences,
  } = useAppStateStore();

  // Derive ArenaSettings (arenaConfig format) from the settings slice for
  // downstream components (ArenaChatToolbar, ArenaSettings panel, chat requests).
  const arenaSettings = useMemo<ArenaSettingsConfig>(() => ({
    provider: settings.arena.defaultProvider,
    model: settings.arena.defaultModel,
    maxSessions: settings.arena.maxSessions,
    maxMessagesPerSession: settings.arena.maxMessagesPerSession,
    enableStreaming: settings.arena.enableStreaming,
  }), [settings.arena]);

  const arenaProviderSettings = settings.arena.providers;

  // ============================================================================
  // Effects
  // ============================================================================

  // Load sessions, settings, and user references on mount
  useEffect(() => {
    async function loadData() {
      setArenaReadiness('loading');
      console.info('Arena readiness: idle → loading');

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
        const s = settingsResult.value;
        updateArenaAppSettings({
          defaultProvider: s.provider,
          defaultModel: s.model || '',
          enableStreaming: s.enableStreaming,
          maxSessions: s.maxSessions,
          maxMessagesPerSession: s.maxMessagesPerSession,
        });
      }

      if (refsResult.isOk) {
        setArenaReferences(mergeReferences(refsResult.value));
      }

      // Update provider settings if available; fall back to current store value.
      const resolvedProviderSettings = providerSettingsResult.isOk
        ? providerSettingsResult.value
        : settings.arena.providers;

      if (providerSettingsResult.isOk) {
        updateArenaAppSettings({ providers: resolvedProviderSettings });
      }

      // Transition to 'ready' or 'needs-config' — never stay in 'loading'.
      if (isProviderConfigured(resolvedProviderSettings)) {
        console.info('Arena readiness: loading → ready');
        setArenaReadiness('ready');
      } else {
        console.info('Arena readiness: loading → needs-config');
        setArenaReadiness('needs-config');
      }
    }

    loadData();
  }, [arenaAdapter, setArenaSessions, updateArenaAppSettings, setArenaReferences, setArenaReadiness, setArenaError]);

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

  // Cleanup active stream on unmount is handled by useArenaStreamManager

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
    (agentId: ArenaAgentId) => {
      // Atomically create the session, add it to the store, and switch to
      // chat view in a single store update — the UI transitions immediately.
      const session = startNewArenaSession(agentId);

      // Fire-and-forget persist — the session is already in the store so a
      // failure only means it won't survive a reload.
      arenaAdapter.saveSession(session).then((result) => {
        if (result.isErr) {
          console.warn('Failed to persist session:', result.error);
        }
      });
    },
    [arenaAdapter, startNewArenaSession],
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
        setArenaView('chat');
      }
    },
    [arenaSessions, selectArenaAgent, setArenaActiveSessionId, setArenaView],
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

      const request = {
        sessionId: arenaActiveSessionId,
        message: content,
        command,
        agent: activeSession.agent,
        history: arenaMessages.slice(-10),
        settings: arenaSettings,
      };

      if (arenaSettings.enableStreaming) {
        // ── Streaming path: delegate to useArenaStreamManager ─────────────
        startStream(request, assistantMessage.id, {
          onComplete: async (response) => {
            await arenaAdapter.saveMessage({
              ...assistantMessage,
              content: response.content,
              status: 'complete',
              sources: response.sources,
              tokenCount: response.tokenCount,
              ...(response.blocks ? { blocks: response.blocks } : {}),
            });
            if (currentMeta) {
              updateArenaSessionMetadata({
                messageCount: currentMeta.messageCount + 2,
                totalTokenCount: currentMeta.totalTokenCount + (response.tokenCount ?? 0),
                lastActiveAt: Date.now(),
                durationMs: Date.now() - currentMeta.startedAt,
              });
            }
          },
          onError: (error) => {
            notification.showNotification('error', error);
          },
        });
      } else {
        const result = await arenaAdapter.sendMessage(request);

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
      updateArenaSessionMetadata,
      notification,
      startStream,
    ],
  );

  const handleCancelMessage = useCallback(() => {
    cancelStream();
  }, [cancelStream]);

  /** Toolbar settings changes (provider / model / api key) */
  const handleToolbarSettingsChange = useCallback(
    async (updates: Partial<ArenaSettingsConfig>) => {
      const newSettings = { ...arenaSettings, ...updates };
      // Map to ArenaAppSettings keys for the settings slice
      const appUpdates: Partial<ArenaAppSettings> = {};
      if (updates.provider !== undefined) appUpdates.defaultProvider = updates.provider;
      if (updates.model !== undefined) appUpdates.defaultModel = updates.model;
      if (updates.enableStreaming !== undefined) appUpdates.enableStreaming = updates.enableStreaming;
      if (updates.maxSessions !== undefined) appUpdates.maxSessions = updates.maxSessions;
      if (updates.maxMessagesPerSession !== undefined) appUpdates.maxMessagesPerSession = updates.maxMessagesPerSession;
      updateArenaAppSettings(appUpdates);
      // Persist
      await arenaAdapter.saveSettings(newSettings);
    },
    [arenaSettings, updateArenaAppSettings, arenaAdapter],
  );

  const handleSaveAdvancedSettings = useCallback(
    async (newSettings: ArenaSettingsConfig, newProviderSettings: ArenaProviderSettingsMap) => {
      const [settingsResult, providerResult] = await Promise.all([
        arenaAdapter.saveSettings(newSettings),
        arenaAdapter.saveProviderSettings(newProviderSettings),
      ]);

      if (settingsResult.isOk && providerResult.isOk) {
        updateArenaAppSettings({
          defaultProvider: newSettings.provider,
          defaultModel: newSettings.model || '',
          enableStreaming: newSettings.enableStreaming,
          maxSessions: newSettings.maxSessions,
          maxMessagesPerSession: newSettings.maxMessagesPerSession,
          providers: newProviderSettings,
        });
        // Re-evaluate readiness after provider settings change.
        if (isProviderConfigured(newProviderSettings)) {
          console.info('Arena readiness: → ready (settings saved)');
          setArenaReadiness('ready');
        } else {
          console.info('Arena readiness: → needs-config (settings saved)');
          setArenaReadiness('needs-config');
        }
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
    [arenaAdapter, updateArenaAppSettings, setArenaView, setArenaReadiness, notification],
  );

  /** Navigate back to agent selection */
  const handleBackToAgentSelect = useCallback(() => {
    cancelStream();

    setArenaMessages([]);
    setArenaView('select-agent');
    setArenaActiveSessionId(null);
  }, [cancelStream, setArenaMessages, setArenaView, setArenaActiveSessionId]);

  // ============================================================================
  // Derived state
  // ============================================================================

  const activeSession = arenaSessions.find((s) => s.id === arenaActiveSessionId);

  // Filter sessions for the sidebar: show all when on agent-select, or only agent-specific when in chat
  const filteredSessions = useMemo(
    () =>
      arenaSelectedAgent
        ? arenaSessions.filter((s) => s.agent === arenaSelectedAgent)
        : arenaSessions,
    [arenaSessions, arenaSelectedAgent],
  );

  // Estimate the total word count of the current session for the context circle.
  // Words are used instead of tokens because they are provider-agnostic and
  // intuitively understandable by users.
  const contextWords = useMemo(() => {
    return arenaMessages.reduce((sum, m) => {
      const words = m.content.split(/\s+/).filter(Boolean).length;
      return sum + words;
    }, 0);
  }, [arenaMessages]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className={cn('flex h-full w-full overflow-hidden', className)}>
      {/* ---- Main Content Column ---- */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar — always visible */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2">
            {arenaView === 'chat' && arenaActiveSessionId && (
              <SecondaryButton
                onClick={handleBackToAgentSelect}
                size="icon"
                variant="ghost"
                className="h-7 w-7 p-0 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                title="Back to agents"
                aria-label="Back to agents"
              >
                <ArrowLeft size={16} />
              </SecondaryButton>
            )}
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Sparkles size={14} className="text-blue-500" />
              Wave Arena
            </h2>
          </div>

          <div className="flex items-center gap-1">
            <SecondaryButton
              onClick={() => setShowRightPane((v) => !v)}
              size="icon"
              variant="ghost"
              className={cn(
                'h-7 w-7 p-0',
                showRightPane
                  ? 'text-blue-500 dark:text-blue-400'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
              )}
              title="Toggle context panel"
              aria-label="Toggle context panel"
            >
              <PanelRight size={16} />
            </SecondaryButton>
            <SecondaryButton
              onClick={() => setArenaView(arenaView === 'settings' ? 'chat' : 'settings')}
              size="icon"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              title="Arena settings"
              aria-label="Arena settings"
            >
              <Settings size={16} />
            </SecondaryButton>
          </div>
        </div>

        {/* View switcher.
             - Settings and agent-select are always accessible, no data needed.
             - Readiness overlays (loading/needs-config) guard the chat view only. */}
        {arenaView === 'settings' ? (
          <ArenaSettings
            settings={arenaSettings}
            providerSettings={arenaProviderSettings}
            onSave={handleSaveAdvancedSettings}
            onCancel={() => setArenaView(arenaSelectedAgent ? 'chat' : 'select-agent')}
          />
        ) : arenaView === 'select-agent' ? (
          <ArenaWelcomeScreen onSelectAgent={handleSelectAgent} />
        ) : arenaReadiness === 'loading' ? (
          <ArenaReadinessOverlay
            readiness={arenaReadiness}
            onOpenSettings={() => setArenaView('settings')}
          />
        ) : arenaReadiness === 'needs-config' ? (
          <ArenaReadinessOverlay
            readiness={arenaReadiness}
            onOpenSettings={() => setArenaView('settings')}
          />
        ) : activeSession ? (
          <>
            <ArenaChatToolbar
              settings={arenaSettings}
              providerSettings={arenaProviderSettings}
              contextWords={contextWords}
              onSettingsChange={handleToolbarSettingsChange}
              enableStreaming={arenaSettings.enableStreaming}
              onEnableStreamingChange={(enabled) =>
                handleToolbarSettingsChange({ enableStreaming: enabled })
              }
              onOpenSettings={() => setArenaView('settings')}
            />
            <ArenaChatView
              session={activeSession}
              messages={arenaMessages}
              streamingContent={streamingContent}
              streamState={streamState}
              onSendMessage={handleSendMessage}
              onCancelMessage={handleCancelMessage}
            />
          </>
        ) : (
          <ArenaWelcomeScreen onSelectAgent={handleSelectAgent} />
        )}
      </div>

      {/* ---- Right Pane ---- */}
      <ArenaRightPane
        isOpen={showRightPane}
        onToggle={() => setShowRightPane((v) => !v)}
        selectedAgent={arenaSelectedAgent}
        sessions={filteredSessions}
        activeSessionId={arenaActiveSessionId}
        sessionMetadata={arenaSessionMetadata}
        activeSources={arenaActiveSources}
        references={arenaReferences}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onReferencesChange={handleReferencesChange}
        onSourcesChange={setArenaActiveSources}
      />
    </div>
  );
}

export default ArenaPane;