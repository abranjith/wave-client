import { StateCreator } from 'zustand';
import type {
    ArenaSession,
    ArenaMessage,
    ArenaCommandId,
    ArenaMessageStatus,
    ArenaView,
} from '../../types/arena';
import type {
    ArenaAgentId,
    ArenaSourceConfig,
    ArenaSessionMetadata,
    ArenaReference,
} from '../../config/arenaConfig';
import {
    getAgentDefinition,
    DEFAULT_REFERENCE_WEBSITES,
    getDefaultReferences,
} from '../../config/arenaConfig';
import type { AppSettings } from './createSettingsSlice';
import { DEFAULT_ARENA_APP_SETTINGS } from './createSettingsSlice';

// ============================================================================
// Types
// ============================================================================

export interface ArenaSlice {
    // State
    arenaSessions: ArenaSession[];
    arenaActiveSessionId: string | null;
    arenaMessages: ArenaMessage[];
    arenaIsLoading: boolean;
    arenaError: string | null;
    /** Currently selected agent (null = show agent selection page) */
    arenaSelectedAgent: ArenaAgentId | null;
    /** Current view in the Arena pane */
    arenaView: ArenaView;
    /** Active sources for the current agent (toolbar) */
    arenaActiveSources: ArenaSourceConfig[];
    /** Session metadata for the active session */
    arenaSessionMetadata: ArenaSessionMetadata | null;
    /** All references (default + user-added, already merged) */
    arenaReferences: ArenaReference[];
    
    // Session actions
    setArenaSessions: (sessions: ArenaSession[]) => void;
    removeArenaSession: (sessionId: string) => void;
    updateArenaSession: (sessionId: string, updates: Partial<ArenaSession>) => void;
    setArenaActiveSessionId: (sessionId: string | null) => void;
    
    // Message actions
    setArenaMessages: (messages: ArenaMessage[]) => void;
    addArenaMessage: (message: ArenaMessage) => void;
    updateArenaMessage: (messageId: string, updates: Partial<ArenaMessage>) => void;
    removeArenaMessage: (messageId: string) => void;
    clearArenaMessages: () => void;
    
    // UI state actions
    setArenaIsLoading: (isLoading: boolean) => void;
    setArenaError: (error: string | null) => void;
    
    // Agent / view actions
    /** Atomically creates a session, sets it active, and switches to chat view in one store update. Returns the created session for optional background persistence. */
    startNewArenaSession: (agentId: ArenaAgentId) => ArenaSession;
    selectArenaAgent: (agentId: ArenaAgentId) => void;
    setArenaView: (view: ArenaView) => void;
    setArenaActiveSources: (sources: ArenaSourceConfig[]) => void;
    setArenaSessionMetadata: (metadata: ArenaSessionMetadata | null) => void;
    updateArenaSessionMetadata: (updates: Partial<ArenaSessionMetadata>) => void;
    
    // Reference actions
    setArenaReferences: (refs: ArenaReference[]) => void;
    addArenaReference: (ref: ArenaReference) => void;
    removeArenaReference: (refId: string) => void;
    toggleArenaReference: (refId: string) => void;
    
    // Utility actions
    resetArenaState: () => void;
    getActiveArenaSession: () => ArenaSession | undefined;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique ID for sessions and messages
 */
function generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new chat session (internal helper)
 */
function createArenaSession(agent: ArenaAgentId, title?: string): ArenaSession {
    const now = Date.now();
    const def = getAgentDefinition(agent);
    const defaultTitle = def ? `New ${def.label} Chat` : 'New Chat';
    return {
        id: generateId('session'),
        title: title || defaultTitle,
        agent,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
    };
}

/**
 * Build the default sources list for an agent (internal helper).
 */
function buildDefaultSources(agentId: ArenaAgentId): ArenaSourceConfig[] {
    const def = getAgentDefinition(agentId);
    if (!def) return [];

    if (def.defaultSourceTypes.includes('web')) {
        return DEFAULT_REFERENCE_WEBSITES
            .filter((w) => w.enabled)
            .map((w) => ({
                type: 'web' as const,
                label: w.name,
                url: w.url,
                enabled: true,
            }));
    }

    if (def.defaultSourceTypes.includes('mcp')) {
        return [
            { type: 'mcp' as const, label: 'MCP Tools', enabled: true },
        ];
    }

    return [];
}

/**
 * Create a new chat message
 */
export function createArenaMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    options?: {
        command?: ArenaCommandId;
        status?: ArenaMessageStatus;
    }
): ArenaMessage {
    return {
        id: generateId('msg'),
        sessionId,
        role,
        content,
        status: options?.status || (role === 'user' ? 'complete' : 'pending'),
        timestamp: Date.now(),
        command: options?.command,
    };
}

// ============================================================================
// Slice Creator
// ============================================================================

/**
 * The arena slice needs read access to `settings.arena` from the settings
 * slice for session/message limits. This type captures that dependency.
 */
type ArenaSliceStore = ArenaSlice & { settings: AppSettings };

const createArenaSlice: StateCreator<ArenaSliceStore, [], [], ArenaSlice> = (set, get) => ({
    // Initial state
    arenaSessions: [],
    arenaActiveSessionId: null,
    arenaMessages: [],
    arenaIsLoading: false,
    arenaError: null,
    arenaSelectedAgent: null,
    arenaView: 'select-agent' as ArenaView,
    arenaActiveSources: [],
    arenaSessionMetadata: null,
    arenaReferences: getDefaultReferences(),
    
    // Session actions
    setArenaSessions: (sessions) => set({ arenaSessions: sessions }),
    
    removeArenaSession: (sessionId) => set((state) => ({
        arenaSessions: state.arenaSessions.filter((s) => s.id !== sessionId),
        // Clear active session if it was deleted
        arenaActiveSessionId: state.arenaActiveSessionId === sessionId 
            ? null 
            : state.arenaActiveSessionId,
        // Clear messages if they belonged to deleted session
        arenaMessages: state.arenaMessages.filter((m) => m.sessionId !== sessionId),
    })),
    
    updateArenaSession: (sessionId, updates) => set((state) => ({
        arenaSessions: state.arenaSessions.map((s) => 
            s.id === sessionId ? { ...s, ...updates, updatedAt: Date.now() } : s
        ),
    })),
    
    setArenaActiveSessionId: (sessionId) => set({ 
        arenaActiveSessionId: sessionId,
        // Clear messages when switching sessions (they'll be loaded by the component)
        arenaMessages: [],
    }),
    
    // Message actions
    setArenaMessages: (messages) => set({ arenaMessages: messages }),
    
    addArenaMessage: (message) => set((state) => {
        const maxMessagesPerSession = state.settings?.arena?.maxMessagesPerSession
            ?? DEFAULT_ARENA_APP_SETTINGS.maxMessagesPerSession;
        const sessionMessages = state.arenaMessages.filter(
            (m) => m.sessionId === message.sessionId
        );
        
        let newMessages = [...state.arenaMessages, message];
        
        // Enforce max messages per session limit
        if (sessionMessages.length >= maxMessagesPerSession) {
            // Remove oldest message from this session
            const oldestInSession = sessionMessages
                .sort((a, b) => a.timestamp - b.timestamp)[0];
            if (oldestInSession) {
                newMessages = newMessages.filter((m) => m.id !== oldestInSession.id);
            }
        }
        
        return { arenaMessages: newMessages };
    }),
    
    updateArenaMessage: (messageId, updates) => set((state) => ({
        arenaMessages: state.arenaMessages.map((m) =>
            m.id === messageId ? { ...m, ...updates } : m
        ),
    })),
    
    removeArenaMessage: (messageId) => set((state) => ({
        arenaMessages: state.arenaMessages.filter((m) => m.id !== messageId),
    })),
    
    clearArenaMessages: () => set({ arenaMessages: [] }),
    
    // UI state actions
    setArenaIsLoading: (isLoading) => set({ arenaIsLoading: isLoading }),
    
    setArenaError: (error) => set({ arenaError: error }),
    
    // Agent / view actions
    startNewArenaSession: (agentId) => {
        const session = createArenaSession(agentId);
        set((state) => {
            const maxSessions = state.settings?.arena?.maxSessions
                ?? DEFAULT_ARENA_APP_SETTINGS.maxSessions;
            let sessions = [...state.arenaSessions, session];
            if (sessions.length > maxSessions) {
                sessions = sessions
                    .sort((a, b) => b.updatedAt - a.updatedAt)
                    .slice(0, maxSessions);
            }
            return {
                arenaSessions: sessions,
                arenaActiveSessionId: session.id,
                arenaMessages: [],
                arenaSelectedAgent: agentId,
                arenaView: 'chat' as ArenaView,
                arenaActiveSources: buildDefaultSources(agentId),
            };
        });
        return session;
    },

    selectArenaAgent: (agentId) => set({
        arenaSelectedAgent: agentId,
        arenaView: 'chat' as ArenaView,
        arenaActiveSources: buildDefaultSources(agentId),
    }),
    
    setArenaView: (view) => set({ arenaView: view }),
    
    setArenaActiveSources: (sources) => set({ arenaActiveSources: sources }),
    
    setArenaSessionMetadata: (metadata) => set({ arenaSessionMetadata: metadata }),
    
    updateArenaSessionMetadata: (updates) => set((state) => ({
        arenaSessionMetadata: state.arenaSessionMetadata
            ? { ...state.arenaSessionMetadata, ...updates }
            : null,
    })),
    
    // Reference actions
    setArenaReferences: (refs) => set({ arenaReferences: refs }),
    
    addArenaReference: (ref) => set((state) => ({
        arenaReferences: [...state.arenaReferences, ref],
    })),
    
    removeArenaReference: (refId) => set((state) => ({
        arenaReferences: state.arenaReferences.filter((r) => r.id !== refId),
    })),
    
    toggleArenaReference: (refId) => set((state) => ({
        arenaReferences: state.arenaReferences.map((r) =>
            r.id === refId ? { ...r, enabled: !r.enabled } : r,
        ),
    })),
    
    // Utility actions
    resetArenaState: () => set({
        arenaSessions: [],
        arenaActiveSessionId: null,
        arenaMessages: [],
        arenaIsLoading: false,
        arenaError: null,
        arenaSelectedAgent: null,
        arenaView: 'select-agent' as ArenaView,
        arenaActiveSources: [],
        arenaSessionMetadata: null,
        arenaReferences: getDefaultReferences(),
    }),
    
    getActiveArenaSession: () => {
        const state = get();
        return state.arenaSessions.find((s) => s.id === state.arenaActiveSessionId);
    },
});

export default createArenaSlice;
