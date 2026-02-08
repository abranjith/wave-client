/**
 * Arena Types for Wave Client Core
 *
 * Types used by the Arena AI chat feature in the UI layer.
 * Agent definitions, provider config, model lists, API URLs, and defaults
 * all live in `config/arenaConfig.ts` — this file contains only the
 * domain / state / adapter types consumed by components and the store.
 */

// Re-export configuration constants so existing consumers keep working
// with a single import path.
export {
  // Agent IDs & definitions
  ARENA_AGENT_IDS,
  ARENA_AGENT_DEFINITIONS,
  getAgentDefinition,
  // Provider definitions
  PROVIDER_DEFINITIONS,
  getProviderDefinition,
  // Model definitions
  MODEL_DEFINITIONS,
  getModelsForProvider,
  // API URLs
  GEMINI_API_BASE_URL,
  OLLAMA_DEFAULT_BASE_URL,
  GEMINI_LIST_MODELS_URL,
  geminiGenerateContentUrl,
  geminiStreamUrl,
  geminiModelsUrl,
  ollamaChatUrl,
  ollamaTagsUrl,
  // Reference websites
  DEFAULT_REFERENCE_WEBSITES,
  // Storage
  STORAGE_KEYS,
  ARENA_DOCS_DIR,
  ARENA_DOCS_METADATA_FILE,
  // Session metadata
  createSessionMetadata,
  // Settings
  DEFAULT_ARENA_SETTINGS,
  // LLM defaults
  LLM_DEFAULTS,
} from '../config/arenaConfig';

export type {
  ArenaAgentId,
  ArenaAgentDefinition,
  ArenaSourceType,
  ArenaSourceConfig,
  ReferenceWebsite,
  ArenaProviderType,
  ProviderDefinition,
  ModelDefinition,
  ArenaSessionMetadata,
  ArenaSettings,
} from '../config/arenaConfig';

// ============================================================================
// Legacy Aliases (deprecated — use ARENA_AGENT_IDS instead)
// ============================================================================

import { ARENA_AGENT_IDS } from '../config/arenaConfig';

/**
 * @deprecated Use `ARENA_AGENT_IDS` from `config/arenaConfig` instead.
 */
export const ARENA_AGENTS = ARENA_AGENT_IDS;

// ============================================================================
// Commands
// ============================================================================

/**
 * Commands are now internal to agents and auto-resolved based on the agent.
 * These IDs remain available for backwards compatibility with existing
 * chat history persisted in storage.
 */
export const ARENA_COMMANDS = {
  // learn-web agent
  LEARN_HTTP: '/learn-http',
  LEARN_REST: '/learn-rest',
  LEARN_WEBSOCKET: '/learn-websocket',
  LEARN_GRAPHQL: '/learn-graphql',
  LEARN_WEB: '/learn-web',

  // learn-docs agent
  LEARN_LOCAL: '/learn-local',

  // wave-client agent
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
  agent: import('../config/arenaConfig').ArenaAgentId;
  placeholder?: string;
}

/**
 * All available commands with metadata.
 * These are now used internally within the chat input command palette;
 * the primary UX entry point is agent selection, not command selection.
 */
export const ARENA_COMMAND_DEFINITIONS: ArenaCommand[] = [
  // learn-web agent commands
  {
    id: ARENA_COMMANDS.LEARN_HTTP,
    label: 'HTTP Protocols',
    description: 'Learn about HTTP/1.1, HTTP/2, HTTP/3, headers, methods, status codes',
    agent: ARENA_AGENT_IDS.LEARN_WEB,
    placeholder: 'Ask about HTTP protocols...',
  },
  {
    id: ARENA_COMMANDS.LEARN_REST,
    label: 'REST APIs',
    description: 'Learn about REST principles, best practices, API design',
    agent: ARENA_AGENT_IDS.LEARN_WEB,
    placeholder: 'Ask about REST APIs...',
  },
  {
    id: ARENA_COMMANDS.LEARN_WEBSOCKET,
    label: 'WebSocket',
    description: 'Learn about WebSocket protocol, real-time communication',
    agent: ARENA_AGENT_IDS.LEARN_WEB,
    placeholder: 'Ask about WebSocket...',
  },
  {
    id: ARENA_COMMANDS.LEARN_GRAPHQL,
    label: 'GraphQL',
    description: 'Learn about GraphQL queries, mutations, subscriptions',
    agent: ARENA_AGENT_IDS.LEARN_WEB,
    placeholder: 'Ask about GraphQL...',
  },
  {
    id: ARENA_COMMANDS.LEARN_WEB,
    label: 'Web Technologies',
    description: 'Learn from curated reference sites (MDN, IETF, W3C)',
    agent: ARENA_AGENT_IDS.LEARN_WEB,
    placeholder: 'Ask about web technologies...',
  },

  // learn-docs agent commands
  {
    id: ARENA_COMMANDS.LEARN_LOCAL,
    label: 'Local Docs',
    description: 'Ask questions about your uploaded documentation',
    agent: ARENA_AGENT_IDS.LEARN_DOCS,
    placeholder: 'Ask about your documents...',
  },

  // wave-client agent commands
  {
    id: ARENA_COMMANDS.HELP,
    label: 'Help',
    description: 'Get help with Wave Client features',
    agent: ARENA_AGENT_IDS.WAVE_CLIENT,
    placeholder: 'What would you like help with?',
  },
  {
    id: ARENA_COMMANDS.COLLECTIONS,
    label: 'Collections',
    description: 'Manage and explore your request collections',
    agent: ARENA_AGENT_IDS.WAVE_CLIENT,
    placeholder: 'Ask about collections...',
  },
  {
    id: ARENA_COMMANDS.ENVIRONMENTS,
    label: 'Environments',
    description: 'Manage environments and variables',
    agent: ARENA_AGENT_IDS.WAVE_CLIENT,
    placeholder: 'Ask about environments...',
  },
  {
    id: ARENA_COMMANDS.FLOWS,
    label: 'Flows',
    description: 'Create and run request flows',
    agent: ARENA_AGENT_IDS.WAVE_CLIENT,
    placeholder: 'Ask about flows...',
  },
  {
    id: ARENA_COMMANDS.TESTS,
    label: 'Tests',
    description: 'Create and run test suites',
    agent: ARENA_AGENT_IDS.WAVE_CLIENT,
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
/** Status of a message */
export type ArenaMessageStatus = 'pending' | 'streaming' | 'complete' | 'error';

/** A chat message in the Arena */
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

/** Source reference in a message */
export interface ArenaMessageSource {
  type: 'web' | 'document' | 'collection' | 'environment' | 'flow';
  title: string;
  url?: string;
  excerpt?: string;
}

// ============================================================================
// Session Types
// ============================================================================

/** A chat session in the Arena */
export interface ArenaSession {
  id: string;
  title: string;
  agent: import('../config/arenaConfig').ArenaAgentId;
  createdAt: number;
  updatedAt: number;
  /** Total messages in the session */
  messageCount: number;
  /** Session metadata (tokens, duration, etc.) */
  metadata?: import('../config/arenaConfig').ArenaSessionMetadata;
}

/** Full session with messages (for display) */
export interface ArenaSessionWithMessages extends ArenaSession {
  messages: ArenaMessage[];
}

// ============================================================================
// Document Types
// ============================================================================

/** A user-uploaded document for the Learn agent */
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
// UI State Types
// ============================================================================

/** Current view in the Arena pane */
export type ArenaView = 'select-agent' | 'chat' | 'settings';

/** Arena UI state for the Zustand store */
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
  settings: import('../config/arenaConfig').ArenaSettings;
  /** Whether Arena is loading */
  isLoading: boolean;
  /** Whether a message is being streamed */
  isStreaming: boolean;
  /** Current streaming message content */
  streamingContent: string;
  /** Error state */
  error: string | null;
  /** Currently selected agent (null = show agent selection) */
  selectedAgent: import('../config/arenaConfig').ArenaAgentId | null;
  /** Current view in the Arena pane */
  arenaView: ArenaView;
  /** Active sources for the current agent (toolbar) */
  activeSources: import('../config/arenaConfig').ArenaSourceConfig[];
}

/** Arena actions for the Zustand store */
export interface ArenaActions {
  // Session management
  createSession(agent: import('../config/arenaConfig').ArenaAgentId, title?: string): Promise<string>;
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
  updateSettings(settings: Partial<import('../config/arenaConfig').ArenaSettings>): Promise<void>;
  loadSettings(): Promise<void>;

  // Agent / view
  selectAgent(agentId: import('../config/arenaConfig').ArenaAgentId): void;
  setArenaView(view: ArenaView): void;
  setActiveSources(sources: import('../config/arenaConfig').ArenaSourceConfig[]): void;

  // Utilities
  clearError(): void;
  reset(): void;
}

/** Combined Arena slice type */
export type ArenaSlice = ArenaState & ArenaActions;

// ============================================================================
// Request/Response Types for Adapter
// ============================================================================

/** Request to send a chat message */
export interface ArenaChatRequest {
  sessionId: string;
  message: string;
  command?: ArenaCommandId;
  agent: import('../config/arenaConfig').ArenaAgentId;
  /** Context messages for the conversation */
  history: ArenaMessage[];
  /** Settings for the request */
  settings: import('../config/arenaConfig').ArenaSettings;
}

/** Response from a chat request */
export interface ArenaChatResponse {
  messageId: string;
  content: string;
  sources?: ArenaMessageSource[];
  tokenCount?: number;
}

/** Streaming chunk from a chat request */
export interface ArenaChatStreamChunk {
  messageId: string;
  content: string;
  done: boolean;
  sources?: ArenaMessageSource[];
  tokenCount?: number;
}
