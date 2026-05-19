import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWebExpertAgent } from '../../agents/webExpertAgent';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, SystemMessage } from '@langchain/core/messages';

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
                    if (timer !== undefined) {clearTimeout(timer);}
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
            if (chunk.done) {break;}
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
            if (chunk.done) {break;}
        }

        // Should have at least a done chunk with no error
        const lastChunk = chunks[chunks.length - 1];
        expect(lastChunk.done).toBe(true);
        expect(lastChunk.error).toBeUndefined();
    }, 5_000);
});

// ---------------------------------------------------------------------------
// Inlined system prompt wiring
// ---------------------------------------------------------------------------

describe('webExpertAgent — inlined system prompt', () => {
    it('passes the full inlined prompt as the system message', async () => {
        const capturedMessages: BaseMessage[][] = [];
        const mockLLM = {
            invoke: vi.fn().mockImplementation((messages: BaseMessage[]) => {
                capturedMessages.push(messages);
                return Promise.resolve(new AIMessage('response'));
            }),
        } as unknown as BaseChatModel;

        const agent = createWebExpertAgent({ llm: mockLLM, _llmTimeoutMs: TEST_TIMEOUT_MS });

        const chunks = [];
        for await (const chunk of agent.chat([], 'hello')) {
            chunks.push(chunk);
            if (chunk.done) {break;}
        }

        expect(capturedMessages.length).toBe(1);
        const systemMsg = capturedMessages[0][0];
        expect(systemMsg).toBeInstanceOf(SystemMessage);
        // Marker that exists only in the full prompt, not in the previous stub
        expect(systemMsg.content).toContain('Tier 1 — Specifications & Standards');
        expect(systemMsg.content).toContain('webauthn.guide');
        expect(systemMsg.content).toContain('Reference Sources');
    }, 5_000);

    it('systemPrompt override replaces the inlined prompt', async () => {
        const capturedMessages: BaseMessage[][] = [];
        const mockLLM = {
            invoke: vi.fn().mockImplementation((messages: BaseMessage[]) => {
                capturedMessages.push(messages);
                return Promise.resolve(new AIMessage('response'));
            }),
        } as unknown as BaseChatModel;

        const agent = createWebExpertAgent({
            llm: mockLLM,
            systemPrompt: 'CUSTOM_PROMPT_FOR_TEST',
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        const chunks = [];
        for await (const chunk of agent.chat([], 'hello')) {
            chunks.push(chunk);
            if (chunk.done) {break;}
        }

        expect(capturedMessages.length).toBe(1);
        const systemMsg = capturedMessages[0][0];
        expect(systemMsg).toBeInstanceOf(SystemMessage);
        expect(systemMsg.content).toBe('CUSTOM_PROMPT_FOR_TEST');
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
        for await (const chunk of agent.chat([], '/protocols explain multiplexing')) {
            chunks.push(chunk);
            if (chunk.done) {break;}
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
            if (chunk.done) {break;}
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
            if (chunk.done) {break;}
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
            if (chunk.done) {break;}
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
            if (chunk.done) {break;}
        }

        const urls = fetchSpy.mock.calls.map(c => String(c[0]));
        expect(urls.some(u => u.includes('custom-docs.example.com'))).toBe(true);
    }, 10_000);
});

// ---------------------------------------------------------------------------
// Persona & response-structure prompt content (FEAT-FP-WEX-002)
// ---------------------------------------------------------------------------

describe('webExpertAgent — persona & response-structure prompt content', () => {
    /**
     * Helper: runs chat() and returns the SystemMessage content passed to the LLM.
     */
    async function captureSystemPrompt(): Promise<string> {
        const captured: BaseMessage[][] = [];
        const mockLLM = {
            invoke: vi.fn().mockImplementation((messages: BaseMessage[]) => {
                captured.push(messages);
                return Promise.resolve(new AIMessage('response'));
            }),
        } as unknown as BaseChatModel;

        const agent = createWebExpertAgent({ llm: mockLLM, _llmTimeoutMs: TEST_TIMEOUT_MS });

        for await (const chunk of agent.chat([], 'hello')) {
            if (chunk.done) {break;}
        }

        const systemMsg = captured[0][0];
        expect(systemMsg).toBeInstanceOf(SystemMessage);
        return systemMsg.content as string;
    }

    it('audience tiers section is present with expected keywords', async () => {
        const content = await captureSystemPrompt();

        expect(content).toContain('## Audience & Depth Tiers');
        expect(content).toContain('/eli5');
        expect(content).toContain('/deep');
        expect(content).toContain('Quick');
        expect(content).toContain('Default');
        expect(content).toContain('Deep');
    }, 5_000);

    it('response structure template contains 5-section layout in order', async () => {
        const content = await captureSystemPrompt();

        expect(content).toContain('**TL;DR:**');
        expect(content).toContain('**Key Takeaway:**');

        // Assert the canonical section names appear in the correct order
        const tldrIdx = content.indexOf('TL;DR');
        const answerIdx = content.indexOf('Answer');
        const exampleIdx = content.indexOf('Example');
        const specRefIdx = content.indexOf('Spec reference');

        expect(tldrIdx).toBeGreaterThan(-1);
        expect(answerIdx).toBeGreaterThan(tldrIdx);
        expect(exampleIdx).toBeGreaterThan(answerIdx);
        expect(specRefIdx).toBeGreaterThan(exampleIdx);
    }, 5_000);

    it('lead-with-TL;DR and match-depth behavioral rules are present', async () => {
        const content = await captureSystemPrompt();

        expect(content).toContain('Lead with the TL;DR');
        expect(content).toContain('Match depth to the cue');
    }, 5_000);
});

// ---------------------------------------------------------------------------
// Anti-hallucination & citation guardrails (FEAT-FP-WEX-003)
// ---------------------------------------------------------------------------

describe('webExpertAgent — anti-hallucination & citation guardrails', () => {
    /**
     * Runs chat() and returns the SystemMessage content passed to the LLM.
     * Reuses the same pattern as the persona block above.
     */
    async function captureSystemPrompt(): Promise<string> {
        const captured: BaseMessage[][] = [];
        const mockLLM = {
            invoke: vi.fn().mockImplementation((messages: BaseMessage[]) => {
                captured.push(messages);
                return Promise.resolve(new AIMessage('response'));
            }),
        } as unknown as BaseChatModel;

        const agent = createWebExpertAgent({ llm: mockLLM, _llmTimeoutMs: TEST_TIMEOUT_MS });

        for await (const chunk of agent.chat([], 'hello')) {
            if (chunk.done) {break;}
        }

        const systemMsg = captured[0][0];
        expect(systemMsg).toBeInstanceOf(SystemMessage);
        return systemMsg.content as string;
    }

    it('hardened Citation Rules section is present with mandatory format and forbidden behaviors', async () => {
        const content = await captureSystemPrompt();

        // Mandatory citation format patterns
        expect(content).toContain('Per RFC');
        expect(content).toContain('Unverified:');
        // Forbidden behaviors list
        expect(content).toContain('Inventing RFC numbers');
        expect(content).toContain('Inventing HTTP header names');
    }, 5_000);

    it('MUST-fetch ruleset is present with MUST, MAY, and MUST-NOT sections and trigger conditions', async () => {
        const content = await captureSystemPrompt();

        // Section headers
        expect(content).toContain('MUST fetch');
        expect(content).toContain('MAY fetch');
        expect(content).toContain('MUST NOT fetch');
        // At least three MUST-fetch trigger conditions
        expect(content).toContain('pastes a URL');
        expect(content).toContain('exact quote');
        expect(content).toContain('/rfc');
        expect(content).toContain('/trending');
    }, 5_000);

    it('Uncertainty & Version Honesty section is present with all three sanctioned phrasings', async () => {
        const content = await captureSystemPrompt();

        expect(content).toContain('## Uncertainty & Version Honesty');
        // Phrasing 1
        expect(content).toContain('Unverified:');
        expect(content).toContain('— consult');
        // Phrasing 2
        expect(content).toContain("The spec doesn't define this");
        // Phrasing 3
        expect(content).toContain('This was true as of');
    }, 5_000);

    it('Cite-or-disclaim and Honor-MUST-fetch-triggers behavioral rules are present', async () => {
        const content = await captureSystemPrompt();

        expect(content).toContain('Cite or disclaim');
        expect(content).toContain('Honor MUST-fetch triggers');
    }, 5_000);
});

// ---------------------------------------------------------------------------
// Command surface (FEAT-FP-WEX-004)
// ---------------------------------------------------------------------------

describe('webExpertAgent — command surface', () => {
    /**
     * Helper: runs chat() and returns:
     * - the messages array passed to the LLM invoke
     * - the fetch URLs hit during the run
     */
    async function runCommand(
        userMessage: string,
        references: Parameters<typeof createWebExpertAgent>[0]['references'] = [],
    ): Promise<{ llmMessages: BaseMessage[]; fetchedUrls: string[] }> {
        const captured: BaseMessage[][] = [];
        const mockLLM = {
            invoke: vi.fn().mockImplementation((messages: BaseMessage[]) => {
                captured.push(messages);
                return Promise.resolve(new AIMessage('response'));
            }),
        } as unknown as BaseChatModel;

        const agent = createWebExpertAgent({
            llm: mockLLM,
            references,
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        for await (const chunk of agent.chat([], userMessage)) {
            if (chunk.done) {break;}
        }

        const llmMessages = captured[0] ?? [];
        const fetchedUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
        return { llmMessages, fetchedUrls };
    }

    // Test 1 — Removed commands are treated as plain text (prefix not stripped)
    it('removed commands (/http, /ws, /network, /crypto) are treated as plain text', async () => {
        for (const prefix of ['/http ', '/ws ', '/network ', '/crypto ']) {
            vi.clearAllMocks();
            fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => mockFetchResponse(STUB_HTML));

            const msg = `${prefix}some question`;
            const { llmMessages } = await runCommand(msg);
            // The user message (last in the array, after the system message) should be unmodified
            const userMsg = llmMessages[llmMessages.length - 1];
            // Content may include appended context but must start with the original text
            expect(String(userMsg?.content ?? '')).toContain(prefix.trim());
        }
    }, 10_000);

    // Test 2 — /help injects the commands-list focus directive
    it('/help injects the commands-list directive as context', async () => {
        const captured: BaseMessage[][] = [];
        const mockLLM = {
            invoke: vi.fn().mockImplementation((messages: BaseMessage[]) => {
                captured.push(messages);
                return Promise.resolve(new AIMessage('response'));
            }),
        } as unknown as BaseChatModel;

        const agent = createWebExpertAgent({ llm: mockLLM, _llmTimeoutMs: TEST_TIMEOUT_MS });
        for await (const chunk of agent.chat([], '/help')) { if (chunk.done) {break;} }

        const systemMsg = captured[0][0];
        expect(systemMsg).toBeInstanceOf(SystemMessage);
        // The context is appended to the final user message
        const userContent = String(captured[0][captured[0].length - 1].content);
        expect(userContent).toContain('complete commands list');
        expect(userContent).toContain('GFM table');
    }, 5_000);

    // Test 3 — /eli5 and /deep inject depth-tier directives
    it('/eli5 injects Quick depth tier directive', async () => {
        const captured: BaseMessage[][] = [];
        const mockLLM = {
            invoke: vi.fn().mockImplementation((messages: BaseMessage[]) => {
                captured.push(messages);
                return Promise.resolve(new AIMessage('response'));
            }),
        } as unknown as BaseChatModel;

        const agent = createWebExpertAgent({ llm: mockLLM, _llmTimeoutMs: TEST_TIMEOUT_MS });
        for await (const chunk of agent.chat([], '/eli5 what is CORS')) { if (chunk.done) {break;} }

        const userContent = String(captured[0][captured[0].length - 1].content);
        expect(userContent).toContain('Quick depth tier');
    }, 5_000);

    it('/deep injects Deep depth tier directive', async () => {
        const captured: BaseMessage[][] = [];
        const mockLLM = {
            invoke: vi.fn().mockImplementation((messages: BaseMessage[]) => {
                captured.push(messages);
                return Promise.resolve(new AIMessage('response'));
            }),
        } as unknown as BaseChatModel;

        const agent = createWebExpertAgent({ llm: mockLLM, _llmTimeoutMs: TEST_TIMEOUT_MS });
        for await (const chunk of agent.chat([], '/deep TLS handshake')) { if (chunk.done) {break;} }

        const userContent = String(captured[0][captured[0].length - 1].content);
        expect(userContent).toContain('Deep depth tier');
    }, 5_000);

    // Test 4 — /rfc 9110 normalises message and triggers RFC fetch
    it('/rfc 9110 normalises the user message and fetches the RFC', async () => {
        const { llmMessages, fetchedUrls } = await runCommand('/rfc 9110');

        // The first message after the system prompt should be the normalised message
        const userContent = String(llmMessages[llmMessages.length - 1]?.content ?? '');
        expect(userContent).toContain('Explain RFC 9110');
        // fetchRfc builds https://www.rfc-editor.org/rfc/rfc9110.txt
        expect(fetchedUrls.some((u) => u.includes('rfc-editor.org/rfc/rfc9110'))).toBe(true);
    }, 10_000);

    // Test 5 — /status 429 normalises message and fetches RFC 9110
    it('/status 429 normalises the user message and fetches RFC 9110', async () => {
        const { llmMessages, fetchedUrls } = await runCommand('/status 429');

        const userContent = String(llmMessages[llmMessages.length - 1]?.content ?? '');
        expect(userContent).toContain('429');
        expect(userContent).toContain('RFC 9110');
        // retrieveNode fetches RFC 9110 for status lookups
        expect(fetchedUrls.some((u) => u.includes('rfc-editor.org/rfc/rfc9110'))).toBe(true);
    }, 10_000);

    // Test 6 — /header Cache-Control normalises message and runs targeted search
    it('/header Cache-Control normalises the user message and searches with http/web categories', async () => {
        const { llmMessages, fetchedUrls } = await runCommand('/header Cache-Control', [
            { id: 'mdn', name: 'MDN', url: 'https://developer.mozilla.org/', description: 'MDN', categories: ['http', 'web'], enabled: true },
        ]);

        const userContent = String(llmMessages[llmMessages.length - 1]?.content ?? '');
        expect(userContent).toContain('Cache-Control');
        expect(userContent).toContain('HTTP header');
        // A search was issued using the http/web categories — MDN is in that category set
        expect(fetchedUrls.some((u) => u.includes('developer.mozilla.org'))).toBe(true);
    }, 10_000);

    // Test 7 — /method PATCH normalises message with RFC 9110 §9.3 reference
    it('/method PATCH normalises the user message with RFC 9110 §9.3 context', async () => {
        const { llmMessages, fetchedUrls } = await runCommand('/method PATCH', [
            { id: 'rfc-editor', name: 'RFC Editor', url: 'https://www.rfc-editor.org/', description: 'RFC Editor', categories: ['http', 'standards'], enabled: true },
        ]);

        const userContent = String(llmMessages[llmMessages.length - 1]?.content ?? '');
        expect(userContent).toContain('PATCH');
        expect(userContent).toContain('RFC 9110');
        // A search was issued using the http/standards categories
        expect(fetchedUrls.some((u) => u.includes('rfc-editor.org'))).toBe(true);
    }, 10_000);

    // Test 8 — /trending fetches HN and includes result in context
    it('/trending calls fetchTrending and includes the result in the LLM context', async () => {
        const HN_STUB = `
            <html><body>
              <span class="titleline"><a href="https://example.com/1">Story One</a></span>
              <span class="titleline"><a href="https://example.com/2">Story Two</a></span>
            </body></html>`;

        fetchSpy.mockImplementation((url: RequestInfo) =>
            String(url).includes('ycombinator') ? mockFetchResponse(HN_STUB) : mockFetchResponse(STUB_HTML),
        );

        const { llmMessages, fetchedUrls } = await runCommand('/trending');

        // The normalised user message should mention Hacker News
        const userContent = String(llmMessages[llmMessages.length - 1]?.content ?? '');
        expect(userContent).toContain('Hacker News');

        // fetchTrending must have fetched the HN URL
        expect(fetchedUrls.some((u) => u.includes('ycombinator.com'))).toBe(true);

        // The HN content is appended to the final user message as context
        expect(userContent).toContain('Story One');
    }, 10_000);

    // Test 9 — Invalid argument syntax falls back to error-guidance focus
    it('/rfc xyz (invalid argument) injects syntax-error guidance', async () => {
        const captured: BaseMessage[][] = [];
        const mockLLM = {
            invoke: vi.fn().mockImplementation((messages: BaseMessage[]) => {
                captured.push(messages);
                return Promise.resolve(new AIMessage('response'));
            }),
        } as unknown as BaseChatModel;

        const agent = createWebExpertAgent({ llm: mockLLM, _llmTimeoutMs: TEST_TIMEOUT_MS });
        for await (const chunk of agent.chat([], '/rfc xyz')) { if (chunk.done) {break;} }

        const userContent = String(captured[0][captured[0].length - 1].content);
        expect(userContent).toContain('invalid argument');
        expect(userContent).toContain('/rfc');
    }, 5_000);

    it('/status xyz (invalid argument) injects syntax-error guidance', async () => {
        const captured: BaseMessage[][] = [];
        const mockLLM = {
            invoke: vi.fn().mockImplementation((messages: BaseMessage[]) => {
                captured.push(messages);
                return Promise.resolve(new AIMessage('response'));
            }),
        } as unknown as BaseChatModel;

        const agent = createWebExpertAgent({ llm: mockLLM, _llmTimeoutMs: TEST_TIMEOUT_MS });
        for await (const chunk of agent.chat([], '/status xyz')) { if (chunk.done) {break;} }

        const userContent = String(captured[0][captured[0].length - 1].content);
        expect(userContent).toContain('invalid argument');
        expect(userContent).toContain('/status');
    }, 5_000);

    // Test 10 — getModes() returns exactly ['web', 'auto']
    it('getModes() returns exactly [\'web\', \'auto\']', () => {
        const mockLLM = makeMockLLM(50);
        const agent = createWebExpertAgent({ llm: mockLLM, _llmTimeoutMs: TEST_TIMEOUT_MS });
        expect(agent.getModes()).toStrictEqual(['web', 'auto']);
    });

    // Updated commands table in prompt: removed commands must NOT appear, new ones must
    it('prompt commands table excludes removed commands and includes new ones', async () => {
        const captured: BaseMessage[][] = [];
        const mockLLM = {
            invoke: vi.fn().mockImplementation((messages: BaseMessage[]) => {
                captured.push(messages);
                return Promise.resolve(new AIMessage('response'));
            }),
        } as unknown as BaseChatModel;

        const agent = createWebExpertAgent({ llm: mockLLM, _llmTimeoutMs: TEST_TIMEOUT_MS });
        for await (const chunk of agent.chat([], 'hello')) { if (chunk.done) {break;} }

        const content = String(captured[0][0].content);

        // Removed commands must NOT be in the table
        expect(content).not.toMatch(/\| `\/http`/);
        expect(content).not.toMatch(/\| `\/ws`/);
        expect(content).not.toMatch(/\| `\/network`/);
        expect(content).not.toMatch(/\| `\/crypto`/);

        // New commands must be present
        expect(content).toContain('/status <code>');
        expect(content).toContain('/header <name>');
        expect(content).toContain('/method <verb>');
        expect(content).toContain('/eli5');
        expect(content).toContain('/deep');

        // Pre-existing commands must still be present
        expect(content).toContain('/help');
        expect(content).toContain('/rfc <number>');
        expect(content).toContain('/trending');
    }, 5_000);
});

// ---------------------------------------------------------------------------
// Smart retrieval detection (FEAT-FP-WEX-005)
// ---------------------------------------------------------------------------

describe('webExpertAgent — smart retrieval detection', () => {
    /**
     * Helper: runs chat() and returns:
     * - the final user message content passed to the LLM (includes appended context)
     * - all URLs hit by globalThis.fetch during the run
     */
    async function runChat(
        userMessage: string,
        references: Parameters<typeof createWebExpertAgent>[0]['references'] = [],
    ): Promise<{ userContent: string; fetchedUrls: string[] }> {
        const captured: BaseMessage[][] = [];
        const mockLLM = {
            invoke: vi.fn().mockImplementation((messages: BaseMessage[]) => {
                captured.push(messages);
                return Promise.resolve(new AIMessage('response'));
            }),
        } as unknown as BaseChatModel;

        const agent = createWebExpertAgent({
            llm: mockLLM,
            references,
            _llmTimeoutMs: TEST_TIMEOUT_MS,
        });

        for await (const chunk of agent.chat([], userMessage)) {
            if (chunk.done) {break;}
        }

        const llmMessages = captured[0] ?? [];
        const userContent = String(llmMessages[llmMessages.length - 1]?.content ?? '');
        const fetchedUrls = fetchSpy.mock.calls.map(c => String(c[0]));
        return { userContent, fetchedUrls };
    }

    // Test 1 — Expanded keywords: CSP triggers security + web categories
    it('CSP keyword triggers security and web categories (MDN-searchable)', async () => {
        const { fetchedUrls } = await runChat('how does CSP nonce-source work?', [
            { id: 'mdn', name: 'MDN', url: 'https://developer.mozilla.org/', description: 'MDN', categories: ['security', 'web'], enabled: true },
        ]);
        // webFetcher.search with security/web categories should reach MDN
        expect(fetchedUrls.some(u => u.includes('developer.mozilla.org'))).toBe(true);
    }, 10_000);

    // Test 2 — Status-code detection: 429 triggers RFC 9110 fetch
    it('status code 429 in prose triggers RFC 9110 fetch', async () => {
        const { userContent, fetchedUrls } = await runChat('why am I getting a 429 from this API?', []);
        expect(fetchedUrls.some(u => u.includes('rfc-editor.org/rfc/rfc9110'))).toBe(true);
        expect(userContent).toContain('Status code(s) referenced: 429');
        expect(userContent).toContain('RFC 9110 §15');
    }, 10_000);

    // Test 3 — Multiple status codes coalesce into one RFC 9110 fetch
    it('multiple status codes coalesce into a single RFC 9110 fetch', async () => {
        const { userContent, fetchedUrls } = await runChat('what is the difference between 401 and 403?', []);
        const rfc9110Fetches = fetchedUrls.filter(u => u.includes('rfc-editor.org/rfc/rfc9110'));
        expect(rfc9110Fetches.length).toBe(1);
        expect(userContent).toContain('401');
        expect(userContent).toContain('403');
        expect(userContent).toContain('Status code(s) referenced:');
    }, 10_000);

    // Test 4 — Status-code dedup with explicit RFC: only one fetch for RFC 9110
    it('status code 451 with explicit RFC 9110 mention fetches RFC 9110 only once', async () => {
        const { fetchedUrls } = await runChat('per RFC 9110, when do I see a 451?', []);
        const rfc9110Fetches = fetchedUrls.filter(u => u.includes('rfc-editor.org/rfc/rfc9110'));
        expect(rfc9110Fetches.length).toBe(1);
    }, 10_000);

    // Test 5 — Invalid status code excluded: port 8080 is not a known status code
    it('port number 8080 does not trigger status-code detection', async () => {
        const { userContent, fetchedUrls } = await runChat('port 8080 is failing', []);
        expect(userContent).not.toContain('Status code(s) referenced:');
        expect(fetchedUrls.filter(u => u.includes('rfc-editor.org/rfc/rfc9110')).length).toBe(0);
    }, 10_000);

    // Test 6 — Header detection: Strict-Transport-Security detected
    it('Strict-Transport-Security is detected and adds context', async () => {
        const { userContent, fetchedUrls } = await runChat('explain Strict-Transport-Security', [
            { id: 'mdn', name: 'MDN', url: 'https://developer.mozilla.org/', description: 'MDN', categories: ['http', 'web'], enabled: true },
        ]);
        expect(userContent).toContain('strict-transport-security');
        expect(userContent).toContain('HTTP header(s) referenced:');
        // Header detection augments categories with http/web — MDN should be reached
        expect(fetchedUrls.some(u => u.includes('developer.mozilla.org'))).toBe(true);
    }, 10_000);

    // Test 7 — Header detection is case-insensitive
    it('cache-control (lowercase) is detected as a known HTTP header', async () => {
        const { userContent } = await runChat('what does cache-control: no-store do?', []);
        expect(userContent).toContain('cache-control');
        expect(userContent).toContain('HTTP header(s) referenced:');
    }, 10_000);

    // Test 8 — URL detection allowlisted: MDN URL is fetched
    it('MDN URL in query is fetched when MDN is an allowlisted reference', async () => {
        const mdnUrl = 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control';
        const { fetchedUrls } = await runChat(`explain ${mdnUrl}`, [
            { id: 'mdn', name: 'MDN', url: 'https://developer.mozilla.org/', description: 'MDN', categories: ['http', 'web'], enabled: true },
        ]);
        expect(fetchedUrls.some(u => u.includes('developer.mozilla.org'))).toBe(true);
    }, 10_000);

    // Test 9 — URL detection non-allowlisted: no fetch, policy message in context
    it('non-allowlisted URL is not fetched and policy message is added to context', async () => {
        const externalUrl = 'https://random-blog.example.com/post';
        const { userContent, fetchedUrls } = await runChat(`explain ${externalUrl}`, []);
        // The external URL must NOT have been fetched
        expect(fetchedUrls.some(u => u.includes('random-blog.example.com'))).toBe(false);
        // The policy message must appear in the context passed to the LLM
        expect(userContent).toContain('not auto-fetched per allowlist policy');
    }, 10_000);

    // Test 10 — Detection caps: at most 3 RFC fetches and 2 URL fetches
    it('RFC fetch cap: at most 3 RFCs fetched when query mentions 4+ RFCs', async () => {
        // Four distinct RFC mentions
        const { fetchedUrls } = await runChat(
            'compare RFC 7540, RFC 9110, RFC 9113, and RFC 6455 for websocket',
            [],
        );
        const rfcFetches = fetchedUrls.filter(u => u.includes('rfc-editor.org/rfc/rfc'));
        // Cap is 3; status-code detection might add RFC 9110 too, but deduplicated
        expect(rfcFetches.length).toBeLessThanOrEqual(3);
    }, 15_000);

    it('URL fetch cap: at most 2 user-provided URLs fetched per message', async () => {
        const mdnBase = 'https://developer.mozilla.org/';
        // Four URLs from an allowlisted origin — only 2 should be fetched via URL detection
        const query = [
            `${mdnBase}a`,
            `${mdnBase}b`,
            `${mdnBase}c`,
            `${mdnBase}d`,
        ].join(' ');

        const beforeFetch = fetchSpy.mock.calls.length;

        await runChat(query, [
            { id: 'mdn', name: 'MDN', url: mdnBase, description: 'MDN', categories: ['web'], enabled: true },
        ]);

        const afterFetch = fetchSpy.mock.calls.length;
        const mdnFetches = fetchSpy.mock.calls
            .slice(beforeFetch)
            .map(c => String(c[0]))
            .filter(u => u.startsWith(mdnBase));

        // detectUrls caps at 2; plus possibly 1 from webFetcher.search (MDN search URL)
        // The key assertion: at most 2 of the exact user-provided paths were fetched
        const userUrlFetches = mdnFetches.filter(u =>
            u === `${mdnBase}a` || u === `${mdnBase}b` || u === `${mdnBase}c` || u === `${mdnBase}d`,
        );
        expect(userUrlFetches.length).toBeLessThanOrEqual(2);
        expect(afterFetch).toBeGreaterThan(beforeFetch); // At least some fetching occurred
    }, 15_000);

    // Test 11 — Source dedup: RFC 9110 URL appears only once even when mentioned both ways
    it('RFC 9110 URL deduplicated when both explicit RFC and URL detection would fetch it', async () => {
        // The query explicitly names RFC 9110 AND pastes the RFC Editor URL.
        // RFC detection fetches rfc9110.txt; URL detection routes through fetchRfc (same .txt URL).
        // The webFetcher cache ensures global.fetch is only called once for rfc9110.txt.
        const { fetchedUrls } = await runChat(
            'compare RFC 9110 to https://www.rfc-editor.org/rfc/rfc9110',
            [],
        );
        const rfc9110Fetches = fetchedUrls.filter(u => u.includes('rfc9110'));
        expect(rfc9110Fetches.length).toBe(1);
    }, 10_000);
});
