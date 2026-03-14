/**
 * Unit tests for ArenaChatView — FEAT-014 lifecycle indicators (TASK-002 / TASK-003)
 *
 * Verifies:
 *  - ArenaMessageBubble renders the correct phase indicator based on streamState:
 *      connecting  → pulsing ring + "Connecting…" label
 *      streaming   → bouncing dots (no content) or inline cursor (with content)
 *      complete    → no indicator
 *      undefined   → no indicator (static message)
 *  - ArenaChatView passes streamState only to the actively streaming message;
 *    all other messages receive undefined and render statically.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ArenaChatView } from '../../../components/arena/ArenaChatView';
import type { ArenaSession, ArenaMessage } from '../../../types/arena';
import type { ArenaStreamState } from '../../../types/arenaStreaming';
import { ARENA_AGENT_IDS } from '../../../config/arenaConfig';

// ============================================================================
// jsdom stub — ArenaChatView uses scrollIntoView on mount
// ============================================================================

window.HTMLElement.prototype.scrollIntoView = vi.fn();

// ============================================================================
// Fixtures
// ============================================================================

const mockSession: ArenaSession = {
    id: 'session-1',
    title: 'Test Session',
    agent: ARENA_AGENT_IDS.WAVE_CLIENT,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageCount: 0,
};

function makeMessage(overrides: Partial<ArenaMessage> = {}): ArenaMessage {
    return {
        id: 'msg-1',
        sessionId: 'session-1',
        role: 'assistant',
        content: '',
        status: 'streaming',
        timestamp: Date.now(),
        ...overrides,
    };
}

const defaultProps = {
    session: mockSession,
    messages: [] as ArenaMessage[],
    streamingContent: '',
    streamState: 'idle' as ArenaStreamState,
    onSendMessage: vi.fn(),
    onCancelMessage: vi.fn(),
};

beforeEach(() => {
    vi.clearAllMocks();
});

// ============================================================================
// TASK-002: ArenaMessageBubble lifecycle indicators
// ============================================================================

describe('ArenaMessageBubble — lifecycle indicators (TASK-002)', () => {
    // ──────────────────────────────────────────────────────────────────
    // connecting state → pulsing ring + "Connecting…" label
    // ──────────────────────────────────────────────────────────────────

    it('streamState=connecting renders "Connecting…" label', () => {
        const streamingMsg = makeMessage({ status: 'streaming' });

        render(
            <ArenaChatView
                {...defaultProps}
                messages={[streamingMsg]}
                streamState="connecting"
                streamingContent=""
            />,
        );

        expect(screen.getByText('Connecting\u2026')).toBeInTheDocument();
    });

    it('streamState=connecting does not show bouncing dots', () => {
        const streamingMsg = makeMessage({ status: 'streaming' });

        const { container } = render(
            <ArenaChatView
                {...defaultProps}
                messages={[streamingMsg]}
                streamState="connecting"
                streamingContent=""
            />,
        );

        // Bouncing dots use animate-bounce class; connecting should not render any
        const bouncingDots = container.querySelectorAll('.animate-bounce');
        expect(bouncingDots).toHaveLength(0);
    });

    // ──────────────────────────────────────────────────────────────────
    // streaming state, no content → bouncing dots
    // ──────────────────────────────────────────────────────────────────

    it('streamState=streaming with empty content renders bouncing dots', () => {
        const streamingMsg = makeMessage({ status: 'streaming' });

        const { container } = render(
            <ArenaChatView
                {...defaultProps}
                messages={[streamingMsg]}
                streamState="streaming"
                streamingContent=""
            />,
        );

        const bouncingDots = container.querySelectorAll('.animate-bounce');
        expect(bouncingDots.length).toBeGreaterThanOrEqual(3);
    });

    it('streamState=streaming with empty content does not show "Connecting…"', () => {
        const streamingMsg = makeMessage({ status: 'streaming' });

        render(
            <ArenaChatView
                {...defaultProps}
                messages={[streamingMsg]}
                streamState="streaming"
                streamingContent=""
            />,
        );

        expect(screen.queryByText('Connecting\u2026')).not.toBeInTheDocument();
    });

    // ──────────────────────────────────────────────────────────────────
    // streaming state, content present → inline cursor (no bouncing dots)
    // ──────────────────────────────────────────────────────────────────

    it('streamState=streaming with content renders inline cursor, not dots', () => {
        const streamingMsg = makeMessage({ status: 'streaming' });

        const { container } = render(
            <ArenaChatView
                {...defaultProps}
                messages={[streamingMsg]}
                streamState="streaming"
                streamingContent="Hello world"
            />,
        );

        // No bouncing dots when content is present
        const bouncingDots = container.querySelectorAll('.animate-bounce');
        expect(bouncingDots).toHaveLength(0);

        // Inline cursor: animate-pulse span
        const pulseDots = container.querySelectorAll('span.animate-pulse');
        expect(pulseDots.length).toBeGreaterThanOrEqual(1);
    });

    it('streamState=streaming with content renders the streamed text', () => {
        const streamingMsg = makeMessage({ status: 'streaming' });

        render(
            <ArenaChatView
                {...defaultProps}
                messages={[streamingMsg]}
                streamState="streaming"
                streamingContent="Hello world"
            />,
        );

        expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    // ──────────────────────────────────────────────────────────────────
    // complete state → no indicator
    // ──────────────────────────────────────────────────────────────────

    it('streamState=complete renders no indicator', () => {
        const completeMsg = makeMessage({ status: 'complete', content: 'Done!' });

        const { container } = render(
            <ArenaChatView
                {...defaultProps}
                messages={[completeMsg]}
                streamState="complete"
                streamingContent=""
            />,
        );

        expect(screen.queryByText('Connecting\u2026')).not.toBeInTheDocument();
        expect(container.querySelectorAll('.animate-bounce')).toHaveLength(0);
    });

    // ──────────────────────────────────────────────────────────────────
    // undefined streamState (static message) → no indicator
    // ──────────────────────────────────────────────────────────────────

    it('static message with idle streamState renders no streaming indicators', () => {
        const staticMsg = makeMessage({ status: 'complete', content: 'A regular message.' });

        const { container } = render(
            <ArenaChatView
                {...defaultProps}
                messages={[staticMsg]}
                streamState="idle"
                streamingContent=""
            />,
        );

        expect(screen.queryByText('Connecting\u2026')).not.toBeInTheDocument();
        expect(container.querySelectorAll('.animate-bounce')).toHaveLength(0);
    });
});

// ============================================================================
// TASK-003: streamState wired only to the actively streaming message
// ============================================================================

describe('ArenaChatView — streamState wiring (TASK-003)', () => {
    // ──────────────────────────────────────────────────────────────────
    // One streaming message → receives connecting indicator
    // ──────────────────────────────────────────────────────────────────

    it('streaming message receives connecting indicator when streamState=connecting', () => {
        const streamingMsg = makeMessage({ id: 'msg-streaming', status: 'streaming' });

        render(
            <ArenaChatView
                {...defaultProps}
                messages={[streamingMsg]}
                streamState="connecting"
                streamingContent=""
            />,
        );

        expect(screen.getByText('Connecting\u2026')).toBeInTheDocument();
    });

    // ──────────────────────────────────────────────────────────────────
    // Non-streaming messages do not receive the indicator
    // ──────────────────────────────────────────────────────────────────

    it('non-streaming messages do not receive streaming indicators', () => {
        const completedMsg = makeMessage({
            id: 'msg-done',
            status: 'complete',
            content: 'Already done.',
        });
        const streamingMsg = makeMessage({
            id: 'msg-active',
            status: 'streaming',
            content: '',
        });

        const { getAllByText } = render(
            <ArenaChatView
                {...defaultProps}
                messages={[completedMsg, streamingMsg]}
                streamState="connecting"
                streamingContent=""
            />,
        );

        // "Connecting…" should appear exactly once (only for the streaming message)
        const labels = getAllByText('Connecting\u2026');
        expect(labels).toHaveLength(1);
    });

    // ──────────────────────────────────────────────────────────────────
    // Multiple messages — only the streaming one gets the active indicator
    // ──────────────────────────────────────────────────────────────────

    it('only the streaming message shows bouncing dots; completed messages show content', () => {
        const completedMsg = makeMessage({
            id: 'msg-1',
            status: 'complete',
            content: 'Static content',
        });
        const streamingMsg = makeMessage({
            id: 'msg-2',
            status: 'streaming',
            content: '',
        });

        const { container } = render(
            <ArenaChatView
                {...defaultProps}
                messages={[completedMsg, streamingMsg]}
                streamState="streaming"
                streamingContent=""
            />,
        );

        // Static content visible (belongs to the completed message)
        expect(screen.getByText('Static content')).toBeInTheDocument();

        // Bouncing dots present (belongs to the streaming message)
        const bouncingDots = container.querySelectorAll('.animate-bounce');
        expect(bouncingDots.length).toBeGreaterThanOrEqual(3);
    });
});
