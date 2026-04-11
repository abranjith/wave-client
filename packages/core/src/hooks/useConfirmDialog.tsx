import { useState, useCallback, useRef } from 'react';
import React from 'react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

// ============================================================================
// Types
// ============================================================================

/**
 * Options passed to `openConfirmDialog` to configure the dialog.
 */
export interface ConfirmDialogOptions {
    /** Dialog heading text. */
    title: string;
    /** Body text explaining the action. */
    message: string;
    /**
     * Callback executed when the user confirms. May return a `Promise`; if it
     * does, the dialog shows a loading state (`isConfirming`) until the promise
     * settles. On rejection the dialog stays open so the caller can surface an
     * error notification.
     */
    onConfirm: () => void | Promise<void>;
    /** Label for the confirm button. Defaults to `"Confirm"`. */
    confirmText?: string;
    /** Label for the cancel button. Defaults to `"Cancel"`. */
    cancelText?: string;
}

/** Internal state shape managed by the hook. */
interface ConfirmDialogState {
    isOpen: boolean;
    isConfirming: boolean;
    options: ConfirmDialogOptions | null;
}

/**
 * Return value of `useConfirmDialog`.
 */
export interface UseConfirmDialogResult {
    /**
     * Opens the confirmation dialog with the supplied options.
     * Calling this while the dialog is already open replaces the current options.
     */
    openConfirmDialog: (options: ConfirmDialogOptions) => void;
    /**
     * A stable React function component that renders the managed `ConfirmDialog`.
     * Place `<ConfirmDialogComponent />` once, at the bottom of your component's
     * JSX tree.
     *
     * The component is stable across renders (same function reference) so React
     * will never unmount/remount it mid-animation. It reads the latest dialog
     * state through an internal ref that is kept in sync on every render.
     */
    ConfirmDialogComponent: React.FC;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Manages a shared confirmation dialog lifecycle, including async-confirm support.
 *
 * - `openConfirmDialog(options)` — opens the dialog.
 * - `ConfirmDialogComponent`     — stable component; render it once in your JSX.
 * - Async `onConfirm` callbacks show a loading state (`isConfirming`) and
 *   auto-close on success. On rejection the dialog stays open so the caller
 *   can surface an error via `notification.showNotification`.
 *
 * @example
 * ```tsx
 * function MyPane() {
 *   const { openConfirmDialog, ConfirmDialogComponent } = useConfirmDialog();
 *
 *   const handleDelete = (id: string) => {
 *     openConfirmDialog({
 *       title: 'Delete Item',
 *       message: 'Are you sure? This cannot be undone.',
 *       onConfirm: async () => {
 *         const result = await deleteItem(id);
 *         if (!result.isOk) throw new Error(result.error);
 *       },
 *     });
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={() => handleDelete('1')}>Delete</button>
 *       <ConfirmDialogComponent />
 *     </div>
 *   );
 * }
 * ```
 */
export function useConfirmDialog(): UseConfirmDialogResult {
    const [state, setState] = useState<ConfirmDialogState>({
        isOpen: false,
        isConfirming: false,
        options: null,
    });

    // Keep a ref to the latest state so the stable ConfirmDialogComponent
    // function can read current values without capturing stale closures.
    const stateRef = useRef(state);
    stateRef.current = state;

    const openConfirmDialog = useCallback((options: ConfirmDialogOptions) => {
        setState({ isOpen: true, isConfirming: false, options });
    }, []);

    // Stable cancel handler — no deps, reads nothing from outer scope.
    const handleCancel = useCallback(() => {
        setState((prev) => ({ ...prev, isOpen: false }));
    }, []);

    // Stable confirm handler — reads the current options from the ref so the
    // function identity never changes while always acting on the latest data.
    const handleConfirm = useCallback(async () => {
        const options = stateRef.current.options;
        if (!options) return;

        const result = options.onConfirm();

        if (result instanceof Promise) {
            setState((prev) => ({ ...prev, isConfirming: true }));
            try {
                await result;
                setState((prev) => ({ ...prev, isOpen: false, isConfirming: false }));
            } catch {
                // Leave the dialog open on rejection so the caller can surface
                // the error via notification.showNotification.
                setState((prev) => ({ ...prev, isConfirming: false }));
            }
        } else {
            setState((prev) => ({ ...prev, isOpen: false }));
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps — reads from ref

    // ConfirmDialogComponent is created once (via useRef) so its identity
    // remains stable. React therefore never unmounts/remounts it between renders,
    // preserving Radix Dialog's open/close animations.
    //
    // On every render of the parent consumer, React re-calls this function
    // component (same type, same position in the tree) and it reads the
    // latest state from stateRef.current.
    const ConfirmDialogComponentRef = useRef<React.FC>(() => {
        const s = stateRef.current;
        return (
            <ConfirmDialog
                isOpen={s.isOpen}
                isConfirming={s.isConfirming}
                title={s.options?.title ?? ''}
                message={s.options?.message ?? ''}
                confirmText={s.options?.confirmText}
                cancelText={s.options?.cancelText}
                onCancel={handleCancel}
                onConfirm={handleConfirm}
            />
        );
    });

    return {
        openConfirmDialog,
        ConfirmDialogComponent: ConfirmDialogComponentRef.current,
    };
}
