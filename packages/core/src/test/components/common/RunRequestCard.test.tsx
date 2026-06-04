/**
 * Unit tests for RunRequestCard — tab auto-switching and state reset behavior.
 *
 * Tested scenarios:
 *  1. Error tab is auto-selected when data.error is present.
 *  2. Tab resets from 'Error' to 'Response Headers' when error clears (re-run fix).
 *  3. Non-Error tab selected by user is preserved when error clears.
 *  4. "An unknown error occurred" is NOT shown after error clears.
 *  5. Error tab shows the actual error message when an error is present.
 *  6. Card starts collapsed; expand/collapse toggle works.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RunRequestCard, { RunRequestData } from '../../../components/common/RunRequestCard';
import type { AnyCollectionRequest } from '../../../types/collection';

// ── Helpers ──────────────────────────────────────────────────────────────────

const baseRequest: AnyCollectionRequest = {
    method: 'GET',
    url: 'https://example.com/api',
    header: [],
} as unknown as AnyCollectionRequest;

function makeData(overrides: Partial<RunRequestData> = {}): RunRequestData {
    return {
        id: 'req-1',
        name: 'My Request',
        method: 'GET',
        url: 'https://example.com/api',
        request: baseRequest,
        folderPath: [],
        runStatus: 'success',
        validationStatus: 'idle',
        ...overrides,
    };
}

function expandCard(container: HTMLElement) {
    // Click the card header (first clickable row) to expand it
    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RunRequestCard — tab auto-switching', () => {
    it('starts with Response Headers tab active when no error', () => {
        const { container } = render(<RunRequestCard data={makeData()} showSelection={false} />);
        expandCard(container);

        expect(screen.getByRole('button', { name: 'Response Headers' })).toHaveClass('border-b-2');
    });

    it('auto-switches to Error tab when data.error is set', () => {
        const { container } = render(
            <RunRequestCard
                data={makeData({ error: 'Connection refused', runStatus: 'failed' })}
                showSelection={false}
            />
        );
        expandCard(container);

        const errorTabBtn = screen.getByRole('button', { name: 'Error' });
        expect(errorTabBtn).toHaveClass('border-b-2');
        expect(screen.getByText('Connection refused')).toBeInTheDocument();
    });

    it('resets from Error tab to Response Headers when error clears on re-run', () => {
        const { container, rerender } = render(
            <RunRequestCard
                data={makeData({ error: 'Timeout', runStatus: 'failed' })}
                showSelection={false}
            />
        );
        expandCard(container);

        // Confirm Error tab is active
        expect(screen.getByRole('button', { name: 'Error' })).toHaveClass('border-b-2');

        // Simulate re-run: error clears, new result with no error
        rerender(
            <RunRequestCard
                data={makeData({ runStatus: 'success', responseStatus: 200 })}
                showSelection={false}
            />
        );

        // Error tab button should be gone (no error → tabs don't include 'Error')
        expect(screen.queryByRole('button', { name: 'Error' })).not.toBeInTheDocument();
        // Response Headers tab should be active
        expect(screen.getByRole('button', { name: 'Response Headers' })).toHaveClass('border-b-2');
    });

    it('does NOT show "An unknown error occurred" after error clears', () => {
        const { container, rerender } = render(
            <RunRequestCard
                data={makeData({ error: 'Network error', runStatus: 'failed' })}
                showSelection={false}
            />
        );
        expandCard(container);

        // Sanity check: error message is shown during the failed run
        expect(screen.getByText('Network error')).toBeInTheDocument();

        // Re-run completes successfully
        rerender(
            <RunRequestCard
                data={makeData({ runStatus: 'success', responseStatus: 200 })}
                showSelection={false}
            />
        );

        expect(screen.queryByText('An unknown error occurred')).not.toBeInTheDocument();
        expect(screen.queryByText('Network error')).not.toBeInTheDocument();
    });

    it('preserves a user-selected non-Error tab when error clears', () => {
        const { container, rerender } = render(
            <RunRequestCard
                data={makeData({ error: 'Bad request', runStatus: 'failed' })}
                showSelection={false}
            />
        );
        expandCard(container);

        // User manually switches to Request Body tab
        fireEvent.click(screen.getByRole('button', { name: 'Request Body' }));
        expect(screen.getByRole('button', { name: 'Request Body' })).toHaveClass('border-b-2');

        // Error clears (re-run with success, still expanded)
        rerender(
            <RunRequestCard
                data={makeData({ runStatus: 'success', responseStatus: 200 })}
                showSelection={false}
            />
        );

        // Request Body tab should still be active — user's selection is preserved
        expect(screen.getByRole('button', { name: 'Request Body' })).toHaveClass('border-b-2');
    });

    it('card starts collapsed and expands on click', () => {
        const { container } = render(<RunRequestCard data={makeData()} showSelection={false} />);

        // No tab buttons visible before expanding
        expect(screen.queryByRole('button', { name: 'Response Headers' })).not.toBeInTheDocument();

        expandCard(container);

        expect(screen.getByRole('button', { name: 'Response Headers' })).toBeInTheDocument();
    });
});
