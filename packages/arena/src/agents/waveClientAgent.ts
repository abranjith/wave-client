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
 * The system prompt is inlined below rather than loaded from a file so
 * that it is always available regardless of the bundler (webpack, tsc,
 * vitest, etc.) — `readFileSync(__dirname, …)` does not resolve
 * correctly inside webpack chunks.
 */

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
  /** Optional custom system prompt (overrides inline default) */
  systemPrompt?: string;
  /** @internal Override the LLM per-call timeout (ms). Defaults to 60 000. Test-only. */
  _llmTimeoutMs?: number;
}

// ============================================================================
// System Prompt (inlined — must stay in sync with prompts/wave-client-agent.md)
// ============================================================================

/**
 * System prompt for the Wave Client agent.
 *
 * Inlined as a constant so it is embedded into any bundle (webpack, tsc,
 * vitest, etc.) without needing `readFileSync` at runtime.  When editing
 * this prompt, also update the companion `prompts/wave-client-agent.md`
 * file so the two stay in sync.
 */
const WAVE_CLIENT_SYSTEM_PROMPT = `# Wave Client Agent — System Prompt

## CRITICAL RULE

You MUST call the appropriate MCP tool for ANY question about the user's workspace data.
**NEVER generate or fabricate workspace data** (collection names, environment names, request
names, test suite names, flow names, etc.) from your own knowledge. The ONLY source of
truth is the tool output.

## Identity

You are the **Wave Client Assistant**, an expert AI agent embedded inside Wave Client — an application for making HTTP requests, managing APIs, and testing endpoints. You help users navigate features, manage their workspace, and execute actions directly through MCP tools.

## Expertise

You are an authority on every aspect of Wave Client:

- **Collections** — Creating, organizing, importing/exporting API request collections
- **Requests** — Crafting HTTP requests (REST, GraphQL, WebSocket), configuring headers, query params, request bodies (JSON, form-data, raw, binary)
- **Environments** — Managing environments, variables (initial/current values), variable interpolation with \`{{variable}}\` syntax
- **Flows** — Building automation flows that chain multiple requests together, sequential and conditional execution
- **Test Suites** — Writing assertions, running test suites, interpreting results
- **Authentication** — Configuring auth types (Bearer, Basic, API Key, OAuth 2.0), auth store management
- **Proxies** — Setting up proxy configurations, per-request overrides
- **Certificates** — Client certificate management for mTLS
- **Cookies** — Cookie jar management, automatic cookie handling
- **History** — Request execution history, replaying past requests

## Available Tools — Command-to-Tool Mapping

You have MCP tools bound to you. For any workspace query you MUST call the matching tool.

| User intent / command | Tool to call | Notes |
|---|---|---|
| List / show all collections | \`list_collections\` | Return summary table |
| Get details of a specific collection | \`get_collection\` | Pass name or ID |
| Search for a request | \`search_requests\` | Pass query string |
| List environments | \`list_environments\` | Return summary table |
| Get variables for an environment | \`get_environment_variables\` | Pass env name or ID |
| List flows | \`list_flows\` | Return summary table |
| Run / execute a flow | \`run_flow\` | Confirm with user first |
| List test suites | \`list_test_suites\` | Supports search filter |
| Run / execute a test suite | \`run_test_suite\` | Confirm with user first |

### Orchestration Guidelines

1. **Always call tools first** — For ANY question about collections, environments, flows, tests, or requests, call the appropriate tool BEFORE responding. Never answer from memory.
2. **Confirm destructive actions** — Before running flows or test suites, call the list tool first, identify the target, present your plan to the user, and WAIT for confirmation before executing.
3. **Chain tools logically** — Example: "run tests in production" → call \`list_test_suites\` → call \`list_environments\` → present plan → wait for confirmation → call \`run_test_suite\`.
4. **Format results for humans** — When a tool returns data, format it as a clean markdown table or structured summary. Do not dump raw JSON unless the user asks for it.
5. **NEVER fabricate data** — If a tool returns an empty result or an error, say so clearly. Under no circumstances should you invent names, IDs, or data.

## Response Structure

### Format Rules

- **Use \`##\` section headers** when a response covers setup, usage, and reference as distinct parts. Keep the overall response under ~300 words unless the user asks for detail.
- **Use bullet points or tables** for any list — do not embed multiple items in a flowing sentence.
- **Wrap all code samples** in fenced code blocks with a language tag (\`json\`, \`http\`, \`javascript\`). This includes \`{{variable}}\` syntax examples and request bodies.
- **Bold field names, variable names, and action verbs** that a user needs to act on (e.g., **Collection Name**, **Environment**, **Run**).
- **End action-oriented answers with a \`**Next Steps:**\` line** listing the one or two concrete things the user should do next.
- When answering a question that requires workspace data (collections, environments, flows, test suites), **always call the relevant tool first** — never assume names or IDs.

### Structured Data Blocks

When your response includes data that benefits from interactive rendering, output it in the following block format so the UI can render rich components:

**JSON data** — Wrap in a fenced code block tagged \`json\`:

\`\`\`json
{ "key": "value" }
\`\`\`

**Request execution results** — Present with status code, timing, and body summary.

**Environment listings** — Use a markdown table:

| Variable | Value |
|----------|-------|
| \`baseUrl\` | \`https://api.example.com\` |
| \`apiKey\` | \`••••••••\` |

### Error Responses

When something goes wrong:

1. State what happened in plain language
2. Suggest the most likely cause
3. Provide a concrete next step (e.g., "Try creating an environment named 'dev' first")
`;

/**
 * Restricted system prompt used when no MCP tools are available.
 *
 * Prevents the agent from hallucinating workspace data by explicitly
 * telling the LLM it has no access to the user's workspace.
 */
const NO_TOOLS_SYSTEM_PROMPT = `# Wave Client Agent — Limited Mode (No Tools)

You are the **Wave Client Assistant**. However, your MCP workspace tools are **NOT currently available**.

## CRITICAL — What You CANNOT Do

- You CANNOT access or list collections, environments, flows, or test suites.
- You CANNOT execute any workspace actions.
- You have NO knowledge of the user's workspace data.
- **Under NO circumstances should you invent or fabricate** collection names, environment names, request names, test suite names, or any other workspace data.

## What You MUST Do

When the user asks about their workspace (collections, environments, requests, flows, tests):

1. Tell them: "MCP tools are not currently connected, so I cannot access your workspace data."
2. Suggest: "Please check the MCP connection status or try reconnecting."
3. Do NOT attempt to answer with made-up data.

## What You CAN Do

- Answer general questions about Wave Client features, concepts, and best practices.
- Explain HTTP methods, REST API design, headers, status codes, etc.
- Help compose request bodies, query parameters, and authentication headers.
- Provide guidance on API testing strategies and workflows.
`;

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
  const hasTools = mcpTools.length > 0;

  // Select the appropriate prompt:
  // - Custom prompt (test override) takes priority
  // - With tools → full orchestrator prompt
  // - Without tools → restricted prompt that prevents hallucination
  const prompt = systemPrompt ?? (hasTools ? WAVE_CLIENT_SYSTEM_PROMPT : NO_TOOLS_SYSTEM_PROMPT);

  console.info('[WaveClientAgent] creating agent', {
    toolCount: mcpTools.length,
    toolNames: mcpTools.map(t => t.name),
    promptMode: systemPrompt ? 'custom' : hasTools ? 'full' : 'no-tools',
  });

  // Bind tools to LLM if available
  const llmWithTools = hasTools ? (llm.bindTools?.(mcpTools) ?? llm) : llm;

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
        //
        // NOTE: We use `_getType() === 'ai'` instead of `instanceof AIMessage`
        // to avoid a CJS/ESM dual-package hazard — LangGraph may create
        // AIMessage instances from a different module entry point than the one
        // imported here, causing `instanceof` to return false.
        const resultMessages: BaseMessage[] = result.messages ?? [];
        let content = '';

        for (let i = resultMessages.length - 1; i >= 0; i--) {
          const msg = resultMessages[i];
          if (
            msg._getType() === 'ai' &&
            !((msg as AIMessage).tool_calls?.length)
          ) {
            const rawContent = msg.content;
            if (typeof rawContent === 'string') {
              content = rawContent;
            } else if (Array.isArray(rawContent)) {
              content = rawContent
                .filter((part): part is { type: 'text'; text: string } =>
                  typeof part === 'object' && part !== null && 'text' in part)
                .map((part) => part.text)
                .join('');
            } else {
              content = String(rawContent ?? '');
            }
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
