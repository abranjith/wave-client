/**
 * Arena Configuration Constants
 *
 * Single source of truth for all Arena-related configuration.
 * All hardcoded values (API URLs, model lists, default settings,
 * reference websites, storage keys, etc.) are centralized here.
 *
 * Import from this module instead of defining local constants.
 */

// ============================================================================
// Agent Definitions
// ============================================================================

/**
 * Arena Agent IDs
 */
export const ARENA_AGENT_IDS = {
  LEARN_WEB: 'learn-web',
  LEARN_DOCS: 'learn-docs',
  WAVE_CLIENT: 'wave-client',
} as const;

export type ArenaAgentId = typeof ARENA_AGENT_IDS[keyof typeof ARENA_AGENT_IDS];

/**
 * Agent definition used for rendering the agent selection page and
 * populating per-agent defaults throughout the UI.
 */
export interface ArenaAgentDefinition {
  id: ArenaAgentId;
  label: string;
  description: string;
  /** Lucide icon name — resolved by the component at render time */
  iconName: 'Globe' | 'FileText' | 'Zap';
  /** Accent colour class for the icon (Tailwind) */
  iconColor: string;
  /** Placeholder text shown in the chat input */
  placeholder: string;
  /** Default source types available for this agent */
  defaultSourceTypes: ArenaSourceType[];
}

/**
 * All agents, in display order.
 */
export const ARENA_AGENT_DEFINITIONS: ArenaAgentDefinition[] = [
  {
    id: ARENA_AGENT_IDS.LEARN_WEB,
    label: 'Learn Web',
    description: 'Explore HTTP, REST, WebSocket, GraphQL and web standards from curated sources like MDN, IETF, and W3C.',
    iconName: 'Globe',
    iconColor: 'text-emerald-500',
    placeholder: 'Ask about web technologies...',
    defaultSourceTypes: ['web'],
  },
  {
    id: ARENA_AGENT_IDS.LEARN_DOCS,
    label: 'Learn Docs',
    description: 'Ask questions about your own uploaded documentation and local reference files.',
    iconName: 'FileText',
    iconColor: 'text-amber-500',
    placeholder: 'Ask about your documents...',
    defaultSourceTypes: ['document'],
  },
  {
    id: ARENA_AGENT_IDS.WAVE_CLIENT,
    label: 'Wave Client',
    description: 'Get help with Wave Client features — collections, environments, flows, tests, and more.',
    iconName: 'Zap',
    iconColor: 'text-violet-500',
    placeholder: 'What would you like help with?',
    defaultSourceTypes: ['mcp'],
  },
];

/**
 * Convenience lookup: agentId → definition.
 */
export function getAgentDefinition(agentId: ArenaAgentId): ArenaAgentDefinition | undefined {
  return ARENA_AGENT_DEFINITIONS.find((a) => a.id === agentId);
}

// ============================================================================
// Source Types
// ============================================================================

export type ArenaSourceType = 'web' | 'document' | 'mcp';

/**
 * An individual source entry surfaced in the toolbar.
 */
export interface ArenaSourceConfig {
  type: ArenaSourceType;
  label: string;
  url?: string;
  documentId?: string;
  enabled: boolean;
}

// ============================================================================
// Reference Websites (learn-web defaults)
// ============================================================================

export interface ReferenceWebsite {
  id: string;
  name: string;
  url: string;
  description: string;
  category: string;
  enabled: boolean;
}

export const DEFAULT_REFERENCE_WEBSITES: ReferenceWebsite[] = [
  {
    id: 'mdn',
    name: 'MDN Web Docs',
    url: 'https://developer.mozilla.org',
    description: 'Comprehensive web technology documentation by Mozilla',
    category: 'Documentation',
    enabled: true,
  },
  {
    id: 'ietf',
    name: 'IETF Datatracker',
    url: 'https://datatracker.ietf.org',
    description: 'Internet Engineering Task Force standards and RFCs',
    category: 'Standards',
    enabled: true,
  },
  {
    id: 'rfc-editor',
    name: 'RFC Editor',
    url: 'https://www.rfc-editor.org',
    description: 'Official RFC documents repository',
    category: 'Standards',
    enabled: true,
  },
  {
    id: 'w3c',
    name: 'W3C',
    url: 'https://www.w3.org',
    description: 'World Wide Web Consortium specifications',
    category: 'Standards',
    enabled: true,
  },
  {
    id: 'whatwg',
    name: 'WHATWG',
    url: 'https://whatwg.org',
    description: 'Web Hypertext Application Technology Working Group living standards',
    category: 'Standards',
    enabled: true,
  },
  {
    id: 'httpwg',
    name: 'HTTP Working Group',
    url: 'https://httpwg.org',
    description: 'IETF HTTP Working Group specifications',
    category: 'Standards',
    enabled: true,
  },
  {
    id: 'rest-api-tutorial',
    name: 'REST API Tutorial',
    url: 'https://restfulapi.net',
    description: 'REST API design guidelines and best practices',
    category: 'Documentation',
    enabled: true,
  },
];

// ============================================================================
// LLM Provider Configuration
// ============================================================================

export type ArenaProviderType = 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'copilot';

export interface ProviderDefinition {
  id: ArenaProviderType;
  label: string;
  description: string;
  /** Whether this provider is currently available (implemented) */
  available: boolean;
  /** Whether this provider requires an API key */
  requiresApiKey: boolean;
  /** Default model for this provider */
  defaultModel: string;
  /** Default temperature */
  defaultTemperature: number;
  /** Default max output tokens */
  defaultMaxOutputTokens: number;
}

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Google\'s Gemini family of models',
    available: true,
    requiresApiKey: true,
    defaultModel: 'gemini-2.0-flash',
    defaultTemperature: 0.7,
    defaultMaxOutputTokens: 8192,
  },
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    description: 'Run open-source models locally',
    available: true,
    requiresApiKey: false,
    defaultModel: 'llama2',
    defaultTemperature: 0.7,
    defaultMaxOutputTokens: 4096,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT-4, GPT-3.5 and other OpenAI models',
    available: false,
    requiresApiKey: true,
    defaultModel: 'gpt-4o',
    defaultTemperature: 0.7,
    defaultMaxOutputTokens: 4096,
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    description: 'Claude family of models',
    available: false,
    requiresApiKey: true,
    defaultModel: 'claude-3-5-sonnet-20241022',
    defaultTemperature: 0.7,
    defaultMaxOutputTokens: 4096,
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    description: 'Use your existing Copilot subscription',
    available: false,
    requiresApiKey: false,
    defaultModel: 'copilot-default',
    defaultTemperature: 0.7,
    defaultMaxOutputTokens: 4096,
  },
];

/**
 * Convenience lookup: providerId → definition.
 */
export function getProviderDefinition(providerId: ArenaProviderType): ProviderDefinition | undefined {
  return PROVIDER_DEFINITIONS.find((p) => p.id === providerId);
}

// ============================================================================
// Model Definitions
// ============================================================================

export interface ModelDefinition {
  id: string;
  label: string;
  provider: ArenaProviderType;
  contextWindow: number;
  /** Short note shown in the UI (optional) */
  note?: string;
}

export const MODEL_DEFINITIONS: ModelDefinition[] = [
  // Gemini
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'gemini', contextWindow: 1_000_000, note: 'Recommended' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', provider: 'gemini', contextWindow: 1_000_000 },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'gemini', contextWindow: 2_000_000 },
  // Ollama
  { id: 'llama2', label: 'Llama 2', provider: 'ollama', contextWindow: 4096 },
  { id: 'llama3.2', label: 'Llama 3.2', provider: 'ollama', contextWindow: 128_000, note: 'Recommended' },
  { id: 'mistral', label: 'Mistral', provider: 'ollama', contextWindow: 8192 },
  { id: 'neural-chat', label: 'Neural Chat', provider: 'ollama', contextWindow: 4096 },
  { id: 'dolphin-mixtral', label: 'Dolphin Mixtral', provider: 'ollama', contextWindow: 32_000 },
  { id: 'openchat', label: 'OpenChat', provider: 'ollama', contextWindow: 8192 },
  { id: 'wizardlm2', label: 'WizardLM 2', provider: 'ollama', contextWindow: 4096 },
];

/**
 * Get models available for a specific provider.
 */
export function getModelsForProvider(providerId: ArenaProviderType): ModelDefinition[] {
  return MODEL_DEFINITIONS.filter((m) => m.provider === providerId);
}

// ============================================================================
// API URLs
// ============================================================================

/** Base URL for the Gemini generative language API (v1beta) */
export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Default Ollama local server URL */
export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

/** Gemini models list endpoint */
export const GEMINI_LIST_MODELS_URL = `${GEMINI_API_BASE_URL}/models`;

/** Build a Gemini content generation URL (with API key) */
export function geminiGenerateContentUrl(model: string, apiKey: string): string {
  return `${GEMINI_API_BASE_URL}/models/${model}:generateContent?key=${apiKey}`;
}

/** Build a Gemini streaming content generation URL (with API key) */
export function geminiStreamUrl(model: string, apiKey: string): string {
  return `${GEMINI_API_BASE_URL}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
}

/** Build the Gemini models list URL (with API key, for validation) */
export function geminiModelsUrl(apiKey: string): string {
  return `${GEMINI_LIST_MODELS_URL}?key=${apiKey}`;
}

/** Build an Ollama chat URL */
export function ollamaChatUrl(baseUrl: string = OLLAMA_DEFAULT_BASE_URL): string {
  return `${baseUrl}/api/chat`;
}

/** Build an Ollama tags URL (list models) */
export function ollamaTagsUrl(baseUrl: string = OLLAMA_DEFAULT_BASE_URL): string {
  return `${baseUrl}/api/tags`;
}

// ============================================================================
// Storage Constants
// ============================================================================

/** localStorage keys used by the web adapter */
export const STORAGE_KEYS = {
  SESSIONS: 'wave-arena-sessions',
  MESSAGES: 'wave-arena-messages',
  DOCUMENTS: 'wave-arena-documents',
  SETTINGS: 'wave-arena-settings',
} as const;

/** Directory name for arena documents (relative to saveFilesLocation) */
export const ARENA_DOCS_DIR = 'arena-docs';

/** Metadata file for arena documents */
export const ARENA_DOCS_METADATA_FILE = 'metadata.json';

// ============================================================================
// Session Metadata
// ============================================================================

/**
 * Metadata tracked per-session and displayed in the toolbar.
 */
export interface ArenaSessionMetadata {
  /** Estimated total token count across all messages */
  totalTokenCount: number;
  /** Number of user + assistant messages */
  messageCount: number;
  /** Session start timestamp (same as session.createdAt) */
  startedAt: number;
  /** Last activity timestamp */
  lastActiveAt: number;
  /** Duration in ms */
  durationMs: number;
  /** Provider used during the session */
  provider: ArenaProviderType;
  /** Model used during the session */
  model: string;
}

/**
 * Create initial metadata for a new session.
 */
export function createSessionMetadata(
  provider: ArenaProviderType,
  model: string
): ArenaSessionMetadata {
  const now = Date.now();
  return {
    totalTokenCount: 0,
    messageCount: 0,
    startedAt: now,
    lastActiveAt: now,
    durationMs: 0,
    provider,
    model,
  };
}

// ============================================================================
// Default Arena Settings
// ============================================================================

/**
 * Arena settings persisted per-user.
 * Provider / model / apiKey are stored here and
 * surfaced via the chat toolbar rather than a separate settings page.
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
  /** Custom reference websites for learn-web agent */
  customReferenceSites?: string[];
}

export const DEFAULT_ARENA_SETTINGS: ArenaSettings = {
  provider: 'gemini',
  maxSessions: 5,
  maxMessagesPerSession: 10,
  maxDocumentSize: 50 * 1024 * 1024, // 50 MB
  enableStreaming: true,
};

// ============================================================================
// LLM Defaults
// ============================================================================

export const LLM_DEFAULTS = {
  /** Default Gemini model */
  GEMINI_MODEL: 'gemini-2.0-flash',
  /** Default Ollama model */
  OLLAMA_MODEL: 'llama3.2',
  /** Default Ollama base URL */
  OLLAMA_BASE_URL: OLLAMA_DEFAULT_BASE_URL,
  /** Default embedding vector dimension */
  EMBEDDING_DIMENSION: 768,
  /** Max context tokens for conversation history */
  MAX_CONTEXT_TOKENS: 150_000,
  /** Rate-limit: requests per second per domain */
  RATE_LIMIT_PER_DOMAIN: 1,
} as const;
