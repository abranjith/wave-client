/**
 * Ollama LLM Provider
 * 
 * Local LLM integration using Ollama via @langchain/ollama
 */

import { ChatOllama } from '@langchain/ollama';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { OllamaConfig } from '../types';
import { httpService } from '@wave-client/shared';
import type { DynamicModelInfo } from '@wave-client/shared';

export interface OllamaProviderConfig {
  baseUrl: string;
  model?: string;
  temperature?: number;
  numCtx?: number;
  streaming?: boolean;
}

const DEFAULT_MODEL = 'llama3.2';
const DEFAULT_TEMPERATURE = 1.0;
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

  console.info('[Ollama] creating provider', { baseUrl, model, temperature, numCtx, streaming });

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
 * Validate Ollama connectivity by probing the tags endpoint via the proxy-aware HTTP service.
 */
export async function validateOllamaApiKey(baseUrl: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const url = new URL('/api/tags', baseUrl).toString();
    const result = await httpService.send({ method: 'GET', url, headers: {}, validateStatus: true });
    const { status } = result.response;
    return status >= 200 && status < 400
      ? { valid: true }
      : { valid: false, error: `Ollama returned status ${status}` };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
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
 * Fetch available models from a running Ollama server.
 *
 * Uses the proxy-aware `httpService` so requests work behind corporate proxies
 * and inside VS Code's Node.js process.
 *
 * @param baseUrl The Ollama server base URL (e.g. `http://localhost:11434`).
 * @returns Array of `DynamicModelInfo` objects; empty array on any failure.
 */
export async function listOllamaModels(baseUrl: string): Promise<DynamicModelInfo[]> {
  try {
    const url = new URL('/api/tags', baseUrl).toString();
    const result = await httpService.send({
      method: 'GET',
      url,
      headers: {},
      validateStatus: true,
      responseType: 'json',
    });
    if (result.response.status < 200 || result.response.status >= 400) {
      return [];
    }
    interface OllamaModelEntry {
      name: string;
      details?: {
        parameter_size?: string;
        quantization_level?: string;
      };
    }
    const data = result.response.data as { models?: OllamaModelEntry[] };
    return (data.models ?? []).map((m) => ({
      id: m.name,
      label: m.name,
      provider: 'ollama' as const,
      parameterSize: m.details?.parameter_size,
      quantizationLevel: m.details?.quantization_level,
    }));
  } catch {
    return [];
  }
}
