/**
 * Unit tests for the ConfirmDialog presentational component.
 *
 * Tested:
 *  1. Hidden when `isOpen` is false.
 *  2. Renders title and message when open.
 *  3. Default button labels ("Cancel" / "Confirm").
 *  4. Custom button labels via `confirmText` / `cancelText` props.
 *  5. `onCancel` is called when the cancel button is clicked.
 *  6. `onConfirm` is called when the confirm button is clicked.
 *  7. Both buttons are disabled when `isConfirming` is true.
 *
 * Radix Dialog, PrimaryButton, and SecondaryButton are replaced with simple
 * native HTML stubs so JSDOM can handle interactions reliably.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../components/ui/dialog', () => ({
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
        open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="dialog-content">{children}</div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="dialog-header">{children}</div>
    ),
    DialogTitle: ({ children }: { children: React.ReactNode; className?: string }) => (
        <h2 data-testid="dialog-title">{children}</h2>
    ),
    DialogDescription: ({ children }: { children: React.ReactNode }) => (
        <p data-testid="dialog-description">{children}</p>
    ),
    DialogFooter: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="dialog-footer">{children}</div>
    ),
}));

vi.mock('../../../components/ui/PrimaryButton', () => ({
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
            {text}
        </button>
    ),
}));

vi.mock('../../../components/ui/SecondaryButton', () => ({
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
            {text}
        </button>
    ),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

const baseProps = {
    isOpen: true,
    title: 'Delete Item',
    message: 'Are you sure you want to delete this item?',
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
};

describe('ConfirmDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not render when isOpen is false', () => {
        render(<ConfirmDialog {...baseProps} isOpen={false} />);
        expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('renders title and message when open', () => {
        render(<ConfirmDialog {...baseProps} />);
        expect(screen.getByTestId('dialog-title')).toHaveTextContent('Delete Item');
        expect(screen.getByTestId('dialog-description')).toHaveTextContent(
            'Are you sure you want to delete this item?',
        );
    });

    it('uses default button labels when confirmText and cancelText are omitted', () => {
        render(<ConfirmDialog {...baseProps} />);
        expect(screen.getByTestId('cancel-button')).toHaveTextContent('Cancel');
        expect(screen.getByTestId('confirm-button')).toHaveTextContent('Confirm');
    });

    it('uses custom button labels when confirmText and cancelText are provided', () => {
        render(
            <ConfirmDialog
                {...baseProps}
                confirmText="Delete Forever"
                cancelText="Go back"
            />,
        );
        expect(screen.getByTestId('cancel-button')).toHaveTextContent('Go back');
        expect(screen.getByTestId('confirm-button')).toHaveTextContent('Delete Forever');
    });

    it('calls onCancel when the cancel button is clicked', () => {
        const onCancel = vi.fn();
        render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);
        fireEvent.click(screen.getByTestId('cancel-button'));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('calls onConfirm when the confirm button is clicked', () => {
        const onConfirm = vi.fn();
        render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} />);
        fireEvent.click(screen.getByTestId('confirm-button'));
        expect(onConfirm).toHaveBeenCalledOnce();
    });

    it('disables both buttons when isConfirming is true', () => {
        render(<ConfirmDialog {...baseProps} isConfirming />);
        expect(screen.getByTestId('cancel-button')).toBeDisabled();
        expect(screen.getByTestId('confirm-button')).toBeDisabled();
    });
});
