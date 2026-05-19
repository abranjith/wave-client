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
 *
 * Two built-in agents:
 * - `wave-client` — Wave Client assistant, uses MCP tools
 * - `web-expert`  — Web technologies expert, uses web fetcher + vector store
 */
export const ARENA_AGENT_IDS = {
  WAVE_CLIENT: 'wave-client',
  WEB_EXPERT: 'web-expert',
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
  iconName: string;
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
    id: ARENA_AGENT_IDS.WAVE_CLIENT,
    label: 'Wave Client',
    description: 'Get help with Wave Client features — collections, environments, flows, tests, and more. Can execute actions via MCP tools.',
    iconName: 'Zap',
    iconColor: 'text-violet-500',
    placeholder: 'What would you like help with?',
    defaultSourceTypes: ['mcp'],
  },
  {
    id: ARENA_AGENT_IDS.WEB_EXPERT,
    label: 'Web Expert',
    description: 'Expert on HTTP, REST, WebSocket, GraphQL, gRPC, OAuth, and web standards. Cites RFCs, MDN, W3C, and IETF sources.',
    iconName: 'Globe',
    iconColor: 'text-emerald-500',
    placeholder: 'Ask about web technologies, protocols, or standards...',
    defaultSourceTypes: ['web'],
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

/**
 * Source types available to Arena agents.
 */
export type ArenaSourceType = 'web' | 'mcp';

/**
 * An individual source entry surfaced in the toolbar.
 */
export interface ArenaSourceConfig {
  type: ArenaSourceType;
  label: string;
  url?: string;
  enabled: boolean;
}

/**
 * A reference resource used by Arena agents.
 *
 */
export interface ArenaReference {
  id: string;
  /** Human-readable name */
  name: string;
  /** Full URL of the reference */
  url: string;
  /** Optional description shown in the modal */
  description?: string;
  /** Grouping category (e.g. "Standards", "Documentation") */
  category?: string;
  /** Source type: web or mcp */
  type: ArenaSourceType;
  /** True for built-in references that cannot be removed */
  isDefault: boolean;
  /** Whether this reference is currently active */
  enabled: boolean;
}

// ============================================================================
// Reference Websites (web-expert agent defaults)
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

/**
 * Dynamically fetched model information from a provider API.
 * Replaces the old static `ModelDefinition` type.
 */
export interface DynamicModelInfo {
  /** Model identifier, e.g. `gemini-2.0-flash`, `llama3.2:latest` */
  id: string;
  /** Human-readable display name */
  label: string;
  /** Provider this model belongs to */
  provider: ArenaProviderType;
  /** Maximum input context tokens (from Gemini API) */
  inputTokenLimit?: number;
  /** Maximum output tokens (from Gemini API) */
  outputTokenLimit?: number;
  /** Parameter size string, e.g. `"3.2B"` (from Ollama API) */
  parameterSize?: string;
  /** Quantization level, e.g. `"Q4_K_M"` (from Ollama API) */
  quantizationLevel?: string;
  /** Model description (from Gemini API) */
  description?: string;
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
  SETTINGS: 'wave-arena-settings',
  REFERENCES: 'wave-arena-references',
  PROVIDER_SETTINGS: 'wave-arena-provider-settings',
} as const;

/** Directory name for arena data (relative to saveFilesLocation / .waveclient) */
export const ARENA_DIR = 'arena';

/** File name for persisted user references inside ARENA_DIR */
export const ARENA_REFERENCES_FILE = 'references.json';

/** File name for persisted provider settings inside ARENA_DIR */
export const ARENA_PROVIDER_SETTINGS_FILE = 'provider-settings.json';

// ARENA_DOCS_DIR and ARENA_DOCS_METADATA_FILE removed — document storage is deprecated.

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

// ============================================================================
// Per-Provider Settings
// ============================================================================

/**
 * Per-provider user configuration.
 * Stored separately from the general ArenaSettings so each provider
 * keeps its own API key, base URL, and model enable/disable state.
 */
export interface ArenaProviderSettings {
  /** Provider this config belongs to */
  providerId: ArenaProviderType;
  /** Whether the user has disabled this provider (hidden from toolbar) */
  enabled: boolean;
  /** API key (cloud providers only) */
  apiKey?: string;
  /** Custom API / server base URL (e.g. Ollama URL) */
  apiUrl?: string;
  /** Model IDs the user has explicitly disabled */
  disabledModels: string[];
}

/**
 * All per-provider settings keyed by provider id.
 */
export type ArenaProviderSettingsMap = Record<ArenaProviderType, ArenaProviderSettings>;

/**
 * Build the default per-provider settings from PROVIDER_DEFINITIONS.
 */
export function getDefaultProviderSettings(): ArenaProviderSettingsMap {
  const map = {} as ArenaProviderSettingsMap;
  for (const p of PROVIDER_DEFINITIONS) {
    map[p.id] = {
      providerId: p.id,
      enabled: p.available,
      apiKey: undefined,
      apiUrl: p.id === 'ollama' ? OLLAMA_DEFAULT_BASE_URL : undefined,
      disabledModels: [],
    };
  }
  return map;
}

/**
 * Get provider definitions that are both implemented AND enabled by the user.
 */
export function getEnabledProviders(
  providerSettings: ArenaProviderSettingsMap,
): ProviderDefinition[] {
  return PROVIDER_DEFINITIONS.filter(
    (p) => p.available && providerSettings[p.id]?.enabled !== false,
  );
}



/**
 * Returns `true` if at least one provider is enabled with valid configuration.
 *
 * A provider counts as configured when:
 * - `enabled === true`, AND
 * - it requires an API key and `apiKey` is a non-empty string, OR
 * - it does **not** require an API key (e.g. Ollama) and `apiUrl` is non-empty.
 */
export function isProviderConfigured(providerSettings: ArenaProviderSettingsMap): boolean {
  return Object.values(providerSettings).some((settings) => {
    if (!settings.enabled) {return false;}
    const def = PROVIDER_DEFINITIONS.find((p) => p.id === settings.providerId);
    if (!def) {return false;}
    if (def.requiresApiKey) {
      return typeof settings.apiKey === 'string' && settings.apiKey.trim().length > 0;
    }
    // Local providers (e.g. Ollama) are configured when they have a non-empty base URL.
    return typeof settings.apiUrl === 'string' && settings.apiUrl.trim().length > 0;
  });
}

// ============================================================================
// General Arena Settings
// ============================================================================

/**
 * Arena settings persisted per-user.
 * Provider / model / api key configuration is in `ArenaProviderSettingsMap`
 * and managed through the Settings panel.
 */
export interface ArenaSettings {
  /** Current LLM provider (selected in toolbar) */
  provider: ArenaProviderType;
  /** Model to use (selected in toolbar, provider-specific) */
  model?: string;
  /** Max sessions to keep */
  maxSessions: number;
  /** Max messages per session */
  maxMessagesPerSession: number;
  /** Enable streaming responses */
  enableStreaming: boolean;
  /** Custom reference websites for web-expert agent */
  customReferenceSites?: string[];
  /** Last model selected per provider — persisted so the user does not need to re-select on provider switch */
  lastSelectedModels?: Partial<Record<ArenaProviderType, string>>;
}

export const DEFAULT_ARENA_SETTINGS: ArenaSettings = {
  provider: 'gemini',
  maxSessions: 5,
  maxMessagesPerSession: 10,
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

// ============================================================================
// Reference Helpers
// ============================================================================

/**
 * Convert `DEFAULT_REFERENCE_WEBSITES` into `ArenaReference[]` with `isDefault: true`.
 */
export function getDefaultReferences(): ArenaReference[] {
  return DEFAULT_REFERENCE_WEBSITES.map((w) => ({
    id: w.id,
    name: w.name,
    url: w.url,
    description: w.description,
    category: w.category,
    type: 'web' as ArenaSourceType,
    isDefault: true,
    enabled: w.enabled,
  }));
}

/**
 * Merge default references with user-added references.
 * Defaults always come first; duplicates (by id) prefer the user copy
 * so the user can toggle `enabled` on a default.
 */
export function mergeReferences(
  userRefs: ArenaReference[],
): ArenaReference[] {
  const defaults = getDefaultReferences();
  const userMap = new Map(userRefs.map((r) => [r.id, r]));
  const merged: ArenaReference[] = defaults.map((d) => userMap.get(d.id) ?? d);

  // Append any user refs whose id doesn't collide with a default
  for (const r of userRefs) {
    if (!defaults.some((d) => d.id === r.id)) {
      merged.push(r);
    }
  }

  return merged;
}
