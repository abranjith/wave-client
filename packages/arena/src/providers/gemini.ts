/**
 * Gemini LLM Provider
 * 
 * Google Gemini integration using @langchain/google-genai
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { GeminiConfig } from '../types';
import { httpService } from '@wave-client/shared';
import type { DynamicModelInfo } from '@wave-client/shared';

export interface GeminiProviderConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  streaming?: boolean;
}

const DEFAULT_MODEL = 'gemini-1.5-pro';
const DEFAULT_TEMPERATURE = 1.0;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

/**
 * Create a Gemini LLM provider instance
 */
export function createGeminiProvider(config: GeminiProviderConfig): BaseChatModel {
  const {
    apiKey,
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
    streaming = true,
  } = config;

  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }

  // Cast via unknown to avoid TS2589 (excessively deep type instantiation from @langchain/google-genai generics)
  const chatModel = new ChatGoogleGenerativeAI({
    apiKey,
    model,
    temperature,
    maxOutputTokens,
    streaming,
  }) as unknown as BaseChatModel;

  return chatModel;
}

/**
 * Validate Gemini configuration
 */
export function validateGeminiConfig(config: GeminiConfig): { valid: boolean; error?: string } {
  if (!config.apiKey) {
    return { valid: false, error: 'API key is required' };
  }

  if (config.apiKey.length < 10) {
    return { valid: false, error: 'Invalid API key format' };
  }

  return { valid: true };
}

/**
 * Available Gemini models
 */
export const GEMINI_MODELS = [
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 1000000 },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', contextWindow: 1000000 },
  { id: 'gemini-pro', name: 'Gemini Pro', contextWindow: 30720 },
] as const;

/**
 * Fetch available models from the Gemini API.
 *
 * Queries the `/v1beta/models` endpoint and returns only models that support
 * the `generateContent` generation method.
 *
 * NOTE: Uses a single `pageSize=100` query. Full pagination via `nextPageToken`
 * is tracked as a future TODO.
 */
export async function listGeminiModels(apiKey: string): Promise<DynamicModelInfo[]> {
  if (!apiKey) return [];
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`;
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
    interface GeminiModelEntry {
      name: string;
      displayName?: string;
      description?: string;
      inputTokenLimit?: number;
      outputTokenLimit?: number;
      supportedGenerationMethods?: string[];
    }
    const data = result.response.data as { models?: GeminiModelEntry[] };
    return (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => ({
        // Strip the "models/" prefix that the API includes in the name field
        id: m.name.startsWith('models/') ? m.name.slice('models/'.length) : m.name,
        label: m.displayName ?? m.name,
        provider: 'gemini' as const,
        inputTokenLimit: m.inputTokenLimit,
        outputTokenLimit: m.outputTokenLimit,
        description: m.description,
      }));
  } catch {
    return [];
  }
}

/**
 * Validate a Gemini API key by probing the models endpoint via the proxy-aware HTTP service.
 */
export async function validateGeminiApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey) {
    return { valid: false, error: 'API key is empty' };
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const result = await httpService.send({ method: 'GET', url, headers: {}, validateStatus: true });
    const { status } = result.response;
    return status >= 200 && status < 400
      ? { valid: true }
      : { valid: false, error: `Gemini returned status ${status}` };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Test connection to Google Gemini API by probing the models endpoint.
 */
export async function testGeminiConnection(apiKey: string): Promise<{ connected: boolean; error?: string }> {
  if (!apiKey) {
    return { connected: false, error: 'API key is not configured' };
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url);
    if (!response.ok) {
      return { connected: false, error: `Gemini API returned status ${response.status}` };
    }
    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}
