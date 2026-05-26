import React from 'react';
import { CheckIcon, XIcon } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';

/**
 * Props for the ConfirmDialog presentational component.
 *
 * This component is intentionally a pure, controlled dialog. All state is
 * owned by the caller (or delegated to `useConfirmDialog`).
 */
export interface ConfirmDialogProps {
    /** Controls dialog visibility. */
    isOpen: boolean;
    /**
     * When `true`, both action buttons are disabled to prevent double-submit
     * while an async `onConfirm` callback is in flight.
     */
    isConfirming?: boolean;
    /** Title displayed in the dialog header. */
    title: string;
    /** Body text explaining the action being confirmed. */
    message: string;
    /** Label for the destructive confirm button. Defaults to `"Confirm"`. */
    confirmText?: string;
    /** Label for the cancel button. Defaults to `"Cancel"`. */
    cancelText?: string;
    /** Called when the user dismisses the dialog without confirming. */
    onCancel: () => void;
    /** Called when the user presses the confirm button. */
    onConfirm: () => void;
}

/**
 * Shared presentational confirmation dialog used for all destructive actions
 * across pane UIs (delete, remove, etc.).
 *
 * Uses the standardised button colour scheme:
 * - Cancel  → `SecondaryButton` with `colorTheme="warning"` + X icon
 * - Confirm → `PrimaryButton`   with `colorTheme="error"`   + check icon
 *
 * Prefer consuming this via `useConfirmDialog` rather than managing the
 * `isOpen`/`isConfirming` state yourself.
 *
 * @example
 * <ConfirmDialog
 *   isOpen={isOpen}
 *   title="Delete Rule"
 *   message="Are you sure? This cannot be undone."
 *   onCancel={handleCancel}
 *   onConfirm={handleConfirm}
 * />
 */
export function ConfirmDialog({
    isOpen,
    isConfirming = false,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    onCancel,
    onConfirm,
}: ConfirmDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                        {title}
                    </DialogTitle>
                    <DialogDescription>{message}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <SecondaryButton
                        onClick={onCancel}
                        icon={<XIcon />}
                        text={cancelText}
                        disabled={isConfirming}
                    />
                    <PrimaryButton
                        onClick={onConfirm}
                        icon={<CheckIcon />}
                        text={confirmText}
                        disabled={isConfirming}
                    />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
