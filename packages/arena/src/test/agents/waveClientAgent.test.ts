import { describe, it, expect, vi } from 'vitest';
import {
    createWaveClientAgent,
    detectWaveIntent,
    extractRunTarget,
    parseWaveCommand,
    preprocessWaveInput,
} from '../../agents/waveClientAgent';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage } from '@langchain/core/messages';
import type { StructuredTool } from '@langchain/core/tools';

// ---------------------------------------------------------------------------
// Mock LLM factory
// ---------------------------------------------------------------------------

/**
 * Creates a mock BaseChatModel whose `invoke` responds to an AbortSignal.
 * When `delay` is set, the invoke resolves after `delay` ms.
 * When `delay` is not set (undefined), the invoke never resolves
 * but rejects if the AbortSignal fires.
 */
function makeMockLLM(delay?: number) {
    const calls: BaseMessage[][] = [];
    const bindToolsFn = vi.fn().mockReturnThis();

    const invokeFn = vi.fn().mockImplementation(
        (messages: BaseMessage[], options?: { signal?: AbortSignal }) => {
            calls.push(messages);
            return new Promise<BaseMessage>((resolve, reject) => {
                if (options?.signal?.aborted) {
                    reject(new Error('LLM aborted: signal already fired'));
                    return;
                }

                const cleanup = () => {
                    if (timer !== undefined) clearTimeout(timer);
                    if (options?.signal) {
                        options.signal.removeEventListener('abort', onAbort);
                    }
                };

                const onAbort = () => {
                    cleanup();
                    reject(new Error('LLM aborted by timeout'));
                };

                let timer: ReturnType<typeof setTimeout> | undefined;

                if (delay !== undefined) {
                    timer = setTimeout(() => {
                        cleanup();
                        resolve(new AIMessage('mock response'));
                    }, delay);
                }

                if (options?.signal) {
                    options.signal.addEventListener('abort', onAbort);
                }
            });
        },
    );

    const llm = {
        invoke: invokeFn,
        bindTools: bindToolsFn,
    } as unknown as BaseChatModel;

    return { llm, calls, invokeFn, bindToolsFn };
}

function createFakeTool(name: string): StructuredTool {
    return {
        name,
        description: `${name} tool`,
    } as unknown as StructuredTool;
}

async function collectChunks(agent: ReturnType<typeof createWaveClientAgent>, message: string) {
    const chunks = [] as Array<{ done: boolean; content: string; error?: string }>;
    for await (const chunk of agent.chat([], message)) {
        chunks.push(chunk);
        if (chunk.done) break;
    }
    return chunks;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * Short timeout used in tests so we don't need fake timers or long waits.
 * The agent's _llmTimeoutMs option overrides the default 60 s.
 */
const TEST_TIMEOUT_MS = 200;

describe('waveClientAgent — LLM timeout', () => {
    it('agentNode throws when LLM call exceeds timeout', async () => {
        const { llm } = makeMockLLM(/* never resolves */);
        const agent = createWaveClientAgent({
            llm,
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        const chunks = await collectChunks(agent, 'test message');
        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks[chunks.length - 1].done).toBe(true);
        expect(chunks[chunks.length - 1].error).toBeTruthy();
    }, 5_000);

    it('agentNode resolves normally when LLM responds within timeout', async () => {
        const { llm } = makeMockLLM(50);
        const agent = createWaveClientAgent({
            llm,
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        const chunks = await collectChunks(agent, 'test message');

        const lastChunk = chunks[chunks.length - 1];
        expect(lastChunk.done).toBe(true);
        expect(lastChunk.error).toBeUndefined();
        const contentChunk = chunks.find((c) => !c.done && c.content.length > 0);
        expect(contentChunk?.content).toBe('mock response');
    }, 5_000);
});

describe('waveClientAgent — prompt source and guardrails', () => {
    it('uses the canonical inlined default prompt when tools are bound', async () => {
        const { llm, calls } = makeMockLLM(1);
        const agent = createWaveClientAgent({
            llm,
            mcpTools: [createFakeTool('list_collections')],
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        await collectChunks(agent, 'list collections');

        const systemPrompt = String(calls[0][0]?.content ?? '');
        expect(systemPrompt).toContain('Wave Client Agent — System Prompt');
        expect(systemPrompt).toContain('TL;DR');
        expect(systemPrompt).toContain('What I checked');
        expect(systemPrompt).toContain('Findings');
        expect(systemPrompt).toContain('Recommended action');
        expect(systemPrompt).toContain('Next Steps');
        expect(systemPrompt).toContain('Quick');
        expect(systemPrompt).toContain('Default');
        expect(systemPrompt).toContain('Deep');
    });

    it('systemPrompt override takes precedence over the inlined default', async () => {
        const { llm, calls } = makeMockLLM(1);
        const agent = createWaveClientAgent({
            llm,
            mcpTools: [createFakeTool('list_collections')],
            systemPrompt: 'CUSTOM-WAVE-SYSTEM-PROMPT',
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        await collectChunks(agent, '/help');
        expect(String(calls[0][0]?.content ?? '')).toContain('CUSTOM-WAVE-SYSTEM-PROMPT');
    });

    it('full prompt includes anti-fabrication and confirmation guardrails', async () => {
        const { llm, calls } = makeMockLLM(1);
        const agent = createWaveClientAgent({
            llm,
            mcpTools: [createFakeTool('list_flows')],
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        await collectChunks(agent, '/run-flow smoke');
        const systemPrompt = String(calls[0][0]?.content ?? '');

        expect(systemPrompt).toContain('Never invent names or IDs');
        expect(systemPrompt).toContain('I cannot verify without MCP/tool output.');
        expect(systemPrompt).toContain('run_flow');
        expect(systemPrompt).toContain('run_test_suite');
        expect(systemPrompt).toContain('explicit confirmation');
    });

    it('no-tools mode injects restricted anti-fabrication prompt and skips bindTools', async () => {
        const { llm, calls, bindToolsFn } = makeMockLLM(1);
        const agent = createWaveClientAgent({
            llm,
            mcpTools: [],
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        await collectChunks(agent, 'list my collections');
        const systemPrompt = String(calls[0][0]?.content ?? '');

        expect(systemPrompt).toContain('Limited Mode (No Tools)');
        expect(systemPrompt).toContain('I cannot verify without MCP/tool output.');
        expect(bindToolsFn).not.toHaveBeenCalled();
    });
});

describe('waveClientAgent — command parsing and normalization', () => {
    it('parses /requests with quoted query', () => {
        const parsed = parseWaveCommand('/requests "login endpoint"');
        expect(parsed.isSlashCommand).toBe(true);
        expect(parsed.command).toBe('/requests');
        expect(parsed.arg).toBe('login endpoint');
        expect(parsed.hint?.kind).toBe('requests');
    });

    it('parses /run-flow target and marks confirmation requirement', () => {
        const parsed = parseWaveCommand('/run-flow    "Nightly Smoke"   ');
        expect(parsed.command).toBe('/run-flow');
        expect(parsed.hint?.kind).toBe('run-flow');
        expect(parsed.hint?.arg).toBe('Nightly Smoke');
        expect(parsed.hint?.requiresConfirmation).toBe(true);
    });

    it('returns guidance for unknown slash commands', () => {
        const parsed = parseWaveCommand('/unknown-cmd test');
        expect(parsed.isSlashCommand).toBe(true);
        expect(parsed.unknownCommand).toBe('/unknown-cmd');
        expect(parsed.normalizedMessage).toContain('is not supported');
        expect(parsed.normalizedMessage).toContain('/help');
    });

    it('handles empty argument edge cases for argument-bearing commands', () => {
        const parsed = parseWaveCommand('/run-tests');
        expect(parsed.command).toBe('/run-tests');
        expect(parsed.hint?.kind).toBe('run-tests');
        expect(parsed.hint?.arg).toBeUndefined();
        expect(parsed.normalizedMessage).toContain('without a target');
    });

    it('extractRunTarget handles quoted and unquoted targets', () => {
        expect(extractRunTarget('run flow "Critical Flow" in staging', 'flow')).toBe('Critical Flow');
        expect(extractRunTarget('execute tests Regression Suite with env prod', 'test')).toBe('Regression Suite');
    });
});

describe('waveClientAgent — free-form intent hinting', () => {
    it('detects list/detail/search intents', () => {
        expect(detectWaveIntent('show all collections')?.kind).toBe('collections');
        expect(detectWaveIntent('variables in environment production')?.kind).toBe('environments');
        expect(detectWaveIntent('find requests login')?.kind).toBe('requests');
    });

    it('detects run intents with confirmation flag', () => {
        const flowIntent = detectWaveIntent('run flow nightly smoke');
        expect(flowIntent?.kind).toBe('run-flow');
        expect(flowIntent?.requiresConfirmation).toBe(true);

        const testIntent = detectWaveIntent('execute test suite "User API Regression"');
        expect(testIntent?.kind).toBe('run-tests');
        expect(testIntent?.requiresConfirmation).toBe(true);
        expect(testIntent?.arg).toBe('User API Regression');
    });

    it('injects deterministic command and intent routing context', () => {
        const fromCommand = preprocessWaveInput('/help');
        expect(fromCommand.commandHint?.kind).toBe('help');
        expect(fromCommand.normalizedMessage).toContain('commandMatched: /help');

        const fromIntent = preprocessWaveInput('run flow nightly smoke');
        expect(fromIntent.intentHint?.kind).toBe('run-flow');
        expect(fromIntent.normalizedMessage).toContain('intentKind: /run-flow');
        expect(fromIntent.normalizedMessage).toContain('requiresConfirmation: true');
    });

    it('streams normally after preprocessing (no parser regression)', async () => {
        const { llm, calls } = makeMockLLM(1);
        const agent = createWaveClientAgent({
            llm,
            mcpTools: [createFakeTool('list_collections')],
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        const chunks = await collectChunks(agent, '/collections');
        expect(chunks[chunks.length - 1].done).toBe(true);
        expect(chunks[chunks.length - 1].error).toBeUndefined();

        const userMessage = String(calls[0][calls[0].length - 1]?.content ?? '');
        expect(userMessage).toContain('commandMatched: /collections');
        expect(userMessage).toContain('toolPlan: Call list_collections.');
    });
});
