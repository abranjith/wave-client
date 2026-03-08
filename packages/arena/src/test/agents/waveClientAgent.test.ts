import { describe, it, expect, vi } from 'vitest';
import { createWaveClientAgent } from '../../agents/waveClientAgent';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage } from '@langchain/core/messages';

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
    const invokeFn = vi.fn().mockImplementation(
        (_messages: unknown[], options?: { signal?: AbortSignal }) => {
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

    return {
        invoke: invokeFn,
        bindTools: vi.fn().mockReturnThis(),
    } as unknown as BaseChatModel;
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
    it('agentNode throws when LLM call exceeds 60 s', async () => {
        // LLM never resolves — the timeout should abort the call
        const mockLLM = makeMockLLM(/* never resolves */);
        const agent = createWaveClientAgent({
            llm: mockLLM,
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        const gen = agent.chat([], 'test message');

        // Let the generator run; the LLM timeout fires after TEST_TIMEOUT_MS
        const chunks = [];
        for await (const chunk of gen) {
            chunks.push(chunk);
            if (chunk.done) break;
        }

        expect(chunks.length).toBeGreaterThan(0);
        const lastChunk = chunks[chunks.length - 1];
        expect(lastChunk.done).toBe(true);
        expect(lastChunk.error).toBeTruthy();
    }, 5_000);

    it('agentNode resolves normally when LLM responds within timeout', async () => {
        // LLM responds quickly (50 ms), well within the TEST_TIMEOUT_MS window
        const mockLLM = makeMockLLM(50);
        const agent = createWaveClientAgent({
            llm: mockLLM,
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        const gen = agent.chat([], 'test message');

        const chunks = [];
        for await (const chunk of gen) {
            chunks.push(chunk);
            if (chunk.done) break;
        }

        // Should have at least a done chunk with no error
        const lastChunk = chunks[chunks.length - 1];
        expect(lastChunk.done).toBe(true);
        expect(lastChunk.error).toBeUndefined();
    }, 5_000);
});
