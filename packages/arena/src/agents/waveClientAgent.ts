/**
 * Wave Client Agent
 *
 * Feature discovery / productivity agent that uses MCP tools to help
 * users explore and manage their Wave Client workspace (collections,
 * environments, flows, test suites).
 *
 * Uses LangGraph StateGraph with an agent → (tools | END) → generate
 * control flow.  System prompt is loaded from the companion markdown
 * file at `./prompts/wave-client-agent.md`.
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
  ToolMessage,
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

interface WaveClientAgentState {
  messages: BaseMessage[];
  toolCalls: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result?: unknown;
  }>;
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
Use available tools to inspect the user's workspace and provide contextual help.`;
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
 * The agent operates as a LangGraph graph with three nodes:
 * 1. **agent** — Invokes the LLM (with bound MCP tools) to decide the next action
 * 2. **tools** — Executes chosen tool calls against the MCP bridge
 * 3. **generate** — Produces the final human-readable response
 *
 * Conditional routing after the agent node:
 * - If the LLM returns tool_calls → route to 'tools'
 * - Otherwise → route to END (agent response is the final answer)
 */
export function createWaveClientAgent(config: WaveClientAgentConfig) {
  const { llm, mcpTools = [], settings = {}, systemPrompt, _llmTimeoutMs = 60_000 } = config;
  const mergedSettings = { ...DEFAULT_ARENA_SETTINGS, ...settings };
  const prompt = systemPrompt ?? WAVE_CLIENT_SYSTEM_PROMPT;

  // Bind tools to LLM if available
  const llmWithTools =
    mcpTools.length > 0 ? (llm.bindTools?.(mcpTools) ?? llm) : llm;

  /**
   * Closure variable to capture the last LLM response content directly.
   * Both agentNode and generateNode write here so chat() can read it
   * without depending on LangGraph's state channel reducers.
   * Reset before each invoke() call.
   */
  let _lastLLMContent = '';

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

  const workflow = new StateGraph<WaveClientAgentState>({
    channels: {
      messages: {
        value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
        default: () => [],
      },
      toolCalls: {
        value: (
          _x: Array<{ name: string; arguments: Record<string, unknown> }>,
          y: Array<{ name: string; arguments: Record<string, unknown> }>,
        ) => y,
        default: () => [],
      },
    },
  });

  // ---------------------------------------------------------------------------
  // Routing
  // ---------------------------------------------------------------------------

  /** Decide whether the LLM wants to invoke tools */
  const shouldCallTools = (
    state: WaveClientAgentState,
  ): 'tools' | 'generate' => {
    const lastMessage = state.messages[state.messages.length - 1];

    if (lastMessage && 'tool_calls' in lastMessage) {
      const toolCalls = (lastMessage as AIMessage).tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        return 'tools';
      }
    }

    return 'generate';
  };

  // ---------------------------------------------------------------------------
  // Nodes
  // ---------------------------------------------------------------------------

  /** Agent node — ask the LLM what to do next */
  const agentNode = async (
    state: WaveClientAgentState,
    config?: LangGraphRunnableConfig,
  ): Promise<Partial<WaveClientAgentState>> => {
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
      const response = await (llmWithTools as BaseChatModel).invoke(messages, callConfig as RunnableConfig);

      // Capture the agent response content. If no tool calls are made,
      // the graph routes to END and this is the final LLM response.
      const rawContent = response.content;
      const hasToolCalls = 'tool_calls' in response && (response as AIMessage).tool_calls?.length;
      if (!hasToolCalls) {
        _lastLLMContent = typeof rawContent === 'string'
          ? rawContent
          : (rawContent?.toString() ?? '');
        console.info('[WaveClient/agent] direct response (no tools)', {
          contentLength: _lastLLMContent.length,
          contentPreview: _lastLLMContent.substring(0, 120),
        });
      } else {
        console.info('[WaveClient/agent] tool calls requested', {
          toolCallCount: (response as AIMessage).tool_calls?.length,
        });
      }

      return { messages: [response] };
    } finally {
      clearTimeout(timer);
    }
  };

  /** Tool node — execute all requested tool calls */
  const toolNode = async (
    state: WaveClientAgentState,
  ): Promise<Partial<WaveClientAgentState>> => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = lastMessage.tool_calls ?? [];

    const toolResults: BaseMessage[] = [];
    const executedCalls: WaveClientAgentState['toolCalls'] = [];

    for (const toolCall of toolCalls) {
      const tool = mcpTools.find((t) => t.name === toolCall.name);

      if (tool) {
        try {
          const result = await tool.invoke(toolCall.args);

          toolResults.push(
            new ToolMessage({
              tool_call_id: toolCall.id ?? toolCall.name,
              content:
                typeof result === 'string' ? result : JSON.stringify(result),
            }),
          );

          executedCalls.push({
            name: toolCall.name,
            arguments: toolCall.args as Record<string, unknown>,
            result,
          });
        } catch (error) {
          toolResults.push(
            new ToolMessage({
              tool_call_id: toolCall.id ?? toolCall.name,
              content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            }),
          );
        }
      }
    }

    return { messages: toolResults, toolCalls: executedCalls };
  };

  /** Generate node — produce the final response after tool results */
  const generateNode = async (
    state: WaveClientAgentState,
    config?: LangGraphRunnableConfig,
  ): Promise<Partial<WaveClientAgentState>> => {
    console.info('[WaveClient/generate] node entered', {
      messageCount: state.messages.length,
    });
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
      const response = await llm.invoke(messages, callConfig as RunnableConfig);

      const rawContent = response.content;
      _lastLLMContent = typeof rawContent === 'string'
        ? rawContent
        : (rawContent?.toString() ?? '');
      console.info('[WaveClient/generate] LLM response received', {
        contentLength: _lastLLMContent.length,
        contentPreview: _lastLLMContent.substring(0, 120),
      });

      return { messages: [response] };
    } finally {
      clearTimeout(timer);
    }
  };

  // ---------------------------------------------------------------------------
  // Graph wiring
  // ---------------------------------------------------------------------------

  workflow.addNode('agent', agentNode);
  workflow.addNode('tools', toolNode);
  workflow.addNode('generate', generateNode);

  workflow.addEdge(START, 'agent' as any);
  (workflow.addConditionalEdges as any)(
    'agent',
    shouldCallTools as any,
    { tools: 'tools', generate: END },
  );
  workflow.addEdge('tools' as any, 'generate' as any);
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
          if (msg.role === 'user') {return new HumanMessage(msg.content);}
          if (msg.role === 'assistant') {return new AIMessage(msg.content);}
          if (msg.role === 'tool' && msg.toolCall) {
            return new ToolMessage({
              tool_call_id: msg.toolCall.name,
              content: JSON.stringify(msg.toolCall.result),
            });
          }
          return new SystemMessage(msg.content);
        });

        messages.push(new HumanMessage(userMessage));

        console.info('[WaveClientAgent] invoking LangGraph (invoke mode)', {
          messageId,
          totalMessages: messages.length,
        });
        const streamStartTime = Date.now();

        // Reset closure before invoke so we capture only this call's output
        _lastLLMContent = '';

        // Use invoke() to run the full graph.
        const result = await app.invoke(
          { messages, toolCalls: [] },
          { ...(signal && { signal }) } as RunnableConfig,
        );

        // Primary: use the closure-captured content from agentNode/generateNode.
        // Fallback: try extracting from the invoke result's messages state.
        let content = _lastLLMContent;

        if (!content) {
          // Fallback: extract from LangGraph state (may be unreliable)
          const lastMessage = result.messages?.[result.messages.length - 1];
          const rawContent = lastMessage?.content;
          content = typeof rawContent === 'string'
            ? rawContent
            : (rawContent?.toString() ?? '');
          if (content) {
            console.info('[WaveClientAgent] content from state fallback', {
              messageId,
              messageCount: result.messages?.length ?? 0,
              lastMessageType: lastMessage?.constructor?.name ?? 'unknown',
              contentLength: content.length,
            });
          }
        }

        console.info('[WaveClientAgent] chat complete', {
          messageId,
          elapsedMs: Date.now() - streamStartTime,
          contentLength: content.length,
          contentSource: _lastLLMContent ? 'closure' : 'state-fallback',
        });

        if (content) {
          yield { id: `chunk-${chunkIndex++}`, content, done: false, messageId };
        }

        yield { id: `chunk-${chunkIndex}`, content: '', done: true, messageId };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[WaveClientAgent] chat error', {
          messageId,
          error: errMsg,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          chunksBeforeError: chunkIndex,
        });
        yield {
          id: 'chunk-error',
          content: '',
          done: true,
          messageId,
          error: errMsg,
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
