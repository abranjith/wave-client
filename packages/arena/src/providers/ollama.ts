/**
 * Ollama LLM Provider
 * 
 * Local LLM integration using Ollama via @langchain/ollama
 */

import { ChatOllama } from '@langchain/ollama';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { OllamaConfig } from '../types';

export interface OllamaProviderConfig {
  baseUrl: string;
  model?: string;
  temperature?: number;
  numCtx?: number;
  streaming?: boolean;
}

const DEFAULT_MODEL = 'llama2';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_NUM_CTX = 4096;

/**
 * Create an Ollama LLM provider instance
 */
export function createOllamaProvider(config: OllamaProviderConfig): BaseChatModel {
  const {
    baseUrl,
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    numCtx = DEFAULT_NUM_CTX,
    streaming = true,
  } = config;

  if (!baseUrl) {
    throw new Error('Ollama base URL is required');
  }

  return new ChatOllama({
    baseUrl,
    model,
    temperature,
    numCtx,
    streaming,
  }) as BaseChatModel;
}

/**
 * Validate Ollama configuration
 */
export function validateOllamaConfig(config: OllamaConfig): { valid: boolean; error?: string } {
  if (!config.baseUrl) {
    return { valid: false, error: 'Base URL is required' };
  }

  // Validate URL format
  try {
    new URL(config.baseUrl);
  } catch {
    return { valid: false, error: 'Invalid base URL format' };
  }

  return { valid: true };
}

/**
 * Test connection to Ollama server
 */
export async function testOllamaConnection(baseUrl: string): Promise<{ connected: boolean; error?: string }> {
  try {
    const url = new URL('/api/tags', baseUrl).toString();
    const response = await fetch(url);
    
    if (!response.ok) {
      return {
        connected: false,
        error: `Server returned status ${response.status}`,
      };
    }

    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Get list of available models from Ollama server
 */
export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  try {
    const url = new URL('/api/tags', baseUrl).toString();
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    const data = (await response.json()) as { models: Array<{ name: string }> };
    return data.models.map((m) => m.name);
  } catch (error) {
    console.error('Failed to list Ollama models:', error);
    return [];
  }
}

/**
 * Popular open-source models available via Ollama
 */
export const OLLAMA_POPULAR_MODELS = [
  { id: 'llama2', name: 'Llama 2', parameters: '7B, 13B, 70B variants', contextWindow: 4096 },
  { id: 'mistral', name: 'Mistral', parameters: '7B', contextWindow: 8192 },
  { id: 'neural-chat', name: 'Neural Chat', parameters: '7B', contextWindow: 4096 },
  { id: 'dolphin-mixtral', name: 'Dolphin Mixtral', parameters: '8x7B', contextWindow: 32768 },
  { id: 'openchat', name: 'OpenChat', parameters: '3.5', contextWindow: 8192 },
  { id: 'wizardlm2', name: 'WizardLM 2', parameters: '8x22B', contextWindow: 65536 },
] as const;
