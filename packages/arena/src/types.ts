/**
 * Arena types - shared type definitions for AI agents
 */

// ============================================================================
// Chat Types
// ============================================================================

/**
 * Role of a message in a conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * A single chat message
 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  /** Agent that generated this message (for assistant messages) */
  agent?: string;
  /** Tool call information (for tool messages) */
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
    result?: unknown;
  };
  /** Token count for context window management */
  tokenCount?: number;
}

/**
 * A chat session containing conversation history
 */
export interface ChatSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  /** Current agent for this session */
  activeAgent: string;
  /** Metadata for the session */
  metadata?: Record<string, unknown>;
}

/**
 * A chunk of streaming response
 */
export interface ChatChunk {
  /** Unique ID for this chunk */
  id: string;
  /** The content fragment */
  content: string;
  /** Whether this is the final chunk */
  done: boolean;
  /** The full message ID this chunk belongs to */
  messageId: string;
  /** Tool call in progress */
  toolCall?: {
    name: string;
    arguments?: string;
  };
  /** Error if something went wrong */
  error?: string;
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Web Expert agent query mode
 * - 'web': Query curated reference websites (RFCs, MDN, W3C, etc.)
 * - 'local': Search user-uploaded documents via vector store
 * - 'auto': Automatically determine the best source based on query
 */
export type WebExpertMode = 'web' | 'local' | 'auto';

/**
 * @deprecated Use WebExpertMode instead (Phase 1.3)
 */
export type LearnAgentMode = WebExpertMode;

/**
 * Definition of an available agent
 */
export interface ArenaAgent {
  id: string;
  name: string;
  description: string;
  /** Icon name (lucide icon) */
  icon: string;
  /** Whether this agent is enabled */
  enabled: boolean;
}

/**
 * A predefined command/prompt suggestion
 */
export interface ArenaCommand {
  /** The trigger string (e.g., '/help') */
  trigger: string;
  /** Which agent handles this command */
  agent: string;
  /** Human-readable label */
  label: string;
  /** Detailed description */
  description?: string;
}

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Supported LLM providers
 */
export type LLMProvider = 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'azure-openai' | 'copilot';

/**
 * Provider status information
 */
export interface ProviderStatus {
  provider: LLMProvider;
  configured: boolean;
  connected: boolean;
  model?: string;
  error?: string;
}

/**
 * Base provider configuration
 */
export interface BaseProviderConfig {
  provider: LLMProvider;
}

/**
 * Gemini provider configuration
 */
export interface GeminiConfig extends BaseProviderConfig {
  provider: 'gemini';
  apiKey: string;
  model?: string;
}

/**
 * OpenAI provider configuration
 */
export interface OpenAIConfig extends BaseProviderConfig {
  provider: 'openai';
  apiKey: string;
  model?: string;
  organization?: string;
}

/**
 * Anthropic provider configuration
 */
export interface AnthropicConfig extends BaseProviderConfig {
  provider: 'anthropic';
  apiKey: string;
  model?: string;
}

/**
 * Ollama provider configuration
 */
export interface OllamaConfig extends BaseProviderConfig {
  provider: 'ollama';
  baseUrl: string;
  model?: string;
}

/**
 * Azure OpenAI provider configuration
 */
export interface AzureOpenAIConfig extends BaseProviderConfig {
  provider: 'azure-openai';
  endpoint: string;
  apiKey: string;
  deploymentName: string;
  apiVersion?: string;
}

/**
 * Union of all provider configurations
 */
export type LLMProviderConfig =
  | GeminiConfig
  | OpenAIConfig
  | AnthropicConfig
  | OllamaConfig
  | AzureOpenAIConfig;

// ============================================================================
// Document Types
// ============================================================================

/**
 * Supported document types for Learn-Local
 */
export type DocumentType = 'pdf' | 'markdown' | 'text' | 'html';

/**
 * Information about an uploaded document
 */
export interface DocumentInfo {
  id: string;
  name: string;
  type: DocumentType;
  size: number;
  uploadedAt: number;
  /** Number of chunks/embeddings created */
  chunkCount?: number;
  /** Tags for categorization */
  tags?: string[];
}

// ============================================================================
// Reference Website Types
// ============================================================================

/**
 * A curated reference website for the Web Expert agent
 */
export interface ReferenceWebsite {
  id: string;
  name: string;
  url: string;
  description: string;
  /** Content categories this site covers */
  categories: string[];
  /** Whether to enable for queries */
  enabled: boolean;
}

/**
 * Default curated reference websites
 */
export const DEFAULT_REFERENCE_WEBSITES: ReferenceWebsite[] = [
  {
    id: 'ietf',
    name: 'IETF Datatracker',
    url: 'https://datatracker.ietf.org/',
    description: 'RFCs and Internet standards',
    categories: ['rfc', 'standards', 'protocols'],
    enabled: true,
  },
  {
    id: 'rfc-editor',
    name: 'RFC Editor',
    url: 'https://www.rfc-editor.org/',
    description: 'RFC documents',
    categories: ['rfc', 'standards'],
    enabled: true,
  },
  {
    id: 'standards-rest',
    name: 'REST Standards',
    url: 'https://standards.rest/',
    description: 'REST API standards',
    categories: ['rest', 'api', 'http'],
    enabled: true,
  },
  {
    id: 'mdn',
    name: 'MDN Web Docs',
    url: 'https://developer.mozilla.org/',
    description: 'Web APIs and HTTP reference',
    categories: ['web', 'http', 'api', 'javascript'],
    enabled: true,
  },
  {
    id: 'httpwg',
    name: 'HTTP Working Group',
    url: 'https://httpwg.org/',
    description: 'HTTP specifications',
    categories: ['http', 'standards'],
    enabled: true,
  },
  {
    id: 'w3c',
    name: 'W3C',
    url: 'https://www.w3.org/',
    description: 'Web standards',
    categories: ['web', 'standards', 'html', 'css'],
    enabled: true,
  },
  {
    id: 'whatwg',
    name: 'WHATWG',
    url: 'https://whatwg.org/',
    description: 'HTML, DOM, Fetch specs',
    categories: ['html', 'dom', 'fetch', 'standards'],
    enabled: true,
  },
];

// ============================================================================
// Settings Types
// ============================================================================

/**
 * Arena settings/configuration
 */
export interface ArenaSettings {
  /** Current LLM provider configuration */
  providerConfig?: LLMProviderConfig;
  /** Max sessions to keep (default: 5) */
  maxSessions: number;
  /** Max messages per session (default: 10) */
  maxMessagesPerSession: number;
  /** Max context window tokens (default: 150000) */
  maxContextTokens: number;
  /** Max document size in bytes (default: 50MB) */
  maxDocumentSize: number;
  /** Reference websites configuration */
  referenceWebsites: ReferenceWebsite[];
  /** Rate limit: requests per second per domain */
  rateLimitPerDomain: number;
}

/**
 * Default arena settings
 */
export const DEFAULT_ARENA_SETTINGS: ArenaSettings = {
  maxSessions: 5,
  maxMessagesPerSession: 10,
  maxContextTokens: 150000,
  maxDocumentSize: 50 * 1024 * 1024, // 50MB
  referenceWebsites: DEFAULT_REFERENCE_WEBSITES,
  rateLimitPerDomain: 1, // 1 req/sec
};

// ============================================================================
// Predefined Commands
// ============================================================================

/**
 * All available Arena commands
 */
export const ARENA_COMMANDS: ArenaCommand[] = [
  // Wave Client Agent
  {
    trigger: '/help',
    agent: 'wave-client',
    label: 'Get help with Wave Client',
    description: 'Get help with Wave Client features and capabilities',
  },
  {
    trigger: '/collections',
    agent: 'wave-client',
    label: 'Help with collections',
    description: 'Get help managing your API collections',
  },
  {
    trigger: '/flows',
    agent: 'wave-client',
    label: 'Help with flows',
    description: 'Learn about automation flows and how to use them',
  },
  {
    trigger: '/tests',
    agent: 'wave-client',
    label: 'Help with test suites',
    description: 'Get help with API testing and test suites',
  },
  {
    trigger: '/environments',
    agent: 'wave-client',
    label: 'Help with environments',
    description: 'Manage environments and variables',
  },

  // Web Expert Agent
  {
    trigger: '/http',
    agent: 'web-expert',
    label: 'HTTP protocols & standards',
    description: 'Learn about HTTP/1.1, HTTP/2, HTTP/3, headers, methods, status codes',
  },
  {
    trigger: '/rest',
    agent: 'web-expert',
    label: 'REST API design',
    description: 'REST principles, best practices, API design patterns',
  },
  {
    trigger: '/websocket',
    agent: 'web-expert',
    label: 'WebSocket protocol',
    description: 'WebSocket specification, real-time communication patterns',
  },
  {
    trigger: '/graphql',
    agent: 'web-expert',
    label: 'GraphQL',
    description: 'GraphQL queries, mutations, subscriptions, schema design',
  },
  {
    trigger: '/rfc',
    agent: 'web-expert',
    label: 'Look up an RFC',
    description: 'Find and explain a specific RFC document',
  },
];

/**
 * Available agents
 */
export const ARENA_AGENTS: ArenaAgent[] = [
  {
    id: 'wave-client',
    name: 'Wave Client',
    description: 'Wave Client assistant — feature help, collections, environments, flows, and test suites via MCP tools',
    icon: 'Zap',
    enabled: true,
  },
  {
    id: 'web-expert',
    name: 'Web Expert',
    description: 'Web technologies expert — HTTP protocols, REST, GraphQL, WebSocket, OAuth, and internet standards',
    icon: 'Globe',
    enabled: true,
  },
];
