/**
 * Unit tests for ValidationStoreGrid after FEAT-001 migration to useConfirmDialog.
 *
 * Tested:
 *  1. Clicking a delete button opens the confirmation dialog.
 *  2. Clicking cancel in the dialog closes it without removing the rule.
 *  3. Clicking confirm in the dialog removes the rule from the store.
 *
 * Strategy:
 *  - The Zustand store is seeded with a single validation rule via
 *    `useAppStateStore.setState` before each test and reset afterwards.
 *  - Dialog primitives, PrimaryButton, and SecondaryButton are mocked with
 *    plain HTML stubs to keep JSDOM interactions reliable.
 *  - The Switch (Radix) and ValidationWizard components are stubbed so the test
 *    can focus purely on the delete confirmation flow.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import ValidationStoreGrid from '../../../components/common/ValidationStoreGrid';
import type { GlobalValidationRule } from '../../../types/validation';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../components/ui/dialog', () => ({
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
            {text ?? 'Confirm'}
        </button>
    ),
}));

vi.mock('../../../components/ui/SecondaryButton', () => ({
    SecondaryButton: ({
        onClick,
        text,
        tooltip,
        disabled,
        colorTheme,
    }: {
        onClick: () => void;
        text?: string;
        tooltip?: string;
        disabled?: boolean;
        colorTheme?: string;
        icon?: React.ReactNode;
        size?: string;
    }) => (
        <button
            onClick={onClick}
            disabled={disabled}
            // Only assign known test IDs to avoid ambiguity:
            //   delete-button → the icon-only row delete action (tooltip="Delete rule")
            //   cancel-button → the dialog Cancel button (colorTheme="warning")
            data-testid={
                tooltip === 'Delete rule'
                    ? 'delete-button'
                    : colorTheme === 'warning'
                      ? 'cancel-button'
                      : undefined
            }
        >
            {text ?? tooltip ?? 'Button'}
        </button>
    ),
}));

vi.mock('../../../components/ui/switch', () => ({
    Switch: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: () => void }) => (
        <input type="checkbox" checked={checked} onChange={onCheckedChange} />
    ),
}));

vi.mock('../../../components/common/ValidationWizard', () => ({
    default: () => <div data-testid="validation-wizard" />,
}));

vi.mock('../../../components/ui/button', () => ({
    Button: ({
        children,
        onClick,
    }: {
        children: React.ReactNode;
        onClick?: () => void;
    }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock('../../../components/ui/table', () => ({
    Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
    TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
    TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
    TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
    TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
    TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
}));

vi.mock('../../../components/ui/banner', () => ({
    default: () => null,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const TEST_RULE: GlobalValidationRule = {
    id: 'rule-test-1',
    name: 'Status OK',
    description: 'Checks status is 200',
    enabled: true,
    category: 'status',
    operator: 'equals',
    value: 200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

function renderGrid() {
    return render(
        <ValidationStoreGrid
            onBack={vi.fn()}
            onSaveValidationRules={vi.fn()}
        />,
    );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ValidationStoreGrid — delete confirmation (FEAT-001)', () => {
    beforeEach(() => {
        act(() => {
            useAppStateStore.setState({ validationRules: [TEST_RULE] });
        });
    });

    afterEach(() => {
        act(() => {
            useAppStateStore.setState({ validationRules: [] });
        });
        vi.clearAllMocks();
    });

    it('clicking delete opens the confirmation dialog', () => {
        renderGrid();

        expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('delete-button'));

        expect(screen.getByTestId('dialog')).toBeInTheDocument();
        expect(screen.getByTestId('dialog-title')).toHaveTextContent('Delete Validation Rule');
    });

    it('clicking cancel closes the dialog without removing the rule', () => {
        renderGrid();
        fireEvent.click(screen.getByTestId('delete-button'));

        expect(screen.getByTestId('dialog')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('cancel-button'));

        expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
        // Rule should still be present in the store
        expect(useAppStateStore.getState().validationRules).toHaveLength(1);
    });

    it('clicking confirm removes the rule from the store', () => {
        renderGrid();
        fireEvent.click(screen.getByTestId('delete-button'));
        fireEvent.click(screen.getByTestId('confirm-button'));

        expect(useAppStateStore.getState().validationRules).toHaveLength(0);
        expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });
});
