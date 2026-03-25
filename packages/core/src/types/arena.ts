/**
 * Arena Types for Wave Client Core
 *
 * Types used by the Arena AI chat feature in the UI layer.
 * Agent definitions, provider config, model lists, API URLs, and defaults
 * all live in `config/arenaConfig.ts` — this file contains only the
 * domain / state / adapter types consumed by components and the store.
 */

// Re-export streaming state machine types for convenience
export type {
  ArenaStreamState,
  ArenaStreamManager,
  ArenaStreamCallbacks,
} from './arenaStreaming';

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
  isProviderConfigured,
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
  HELP: '/help',
  COLLECTIONS: '/collections',
  ENVIRONMENTS: '/environments',
  FLOWS: '/flows',
  TESTS: '/tests',
  PROTOCOLS: '/protocols',
  SECURITY: '/security',
  STANDARDS: '/standards',
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
  /** When true, this command is available to all agents regardless of the `agent` field */
  universal?: boolean;
}

/**
 * All available commands with metadata.
 * Used in the chat input command palette when the user types `/`.
 */
export const ARENA_COMMAND_DEFINITIONS: ArenaCommand[] = [
  {
    id: ARENA_COMMANDS.HELP,
    label: 'Help',
    description: 'Get help and see what this agent can do',
    agent: 'wave-client',
    placeholder: 'What would you like help with?',
    universal: true,
  },
  {
    id: ARENA_COMMANDS.COLLECTIONS,
    label: 'Collections',
    description: 'List, search, and inspect API collections',
    agent: 'wave-client',
    placeholder: 'Ask about collections...',
  },
  {
    id: ARENA_COMMANDS.ENVIRONMENTS,
    label: 'Environments',
    description: 'List environments and inspect variables',
    agent: 'wave-client',
    placeholder: 'Ask about environments...',
  },
  {
    id: ARENA_COMMANDS.FLOWS,
    label: 'Flows',
    description: 'List and execute automation flows',
    agent: 'wave-client',
    placeholder: 'Ask about flows...',
  },
  {
    id: ARENA_COMMANDS.TESTS,
    label: 'Tests',
    description: 'List and run test suites',
    agent: 'wave-client',
    placeholder: 'Ask about tests...',
  },
  {
    id: ARENA_COMMANDS.PROTOCOLS,
    label: 'Protocols',
    description: 'Ask about HTTP, WebSocket, gRPC, GraphQL, and transport protocols',
    agent: 'web-expert',
    placeholder: 'Ask about protocols...',
  },
  {
    id: ARENA_COMMANDS.SECURITY,
    label: 'Security',
    description: 'Ask about TLS, OAuth, CORS, CSP, and web security',
    agent: 'web-expert',
    placeholder: 'Ask about security...',
  },
  {
    id: ARENA_COMMANDS.STANDARDS,
    label: 'Standards',
    description: 'Ask about RFCs, W3C specs, WHATWG standards, and API design',
    agent: 'web-expert',
    placeholder: 'Ask about standards...',
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
  type: 'web' | 'collection' | 'environment' | 'flow';
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

/**
 * Arena initialization readiness state.
 *
 * - `'idle'`         — Arena not yet mounted; no data has been requested.
 * - `'loading'`      — Fetching sessions, settings, provider config, and references.
 * - `'ready'`        — All data loaded and at least one provider is configured.
 * - `'needs-config'` — Data loaded but no provider is enabled or configured.
 */
export type ArenaReadinessState = 'idle' | 'loading' | 'ready' | 'needs-config';

/**
 * MCP server connection status (wave-client agent only).
 *
 * - `'disconnected'` — MCP server not running
 * - `'connecting'`   — MCP server starting / reconnecting
 * - `'connected'`    — MCP server running and responding
 * - `'error'`        — MCP server failed to start or lost connection
 */
export type McpStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

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
  /** MCP server connection status (relevant for wave-client agent) */
  mcpStatus: McpStatus;
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

  // MCP
  setMcpStatus(status: McpStatus): void;

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
  /** Incremental text delta (never accumulated — append to existing content). */
  content: string;
  done: boolean;
  sources?: ArenaMessageSource[];
  tokenCount?: number;
  /** Blocks emitted so far (only present on final chunk or when done=true) */
  blocks?: import('./arenaChatBlocks').ArenaChatBlock[];
  /**
   * Error detail from the provider or agent.
   * When set, `content` should be empty — errors are displayed
   * separately by the UI, not concatenated into the message body.
   */
  error?: string;
  /**
   * When true, this is a keep-alive heartbeat with no content.
   * The UI should reset its safety timeout and show a progress indicator
   * but must NOT append `content` (which will be empty) to the message body.
   */
  heartbeat?: boolean;
  /**
   * 0-indexed per-stream sequence number assigned by `ArenaService.streamChat()`.
   * Used by `useArenaStreamManager` to reorder chunks that arrive out of order
   * due to transport anomalies.
   * Heartbeat and error chunks may omit this field.
   */
  seq?: number;
}

// ============================================================================
// StreamHandle — explicit lifecycle for streaming chat
// ============================================================================

/**
 * Unsubscribe function returned by StreamHandle event subscriptions.
 * Calling it removes the listener; calling it more than once is a no-op.
 */
export type StreamUnsubscribe = () => void;

/**
 * Explicit lifecycle handle for a streaming chat response.
 *
 * Returned synchronously by `IArenaAdapter.streamMessage()` so the caller
 * can subscribe to events and cancel the stream without holding a Promise.
 *
 * Lifecycle:
 *   1. `onChunk(cb)` — 0‥N incremental text chunks.
 *   2. `onDone(cb)` / `onError(cb)` — exactly one of these fires to end the stream.
 *   3. `cancel()` — may be called at any time; triggers `onError('Cancelled')`.
 *
 * All callbacks are invoked synchronously on the next microtask after the
 * underlying transport delivers data.  Calling `cancel()` after the stream
 * has already completed (done or errored) is a safe no-op.
 */
export interface StreamHandle {
  /** Subscribe to incremental text chunks (content delta, not accumulated). */
  onChunk(cb: (chunk: ArenaChatStreamChunk) => void): StreamUnsubscribe;
  /** Subscribe to the final complete response (fires once, stream ends). */
  onDone(cb: (response: ArenaChatResponse) => void): StreamUnsubscribe;
  /** Subscribe to stream errors (fires once, stream ends). */
  onError(cb: (error: string) => void): StreamUnsubscribe;
  /** Cancel the in-flight stream. Safe to call multiple times. */
  cancel(): void;
}
