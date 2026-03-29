import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWebExpertAgent } from '../../agents/webExpertAgent';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage } from '@langchain/core/messages';

// ---------------------------------------------------------------------------
// Mock global fetch so webFetcher never makes real HTTP requests
// ---------------------------------------------------------------------------

const mockFetchResponse = (body: string, status = 200) =>
    Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        text: () => Promise.resolve(body),
    } as Response);

const STUB_HTML = '<html><head><title>Stub</title></head><body><main>stub content</main></body></html>';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => mockFetchResponse(STUB_HTML));
});

afterEach(() => {
    fetchSpy.mockRestore();
});

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

describe('webExpertAgent — LLM timeout', () => {
    it('generateNode throws when LLM call exceeds 60 s', async () => {
        // LLM never resolves — the timeout should abort the call
        const mockLLM = makeMockLLM(/* never resolves */);
        const agent = createWebExpertAgent({
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

    it('generateNode resolves normally within timeout', async () => {
        // LLM responds quickly (50 ms), well within the TEST_TIMEOUT_MS window
        const mockLLM = makeMockLLM(50);
        const agent = createWebExpertAgent({
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

// ---------------------------------------------------------------------------
// Messages reducer: no duplication
// ---------------------------------------------------------------------------

describe('webExpertAgent — messages reducer', () => {
    it('does not duplicate messages with command prefix routing', async () => {
        // Track the messages array passed to invoke to verify no duplication
        const invokedMessages: BaseMessage[][] = [];
        const mockLLM = {
            invoke: vi.fn().mockImplementation((messages: BaseMessage[]) => {
                invokedMessages.push(messages);
                return Promise.resolve(new AIMessage('response'));
            }),
        } as unknown as BaseChatModel;

        const agent = createWebExpertAgent({
            llm: mockLLM,
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        const chunks = [];
        for await (const chunk of agent.chat([], '/http explain multiplexing')) {
            chunks.push(chunk);
            if (chunk.done) break;
        }

        // LLM should have been invoked with system prompt + the stripped user message
        expect(mockLLM.invoke).toHaveBeenCalledTimes(1);
        const llmMessages = invokedMessages[0];
        // System message + user message (stripped of /http prefix) = 2
        expect(llmMessages).toHaveLength(2);
    }, 5_000);

    it('does not duplicate messages without command prefix', async () => {
        const invokedMessages: BaseMessage[][] = [];
        const mockLLM = {
            invoke: vi.fn().mockImplementation((messages: BaseMessage[]) => {
                invokedMessages.push(messages);
                return Promise.resolve(new AIMessage('response'));
            }),
        } as unknown as BaseChatModel;

        const agent = createWebExpertAgent({
            llm: mockLLM,
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        const chunks = [];
        for await (const chunk of agent.chat([], 'plain question')) {
            chunks.push(chunk);
            if (chunk.done) break;
        }

        expect(mockLLM.invoke).toHaveBeenCalledTimes(1);
        const llmMessages = invokedMessages[0];
        // System message + user message = 2
        expect(llmMessages).toHaveLength(2);
    }, 5_000);
});

// ---------------------------------------------------------------------------
// Retrieve pipeline: reference websites and RFC fetching
// ---------------------------------------------------------------------------

describe('webExpertAgent — retrieve pipeline', () => {
    it('fetches from reference websites during retrieval', async () => {
        const mockLLM = makeMockLLM(50);
        const agent = createWebExpertAgent({
            llm: mockLLM,
            references: [
                { id: 'mdn', name: 'MDN', url: 'https://developer.mozilla.org/', description: 'MDN', categories: ['web', 'http'], enabled: true },
            ],
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        const chunks = [];
        for await (const chunk of agent.chat([], 'explain http caching')) {
            chunks.push(chunk);
            if (chunk.done) break;
        }

        // webFetcher.search should have triggered at least one fetch call
        expect(fetchSpy).toHaveBeenCalled();
        // At least one call should be to MDN search URL
        const urls = fetchSpy.mock.calls.map(c => String(c[0]));
        expect(urls.some(u => u.includes('developer.mozilla.org'))).toBe(true);
    }, 10_000);

    it('fetches RFC by number when query contains RFC reference', async () => {
        const mockLLM = makeMockLLM(50);
        const agent = createWebExpertAgent({
            llm: mockLLM,
            references: [],
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        const chunks = [];
        for await (const chunk of agent.chat([], 'explain RFC 7540')) {
            chunks.push(chunk);
            if (chunk.done) break;
        }

        const urls = fetchSpy.mock.calls.map(c => String(c[0]));
        expect(urls.some(u => u.includes('rfc-editor.org/rfc/rfc7540.txt'))).toBe(true);
    }, 10_000);

    it('passes custom references to webFetcher', async () => {
        const mockLLM = makeMockLLM(50);
        const customRef = {
            id: 'custom',
            name: 'Custom Docs',
            url: 'https://custom-docs.example.com/',
            description: 'Custom',
            categories: ['custom'],
            enabled: true,
        };
        const agent = createWebExpertAgent({
            llm: mockLLM,
            references: [customRef],
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        const chunks = [];
        // Query with no known category keywords — should fall back to all enabled sites
        for await (const chunk of agent.chat([], 'custom topic query')) {
            chunks.push(chunk);
            if (chunk.done) break;
        }

        const urls = fetchSpy.mock.calls.map(c => String(c[0]));
        expect(urls.some(u => u.includes('custom-docs.example.com'))).toBe(true);
    }, 10_000);
});
