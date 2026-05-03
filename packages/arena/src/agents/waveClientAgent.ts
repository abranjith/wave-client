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
 * The system prompt is inlined below as the canonical source of truth
 * so that it is always available regardless of the bundler (webpack,
 * tsc, vitest, etc.) — `readFileSync(__dirname, …)` does not resolve
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

export type WaveCommandKind =
  | 'help'
  | 'collections'
  | 'requests'
  | 'environments'
  | 'flows'
  | 'tests'
  | 'run-flow'
  | 'run-tests';

/**
 * Routing hint used to steer deterministic tool orchestration behavior.
 */
export interface WaveCommandHint {
  kind: WaveCommandKind;
  arg?: string;
  requiresConfirmation?: boolean;
}

export interface ParsedWaveCommandResult {
  isSlashCommand: boolean;
  command?: WaveSupportedCommand;
  arg?: string;
  hint?: WaveCommandHint;
  normalizedMessage: string;
  unknownCommand?: string;
}

export interface WaveInputPreprocessResult {
  normalizedMessage: string;
  commandHint?: WaveCommandHint;
  intentHint?: WaveCommandHint;
  unknownCommand?: string;
}

export const WAVE_SUPPORTED_COMMANDS = [
  '/help',
  '/collections',
  '/requests',
  '/environments',
  '/flows',
  '/tests',
  '/run-flow',
  '/run-tests',
] as const;

type WaveSupportedCommand = typeof WAVE_SUPPORTED_COMMANDS[number];

const WAVE_SUPPORTED_COMMAND_SET = new Set<WaveSupportedCommand>(WAVE_SUPPORTED_COMMANDS);

const WAVE_COMMAND_TO_KIND: Record<WaveSupportedCommand, WaveCommandKind> = {
  '/help': 'help',
  '/collections': 'collections',
  '/requests': 'requests',
  '/environments': 'environments',
  '/flows': 'flows',
  '/tests': 'tests',
  '/run-flow': 'run-flow',
  '/run-tests': 'run-tests',
};

const WAVE_KIND_TO_COMMAND: Record<WaveCommandKind, WaveSupportedCommand> = {
  help: '/help',
  collections: '/collections',
  requests: '/requests',
  environments: '/environments',
  flows: '/flows',
  tests: '/tests',
  'run-flow': '/run-flow',
  'run-tests': '/run-tests',
};

/**
 * Stable command-to-focus guidance injected into the user message context.
 */
export const WAVE_COMMAND_FOCUS: Record<WaveCommandKind, string> = {
  help: 'Provide a concise command guide tailored for Wave Client operations.',
  collections: 'Focus on collections inventory and collection-level details.',
  requests: 'Focus on request search and request-level lookup using a query.',
  environments: 'Focus on environment inventory and environment variables.',
  flows: 'Focus on flow inventory and flow execution planning.',
  tests: 'Focus on test suite inventory and test execution planning.',
  'run-flow': 'Focus on safely executing a flow with confirmation-first behavior.',
  'run-tests': 'Focus on safely executing a test suite with confirmation-first behavior.',
};

const WAVE_COMMAND_HELP_TEXT = WAVE_SUPPORTED_COMMANDS.join(', ');

// ============================================================================
// Command and intent preprocessing helpers
// ============================================================================

function truncatePreview(value: string, maxLength = 80): string {
  return value.length <= maxLength ? value : `${value.substring(0, maxLength)}...`;
}

function normalizeHintArg(arg: string | undefined): string | undefined {
  if (!arg) { return undefined; }
  const trimmed = arg.trim();
  if (!trimmed) { return undefined; }

  const quotedMatch = trimmed.match(/^(['"])([\s\S]+)\1$/);
  const unwrapped = quotedMatch ? quotedMatch[2] : trimmed;
  return unwrapped.trim() || undefined;
}

function sanitizeRunTarget(target: string | undefined): string | undefined {
  if (!target) { return undefined; }

  const withoutTrailingContext = target
    .trim()
    .replace(/\s+(in|on|with|using|against|via)\s+.+$/i, '');

  const cleaned = withoutTrailingContext
    .replace(/^['"`]|['"`]$/g, '')
    .replace(/[.,;:!?]+$/g, '')
    .trim();

  return cleaned || undefined;
}

/**
 * Extracts a run target from free-form text for flow/test execution intents.
 */
export function extractRunTarget(message: string, kind: 'flow' | 'test'): string | undefined {
  const trimmed = message.trim();
  if (!trimmed) { return undefined; }

  const quoted = trimmed.match(/['"]([^'"\n]+)['"]/);
  if (quoted?.[1]) {
    return sanitizeRunTarget(quoted[1]);
  }

  const flowPattern = /\b(?:run|execute)\s+(?:the\s+)?flow\s+(.+)$/i;
  const testPattern = /\b(?:run|execute)\s+(?:the\s+)?(?:tests?|test suites?)\s+(.+)$/i;
  const genericPattern = /\b(?:run|execute)\s+(.+)$/i;

  const directMatch = kind === 'flow'
    ? trimmed.match(flowPattern)
    : trimmed.match(testPattern);

  if (directMatch?.[1]) {
    return sanitizeRunTarget(directMatch[1]);
  }

  if (kind === 'test') {
    const shortTestPattern = /\btest suite\s+(.+)$/i;
    const shortMatch = trimmed.match(shortTestPattern);
    if (shortMatch?.[1]) {
      return sanitizeRunTarget(shortMatch[1]);
    }
  }

  const genericMatch = trimmed.match(genericPattern);
  if (!genericMatch?.[1]) {
    return undefined;
  }

  const genericTarget = sanitizeRunTarget(genericMatch[1]);
  if (!genericTarget) {
    return undefined;
  }

  if (kind === 'flow' && /\btests?\b/i.test(genericTarget)) {
    return undefined;
  }
  if (kind === 'test' && /\bflows?\b/i.test(genericTarget)) {
    return undefined;
  }

  return genericTarget;
}

function extractEntityTarget(message: string, entity: 'collection' | 'environment' | 'request'): string | undefined {
  const trimmed = message.trim();
  if (!trimmed) { return undefined; }

  const quoted = trimmed.match(/['"]([^'"\n]+)['"]/);
  if (quoted?.[1]) {
    return normalizeHintArg(quoted[1]);
  }

  const patterns: Record<typeof entity, RegExp[]> = {
    collection: [
      /\bcollection\s+(?:named|called|id)\s+(.+)$/i,
      /\bcollection\s+(.+)$/i,
    ],
    environment: [
      /\b(?:environment|env)\s+(?:named|called|id)\s+(.+)$/i,
      /\b(?:environment|env)\s+(.+)$/i,
    ],
    request: [
      /\brequests?\s+(?:named|called|matching)\s+(.+)$/i,
      /\b(?:find|search)\s+(?:for\s+)?requests?\s+(.+)$/i,
      /\b(?:find|search)\s+(.+)$/i,
    ],
  };

  for (const pattern of patterns[entity]) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return normalizeHintArg(match[1]);
    }
  }

  return undefined;
}

function normalizeCommandPrompt(command: WaveSupportedCommand, arg?: string): string {
  switch (command) {
    case '/help':
      return 'Show a concise Wave Client command guide with one practical example per command.';
    case '/collections':
      return arg
        ? `Inspect collection details for "${arg}" and summarize key requests.`
        : 'List all collections with a concise summary for each.';
    case '/requests':
      return arg
        ? `Search requests using query "${arg}" and summarize the top matches.`
        : 'The user ran /requests without a query. Ask for a search query and give one usage example: /requests login.';
    case '/environments':
      return arg
        ? `Show variables for environment "${arg}" and summarize important values safely.`
        : 'List all environments and summarize their variable counts.';
    case '/flows':
      return arg
        ? `Check whether flow "${arg}" exists and summarize how to run it safely.`
        : 'List all flows and summarize their status/readiness.';
    case '/tests':
      return arg
        ? `Check whether test suite "${arg}" exists and summarize how to run it safely.`
        : 'List all test suites and summarize their purpose/readiness.';
    case '/run-flow':
      return arg
        ? `Prepare to run flow "${arg}". Resolve the target first, then request explicit confirmation before execution.`
        : 'The user ran /run-flow without a target. Ask for flow name or ID and show one usage example: /run-flow Smoke Tests.';
    case '/run-tests':
      return arg
        ? `Prepare to run test suite "${arg}". Resolve the target first, then request explicit confirmation before execution.`
        : 'The user ran /run-tests without a target. Ask for suite name or ID and show one usage example: /run-tests Regression Suite.';
  }
}

function buildToolPlanHint(hint: WaveCommandHint): string {
  switch (hint.kind) {
    case 'help':
      return 'No MCP tool required. Provide command guidance only.';
    case 'collections':
      return hint.arg
        ? `Call get_collection with target "${hint.arg}". If it fails to resolve, call list_collections first.`
        : 'Call list_collections.';
    case 'requests':
      return hint.arg
        ? `Call search_requests with query "${hint.arg}".`
        : 'Call search_requests after asking the user for a query.';
    case 'environments':
      return hint.arg
        ? `Call get_environment_variables for "${hint.arg}". If unresolved, call list_environments first.`
        : 'Call list_environments.';
    case 'flows':
      return 'Call list_flows.';
    case 'tests':
      return 'Call list_test_suites.';
    case 'run-flow':
      return hint.arg
        ? `Call list_flows to resolve "${hint.arg}". Ask for explicit confirmation. Only then call run_flow.`
        : 'Call list_flows, ask for target selection, then request explicit confirmation before run_flow.';
    case 'run-tests':
      return hint.arg
        ? `Call list_test_suites to resolve "${hint.arg}". Ask for explicit confirmation. Only then call run_test_suite.`
        : 'Call list_test_suites, ask for target selection, then request explicit confirmation before run_test_suite.';
  }
}

function buildRoutingContext(
  commandHint?: WaveCommandHint,
  intentHint?: WaveCommandHint,
  unknownCommand?: string,
): string {
  if (unknownCommand) {
    return [
      'Wave routing hint:',
      `- unknownCommand: ${unknownCommand}`,
      `- supportedCommands: ${WAVE_COMMAND_HELP_TEXT}`,
      '- action: explain valid command syntax and request corrected input.',
    ].join('\n');
  }

  const activeHint = commandHint ?? intentHint;
  if (!activeHint) {
    return '';
  }

  const commandLabel = WAVE_KIND_TO_COMMAND[activeHint.kind];
  const sourceLabel = commandHint ? 'commandMatched' : 'intentKind';

  const lines = [
    'Wave routing hint:',
    `- ${sourceLabel}: ${commandLabel}`,
    `- focus: ${WAVE_COMMAND_FOCUS[activeHint.kind]}`,
    `- toolPlan: ${buildToolPlanHint(activeHint)}`,
  ];

  if (activeHint.arg) {
    lines.push(`- targetArg: ${activeHint.arg}`);
  }

  if (activeHint.requiresConfirmation) {
    lines.push('- requiresConfirmation: true');
  }

  return lines.join('\n');
}

/**
 * Parses a slash command and normalizes it into an operational user prompt.
 */
export function parseWaveCommand(message: string): ParsedWaveCommandResult {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/')) {
    return { isSlashCommand: false, normalizedMessage: trimmed };
  }

  const match = trimmed.match(/^\/([a-z-]+)(?:\s+([\s\S]+))?$/i);
  if (!match) {
    return {
      isSlashCommand: true,
      normalizedMessage: `The command syntax is invalid. Use one of: ${WAVE_COMMAND_HELP_TEXT}.`,
      unknownCommand: trimmed,
    };
  }

  const commandToken = `/${match[1].toLowerCase()}`;
  const arg = normalizeHintArg(match[2]);

  if (!WAVE_SUPPORTED_COMMAND_SET.has(commandToken as WaveSupportedCommand)) {
    return {
      isSlashCommand: true,
      normalizedMessage: `The command "${commandToken}" is not supported. Supported commands: ${WAVE_COMMAND_HELP_TEXT}.`,
      unknownCommand: commandToken,
    };
  }

  const command = commandToken as WaveSupportedCommand;
  const kind = WAVE_COMMAND_TO_KIND[command];
  const hint: WaveCommandHint = {
    kind,
    ...(arg ? { arg } : {}),
    ...(kind === 'run-flow' || kind === 'run-tests' ? { requiresConfirmation: true } : {}),
  };

  return {
    isSlashCommand: true,
    command,
    arg,
    hint,
    normalizedMessage: normalizeCommandPrompt(command, arg),
  };
}

/**
 * Detects free-form Wave intents and maps them to deterministic hint kinds.
 */
export function detectWaveIntent(message: string): WaveCommandHint | undefined {
  const trimmed = message.trim();
  if (!trimmed || trimmed.startsWith('/')) {
    return undefined;
  }

  const lower = trimmed.toLowerCase();

  if (/\b(?:run|execute)\b/.test(lower) && /\bflows?\b/.test(lower)) {
    const arg = extractRunTarget(trimmed, 'flow');
    return {
      kind: 'run-flow',
      ...(arg ? { arg } : {}),
      requiresConfirmation: true,
    };
  }

  if (
    /\b(?:run|execute)\b/.test(lower) &&
    (/\btests?\b/.test(lower) || /\btest suites?\b/.test(lower))
  ) {
    const arg = extractRunTarget(trimmed, 'test');
    return {
      kind: 'run-tests',
      ...(arg ? { arg } : {}),
      requiresConfirmation: true,
    };
  }

  if (/\b(?:find|search|lookup)\b/.test(lower) && /\brequests?\b/.test(lower)) {
    const arg = extractEntityTarget(trimmed, 'request');
    return { kind: 'requests', ...(arg ? { arg } : {}) };
  }

  if (/\bcollections?\b/.test(lower)) {
    const arg = extractEntityTarget(trimmed, 'collection');
    return { kind: 'collections', ...(arg ? { arg } : {}) };
  }

  if (/\b(?:environment|environments|env|envs)\b/.test(lower) || /\bvariables?\b/.test(lower)) {
    const arg = extractEntityTarget(trimmed, 'environment');
    return { kind: 'environments', ...(arg ? { arg } : {}) };
  }

  if (/\bflows?\b/.test(lower)) {
    return { kind: 'flows' };
  }

  if (/\btests?\b/.test(lower) || /\btest suites?\b/.test(lower)) {
    return { kind: 'tests' };
  }

  if (/\brequests?\b/.test(lower)) {
    const arg = extractEntityTarget(trimmed, 'request');
    return { kind: 'requests', ...(arg ? { arg } : {}) };
  }

  return undefined;
}

/**
 * Normalizes incoming user text into deterministic command/intent guided input.
 */
export function preprocessWaveInput(message: string): WaveInputPreprocessResult {
  const trimmed = message.trim();
  if (!trimmed) {
    return { normalizedMessage: message };
  }

  const parsedCommand = parseWaveCommand(trimmed);
  if (parsedCommand.isSlashCommand) {
    const context = buildRoutingContext(parsedCommand.hint, undefined, parsedCommand.unknownCommand);
    const normalizedMessage = context
      ? `${parsedCommand.normalizedMessage}\n\n${context}`
      : parsedCommand.normalizedMessage;

    return {
      normalizedMessage,
      commandHint: parsedCommand.hint,
      unknownCommand: parsedCommand.unknownCommand,
    };
  }

  const intentHint = detectWaveIntent(trimmed);
  if (!intentHint) {
    return { normalizedMessage: trimmed };
  }

  const context = buildRoutingContext(undefined, intentHint);
  return {
    normalizedMessage: `${trimmed}\n\n${context}`,
    intentHint,
  };
}

// ============================================================================
// System Prompt (inlined — canonical source, no companion prompt file)
// ============================================================================

/**
 * Canonical inlined system prompt for the Wave Client agent.
 *
 * Inlined as a constant so it is embedded into any bundle (webpack, tsc,
 * vitest, etc.) without needing `readFileSync` at runtime. Use the
 * `systemPrompt` config option to override this prompt per instance.
 */
const WAVE_CLIENT_SYSTEM_PROMPT = `# Wave Client Agent — System Prompt

## Identity

You are the **Wave Client Assistant** inside Wave Client.
Your job is to help users inspect and operate their workspace using MCP tools.

## Non-Negotiable Rules

1. For workspace data, call tools first. Never answer from memory.
2. Never invent names or IDs for collections, requests, environments, flows, or test suites.
3. For every workspace claim, state which MCP tool produced it.
4. If tool output is unavailable, explicitly write: "I cannot verify without MCP/tool output."
5. Before \`run_flow\` or \`run_test_suite\`, require explicit confirmation language from the user.
6. If a run target is ambiguous, list candidates first and ask the user to choose.

## Expertise

You are an authority on Wave Client collections, requests, environments, flows, test suites,
authentication, proxies, certificates, cookies, and history.

Use Wave Client terminology precisely (collection, environment, flow, test suite).

## Command and Tool Mapping

You have MCP tools bound to you. Use this mapping:

| User intent / command | Tool to call | Notes |
|---|---|---|
| /help | none | Explain command usage and safe workflow |
| /collections | list_collections, get_collection | list first; drill down when target provided |
| /requests | search_requests | requires query |
| /environments | list_environments, get_environment_variables | list first; fetch variables when target provided |
| /flows | list_flows | inventory and readiness |
| /tests | list_test_suites | inventory and readiness |
| /run-flow | list_flows, run_flow | resolve target, confirm, then run |
| /run-tests | list_test_suites, run_test_suite | resolve target, confirm, then run |

## Response Format (Mandatory)

For operational answers, always use this exact section order:

1. TL;DR
2. What I checked
3. Findings
4. Recommended action
5. Next Steps

## Depth Control

- Quick: short operational response, minimal detail.
- Default: structured actionable response with concise rationale.
- Deep: detailed troubleshooting with explicit command/tool breakdown and alternatives.

Use the depth requested by the user. If no depth is requested, use Default.

## Orchestration Rules

1. For list intents, call the matching list tool first.
2. For detail intents, resolve with list/get tool output before answering.
3. For run intents, do: resolve target -> ask confirmation -> run.
4. Keep outputs structured and concise; use tables for lists when useful.
5. Never expose or infer secrets from masked values.

## Failure Handling

When tools fail or return empty results:

1. State what failed.
2. Include the tool name used.
3. Give a concrete next step.
4. If data is not verified, use: "I cannot verify without MCP/tool output."
`;

/**
 * Restricted system prompt used when no MCP tools are available.
 *
 * Prevents fabricated workspace output by requiring explicit limitation
 * language and no-data guarantees.
 */
const NO_TOOLS_SYSTEM_PROMPT = `# Wave Client Agent — Limited Mode (No Tools)

You are the **Wave Client Assistant**. MCP workspace tools are currently unavailable.

## Non-Negotiable Rules

1. You cannot read workspace collections, requests, environments, flows, or test suites.
2. You cannot execute workspace actions.
3. Never invent workspace names, IDs, variables, or results.
4. For any workspace question, explicitly write: "I cannot verify without MCP/tool output."
5. Ask the user to reconnect MCP and retry.

## Allowed Scope

- Explain Wave Client concepts and best practices.
- Provide request composition guidance (headers, body, auth setup).
- Explain testing approaches and troubleshooting strategy at a conceptual level.

## Response Format (Mandatory)

Use this exact section order when answering operational questions:

1. TL;DR
2. What I checked
3. Findings
4. Recommended action
5. Next Steps

Do not claim workspace facts in limited mode.
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
      const preprocessedInput = preprocessWaveInput(userMessage);
      const commandMatched = preprocessedInput.commandHint
        ? WAVE_KIND_TO_COMMAND[preprocessedInput.commandHint.kind]
        : undefined;
      const intentKind = preprocessedInput.intentHint?.kind;

      const messageId = `msg-${Date.now()}`;
      let chunkIndex = 0;

      console.info('[WaveClientAgent] chat start', {
        messageId,
        historyLength: sessionMessages.length,
        messagePreview: truncatePreview(userMessage),
        normalizedPreview: truncatePreview(preprocessedInput.normalizedMessage),
        commandMatched,
        intentKind,
        unknownCommand: preprocessedInput.unknownCommand,
        toolCount: mcpTools.length,
      });

      if (commandMatched || intentKind || preprocessedInput.unknownCommand) {
        console.info('[WaveClientAgent] routing', {
          commandMatched,
          intentKind,
          unknownCommand: preprocessedInput.unknownCommand,
          messagePreview: truncatePreview(userMessage, 60),
        });
      }

      try {
        const messages: BaseMessage[] = sessionMessages.map((msg) => {
          if (msg.role === 'user') { return new HumanMessage(msg.content); }
          if (msg.role === 'assistant') { return new AIMessage(msg.content); }
          return new SystemMessage(msg.content);
        });

        messages.push(new HumanMessage(preprocessedInput.normalizedMessage));

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
            msg.getType() === 'ai' &&
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
