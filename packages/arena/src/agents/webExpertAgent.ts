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
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
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
  /** @internal Override the LLM per-call timeout (ms). Defaults to 60 000. Test-only. */
  _llmTimeoutMs?: number;
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
  const { llm, settings = {}, systemPrompt, _llmTimeoutMs = 60_000 } = config;
  const mergedSettings = { ...DEFAULT_ARENA_SETTINGS, ...settings };
  const prompt = systemPrompt ?? WEB_EXPERT_SYSTEM_PROMPT;

  /**
   * Closure variable to capture the generate node's LLM response directly.
   * This bypasses LangGraph's state channel reducers which may silently
   * lose content depending on the version/configuration.
   * Reset before each invoke() call.
   */
  let _lastGenerateContent = '';

  // ---------------------------------------------------------------------------
  // Signal helpers
  // ---------------------------------------------------------------------------

  /**
   * Creates an AbortSignal that aborts when either input signal aborts.
   * Used to combine a per-call timeout signal with the LangGraph outer signal
   * so both can trigger cancellation without replacing LangGraph callbacks.
   */
  function createCombinedSignal(sig1: AbortSignal, sig2: AbortSignal): AbortSignal {
    if (sig1.aborted || sig2.aborted) {
      const c = new AbortController();
      c.abort();
      return c.signal;
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    sig1.addEventListener('abort', abort, { once: true });
    sig2.addEventListener('abort', abort, { once: true });
    return controller.signal;
  }

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
  // Command prefix → context focus mapping
  // ---------------------------------------------------------------------------

  const COMMAND_FOCUS: Record<string, string> = {
    '/protocols': 'Focus on HTTP, WebSocket, gRPC, GraphQL, and transport protocols.',
    '/security': 'Focus on TLS, OAuth, CORS, CSP, OWASP, cryptography, and web security.',
    '/standards': 'Focus on RFCs, W3C specs, WHATWG standards, OpenAPI, and API design.',
    '/http': 'Focus on HTTP protocol details (HTTP/1.1, HTTP/2, HTTP/3).',
    '/ws': 'Focus on WebSocket, WebTransport, and real-time protocol guidance.',
    '/api': 'Focus on REST, GraphQL, gRPC, and AsyncAPI design guidance.',
    '/network': 'Focus on TCP/IP, UDP, QUIC, DNS, and transport-layer topics.',
    '/crypto': 'Focus on Web Crypto API, JOSE, hashing, and post-quantum cryptography.',
  };

  /**
   * Detect command prefixes (e.g. `/protocols How does HTTP/2 work?`) and
   * strip the prefix from the message while adding a context-focus hint.
   */
  const routeNode = async (
    state: WebExpertAgentState,
  ): Promise<Partial<WebExpertAgentState>> => {
    const lastMessage = state.messages[state.messages.length - 1];
    const text = lastMessage?.content?.toString().trim() ?? '';

    for (const [prefix, focus] of Object.entries(COMMAND_FOCUS)) {
      if (text.startsWith(prefix)) {
        const stripped = text.slice(prefix.length).trim();
        // Replace the last message with the stripped text
        const updatedMessages = [
          ...state.messages.slice(0, -1),
          new HumanMessage(stripped || `Tell me about ${prefix.slice(1)}`),
        ];
        return {
          mode: state.mode,
          messages: updatedMessages,
          context: [focus],
        };
      }
    }

    return { mode: state.mode };
  };

  /** Retrieve relevant context from the appropriate source */
  const retrieveNode = async (
    state: WebExpertAgentState,
  ): Promise<Partial<WebExpertAgentState>> => {
    const lastMessage = state.messages[state.messages.length - 1];
    const query = lastMessage?.content?.toString() ?? '';

    // Use the raw message content as the search query
    const cleanQuery = query.trim();

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
    config?: LangGraphRunnableConfig,
  ): Promise<Partial<WebExpertAgentState>> => {
    console.info('[WebExpert/generate] node entered', {
      messageCount: state.messages.length,
      contextCount: state.context.length,
      sourcesCount: state.sources.length,
    });

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

    // Merge the per-call timeout signal with the LangGraph outer signal.
    // Spreading config preserves LangGraph streaming callbacks so that
    // streamMode: 'messages' tokens are emitted correctly.
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), _llmTimeoutMs);
    try {
      const combinedSignal = config?.signal
        ? createCombinedSignal(config.signal as AbortSignal, timeoutController.signal)
        : timeoutController.signal;
      const callConfig = config
        ? { ...config, signal: combinedSignal }
        : { signal: combinedSignal };
      const response = await llm.invoke(messagesWithContext, callConfig as RunnableConfig);

      const rawContent = response.content;
      console.info('[WebExpert/generate] LLM response received', {
        rawContentType: typeof rawContent,
        isArray: Array.isArray(rawContent),
        contentLength: typeof rawContent === 'string' ? rawContent.length : JSON.stringify(rawContent).length,
        contentPreview: typeof rawContent === 'string'
          ? rawContent.substring(0, 120)
          : JSON.stringify(rawContent).substring(0, 120),
      });

      let responseContent = typeof rawContent === 'string'
        ? rawContent
        : (rawContent?.toString() ?? '');
      if (sourcesStr) {
        responseContent += sourcesStr;
      }

      // Capture in closure so chat() can read it directly
      _lastGenerateContent = responseContent;

      return { messages: [new AIMessage(responseContent)] };
    } finally {
      clearTimeout(timer);
    }
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
      signal?: AbortSignal,
      mode: WebExpertMode = 'auto',
    ): AsyncGenerator<ChatChunk> {
      const messageId = `msg-${Date.now()}`;
      let chunkIndex = 0;

      console.info('[WebExpertAgent] chat start', {
        messageId,
        historyLength: sessionMessages.length,
        messagePreview: userMessage.substring(0, 80),
        mode,
      });

      try {
        const messages: BaseMessage[] = sessionMessages.map((msg) => {
          if (msg.role === 'user') {
            return new HumanMessage(msg.content);
          }
          if (msg.role === 'assistant') {
            return new AIMessage(msg.content);
          }
          return new SystemMessage(msg.content);
        });

        messages.push(new HumanMessage(userMessage));

        console.info('[WebExpertAgent] invoking LangGraph (invoke mode)', { messageId });
        const streamStartTime = Date.now();

        // Reset closure before invoke so we capture only this call's output
        _lastGenerateContent = '';

        // Use invoke() to run the full graph.
        const result = await app.invoke(
          { messages, mode },
          { ...(signal && { signal }) } as RunnableConfig,
        );

        // Primary: use the closure-captured content from generateNode.
        // Fallback: try extracting from the invoke result's messages state.
        let content = _lastGenerateContent;

        if (!content) {
          // Fallback: extract from LangGraph state (may be unreliable)
          const lastMessage = result.messages?.[result.messages.length - 1];
          const rawContent = lastMessage?.content;
          content = typeof rawContent === 'string'
            ? rawContent
            : (rawContent?.toString() ?? '');
          if (content) {
            console.info('[WebExpertAgent] content from state fallback', {
              messageId,
              messageCount: result.messages?.length ?? 0,
              lastMessageType: lastMessage?.constructor?.name ?? 'unknown',
              contentLength: content.length,
            });
          }
        }

        console.info('[WebExpertAgent] chat complete', {
          messageId,
          elapsedMs: Date.now() - streamStartTime,
          contentLength: content.length,
          contentSource: _lastGenerateContent ? 'closure' : 'state-fallback',
        });

        if (content) {
          yield { id: `chunk-${chunkIndex++}`, content, done: false, messageId };
        }

        yield { id: `chunk-${chunkIndex}`, content: '', done: true, messageId };
      } catch (error) {
        const isAbortError = error instanceof Error && error.name === 'AbortError';

        // Intentional cancellation from the caller — clean exit, no error chunk.
        if (isAbortError && signal?.aborted) {
          console.info('[WebExpertAgent] chat cancelled by caller signal');
          return;
        }

        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[WebExpertAgent] chat error', {
          messageId,
          error: errMsg,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          chunksBeforeError: chunkIndex,
        });

        // Replace the opaque browser AbortError message with a human-readable timeout message.
        // This fires when the internal per-call LLM timeout (_llmTimeoutMs) expires.
        const displayError = isAbortError
          ? `LLM request timed out after ${_llmTimeoutMs / 1_000}s — the model may be loading or unresponsive`
          : errMsg;

        yield {
          id: 'chunk-error',
          content: '',
          done: true,
          messageId,
          error: displayError,
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
