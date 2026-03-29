/**
 * Wave Client Agent
 *
 * Feature discovery / productivity agent that uses MCP tools to help
 * users explore and manage their Wave Client workspace (collections,
 * environments, flows, test suites).
 *
 * Uses the standard LangGraph **ReAct loop**:
 *   START → agent → (tools → agent)* → END
 *
 * Tools are discovered dynamically via the MCP Client SDK and bound
 * to the LLM via `bindTools()`.  Execution is handled by LangGraph's
 * prebuilt `ToolNode`.
 *
 * System prompt is loaded from `./prompts/wave-client-agent.md`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StateGraph, END, START, MessagesAnnotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredTool } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { ChatMessage, ChatChunk, ArenaSettings } from '../types';
import { DEFAULT_ARENA_SETTINGS } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface WaveClientAgentConfig {
  /** LLM instance to use for generation */
  llm: BaseChatModel;
  /** MCP tools available for the agent to invoke */
  mcpTools?: StructuredTool[];
  /** Override arena settings */
  settings?: Partial<ArenaSettings>;
  /** Optional custom system prompt (overrides MD file) */
  systemPrompt?: string;
  /** @internal Override the LLM per-call timeout (ms). Defaults to 60 000. Test-only. */
  _llmTimeoutMs?: number;
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
    const promptPath = resolve(__dirname, 'prompts', 'wave-client-agent.md');
    return readFileSync(promptPath, 'utf-8');
  } catch {
    return `You are the Wave Client Assistant, an expert AI agent embedded inside Wave Client - client for making HTTP requests, managing APIs, and testing endpoints.
Use your bound tools to inspect the user's workspace and provide contextual help.`;
  }
}

/** Cached system prompt (loaded once on module init) */
const WAVE_CLIENT_SYSTEM_PROMPT = loadSystemPrompt();

// ============================================================================
// Wave Client Agent Implementation
// ============================================================================

/**
 * Create a Wave Client Agent instance.
 *
 * The agent operates as a standard LangGraph ReAct loop:
 * 1. **agent** — Invokes the LLM (with bound MCP tools) to decide the next action
 * 2. **tools** — LangGraph prebuilt `ToolNode` executes tool calls
 *
 * After tool execution, control returns to the agent node so it can
 * synthesize results or call additional tools (multi-turn).
 */
export function createWaveClientAgent(config: WaveClientAgentConfig) {
  const {
    llm,
    mcpTools = [],
    settings = {},
    systemPrompt,
    _llmTimeoutMs = 60_000,
  } = config;
  const mergedSettings = { ...DEFAULT_ARENA_SETTINGS, ...settings };
  const prompt = systemPrompt ?? WAVE_CLIENT_SYSTEM_PROMPT;

  // Bind tools to LLM if available
  const llmWithTools =
    mcpTools.length > 0 ? (llm.bindTools?.(mcpTools) ?? llm) : llm;

  // ---------------------------------------------------------------------------
  // Routing
  // ---------------------------------------------------------------------------

  /** Decide whether the LLM wants to invoke tools or is done. */
  function shouldContinue(
    state: typeof MessagesAnnotation.State,
  ): 'tools' | typeof END {
    const lastMessage = state.messages[state.messages.length - 1];

    if (lastMessage && 'tool_calls' in lastMessage) {
      const toolCalls = (lastMessage as AIMessage).tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        return 'tools';
      }
    }

    return END;
  }

  // ---------------------------------------------------------------------------
  // Agent node
  // ---------------------------------------------------------------------------

  /** Agent node — ask the LLM what to do next (or synthesize after tool results). */
  async function callModel(
    state: typeof MessagesAnnotation.State,
    config?: LangGraphRunnableConfig,
  ): Promise<typeof MessagesAnnotation.Update> {
    const systemMessage = new SystemMessage(prompt);
    const messages = [systemMessage, ...state.messages];

    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), _llmTimeoutMs);

    try {
      const combinedSignal = config?.signal
        ? createCombinedSignal(config.signal as AbortSignal, timeoutController.signal)
        : timeoutController.signal;

      const callConfig = config
        ? { ...config, signal: combinedSignal }
        : { signal: combinedSignal };

      const response = await (llmWithTools as BaseChatModel).invoke(
        messages,
        callConfig as RunnableConfig,
      );

      return { messages: [response] };
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------------
  // Graph wiring — standard ReAct loop
  // ---------------------------------------------------------------------------

  const toolNode = new ToolNode(mcpTools);

  const workflow = new StateGraph(MessagesAnnotation)
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, {
      tools: 'tools',
      [END]: END,
    })
    .addEdge('tools', 'agent');

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
     * @param signal          Optional AbortSignal for cancellation
     */
    async *chat(
      sessionMessages: ChatMessage[],
      userMessage: string,
      signal?: AbortSignal,
    ): AsyncGenerator<ChatChunk> {
      const messageId = `msg-${Date.now()}`;
      let chunkIndex = 0;

      console.info('[WaveClientAgent] chat start', {
        messageId,
        historyLength: sessionMessages.length,
        messagePreview: userMessage.substring(0, 80),
        toolCount: mcpTools.length,
      });

      try {
        const messages: BaseMessage[] = sessionMessages.map((msg) => {
          if (msg.role === 'user') { return new HumanMessage(msg.content); }
          if (msg.role === 'assistant') { return new AIMessage(msg.content); }
          return new SystemMessage(msg.content);
        });

        messages.push(new HumanMessage(userMessage));

        const streamStartTime = Date.now();

        const result = await app.invoke(
          { messages },
          { ...(signal && { signal }) } as RunnableConfig,
        );

        // Extract final content from the last AIMessage in the result.
        // Walk backwards to find the final synthesis (skip AIMessages with tool_calls).
        const resultMessages: BaseMessage[] = result.messages ?? [];
        let content = '';

        for (let i = resultMessages.length - 1; i >= 0; i--) {
          const msg = resultMessages[i];
          if (msg instanceof AIMessage && !msg.tool_calls?.length) {
            const rawContent = msg.content;
            content = typeof rawContent === 'string'
              ? rawContent
              : (rawContent?.toString() ?? '');
            break;
          }
        }

        console.info('[WaveClientAgent] chat complete', {
          messageId,
          elapsedMs: Date.now() - streamStartTime,
          contentLength: content.length,
          totalMessages: resultMessages.length,
        });

        if (content) {
          yield { id: `chunk-${chunkIndex++}`, content, done: false, messageId };
        }

        yield { id: `chunk-${chunkIndex}`, content: '', done: true, messageId };
      } catch (error) {
        const isAbortError = error instanceof Error && error.name === 'AbortError';

        // Intentional cancellation from the caller — clean exit, no error chunk.
        if (isAbortError && signal?.aborted) {
          console.info('[WaveClientAgent] chat cancelled by caller signal');
          return;
        }

        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[WaveClientAgent] chat error', {
          messageId,
          error: errMsg,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          chunksBeforeError: chunkIndex,
        });

        // Replace the opaque browser AbortError message with a human-readable timeout message.
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

    /** Get the list of available tool names */
    getTools(): string[] {
      return mcpTools.map((t) => t.name);
    },

    /** Get the active settings */
    getSettings(): Partial<ArenaSettings> {
      return mergedSettings;
    },
  };
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Creates an AbortSignal that aborts when either input signal aborts.
 * Used to combine a per-call timeout signal with the LangGraph outer signal.
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
