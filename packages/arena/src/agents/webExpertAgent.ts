/**
 * Web Expert Agent
 *
 * Web technologies knowledge agent with two retrieval modes:
 * - Web: Query curated reference websites (IETF, MDN, W3C, etc.)
 * - Local: Search user-uploaded documents via vector store
 *
 * Uses LangGraph StateGraph with route → retrieve → generate pipeline.
 * System prompt is loaded from the companion markdown file at
 * `./prompts/web-expert-agent.md`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StateGraph, END, START } from '@langchain/langgraph';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { RunnableConfig } from '@langchain/core/runnables';
import type {
  ChatMessage,
  ChatChunk,
  WebExpertMode,
  ArenaSettings,
} from '../types';
import { DEFAULT_ARENA_SETTINGS } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface WebExpertAgentConfig {
  /** LLM instance to use for generation */
  llm: BaseChatModel;
  /** Override arena settings */
  settings?: Partial<ArenaSettings>;
  /** Vector store instance for local document search */
  vectorStore?: unknown; // Properly typed when vector store is implemented
  /** Optional custom system prompt (overrides MD file) */
  systemPrompt?: string;
}

interface WebExpertAgentState {
  messages: BaseMessage[];
  mode: WebExpertMode;
  context: string[];
  sources: string[];
}

// ============================================================================
// Prompt Loader
// ============================================================================

/**
 * Load the system prompt from the companion markdown file.
 * Falls back to a minimal inline prompt if the file cannot be read.
 */
function loadSystemPrompt(): string {
  try {
    const promptPath = resolve(__dirname, 'prompts', 'web-expert-agent.md');
    return readFileSync(promptPath, 'utf-8');
  } catch {
    // Fallback: minimal prompt so the agent still functions
    return `You are the Web Expert, an AI agent specializing in web technologies, networking protocols, and API design.
Provide authoritative, standards-based answers. Cite RFC numbers when discussing protocol behaviour.`;
  }
}

/** Cached system prompt (loaded once on module init) */
const WEB_EXPERT_SYSTEM_PROMPT = loadSystemPrompt();

// ============================================================================
// Web Expert Agent Implementation
// ============================================================================

/**
 * Create a Web Expert Agent instance.
 *
 * The agent operates as a LangGraph graph with three nodes:
 * 1. **route** — Detects the retrieval mode from command prefixes
 * 2. **retrieve** — Fetches relevant context (web or local vector store)
 * 3. **generate** — Invokes the LLM with the system prompt + context
 */
export function createWebExpertAgent(config: WebExpertAgentConfig) {
  const { llm, settings = {}, systemPrompt } = config;
  const mergedSettings = { ...DEFAULT_ARENA_SETTINGS, ...settings };
  const prompt = systemPrompt ?? WEB_EXPERT_SYSTEM_PROMPT;

  // ---------------------------------------------------------------------------
  // State Graph
  // ---------------------------------------------------------------------------

  const workflow = new StateGraph<WebExpertAgentState>({
    channels: {
      messages: {
        value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
        default: () => [],
      },
      mode: {
        value: (_x: WebExpertMode, y: WebExpertMode) => y,
        default: () => 'auto' as WebExpertMode,
      },
      context: {
        value: (_x: string[], y: string[]) => y,
        default: () => [],
      },
      sources: {
        value: (x: string[], y: string[]) => [...new Set([...x, ...y])],
        default: () => [],
      },
    },
  });

  // ---------------------------------------------------------------------------
  // Nodes
  // ---------------------------------------------------------------------------

  /** Detect query mode from command prefixes */
  const routeNode = async (
    state: WebExpertAgentState,
  ): Promise<Partial<WebExpertAgentState>> => {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage?.content?.toString() ?? '';

    let mode: WebExpertMode = state.mode;
    if (content.startsWith('/http') || content.startsWith('/rest') || content.startsWith('/websocket') || content.startsWith('/graphql')) {
      mode = 'web';
    } else if (content.startsWith('/rfc')) {
      mode = 'web';
    } else if (content.startsWith('/learn-local')) {
      mode = 'local';
    }

    return { mode };
  };

  /** Retrieve relevant context from the appropriate source */
  const retrieveNode = async (
    state: WebExpertAgentState,
  ): Promise<Partial<WebExpertAgentState>> => {
    const lastMessage = state.messages[state.messages.length - 1];
    const query = lastMessage?.content?.toString() ?? '';

    // Strip command prefix from query
    const cleanQuery = query
      .replace(
        /^\/(http|rest|websocket|graphql|rfc|learn-web|learn-local|explain|compare)\s*/i,
        '',
      )
      .trim();

    const context: string[] = [];
    const sources: string[] = [];

    if (state.mode === 'web' || state.mode === 'auto') {
      // TODO: Wire web fetcher retrieval (search curated sites)
      context.push(
        `[Web search for: "${cleanQuery}" — web fetcher not yet wired]`,
      );
    }

    if (state.mode === 'local' || state.mode === 'auto') {
      // TODO: Wire vector store retrieval (local docs)
      context.push(
        `[Local search for: "${cleanQuery}" — vector store not yet wired]`,
      );
    }

    return { context, sources };
  };

  /** Generate the final response with the LLM */
  const generateNode = async (
    state: WebExpertAgentState,
  ): Promise<Partial<WebExpertAgentState>> => {
    const systemMessage = new SystemMessage(prompt);

    const contextStr =
      state.context.length > 0
        ? `\n\nRelevant context:\n${state.context.join('\n\n')}`
        : '';

    const sourcesStr =
      state.sources.length > 0
        ? `\n\nSources: ${state.sources.join(', ')}`
        : '';

    const messagesWithContext = [
      systemMessage,
      ...state.messages.slice(0, -1),
      new HumanMessage(
        state.messages[state.messages.length - 1].content + contextStr,
      ),
    ];

    const response = await llm.invoke(messagesWithContext);

    let responseContent = response.content?.toString() ?? '';
    if (sourcesStr) {
      responseContent += sourcesStr;
    }

    return { messages: [new AIMessage(responseContent)] };
  };

  // ---------------------------------------------------------------------------
  // Graph wiring
  // ---------------------------------------------------------------------------

  workflow.addNode('route', routeNode);
  workflow.addNode('retrieve', retrieveNode);
  workflow.addNode('generate', generateNode);

  workflow.addEdge(START, 'route' as any);
  workflow.addEdge('route' as any, 'retrieve' as any);
  workflow.addEdge('retrieve' as any, 'generate' as any);
  workflow.addEdge('generate' as any, END);

  const app = workflow.compile();

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    /**
     * Send a message and stream the response.
     *
     * @param sessionMessages Previous messages for context
     * @param userMessage     The new user message
     * @param mode            Retrieval mode override (default: 'auto')
     */
    async *chat(
      sessionMessages: ChatMessage[],
      userMessage: string,
      mode: WebExpertMode = 'auto',
    ): AsyncGenerator<ChatChunk> {
      const messageId = `msg-${Date.now()}`;
      let chunkIndex = 0;

      try {
        const messages: BaseMessage[] = sessionMessages.map((msg) => {
          if (msg.role === 'user') return new HumanMessage(msg.content);
          if (msg.role === 'assistant') return new AIMessage(msg.content);
          return new SystemMessage(msg.content);
        });

        messages.push(new HumanMessage(userMessage));

        const stream = await app.stream(
          { messages, mode },
          { streamMode: 'values' } as RunnableConfig,
        );

        let fullContent = '';

        for await (const state of stream) {
          const lastMessage = state.messages?.[state.messages.length - 1];
          if (lastMessage instanceof AIMessage) {
            const content = lastMessage.content?.toString() ?? '';
            const newContent = content.slice(fullContent.length);

            if (newContent) {
              fullContent = content;
              yield {
                id: `chunk-${chunkIndex++}`,
                content: newContent,
                done: false,
                messageId,
              };
            }
          }
        }

        yield { id: `chunk-${chunkIndex}`, content: '', done: true, messageId };
      } catch (error) {
        yield {
          id: 'chunk-error',
          content: '',
          done: true,
          messageId,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /** Get available retrieval modes */
    getModes(): WebExpertMode[] {
      return ['web', 'local', 'auto'];
    },

    /** Get the active settings */
    getSettings(): Partial<ArenaSettings> {
      return mergedSettings;
    },
  };
}
