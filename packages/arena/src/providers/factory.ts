/**
 * Provider Factory
 * 
 * Creates LLM provider instances based on configuration
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createGeminiProvider, testGeminiConnection, validateGeminiApiKey } from './gemini';
import { createOllamaProvider, testOllamaConnection, validateOllamaApiKey } from './ollama';
import type { LLMProviderConfig, ProviderStatus, LLMProvider } from '../types';
import type { ArenaProviderType, ArenaProviderSettings } from '@wave-client/shared';

/** Default Ollama base URL used when no URL is configured. */
const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

export interface ProviderConfig {
  provider: LLMProvider;
  [key: string]: unknown;
}

/**
 * Create an LLM provider based on configuration
 * 
 * Supports Gemini and Ollama. Other providers will be added later.
 */
export function createProviderFactory(config: LLMProviderConfig): BaseChatModel {
  switch (config.provider) {
    case 'gemini': {
      return createGeminiProvider({
        apiKey: config.apiKey,
        model: config.model,
      });
    }
    
    case 'ollama': {
      return createOllamaProvider({
        baseUrl: config.baseUrl,
        model: config.model,
      });
    }
    
    case 'openai':
    case 'anthropic':
    case 'azure-openai':
      throw new Error(`Provider '${config.provider}' is not yet implemented. Coming soon!`);
    
    default:
      throw new Error(`Unknown provider: ${(config as LLMProviderConfig).provider}`);
  }
}

/**
 * Pre-flight connectivity test for any supported provider.
 *
 * Returns `{ connected: true }` when the provider's endpoint is reachable and
 * the credentials (if applicable) are accepted.  Otherwise returns
 * `{ connected: false, error: '<reason>' }`.
 *
 * Used by ArenaService.streamChat() to fail fast with a clear message instead
 * of waiting for the LLM invocation to time out.
 */
export async function testProviderConnection(
  config: LLMProviderConfig,
): Promise<{ connected: boolean; error?: string }> {
  switch (config.provider) {
    case 'gemini':
      return testGeminiConnection(config.apiKey);

    case 'ollama':
      return testOllamaConnection(config.baseUrl);

    case 'openai':
    case 'anthropic':
    case 'azure-openai':
      // Not yet implemented — skip pre-flight check so the normal LLM
      // timeout path handles failures.
      return { connected: true };

    default:
      return { connected: true };
  }
}

/**
 * Check provider status/connectivity
 */
export async function checkProviderStatus(config: LLMProviderConfig): Promise<ProviderStatus> {
  const baseStatus: ProviderStatus = {
    provider: config.provider,
    configured: false,
    connected: false,
  };

  try {
    switch (config.provider) {
      case 'gemini': {
        if (!config.apiKey) {
          return { ...baseStatus, error: 'API key not configured' };
        }
        
        baseStatus.configured = true;
        baseStatus.model = config.model || 'gemini-1.5-pro';
        
        // Try to create provider to validate config
        const provider = createGeminiProvider({
          apiKey: config.apiKey,
          model: config.model,
        });
        
        // Simple validation - provider created successfully
        if (provider) {
          baseStatus.connected = true;
        }
        
        return baseStatus;
      }
      
      case 'ollama': {
        if (!config.baseUrl) {
          return { ...baseStatus, error: 'Base URL not configured' };
        }
        
        baseStatus.configured = true;
        baseStatus.model = config.model || 'llama2';
        
        // Test connection to Ollama server
        const connectionResult = await testOllamaConnection(config.baseUrl);
        
        if (connectionResult.connected) {
          baseStatus.connected = true;
        } else {
          baseStatus.error = connectionResult.error || 'Connection failed';
        }
        
        return baseStatus;
      }
      
      default:
        return {
          ...baseStatus,
          error: `Provider '${config.provider}' is not yet implemented`,
        };
    }
  } catch (error) {
    return {
      ...baseStatus,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Validates provider credentials/connectivity without instantiating an agent.
 *
 * Dispatches to the provider-specific implementation so `ArenaService` retains
 * no knowledge of individual providers.
 *
 * @param provider  The provider type to validate.
 * @param settings  The provider settings (must include `apiKey` for cloud providers).
 * @returns `{ valid: true }` on success or `{ valid: false, error: string }`.
 */
export async function validateProviderApiKey(
  provider: ArenaProviderType,
  settings: ArenaProviderSettings,
): Promise<{ valid: boolean; error?: string }> {
  switch (provider) {
    case 'gemini':
      return validateGeminiApiKey(settings.apiKey ?? '');

    case 'ollama':
      return validateOllamaApiKey(settings.apiUrl ?? OLLAMA_DEFAULT_BASE_URL);

    default:
      return { valid: false, error: `Provider '${provider}' validation is not supported` };
  }
}

/**
 * Get list of supported providers
 */
export function getSupportedProviders(): Array<{
  id: LLMProvider;
  name: string;
  implemented: boolean;
  description: string;
}> {
  return [
    {
      id: 'gemini',
      name: 'Google Gemini',
      implemented: true,
      description: 'Google\'s Gemini models with large context windows',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      implemented: false,
      description: 'GPT-4 and other OpenAI models',
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      implemented: false,
      description: 'Claude models with strong reasoning',
    },
    {
      id: 'ollama',
      name: 'Ollama (Local)',
      implemented: true,
      description: 'Run models locally with Ollama',
    },
    {
      id: 'azure-openai',
      name: 'Azure OpenAI',
      implemented: false,
      description: 'OpenAI models via Azure',
    },
    {
      id: 'copilot',
      name: 'GitHub Copilot',
      implemented: false,
      description: 'VS Code Language Model API (VS Code only)',
    },
  ];
}
