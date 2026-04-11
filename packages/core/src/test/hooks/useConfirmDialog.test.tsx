/**
 * Unit tests for the useConfirmDialog hook.
 *
 * Tested:
 *  1. Hook returns `openConfirmDialog` and `ConfirmDialogComponent` on mount.
 *  2. Dialog is closed on initial render.
 *  3. `openConfirmDialog` opens the dialog with correct title / message.
 *  4. Clicking cancel closes the dialog without calling `onConfirm`.
 *  5. Clicking confirm with a sync callback fires the callback and closes.
 *  6. Clicking confirm with an async callback shows `isConfirming` while
 *     awaiting the promise, then closes on resolution.
 *  7. When the async `onConfirm` rejects, the dialog stays open (so callers
 *     can surface an error notification themselves).
 *
 * Strategy:
 *  - A `TestBed` wrapper component renders the hook and exposes a button that
 *    calls `openConfirmDialog`, so we can drive the hook through real UI events.
 *  - Dialog primitives, PrimaryButton, and SecondaryButton are mocked with
 *    plain HTML equivalents so JSDOM handles interactions reliably.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useConfirmDialog, type ConfirmDialogOptions } from '../../hooks/useConfirmDialog';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../components/ui/dialog', () => ({
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
        open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode; className?: string }) => (
        <h2 data-testid="dialog-title">{children}</h2>
    ),
    DialogDescription: ({ children }: { children: React.ReactNode }) => (
        <p data-testid="dialog-description">{children}</p>
    ),
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/ui/PrimaryButton', () => ({
    PrimaryButton: ({
        onClick,
        text,
        disabled,
    }: {
        onClick: () => void;
        text?: string;
        disabled?: boolean;
    }) => (
        <button onClick={onClick} disabled={disabled} data-testid="confirm-button">
            {text ?? 'Confirm'}
        </button>
    ),
}));

vi.mock('../../components/ui/SecondaryButton', () => ({
    SecondaryButton: ({
        onClick,
        text,
        disabled,
    }: {
        onClick: () => void;
        text?: string;
        disabled?: boolean;
    }) => (
        <button onClick={onClick} disabled={disabled} data-testid="cancel-button">
            {text ?? 'Cancel'}
        </button>
    ),
}));

// ── Test Helpers ──────────────────────────────────────────────────────────────

interface TestBedProps {
    /** Called with the `openConfirmDialog` function once on mount. */
    onMount: (open: (opts: ConfirmDialogOptions) => void) => void;
}

/**
 * Wrapper component that renders the hook under test and exposes the
 * `openConfirmDialog` function via a callback so tests can call it directly.
 */
function TestBed({ onMount }: TestBedProps) {
    const { openConfirmDialog, ConfirmDialogComponent } = useConfirmDialog();

    React.useEffect(() => {
        onMount(openConfirmDialog);
    }, [onMount, openConfirmDialog]);

    return <ConfirmDialogComponent />;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useConfirmDialog', () => {
    let openFn: (opts: ConfirmDialogOptions) => void;

    beforeEach(() => {
        vi.clearAllMocks();
        openFn = () => { /* set by onMount */ };
    });

    function renderTestBed() {
        render(
            <TestBed
                onMount={(fn) => {
                    openFn = fn;
                }}
            />,
        );
    }

    it('returns openConfirmDialog and ConfirmDialogComponent', () => {
        const hookValues: ReturnType<typeof useConfirmDialog>[] = [];
        function Inspector() {
            const hook = useConfirmDialog();
            hookValues.push(hook);
            return null;
        }
        render(<Inspector />);
        expect(hookValues[0].openConfirmDialog).toBeTypeOf('function');
        expect(hookValues[0].ConfirmDialogComponent).toBeTypeOf('function');
    });

    it('dialog is closed on initial render', () => {
        renderTestBed();
        expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('openConfirmDialog opens the dialog with the provided title and message', () => {
        renderTestBed();

        act(() => {
            openFn({
                title: 'Delete Rule',
                message: 'This cannot be undone.',
                onConfirm: vi.fn(),
            });
        });

        expect(screen.getByTestId('dialog')).toBeInTheDocument();
        expect(screen.getByTestId('dialog-title')).toHaveTextContent('Delete Rule');
        expect(screen.getByTestId('dialog-description')).toHaveTextContent(
            'This cannot be undone.',
        );
    });

    it('clicking cancel closes the dialog without calling onConfirm', () => {
        const onConfirm = vi.fn();
        renderTestBed();

        act(() => {
            openFn({ title: 'Test', message: 'Confirm?', onConfirm });
        });

        fireEvent.click(screen.getByTestId('cancel-button'));

        expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('clicking confirm with a sync callback fires the callback and closes the dialog', () => {
        const onConfirm = vi.fn();
        renderTestBed();

        act(() => {
            openFn({ title: 'Test', message: 'Confirm?', onConfirm });
        });

        fireEvent.click(screen.getByTestId('confirm-button'));

        expect(onConfirm).toHaveBeenCalledOnce();
        expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('async confirm shows isConfirming then closes on resolution', async () => {
        let resolve!: () => void;
        const asyncConfirm = vi.fn(
            () =>
                new Promise<void>((res) => {
                    resolve = res;
                }),
        );

        renderTestBed();

        act(() => {
            openFn({ title: 'Test', message: 'Confirm?', onConfirm: asyncConfirm });
        });

        fireEvent.click(screen.getByTestId('confirm-button'));

        // While promise is pending, buttons should be disabled (isConfirming=true)
        await waitFor(() => {
            expect(screen.getByTestId('confirm-button')).toBeDisabled();
            expect(screen.getByTestId('cancel-button')).toBeDisabled();
        });

        // Resolve the promise
        await act(async () => {
            resolve();
        });

        // Dialog should now be closed
        expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
        expect(asyncConfirm).toHaveBeenCalledOnce();
    });

    it('async confirm rejection leaves dialog open and clears isConfirming', async () => {
        let reject!: (err: Error) => void;
        const asyncConfirm = vi.fn(
            () =>
                new Promise<void>((_, rej) => {
                    reject = rej;
                }),
        );

        renderTestBed();

        act(() => {
            openFn({ title: 'Test', message: 'Confirm?', onConfirm: asyncConfirm });
        });

        fireEvent.click(screen.getByTestId('confirm-button'));

        // While pending, buttons are disabled
        await waitFor(() => {
            expect(screen.getByTestId('confirm-button')).toBeDisabled();
        });

        // Reject the promise
        await act(async () => {
            reject(new Error('delete failed'));
        });

        // Dialog should remain open so the caller can show an error
        expect(screen.getByTestId('dialog')).toBeInTheDocument();
        // Buttons should be re-enabled (isConfirming cleared)
        expect(screen.getByTestId('confirm-button')).not.toBeDisabled();
        expect(screen.getByTestId('cancel-button')).not.toBeDisabled();
    });
});
