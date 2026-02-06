/**
 * Learn Agent
 * 
 * Web technologies knowledge agent with two modes:
 * - Web: Query curated reference websites (IETF, MDN, W3C, etc.)
 * - Local: Search user-uploaded documents via vector store
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { 
  ChatMessage, 
  ChatChunk, 
  LearnAgentMode,
  ArenaSettings,
} from '../types';
import { DEFAULT_ARENA_SETTINGS } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface LearnAgentConfig {
  llm: BaseChatModel;
  settings?: Partial<ArenaSettings>;
  vectorStore?: unknown; // Will be properly typed when implementing vector store
}

interface LearnAgentState {
  messages: BaseMessage[];
  mode: LearnAgentMode;
  context: string[];
  sources: string[];
}

// ============================================================================
// System Prompts
// ============================================================================

const LEARN_SYSTEM_PROMPT = `You are a web technologies expert assistant specializing in network protocols, web standards, and API design.

Your knowledge covers:
- Network fundamentals: TCP/IP, UDP, DNS, routing
- Transfer protocols: HTTP/1.1, HTTP/2, HTTP/3, QUIC
- Application protocols: REST, GraphQL, gRPC, WebSocket, SSE
- Security: TLS/SSL, OAuth 2.0, JWT, CORS
- Remote access: SSH, FTP, SFTP
- Web standards: W3C, WHATWG, IETF RFCs

Instructions:
1. Search the appropriate knowledge base based on the query mode
2. For /learn-web: Reference official standards and RFCs
3. For /learn-local: Search user's uploaded documents
4. Always cite sources (RFC numbers, spec sections, document names)
5. Provide practical examples when helpful
6. Suggest related topics for deeper learning

Be concise but thorough. If you don't know something, say so rather than making up information.`;

// ============================================================================
// Learn Agent Implementation
// ============================================================================

/**
 * Create a Learn Agent instance
 */
export function createLearnAgent(config: LearnAgentConfig) {
  const { llm, settings = {} } = config;
  const mergedSettings = { ...DEFAULT_ARENA_SETTINGS, ...settings };

  // Define the state graph for the agent
  const workflow = new StateGraph<LearnAgentState>({
    channels: {
      messages: {
        value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
        default: () => [],
      },
      mode: {
        value: (_x: LearnAgentMode, y: LearnAgentMode) => y,
        default: () => 'auto' as LearnAgentMode,
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

  // Route node - determine if we need to fetch context
  const routeNode = async (state: LearnAgentState): Promise<Partial<LearnAgentState>> => {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage?.content?.toString() || '';
    
    // Determine mode from message content
    let mode: LearnAgentMode = state.mode;
    if (content.startsWith('/learn-web')) {
      mode = 'web';
    } else if (content.startsWith('/learn-local')) {
      mode = 'local';
    } else if (content.startsWith('/rfc')) {
      mode = 'web';
    }
    
    return { mode };
  };

  // Retrieve context node
  const retrieveNode = async (state: LearnAgentState): Promise<Partial<LearnAgentState>> => {
    const lastMessage = state.messages[state.messages.length - 1];
    const query = lastMessage?.content?.toString() || '';
    
    // Clean query of command prefixes
    const cleanQuery = query
      .replace(/^\/(learn-web|learn-local|explain|compare|rfc)\s*/i, '')
      .trim();
    
    const context: string[] = [];
    const sources: string[] = [];
    
    if (state.mode === 'web' || state.mode === 'auto') {
      // TODO: Implement web fetcher retrieval
      // For now, add placeholder
      context.push(`[Web search for: "${cleanQuery}" - Web fetcher not yet implemented]`);
    }
    
    if (state.mode === 'local' || state.mode === 'auto') {
      // TODO: Implement vector store retrieval
      // For now, add placeholder
      context.push(`[Local search for: "${cleanQuery}" - Vector store not yet implemented]`);
    }
    
    return { context, sources };
  };

  // Generate response node
  const generateNode = async (state: LearnAgentState): Promise<Partial<LearnAgentState>> => {
    const systemMessage = new SystemMessage(LEARN_SYSTEM_PROMPT);
    
    // Build context string
    const contextStr = state.context.length > 0
      ? `\n\nRelevant context:\n${state.context.join('\n\n')}`
      : '';
    
    const sourcesStr = state.sources.length > 0
      ? `\n\nSources: ${state.sources.join(', ')}`
      : '';
    
    // Prepare messages with context
    const messagesWithContext = [
      systemMessage,
      ...state.messages.slice(0, -1), // All but last
      new HumanMessage(
        state.messages[state.messages.length - 1].content + contextStr
      ),
    ];
    
    // Generate response
    const response = await llm.invoke(messagesWithContext);
    
    // Add sources to response if available
    let responseContent = response.content?.toString() || '';
    if (sourcesStr) {
      responseContent += sourcesStr;
    }
    
    return {
      messages: [new AIMessage(responseContent)],
    };
  };

  // Add nodes to graph
  workflow.addNode('route', routeNode);
  workflow.addNode('retrieve', retrieveNode);
  workflow.addNode('generate', generateNode);

  // Define edges
  workflow.addEdge(START, 'route' as any);
  workflow.addEdge('route' as any, 'retrieve' as any);
  workflow.addEdge('retrieve' as any, 'generate' as any);
  workflow.addEdge('generate' as any, END);

  // Compile the graph
  const app = workflow.compile();

  return {
    /**
     * Send a message and stream the response
     */
    async *chat(
      sessionMessages: ChatMessage[],
      userMessage: string,
      mode: LearnAgentMode = 'auto'
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
          } else {
            return new SystemMessage(msg.content);
          }
        });
        
        // Add the new user message
        messages.push(new HumanMessage(userMessage));
        
        // Stream the response
        const stream = await app.stream(
          { messages, mode },
          { streamMode: 'values' } as RunnableConfig
        );
        
        let fullContent = '';
        
        for await (const state of stream) {
          const lastMessage = state.messages?.[state.messages.length - 1];
          if (lastMessage instanceof AIMessage) {
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
     * Get available modes
     */
    getModes(): LearnAgentMode[] {
      return ['web', 'local', 'auto'];
    },

    /**
     * Get agent settings
     */
    getSettings(): Partial<ArenaSettings> {
      return mergedSettings;
    },
  };
}
