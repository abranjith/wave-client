/**
 * Arena Types for Wave Client Core
 * 
 * Types used by the Arena AI chat feature in the UI layer.
 * These are distinct from the arena package types which are used
 * for the LangGraph agent implementation.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Available agents
 */
export const ARENA_AGENTS = {
  LEARN: 'learn',
  DISCOVER: 'discover',
} as const;

export type ArenaAgentId = typeof ARENA_AGENTS[keyof typeof ARENA_AGENTS];

/**
 * Available commands
 */
export const ARENA_COMMANDS = {
  // Learn agent commands
  LEARN_HTTP: '/learn-http',
  LEARN_REST: '/learn-rest',
  LEARN_WEBSOCKET: '/learn-websocket',
  LEARN_GRAPHQL: '/learn-graphql',
  LEARN_WEB: '/learn-web',
  LEARN_LOCAL: '/learn-local',
  
  // Discover agent commands
  HELP: '/help',
  COLLECTIONS: '/collections',
  ENVIRONMENTS: '/environments',
  FLOWS: '/flows',
  TESTS: '/tests',
} as const;

export type ArenaCommandId = typeof ARENA_COMMANDS[keyof typeof ARENA_COMMANDS];

/**
 * Command definition with metadata
 */
export interface ArenaCommand {
  id: ArenaCommandId;
  label: string;
  description: string;
  agent: ArenaAgentId;
  placeholder?: string;
}

/**
 * All available commands with metadata
 */
export const ARENA_COMMAND_DEFINITIONS: ArenaCommand[] = [
  // Learn agent commands
  {
    id: ARENA_COMMANDS.LEARN_HTTP,
    label: 'HTTP Protocols',
    description: 'Learn about HTTP/1.1, HTTP/2, HTTP/3, headers, methods, status codes',
    agent: ARENA_AGENTS.LEARN,
    placeholder: 'Ask about HTTP protocols...',
  },
  {
    id: ARENA_COMMANDS.LEARN_REST,
    label: 'REST APIs',
    description: 'Learn about REST principles, best practices, API design',
    agent: ARENA_AGENTS.LEARN,
    placeholder: 'Ask about REST APIs...',
  },
  {
    id: ARENA_COMMANDS.LEARN_WEBSOCKET,
    label: 'WebSocket',
    description: 'Learn about WebSocket protocol, real-time communication',
    agent: ARENA_AGENTS.LEARN,
    placeholder: 'Ask about WebSocket...',
  },
  {
    id: ARENA_COMMANDS.LEARN_GRAPHQL,
    label: 'GraphQL',
    description: 'Learn about GraphQL queries, mutations, subscriptions',
    agent: ARENA_AGENTS.LEARN,
    placeholder: 'Ask about GraphQL...',
  },
  {
    id: ARENA_COMMANDS.LEARN_WEB,
    label: 'Web Technologies',
    description: 'Learn from curated reference sites (MDN, IETF, W3C)',
    agent: ARENA_AGENTS.LEARN,
    placeholder: 'Ask about web technologies...',
  },
  {
    id: ARENA_COMMANDS.LEARN_LOCAL,
    label: 'Local Docs',
    description: 'Ask questions about your uploaded documentation',
    agent: ARENA_AGENTS.LEARN,
    placeholder: 'Ask about your documents...',
  },
  
  // Discover agent commands
  {
    id: ARENA_COMMANDS.HELP,
    label: 'Help',
    description: 'Get help with Wave Client features',
    agent: ARENA_AGENTS.DISCOVER,
    placeholder: 'What would you like help with?',
  },
  {
    id: ARENA_COMMANDS.COLLECTIONS,
    label: 'Collections',
    description: 'Manage and explore your request collections',
    agent: ARENA_AGENTS.DISCOVER,
    placeholder: 'Ask about collections...',
  },
  {
    id: ARENA_COMMANDS.ENVIRONMENTS,
    label: 'Environments',
    description: 'Manage environments and variables',
    agent: ARENA_AGENTS.DISCOVER,
    placeholder: 'Ask about environments...',
  },
  {
    id: ARENA_COMMANDS.FLOWS,
    label: 'Flows',
    description: 'Create and run request flows',
    agent: ARENA_AGENTS.DISCOVER,
    placeholder: 'Ask about flows...',
  },
  {
    id: ARENA_COMMANDS.TESTS,
    label: 'Tests',
    description: 'Create and run test suites',
    agent: ARENA_AGENTS.DISCOVER,
    placeholder: 'Ask about tests...',
  },
];

// ============================================================================
// Message Types
// ============================================================================

/**
 * Role of a message in the chat
 */
export type ArenaMessageRole = 'user' | 'assistant' | 'system';

/**
 * Status of a message
 */
export type ArenaMessageStatus = 'pending' | 'streaming' | 'complete' | 'error';

/**
 * A chat message in the Arena
 */
export interface ArenaMessage {
  id: string;
  sessionId: string;
  role: ArenaMessageRole;
  content: string;
  status: ArenaMessageStatus;
  timestamp: number;
  /** Command that triggered this message (if any) */
  command?: ArenaCommandId;
  /** Token count estimate */
  tokenCount?: number;
  /** Error message if status is 'error' */
  error?: string;
  /** Sources/references used in the response */
  sources?: ArenaMessageSource[];
}

/**
 * Source reference in a message
 */
export interface ArenaMessageSource {
  type: 'web' | 'document' | 'collection' | 'environment' | 'flow';
  title: string;
  url?: string;
  excerpt?: string;
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * A chat session in the Arena
 */
export interface ArenaSession {
  id: string;
  title: string;
  agent: ArenaAgentId;
  createdAt: number;
  updatedAt: number;
  /** Total messages in the session */
  messageCount: number;
}

/**
 * Full session with messages (for display)
 */
export interface ArenaSessionWithMessages extends ArenaSession {
  messages: ArenaMessage[];
}

// ============================================================================
// Document Types
// ============================================================================

/**
 * A user-uploaded document for the Learn agent
 */
export interface ArenaDocument {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  /** Whether the document has been processed/indexed */
  processed: boolean;
  /** Number of chunks after processing */
  chunkCount?: number;
  /** Processing error if any */
  error?: string;
}

// ============================================================================
// Settings Types
// ============================================================================

/**
 * LLM Provider type
 */
export type ArenaProviderType = 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'copilot';

/**
 * Arena settings (stored in AppSettings)
 */
export interface ArenaSettings {
  /** Current LLM provider */
  provider: ArenaProviderType;
  /** API key for cloud providers */
  apiKey?: string;
  /** Model to use (provider-specific) */
  model?: string;
  /** Base URL for Ollama */
  ollamaBaseUrl?: string;
  /** Max sessions to keep */
  maxSessions: number;
  /** Max messages per session */
  maxMessagesPerSession: number;
  /** Max document upload size in bytes */
  maxDocumentSize: number;
  /** Enable streaming responses */
  enableStreaming: boolean;
  /** Custom reference websites for /learn-web */
  customReferenceSites?: string[];
}

/**
 * Default Arena settings
 */
export const DEFAULT_ARENA_SETTINGS: ArenaSettings = {
  provider: 'gemini',
  maxSessions: 5,
  maxMessagesPerSession: 10,
  maxDocumentSize: 50 * 1024 * 1024, // 50MB
  enableStreaming: true,
};

// ============================================================================
// UI State Types
// ============================================================================

/**
 * Arena UI state for the Zustand store
 */
export interface ArenaState {
  /** All sessions */
  sessions: ArenaSession[];
  /** Currently active session ID */
  activeSessionId: string | null;
  /** Messages for the active session */
  messages: ArenaMessage[];
  /** Uploaded documents */
  documents: ArenaDocument[];
  /** Arena settings */
  settings: ArenaSettings;
  /** Whether Arena is loading */
  isLoading: boolean;
  /** Whether a message is being streamed */
  isStreaming: boolean;
  /** Current streaming message content */
  streamingContent: string;
  /** Error state */
  error: string | null;
}

/**
 * Arena actions for the Zustand store
 */
export interface ArenaActions {
  // Session management
  createSession(agent: ArenaAgentId, title?: string): Promise<string>;
  deleteSession(sessionId: string): Promise<void>;
  setActiveSession(sessionId: string | null): Promise<void>;
  loadSessions(): Promise<void>;
  
  // Message management
  sendMessage(content: string, command?: ArenaCommandId): Promise<void>;
  cancelMessage(): void;
  loadMessages(sessionId: string): Promise<void>;
  
  // Document management
  uploadDocument(file: File): Promise<void>;
  deleteDocument(documentId: string): Promise<void>;
  loadDocuments(): Promise<void>;
  
  // Settings
  updateSettings(settings: Partial<ArenaSettings>): Promise<void>;
  loadSettings(): Promise<void>;
  
  // Utilities
  clearError(): void;
  reset(): void;
}

/**
 * Combined Arena slice type
 */
export type ArenaSlice = ArenaState & ArenaActions;

// ============================================================================
// Request/Response Types for Adapter
// ============================================================================

/**
 * Request to send a chat message
 */
export interface ArenaChatRequest {
  sessionId: string;
  message: string;
  command?: ArenaCommandId;
  agent: ArenaAgentId;
  /** Context messages for the conversation */
  history: ArenaMessage[];
  /** Settings for the request */
  settings: ArenaSettings;
}

/**
 * Response from a chat request
 */
export interface ArenaChatResponse {
  messageId: string;
  content: string;
  sources?: ArenaMessageSource[];
  tokenCount?: number;
}

/**
 * Streaming chunk from a chat request
 */
export interface ArenaChatStreamChunk {
  messageId: string;
  content: string;
  done: boolean;
  sources?: ArenaMessageSource[];
  tokenCount?: number;
}
