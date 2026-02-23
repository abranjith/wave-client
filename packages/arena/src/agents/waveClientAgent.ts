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
  const { llm, mcpTools = [], settings = {}, systemPrompt } = config;
  const mergedSettings = { ...DEFAULT_ARENA_SETTINGS, ...settings };
  const prompt = systemPrompt ?? WAVE_CLIENT_SYSTEM_PROMPT;

  // Bind tools to LLM if available
  const llmWithTools =
    mcpTools.length > 0 ? (llm.bindTools?.(mcpTools) ?? llm) : llm;

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
  ): Promise<Partial<WaveClientAgentState>> => {
    const systemMessage = new SystemMessage(prompt);
    const messages = [systemMessage, ...state.messages];
    const response = await llmWithTools.invoke(messages);
    return { messages: [response] };
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
  ): Promise<Partial<WaveClientAgentState>> => {
    const systemMessage = new SystemMessage(prompt);
    const messages = [systemMessage, ...state.messages];
    const response = await llm.invoke(messages);
    return { messages: [response] };
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
    ): AsyncGenerator<ChatChunk> {
      const messageId = `msg-${Date.now()}`;
      let chunkIndex = 0;

      try {
        const messages: BaseMessage[] = sessionMessages.map((msg) => {
          if (msg.role === 'user') return new HumanMessage(msg.content);
          if (msg.role === 'assistant') return new AIMessage(msg.content);
          if (msg.role === 'tool' && msg.toolCall) {
            return new ToolMessage({
              tool_call_id: msg.toolCall.name,
              content: JSON.stringify(msg.toolCall.result),
            });
          }
          return new SystemMessage(msg.content);
        });

        messages.push(new HumanMessage(userMessage));

        const stream = await app.stream(
          { messages, toolCalls: [] },
          { streamMode: 'values' } as RunnableConfig,
        );

        let fullContent = '';

        for await (const state of stream) {
          const lastMessage = state.messages?.[state.messages.length - 1];

          // Yield tool call chunks
          if (lastMessage && 'tool_calls' in lastMessage) {
            const toolCalls = (lastMessage as AIMessage).tool_calls;
            if (toolCalls && toolCalls.length > 0) {
              for (const tc of toolCalls) {
                yield {
                  id: `chunk-${chunkIndex++}`,
                  content: '',
                  done: false,
                  messageId,
                  toolCall: {
                    name: tc.name,
                    arguments: JSON.stringify(tc.args),
                  },
                };
              }
            }
          }

          // Yield AI text chunks
          if (
            lastMessage instanceof AIMessage &&
            !(
              'tool_calls' in lastMessage &&
              (lastMessage as AIMessage).tool_calls?.length
            )
          ) {
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
