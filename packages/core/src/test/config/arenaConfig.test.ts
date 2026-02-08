/**
 * Tests for the centralized arena config module.
 */

import { describe, it, expect } from 'vitest';
import {
  ARENA_AGENT_IDS,
  ARENA_AGENT_DEFINITIONS,
  getAgentDefinition,
  PROVIDER_DEFINITIONS,
  getProviderDefinition,
  MODEL_DEFINITIONS,
  getModelsForProvider,
  geminiGenerateContentUrl,
  geminiStreamUrl,
  geminiModelsUrl,
  ollamaChatUrl,
  ollamaTagsUrl,
  DEFAULT_ARENA_SETTINGS,
  DEFAULT_REFERENCE_WEBSITES,
  STORAGE_KEYS,
  LLM_DEFAULTS,
  createSessionMetadata,
} from '../../config/arenaConfig';

// ============================================================================
// Agent IDs & Definitions
// ============================================================================

describe('ARENA_AGENT_IDS', () => {
  it('should have exactly 3 agent IDs', () => {
    expect(Object.keys(ARENA_AGENT_IDS)).toHaveLength(3);
  });

  it('should contain learn-web, learn-docs, and wave-client', () => {
    expect(ARENA_AGENT_IDS.LEARN_WEB).toBe('learn-web');
    expect(ARENA_AGENT_IDS.LEARN_DOCS).toBe('learn-docs');
    expect(ARENA_AGENT_IDS.WAVE_CLIENT).toBe('wave-client');
  });
});

describe('ARENA_AGENT_DEFINITIONS', () => {
  it('should have a definition for every agent ID', () => {
    const ids = Object.values(ARENA_AGENT_IDS);
    for (const id of ids) {
      expect(ARENA_AGENT_DEFINITIONS.find((d) => d.id === id)).toBeDefined();
    }
  });

  it('each definition should include required fields', () => {
    for (const def of ARENA_AGENT_DEFINITIONS) {
      expect(def.id).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.iconName).toBeTruthy();
      expect(def.iconColor).toBeTruthy();
      expect(Array.isArray(def.defaultSourceTypes)).toBe(true);
    }
  });
});

describe('getAgentDefinition', () => {
  it('should return definition for valid agent ID', () => {
    const def = getAgentDefinition(ARENA_AGENT_IDS.LEARN_WEB);
    expect(def).toBeDefined();
    expect(def!.id).toBe('learn-web');
  });

  it('should return undefined for invalid agent ID', () => {
    const def = getAgentDefinition('nonexistent' as any);
    expect(def).toBeUndefined();
  });
});

// ============================================================================
// Provider & Model Definitions
// ============================================================================

describe('PROVIDER_DEFINITIONS', () => {
  it('should have at least 2 available providers', () => {
    const available = PROVIDER_DEFINITIONS.filter((p) => p.available);
    expect(available.length).toBeGreaterThanOrEqual(2);
  });

  it('gemini and ollama should be available', () => {
    expect(getProviderDefinition('gemini')?.available).toBe(true);
    expect(getProviderDefinition('ollama')?.available).toBe(true);
  });
});

describe('getModelsForProvider', () => {
  it('should return models for gemini', () => {
    const models = getModelsForProvider('gemini');
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === 'gemini')).toBe(true);
  });

  it('should return models for ollama', () => {
    const models = getModelsForProvider('ollama');
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === 'ollama')).toBe(true);
  });

  it('should return empty array for unsupported provider', () => {
    expect(getModelsForProvider('nonexistent' as any)).toEqual([]);
  });
});

// ============================================================================
// URL Builders
// ============================================================================

describe('URL builders', () => {
  it('geminiGenerateContentUrl should include model and key', () => {
    const url = geminiGenerateContentUrl('gemini-2.0-flash', 'test-key');
    expect(url).toContain('gemini-2.0-flash');
    expect(url).toContain('generateContent');
    expect(url).toContain('key=test-key');
  });

  it('geminiStreamUrl should include model, key, and alt=sse', () => {
    const url = geminiStreamUrl('gemini-2.0-flash', 'test-key');
    expect(url).toContain('gemini-2.0-flash');
    expect(url).toContain('streamGenerateContent');
    expect(url).toContain('key=test-key');
    expect(url).toContain('alt=sse');
  });

  it('geminiModelsUrl should include key', () => {
    const url = geminiModelsUrl('test-key');
    expect(url).toContain('models');
    expect(url).toContain('key=test-key');
  });

  it('ollamaChatUrl should default to localhost', () => {
    const url = ollamaChatUrl();
    expect(url).toContain('localhost:11434');
    expect(url).toContain('/api/chat');
  });

  it('ollamaChatUrl should accept custom base URL', () => {
    const url = ollamaChatUrl('http://my-server:1234');
    expect(url).toBe('http://my-server:1234/api/chat');
  });

  it('ollamaTagsUrl should return /api/tags', () => {
    const url = ollamaTagsUrl();
    expect(url).toContain('/api/tags');
  });
});

// ============================================================================
// Defaults & Constants
// ============================================================================

describe('DEFAULT_ARENA_SETTINGS', () => {
  it('should have a provider field', () => {
    expect(DEFAULT_ARENA_SETTINGS.provider).toBeTruthy();
  });

  it('should have reasonable session limits', () => {
    expect(DEFAULT_ARENA_SETTINGS.maxSessions).toBeGreaterThan(0);
    expect(DEFAULT_ARENA_SETTINGS.maxMessagesPerSession).toBeGreaterThan(0);
  });
});

describe('DEFAULT_REFERENCE_WEBSITES', () => {
  it('should contain at least one website', () => {
    expect(DEFAULT_REFERENCE_WEBSITES.length).toBeGreaterThan(0);
  });

  it('each entry should have a name and url', () => {
    for (const site of DEFAULT_REFERENCE_WEBSITES) {
      expect(site.name).toBeTruthy();
      expect(site.url).toMatch(/^https?:\/\//);
    }
  });
});

describe('STORAGE_KEYS', () => {
  it('should have session, message, documents, and settings keys', () => {
    expect(STORAGE_KEYS.SESSIONS).toBeTruthy();
    expect(STORAGE_KEYS.MESSAGES).toBeTruthy();
    expect(STORAGE_KEYS.DOCUMENTS).toBeTruthy();
    expect(STORAGE_KEYS.SETTINGS).toBeTruthy();
  });
});

describe('LLM_DEFAULTS', () => {
  it('should have default models for Gemini and Ollama', () => {
    expect(LLM_DEFAULTS.GEMINI_MODEL).toBeTruthy();
    expect(LLM_DEFAULTS.OLLAMA_MODEL).toBeTruthy();
    expect(LLM_DEFAULTS.OLLAMA_BASE_URL).toContain('localhost');
  });
});

// ============================================================================
// Session Metadata
// ============================================================================

describe('createSessionMetadata', () => {
  it('should create metadata with default values', () => {
    const meta = createSessionMetadata('gemini', 'gemini-2.0-flash');
    expect(meta.provider).toBe('gemini');
    expect(meta.model).toBe('gemini-2.0-flash');
    expect(meta.messageCount).toBe(0);
    expect(meta.totalTokenCount).toBe(0);
    expect(meta.startedAt).toBeGreaterThan(0);
  });
});
