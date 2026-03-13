/**
 * Unit tests for ArenaPane — streaming chunk handling (TASK-007)
 *
 * Verifies the heartbeat fast-path and streaming cleanup guarantees added by
 * FEAT-006.  Each test:
 *   1. Initialises the Zustand store with an active session so
 *      `handleSendMessage` can run.
 *   2. Replaces `adapter.arena.streamMessage` with a controllable StreamHandle
 *      so individual chunks/events can be injected synchronously.
 *   3. Types a message and submits via the UI to trigger the real code path
 *      inside `handleSendMessage`.
 *   4. Injects a chunk/event and asserts on the observable store state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter } from '../../mocks/mockAdapter';
import { ArenaPane } from '../../../components/arena/ArenaPane';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import type {
    ArenaChatStreamChunk,
    ArenaChatResponse,
    StreamHandle,
} from '../../../types/arena';
import { ARENA_AGENT_IDS } from '../../../config/arenaConfig';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Creates a StreamHandle whose callbacks can be invoked from the test.
 * subscribe to onChunk/onDone/onError in any order before pushing events.
 */
function createControllableHandle() {
    const chunkCbs = new Set<(chunk: ArenaChatStreamChunk) => void>();
    const doneCbs = new Set<(response: ArenaChatResponse) => void>();
    const errorCbs = new Set<(error: string) => void>();

    const handle: StreamHandle = {
        onChunk(cb) {
            chunkCbs.add(cb);
            return () => { chunkCbs.delete(cb); };
        },
        onDone(cb) {
            doneCbs.add(cb);
            return () => { doneCbs.delete(cb); };
        },
        onError(cb) {
            errorCbs.add(cb);
            return () => { errorCbs.delete(cb); };
        },
        cancel() {
            errorCbs.forEach((cb) => {
                try { cb('Cancelled'); } catch { /* noop */ }
            });
        },
    };

    return {
        handle,
        pushChunk: (chunk: ArenaChatStreamChunk) =>
            chunkCbs.forEach((cb) => { try { cb(chunk); } catch { /* noop */ } }),
        pushDone: (response: ArenaChatResponse) =>
            doneCbs.forEach((cb) => { try { cb(response); } catch { /* noop */ } }),
        pushError: (error: string) =>
            errorCbs.forEach((cb) => { try { cb(error); } catch { /* noop */ } }),
    };
}

/**
 * Renders ArenaPane with the given adapter and returns userEvent helpers.
 */
function renderArenaPane(adapter: ReturnType<typeof createMockAdapter>['adapter']) {
    return render(
        <AdapterProvider adapter={adapter}>
            <ArenaPane />
        </AdapterProvider>,
    );
}

/**
 * Types a message in the textarea and submits (Enter key).
 */
async function sendMessage(user: ReturnType<typeof userEvent.setup>, message = 'Hello') {
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, message);
    await user.keyboard('{Enter}');
}

// jsdom does not implement scrollIntoView; stub it so React's auto-scroll
// effect in ArenaChatView does not throw.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// ============================================================================
// Test suite
// ============================================================================

describe('ArenaPane — streaming chunk handling (TASK-007)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        // Reset Zustand arena state between tests so they don't bleed into each
        // other (sessions accumulate otherwise since the store is a singleton).
        act(() => {
            useAppStateStore.setState({
                arenaSessions: [],
                arenaActiveSessionId: null,
                arenaMessages: [],
            });
        });
    });

    /**
     * Creates the adapter with the session pre-loaded in the mock store, sets
     * up the spy, renders the component, and waits for the initial data-load
     * effect to finish before returning controls.
     *
     * Key invariant: `store.arenaSessions` must already contain the session
     * when `loadSessions()` is called on mount — otherwise the mount effect
     * calls `setArenaSessions([])`, which empties the sessions array and
     * causes `handleSendMessage` to bail (activeSession not found).
     */
    async function setup() {
        // 1. Create the mock adapter
        const { adapter, store } = createMockAdapter();
        const { handle, pushChunk, pushDone, pushError } = createControllableHandle();
        vi.spyOn(adapter.arena, 'streamMessage').mockReturnValue(handle);

        // 2. Create the session in the Zustand store AND in the mock store so
        //    loadSessions() returns it when the mount effect fires.
        const session = useAppStateStore.getState().startNewArenaSession(ARENA_AGENT_IDS.WAVE_CLIENT);
        store.arenaSessions.push(session);

        // 3. Render
        const user = userEvent.setup();
        renderArenaPane(adapter);

        // 4. Wait for the mount effect (loadSessions / loadSettings) to finish.
        //    Once arenaIsLoading transitions back to false the chat input is
        //    interactive and sessions are properly reflected in the store.
        await waitFor(() => {
            expect(useAppStateStore.getState().arenaIsLoading).toBe(false);
        });

        return { adapter, user, pushChunk, pushDone, pushError };
    }

    // ------------------------------------------------------------------

    it('heartbeat chunk does not append content to streaming message', async () => {
        const { adapter, user, pushChunk } = await setup();

        await sendMessage(user);

        await waitFor(() => {
            expect(adapter.arena.streamMessage).toHaveBeenCalledOnce();
        });

        // Identify the streaming assistant message
        const assistantMsg = useAppStateStore.getState().arenaMessages.find(
            (m) => m.role === 'assistant',
        );
        expect(assistantMsg).toBeDefined();

        // Push a heartbeat chunk — no content should be appended to the message
        act(() => {
            pushChunk({ messageId: assistantMsg!.id, content: '', done: false, heartbeat: true });
        });

        // The message content must remain empty — heartbeat carries no text
        const msg = useAppStateStore.getState().arenaMessages.find((m) => m.id === assistantMsg!.id);
        expect(msg?.content).toBe('');
    });

    // ------------------------------------------------------------------

    it('error chunk sets message status to error', async () => {
        const { adapter, user, pushChunk } = await setup();

        await sendMessage(user);

        await waitFor(() => {
            expect(adapter.arena.streamMessage).toHaveBeenCalledOnce();
        });

        // Capture the assistant message id before the error chunk
        const stateBeforeError = useAppStateStore.getState();
        const assistantMsg = stateBeforeError.arenaMessages.find(
            (m) => m.role === 'assistant',
        );
        expect(assistantMsg).toBeDefined();

        act(() => {
            pushChunk({
                messageId: assistantMsg!.id,
                content: '',
                done: true,
                error: 'Test error',
            });
        });

        // Message should be updated to error status
        const state = useAppStateStore.getState();
        const updatedMsg = state.arenaMessages.find((m) => m.id === assistantMsg!.id);
        expect(updatedMsg?.status).toBe('error');
        expect(updatedMsg?.error).toBe('Test error');
    });

    // ------------------------------------------------------------------

    it('streaming state is cleaned up on onError', async () => {
        const { adapter, user, pushError } = await setup();

        await sendMessage(user);

        await waitFor(() => {
            expect(adapter.arena.streamMessage).toHaveBeenCalledOnce();
        });

        // Capture the assistant message id before the error
        const assistantMsg = useAppStateStore.getState().arenaMessages.find(
            (m) => m.role === 'assistant',
        );
        expect(assistantMsg).toBeDefined();

        act(() => {
            pushError('Connection dropped');
        });

        // The assistant message should be marked as error (stream manager called updateArenaMessage)
        await waitFor(() => {
            const msg = useAppStateStore.getState().arenaMessages.find((m) => m.id === assistantMsg!.id);
            expect(msg?.status).toBe('error');
        });
    });

    // ------------------------------------------------------------------

    it('streaming state is cleaned up on onDone', async () => {
        const { adapter, user, pushDone } = await setup();

        await sendMessage(user);

        await waitFor(() => {
            expect(adapter.arena.streamMessage).toHaveBeenCalledOnce();
        });

        // Capture the streaming assistant message
        const assistantMsg = useAppStateStore.getState().arenaMessages.find(
            (m) => m.role === 'assistant',
        );
        expect(assistantMsg).toBeDefined();

        const response: ArenaChatResponse = {
            messageId: assistantMsg!.id,
            content: 'Done!',
            tokenCount: 10,
        };

        await act(async () => {
            pushDone(response);
            // Allow async operations inside onComplete (e.g. saveMessage) to settle
            await Promise.resolve();
        });

        // The assistant message should be marked as complete
        await waitFor(() => {
            const msg = useAppStateStore.getState().arenaMessages.find((m) => m.id === assistantMsg!.id);
            expect(msg?.status).toBe('complete');
        });
    });
});

