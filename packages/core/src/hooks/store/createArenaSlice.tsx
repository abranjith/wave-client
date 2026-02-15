import { StateCreator } from 'zustand';
import type {
    ArenaSession,
    ArenaMessage,
    ArenaDocument,
    ArenaCommandId,
    ArenaMessageStatus,
    ArenaView,
} from '../../types/arena';
import type {
    ArenaAgentId,
    ArenaSettings,
    ArenaSourceConfig,
    ArenaSessionMetadata,
    ArenaReference,
    ArenaProviderSettingsMap,
    ArenaProviderType,
} from '../../config/arenaConfig';
import {
    DEFAULT_ARENA_SETTINGS,
    getAgentDefinition,
    createSessionMetadata,
    DEFAULT_REFERENCE_WEBSITES,
    getDefaultReferences,
    getDefaultProviderSettings,
} from '../../config/arenaConfig';

// ============================================================================
// Types
// ============================================================================

export interface ArenaSlice {
    // State
    arenaSessions: ArenaSession[];
    arenaActiveSessionId: string | null;
    arenaMessages: ArenaMessage[];
    arenaDocuments: ArenaDocument[];
    /** @deprecated Use `settings.arena` from the settings slice instead (Phase 4). Will be removed in Phase 3. */
    arenaSettings: ArenaSettings;
    arenaIsLoading: boolean;
    arenaIsStreaming: boolean;
    arenaStreamingContent: string;
    arenaStreamingMessageId: string | null;
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
    /** @deprecated Use `settings.arena.providers` from the settings slice instead (Phase 4). Will be removed in Phase 3. */
    arenaProviderSettings: ArenaProviderSettingsMap;
    
    // Session actions
    setArenaSessions: (sessions: ArenaSession[]) => void;
    addArenaSession: (session: ArenaSession) => void;
    removeArenaSession: (sessionId: string) => void;
    updateArenaSession: (sessionId: string, updates: Partial<ArenaSession>) => void;
    setArenaActiveSessionId: (sessionId: string | null) => void;
    
    // Message actions
    setArenaMessages: (messages: ArenaMessage[]) => void;
    addArenaMessage: (message: ArenaMessage) => void;
    updateArenaMessage: (messageId: string, updates: Partial<ArenaMessage>) => void;
    removeArenaMessage: (messageId: string) => void;
    clearArenaMessages: () => void;
    
    // Document actions
    setArenaDocuments: (documents: ArenaDocument[]) => void;
    addArenaDocument: (document: ArenaDocument) => void;
    updateArenaDocument: (documentId: string, updates: Partial<ArenaDocument>) => void;
    removeArenaDocument: (documentId: string) => void;
    
    // Settings actions
    /** @deprecated Use settings slice actions instead (Phase 4). Will be removed in Phase 3. */
    setArenaSettings: (settings: ArenaSettings) => void;
    /** @deprecated Use settings slice actions instead (Phase 4). Will be removed in Phase 3. */
    updateArenaSettings: (updates: Partial<ArenaSettings>) => void;
    /** @deprecated Use settings slice actions instead (Phase 4). Will be removed in Phase 3. */
    setArenaProviderSettings: (settings: ArenaProviderSettingsMap) => void;
    /** @deprecated Use settings slice actions instead (Phase 4). Will be removed in Phase 3. */
    updateArenaProviderSettings: (providerId: ArenaProviderType, updates: Partial<ArenaProviderSettingsMap[ArenaProviderType]>) => void;
    
    // UI state actions
    setArenaIsLoading: (isLoading: boolean) => void;
    setArenaIsStreaming: (isStreaming: boolean) => void;
    setArenaStreamingContent: (content: string) => void;
    appendArenaStreamingContent: (chunk: string) => void;
    setArenaStreamingMessageId: (messageId: string | null) => void;
    setArenaError: (error: string | null) => void;
    clearArenaError: () => void;
    
    // Agent / view actions
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
 * Create a new chat session
 */
export function createArenaSession(agent: ArenaAgentId, title?: string): ArenaSession {
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
 * Build the default sources list for an agent.
 */
export function buildDefaultSources(agentId: ArenaAgentId): ArenaSourceConfig[] {
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

const createArenaSlice: StateCreator<ArenaSlice> = (set, get) => ({
    // Initial state
    arenaSessions: [],
    arenaActiveSessionId: null,
    arenaMessages: [],
    arenaDocuments: [],
    arenaSettings: DEFAULT_ARENA_SETTINGS,
    arenaIsLoading: false,
    arenaIsStreaming: false,
    arenaStreamingContent: '',
    arenaStreamingMessageId: null,
    arenaError: null,
    arenaSelectedAgent: null,
    arenaView: 'select-agent' as ArenaView,
    arenaActiveSources: [],
    arenaSessionMetadata: null,
    arenaReferences: getDefaultReferences(),
    arenaProviderSettings: getDefaultProviderSettings(),
    
    // Session actions
    setArenaSessions: (sessions) => set({ arenaSessions: sessions }),
    
    addArenaSession: (session) => set((state) => {
        const { maxSessions } = state.arenaSettings;
        let sessions = [...state.arenaSessions, session];
        
        // Enforce max sessions limit (remove oldest)
        if (sessions.length > maxSessions) {
            sessions = sessions
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, maxSessions);
        }
        
        return { arenaSessions: sessions };
    }),
    
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
        const { maxMessagesPerSession } = state.arenaSettings;
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
    
    // Document actions
    setArenaDocuments: (documents) => set({ arenaDocuments: documents }),
    
    addArenaDocument: (document) => set((state) => ({
        arenaDocuments: [...state.arenaDocuments, document],
    })),
    
    updateArenaDocument: (documentId, updates) => set((state) => ({
        arenaDocuments: state.arenaDocuments.map((d) =>
            d.id === documentId ? { ...d, ...updates } : d
        ),
    })),
    
    removeArenaDocument: (documentId) => set((state) => ({
        arenaDocuments: state.arenaDocuments.filter((d) => d.id !== documentId),
    })),
    
    // Settings actions (deprecated — use settings slice instead)
    setArenaSettings: (settings) => set({ arenaSettings: settings }),
    
    updateArenaSettings: (updates) => set((state) => ({
        arenaSettings: { ...state.arenaSettings, ...updates },
    })),
    
    setArenaProviderSettings: (settings) => set({ arenaProviderSettings: settings }),
    
    updateArenaProviderSettings: (providerId, updates) => set((state) => ({
        arenaProviderSettings: {
            ...state.arenaProviderSettings,
            [providerId]: { ...state.arenaProviderSettings[providerId], ...updates },
        },
    })),
    
    // UI state actions
    setArenaIsLoading: (isLoading) => set({ arenaIsLoading: isLoading }),
    
    setArenaIsStreaming: (isStreaming) => set({ 
        arenaIsStreaming: isStreaming,
        // Clear streaming content when not streaming
        ...(isStreaming ? {} : { arenaStreamingContent: '', arenaStreamingMessageId: null }),
    }),
    
    setArenaStreamingContent: (content) => set({ arenaStreamingContent: content }),
    
    appendArenaStreamingContent: (chunk) => set((state) => ({
        arenaStreamingContent: state.arenaStreamingContent + chunk,
    })),
    
    setArenaStreamingMessageId: (messageId) => set({ arenaStreamingMessageId: messageId }),
    
    setArenaError: (error) => set({ arenaError: error }),
    
    clearArenaError: () => set({ arenaError: null }),
    
    // Agent / view actions
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
        arenaDocuments: [],
        arenaSettings: DEFAULT_ARENA_SETTINGS,
        arenaIsLoading: false,
        arenaIsStreaming: false,
        arenaStreamingContent: '',
        arenaStreamingMessageId: null,
        arenaError: null,
        arenaSelectedAgent: null,
        arenaView: 'select-agent' as ArenaView,
        arenaActiveSources: [],
        arenaSessionMetadata: null,
        arenaReferences: getDefaultReferences(),
        arenaProviderSettings: getDefaultProviderSettings(),
    }),
    
    getActiveArenaSession: () => {
        const state = get();
        return state.arenaSessions.find((s) => s.id === state.arenaActiveSessionId);
    },
});

export default createArenaSlice;
