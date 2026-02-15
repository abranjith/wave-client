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
  ARENA_DIR,
  ARENA_REFERENCES_FILE,
  ARENA_PROVIDER_SETTINGS_FILE,
  // Session metadata
  createSessionMetadata,
  // Settings
  DEFAULT_ARENA_SETTINGS,
  // LLM defaults
  LLM_DEFAULTS,
  // Reference helpers
  getDefaultReferences,
  mergeReferences,
  // Provider settings helpers
  getDefaultProviderSettings,
  getEnabledProviders,
  getEnabledModels,
} from '../config/arenaConfig';

export type {
  ArenaAgentId,
  ArenaAgentDefinition,
  ArenaSourceType,
  ArenaSourceConfig,
  ArenaReference,
  ReferenceWebsite,
  ArenaProviderType,
  ProviderDefinition,
  ModelDefinition,
  ArenaSessionMetadata,
  ArenaSettings,
  ArenaProviderSettings,
  ArenaProviderSettingsMap,
} from '../config/arenaConfig';

// Re-export chat block types
export type {
  ArenaChatBlock,
  ArenaChatBlockType,
  TextBlock,
  CodeBlock,
  JsonViewerBlock,
  RequestFormBlock,
  ResponseViewerBlock,
  EnvSelectorBlock,
  TableBlock,
  ConfirmationBlock,
  ProgressBlock,
  EnvOption,
  RequestFormData,
} from './arenaChatBlocks';

export {
  textBlock,
  codeBlock,
  jsonViewerBlock,
  tableBlock,
  progressBlock,
} from './arenaChatBlocks';

// ============================================================================
// Commands
// ============================================================================

/**
 * Commands are internal to agents and auto-resolved based on the agent.
 * Each command is associated with exactly one agent.
 */
export const ARENA_COMMANDS = {
  // wave-client agent
  HELP: '/help',
  COLLECTIONS: '/collections',
  ENVIRONMENTS: '/environments',
  FLOWS: '/flows',
  TESTS: '/tests',

  // web-expert agent
  HTTP: '/http',
  REST: '/rest',
  WEBSOCKET: '/websocket',
  GRAPHQL: '/graphql',
  RFC: '/rfc',
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
 * Used in the chat input command palette when the user types `/`.
 */
export const ARENA_COMMAND_DEFINITIONS: ArenaCommand[] = [
  // wave-client agent commands
  {
    id: ARENA_COMMANDS.HELP,
    label: 'Help',
    description: 'Get help with Wave Client features',
    agent: 'wave-client',
    placeholder: 'What would you like help with?',
  },
  {
    id: ARENA_COMMANDS.COLLECTIONS,
    label: 'Collections',
    description: 'Manage and explore your request collections',
    agent: 'wave-client',
    placeholder: 'Ask about collections...',
  },
  {
    id: ARENA_COMMANDS.ENVIRONMENTS,
    label: 'Environments',
    description: 'Manage environments and variables',
    agent: 'wave-client',
    placeholder: 'Ask about environments...',
  },
  {
    id: ARENA_COMMANDS.FLOWS,
    label: 'Flows',
    description: 'Create and run request flows',
    agent: 'wave-client',
    placeholder: 'Ask about flows...',
  },
  {
    id: ARENA_COMMANDS.TESTS,
    label: 'Tests',
    description: 'Create and run test suites',
    agent: 'wave-client',
    placeholder: 'Ask about tests...',
  },

  // web-expert agent commands
  {
    id: ARENA_COMMANDS.HTTP,
    label: 'HTTP Protocols',
    description: 'Learn about HTTP/1.1, HTTP/2, HTTP/3, headers, methods, status codes',
    agent: 'web-expert',
    placeholder: 'Ask about HTTP protocols...',
  },
  {
    id: ARENA_COMMANDS.REST,
    label: 'REST APIs',
    description: 'Learn about REST principles, best practices, API design',
    agent: 'web-expert',
    placeholder: 'Ask about REST APIs...',
  },
  {
    id: ARENA_COMMANDS.WEBSOCKET,
    label: 'WebSocket',
    description: 'Learn about WebSocket protocol, real-time communication',
    agent: 'web-expert',
    placeholder: 'Ask about WebSocket...',
  },
  {
    id: ARENA_COMMANDS.GRAPHQL,
    label: 'GraphQL',
    description: 'Learn about GraphQL queries, mutations, subscriptions',
    agent: 'web-expert',
    placeholder: 'Ask about GraphQL...',
  },
  {
    id: ARENA_COMMANDS.RFC,
    label: 'RFC Lookup',
    description: 'Find and explain a specific RFC document',
    agent: 'web-expert',
    placeholder: 'Which RFC would you like to look up?',
  },
];

// ============================================================================
// Message Types
// ============================================================================

/**
 * Role of a message in the chat
 */
export type ArenaMessageRole = 'user' | 'assistant' | 'system';

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
  /**
   * Rich content blocks for this message.
   *
   * When present and non-empty, the UI renders each block via
   * `ArenaBlockRenderer` instead of treating `content` as raw markdown.
   * Backward-compatible: if absent or empty, falls back to `content`.
   */
  blocks?: import('./arenaChatBlocks').ArenaChatBlock[];
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
// Document Types (deprecated — will be removed in future phase)
// ============================================================================

/**
 * @deprecated The learn-docs agent has been removed. This type is kept
 * temporarily for adapter backward compatibility and will be removed
 * when adapters are refactored (Phase 5).
 */
export interface ArenaDocument {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  processed: boolean;
  chunkCount?: number;
  error?: string;
}

// ============================================================================
// UI State Types
// ============================================================================

/**
 * Current view in the Arena pane.
 *
 * After the refactor, the only real view is 'chat' (with welcome screen
 * shown when there are no messages). The other values are kept temporarily
 * for backward compatibility with ArenaPane / ArenaSettings until Phase 3
 * replaces those components.
 */
export type ArenaView = 'chat' | 'select-agent' | 'settings';

/** Arena UI state for the Zustand store */
export interface ArenaState {
  /** All sessions */
  sessions: ArenaSession[];
  /** Currently active session ID */
  activeSessionId: string | null;
  /** Messages for the active session */
  messages: ArenaMessage[];
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
  /** Currently selected agent (null = show welcome) */
  selectedAgent: import('../config/arenaConfig').ArenaAgentId | null;
  /** Current view in the Arena pane */
  arenaView: ArenaView;
  /** Active sources for the current agent */
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
  /** Optional rich blocks to render instead of raw content */
  blocks?: import('./arenaChatBlocks').ArenaChatBlock[];
}

/** Streaming chunk from a chat request */
export interface ArenaChatStreamChunk {
  messageId: string;
  content: string;
  done: boolean;
  sources?: ArenaMessageSource[];
  tokenCount?: number;
  /** Blocks emitted so far (only present on final chunk or when done=true) */
  blocks?: import('./arenaChatBlocks').ArenaChatBlock[];
}
