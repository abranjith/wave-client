/**
 * Discover Agent
 * 
 * Wave Client feature discovery agent that uses MCP tools
 * to help users explore and use the application.
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredTool } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { ChatMessage, ChatChunk, ArenaSettings } from '../types';
import { DEFAULT_ARENA_SETTINGS } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface DiscoverAgentConfig {
  llm: BaseChatModel;
  mcpTools?: StructuredTool[];
  settings?: Partial<ArenaSettings>;
}

interface DiscoverAgentState {
  messages: BaseMessage[];
  toolCalls: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result?: unknown;
  }>;
}

// ============================================================================
// System Prompts
// ============================================================================

const DISCOVER_SYSTEM_PROMPT = `You are Wave Client's assistant, helping users discover and use the app.

You have access to tools that interact with the user's Wave Client data:
- Collections: API request collections organized by project
- Environments: Variable sets for different environments (dev, staging, prod)
- Flows: Automated request sequences
- Test Suites: API testing configurations

Instructions:
1. Use tools to understand the user's current setup
2. Provide step-by-step guidance for tasks
3. Offer relevant suggestions based on their data
4. Be concise but helpful

When users ask about Wave Client features, use the available tools to provide accurate, contextual information about their specific setup.`;

// ============================================================================
// Discover Agent Implementation
// ============================================================================

/**
 * Create a Discover Agent instance
 */
export function createDiscoverAgent(config: DiscoverAgentConfig) {
  const { llm, mcpTools = [], settings = {} } = config;
  const mergedSettings = { ...DEFAULT_ARENA_SETTINGS, ...settings };

  // Bind tools to LLM if available
  const llmWithTools = mcpTools.length > 0
    ? llm.bindTools?.(mcpTools) ?? llm
    : llm;

  // Define the state graph
  const workflow = new StateGraph<DiscoverAgentState>({
    channels: {
      messages: {
        value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
        default: () => [],
      },
      toolCalls: {
        value: (_x: Array<{ name: string; arguments: Record<string, unknown> }>, y: Array<{ name: string; arguments: Record<string, unknown> }>) => y,
        default: () => [],
      },
    },
  });

  // Check if we should call tools
  const shouldCallTools = (state: DiscoverAgentState): 'tools' | 'generate' => {
    const lastMessage = state.messages[state.messages.length - 1];
    
    // Check if the last message has tool calls
    if (lastMessage && 'tool_calls' in lastMessage) {
      const toolCalls = (lastMessage as AIMessage).tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        return 'tools';
      }
    }
    
    return 'generate';
  };

  // Agent node - decide what to do
  const agentNode = async (state: DiscoverAgentState): Promise<Partial<DiscoverAgentState>> => {
    const systemMessage = new SystemMessage(DISCOVER_SYSTEM_PROMPT);
    const messages = [systemMessage, ...state.messages];
    
    const response = await llmWithTools.invoke(messages);
    
    return {
      messages: [response],
    };
  };

  // Tool execution node
  const toolNode = async (state: DiscoverAgentState): Promise<Partial<DiscoverAgentState>> => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = lastMessage.tool_calls || [];
    
    const toolResults: BaseMessage[] = [];
    const executedCalls: DiscoverAgentState['toolCalls'] = [];
    
    for (const toolCall of toolCalls) {
      const tool = mcpTools.find(t => t.name === toolCall.name);
      
      if (tool) {
        try {
          const result = await tool.invoke(toolCall.args);
          
          toolResults.push(
            new ToolMessage({
              tool_call_id: toolCall.id || toolCall.name,
              content: typeof result === 'string' ? result : JSON.stringify(result),
            })
          );
          
          executedCalls.push({
            name: toolCall.name,
            arguments: toolCall.args as Record<string, unknown>,
            result,
          });
        } catch (error) {
          toolResults.push(
            new ToolMessage({
              tool_call_id: toolCall.id || toolCall.name,
              content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            })
          );
        }
      }
    }
    
    return {
      messages: toolResults,
      toolCalls: executedCalls,
    };
  };

  // Generate final response node
  const generateNode = async (state: DiscoverAgentState): Promise<Partial<DiscoverAgentState>> => {
    const systemMessage = new SystemMessage(DISCOVER_SYSTEM_PROMPT);
    const messages = [systemMessage, ...state.messages];
    
    const response = await llm.invoke(messages);
    
    return {
      messages: [response],
    };
  };

  // Add nodes
  workflow.addNode('agent', agentNode);
  workflow.addNode('tools', toolNode);
  workflow.addNode('generate', generateNode);

  // Define edges
  workflow.addEdge(START, 'agent' as any);
  (workflow.addConditionalEdges as any)('agent', shouldCallTools as any, {
    tools: 'tools',
    generate: END,
  });
  workflow.addEdge('tools' as any, 'generate' as any);
  workflow.addEdge('generate' as any, END);

  // Compile the graph
  const app = workflow.compile();

  return {
    /**
     * Send a message and stream the response
     */
    async *chat(
      sessionMessages: ChatMessage[],
      userMessage: string
    ): AsyncGenerator<ChatChunk> {
      const messageId = `msg-${Date.now()}`;
      let chunkIndex = 0;
      
      try {
        // Convert session messages to LangChain format
        const messages: BaseMessage[] = sessionMessages.map((msg) => {
          if (msg.role === 'user') {
            return new HumanMessage(msg.content);
          } else if (msg.role === 'assistant') {
            return new AIMessage(msg.content);
          } else if (msg.role === 'tool' && msg.toolCall) {
            return new ToolMessage({
              tool_call_id: msg.toolCall.name,
              content: JSON.stringify(msg.toolCall.result),
            });
          } else {
            return new SystemMessage(msg.content);
          }
        });
        
        // Add the new user message
        messages.push(new HumanMessage(userMessage));
        
        // Stream the response
        const stream = await app.stream(
          { messages, toolCalls: [] },
          { streamMode: 'values' } as RunnableConfig
        );
        
        let fullContent = '';
        
        for await (const state of stream) {
          const lastMessage = state.messages?.[state.messages.length - 1];
          
          // Handle tool calls
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
          
          // Handle AI response
          if (lastMessage instanceof AIMessage && !('tool_calls' in lastMessage && (lastMessage as AIMessage).tool_calls?.length)) {
            const content = lastMessage.content?.toString() || '';
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
        
        // Final chunk
        yield {
          id: `chunk-${chunkIndex}`,
          content: '',
          done: true,
          messageId,
        };
      } catch (error) {
        yield {
          id: `chunk-error`,
          content: '',
          done: true,
          messageId,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Get available tools
     */
    getTools(): string[] {
      return mcpTools.map(t => t.name);
    },

    /**
     * Get agent settings
     */
    getSettings(): Partial<ArenaSettings> {
      return mergedSettings;
    },
  };
}
