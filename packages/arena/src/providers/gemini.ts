/**
 * Gemini LLM Provider
 * 
 * Google Gemini integration using @langchain/google-genai
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { GeminiConfig } from '../types';

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

  const chatModel: BaseChatModel = new ChatGoogleGenerativeAI({
    apiKey,
    model,
    temperature,
    maxOutputTokens,
    streaming,
  });

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
