import { StateCreator } from 'zustand';
import type {
    ArenaSession,
    ArenaMessage,
    ArenaDocument,
    ArenaSettings,
    ArenaAgentId,
    ArenaCommandId,
    ArenaMessageStatus,
} from '../../types/arena';
import { DEFAULT_ARENA_SETTINGS } from '../../types/arena';

// ============================================================================
// Types
// ============================================================================

export interface ArenaSlice {
    // State
    arenaSessions: ArenaSession[];
    arenaActiveSessionId: string | null;
    arenaMessages: ArenaMessage[];
    arenaDocuments: ArenaDocument[];
    arenaSettings: ArenaSettings;
    arenaIsLoading: boolean;
    arenaIsStreaming: boolean;
    arenaStreamingContent: string;
    arenaStreamingMessageId: string | null;
    arenaError: string | null;
    
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
    setArenaSettings: (settings: ArenaSettings) => void;
    updateArenaSettings: (updates: Partial<ArenaSettings>) => void;
    
    // UI state actions
    setArenaIsLoading: (isLoading: boolean) => void;
    setArenaIsStreaming: (isStreaming: boolean) => void;
    setArenaStreamingContent: (content: string) => void;
    appendArenaStreamingContent: (chunk: string) => void;
    setArenaStreamingMessageId: (messageId: string | null) => void;
    setArenaError: (error: string | null) => void;
    clearArenaError: () => void;
    
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
    return {
        id: generateId('session'),
        title: title || `New ${agent === 'learn' ? 'Learn' : 'Discover'} Chat`,
        agent,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
    };
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
    
    // Settings actions
    setArenaSettings: (settings) => set({ arenaSettings: settings }),
    
    updateArenaSettings: (updates) => set((state) => ({
        arenaSettings: { ...state.arenaSettings, ...updates },
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
    }),
    
    getActiveArenaSession: () => {
        const state = get();
        return state.arenaSessions.find((s) => s.id === state.arenaActiveSessionId);
    },
});

export default createArenaSlice;
