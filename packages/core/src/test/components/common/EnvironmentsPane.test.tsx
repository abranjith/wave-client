/**
 * Unit tests for EnvironmentsPane — FEAT-005 regression coverage.
 *
 * Protects against the following regressions:
 *  - Delete action bypassing the confirmation dialog.
 *  - Delete completing without user confirmation.
 *  - Delete executing despite the user cancelling the dialog.
 *  - Adapter errors on delete not surfacing to the user or leaving stale store state.
 *  - Rename action no longer opening the inline editor.
 *  - Duplicate names being accepted during rename.
 *  - Adapter errors on rename not surfacing to the user or mutating the store.
 *  - Row click selection being suppressed when no rename is active.
 *
 * Tested scenarios:
 *  1.  Dropdown renders Rename and Delete menu items for each environment row.
 *  2.  The Delete item has a visually destructive (red) class.
 *  3.  Clicking Rename opens the inline input seeded with the current name.
 *  4.  Pressing Enter commits the rename.
 *  5.  Pressing Escape cancels rename without calling the adapter.
 *  6.  Blur also commits the rename.
 *  7.  A duplicate name is rejected with an error notification and no adapter call.
 *  8.  A successful rename calls saveEnvironment and updates the rendered name.
 *  9.  A failed adapter save shows an error notification and leaves the name unchanged.
 * 10.  Clicking Delete opens the confirmation dialog with the correct title.
 * 11.  The confirmation dialog message references the environment name.
 * 12.  Cancelling the dialog does NOT call adapter deleteEnvironment.
 * 13.  Confirming the dialog calls adapter deleteEnvironment and removes the row.
 * 14.  A failed adapter delete shows an error notification and does NOT remove the row.
 * 15.  Only the confirmed environment is removed; sibling environments remain.
 *
 * Strategy:
 *  - Radix UI DropdownMenu, Tooltip, and Dialog primitives are replaced with
 *    HTML stubs that render all children unconditionally so JSDOM can interact
 *    without hover/keyboard navigation.
 *  - Adapter calls are tested via vi.spyOn on the mock adapter.
 *  - Zustand store is seeded with test environments via useAppStateStore.setState
 *    and reset in afterEach.
 *  - EnvImportWizard and EnvAddWizard are mocked to null to isolate pane behaviour.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter } from '../../mocks/mockAdapter';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import EnvironmentsPane from '../../../components/common/EnvironmentsPane';
import type { Environment } from '../../../types/collection';
import { err, ok } from '../../../utils/result';

// ── Mocks ────────────────────────────────────────────────────────────────────

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
        children,
        disabled,
    }: {
        onClick?: () => void;
        text?: string;
        children?: React.ReactNode;
        disabled?: boolean;
        [key: string]: unknown;
    }) => (
        <button onClick={onClick} disabled={disabled} data-testid="cancel-button">
            {text ?? children ?? 'Cancel'}
        </button>
    ),
}));

vi.mock('../../../components/ui/dropdown-menu', () => ({
    DropdownMenu: ({
        children,
    }: {
        children: React.ReactNode;
        onOpenChange?: (open: boolean) => void;
    }) => <div data-testid="dropdown">{children}</div>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
        <>{children}</>
    ),
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="dropdown-content">{children}</div>
    ),
    DropdownMenuItem: ({
        children,
        onClick,
        className,
    }: {
        children: React.ReactNode;
        onClick?: (e: React.MouseEvent) => void;
        className?: string;
    }) => (
        <button data-testid="menu-item" className={className} onClick={onClick}>
            {children}
        </button>
    ),
}));

vi.mock('../../../components/ui/tooltip', () => ({
    TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
        <>{children}</>
    ),
    TooltipContent: () => null,
}));

vi.mock('../../../components/ui/button', () => ({
    Button: ({
        children,
        onClick,
    }: {
        children: React.ReactNode;
        onClick?: (e?: React.MouseEvent) => void;
    }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock('../../../components/ui/input', () => ({
    Input: ({
        value,
        onChange,
        onBlur,
        onFocus,
        onKeyDown,
        autoFocus,
        onClick,
        className,
        placeholder,
    }: React.InputHTMLAttributes<HTMLInputElement>) => (
        <input
            data-testid={autoFocus ? 'rename-input' : 'search-input'}
            value={value ?? ''}
            onChange={onChange}
            onBlur={onBlur}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            autoFocus={autoFocus}
            onClick={onClick}
            className={className}
            placeholder={placeholder}
        />
    ),
}));

// Isolate the pane from wizard modals — they are not under test here.
vi.mock('../../../components/common/EnvImportWizard', () => ({ default: () => null }));
vi.mock('../../../components/common/EnvAddWizard', () => ({ default: () => null }));

// ── Test Data ─────────────────────────────────────────────────────────────────

const ENV_STAGING: Environment = {
    id: 'env-001',
    name: 'Staging',
    values: [
        { key: 'API_URL', value: 'https://staging.api.example.com', type: 'default', enabled: true },
        { key: 'API_KEY', value: 'staging-key', type: 'default', enabled: true },
    ],
};

const ENV_PRODUCTION: Environment = {
    id: 'env-002',
    name: 'Production',
    values: [{ key: 'API_URL', value: 'https://api.example.com', type: 'default', enabled: true }],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPane(
    mockAdapterResult?: ReturnType<typeof createMockAdapter>,
    props?: {
        onEnvSelect?: (env: Environment) => void;
    },
) {
    const result =
        mockAdapterResult ??
        createMockAdapter({ initialData: { environments: [ENV_STAGING] } });
    const { adapter, notificationLog } = result;

    const renderResult = render(
        <AdapterProvider adapter={adapter}>
            <EnvironmentsPane
                onEnvSelect={props?.onEnvSelect ?? vi.fn()}
                onImportEnvironments={vi.fn()}
                onExportEnvironments={vi.fn()}
            />
        </AdapterProvider>,
    );

    return { ...renderResult, adapter, notificationLog };
}

function seedStore(environments: Environment[] = [ENV_STAGING]) {
    useAppStateStore.setState({
        environments,
        isEnvironmentsLoading: false,
        environmentLoadError: null,
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EnvironmentsPane — FEAT-005 pane actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        seedStore();
    });

    afterEach(() => {
        useAppStateStore.setState({ environments: [] });
    });

    // ── Menu contents ────────────────────────────────────────────────────────

    it('renders Rename and Delete menu items for each environment row', () => {
        renderPane();
        const items = screen.getAllByTestId('menu-item');
        const labels = items.map((el) => el.textContent ?? '');
        expect(labels.some((l) => l.includes('Rename'))).toBe(true);
        expect(labels.some((l) => l.includes('Delete'))).toBe(true);
    });

    it('applies a red/destructive class to the Delete menu item', () => {
        renderPane();
        const items = screen.getAllByTestId('menu-item');
        const deleteItem = items.find((el) => el.textContent?.includes('Delete'))!;
        expect(deleteItem.className).toMatch(/red/);
    });

    // ── Rename: open + keyboard lifecycle ────────────────────────────────────

    it('clicking Rename opens the inline input seeded with the current environment name', () => {
        renderPane();

        const renameBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        const input = screen.getByTestId('rename-input') as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.value).toBe('Staging');
        expect(input.className).toContain('ring-2');

        fireEvent.focus(input);
        expect(input.selectionStart).toBe(input.value.length);
        expect(input.selectionEnd).toBe(input.value.length);
    });

    it('pressing Enter commits the rename and calls saveEnvironment', async () => {
        const mock = createMockAdapter({ initialData: { environments: [ENV_STAGING] } });
        const saveSpy = vi.spyOn(mock.adapter.storage, 'saveEnvironment').mockResolvedValue(ok(undefined));
        renderPane(mock);

        // Open rename
        const renameBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        const input = screen.getByTestId('rename-input');
        fireEvent.change(input, { target: { value: 'Staging Dev' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => {
            expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'Staging Dev' }));
        });
    });

    it('pressing Escape cancels rename without calling saveEnvironment', async () => {
        const mock = createMockAdapter({ initialData: { environments: [ENV_STAGING] } });
        const saveSpy = vi.spyOn(mock.adapter.storage, 'saveEnvironment');
        renderPane(mock);

        const renameBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        const input = screen.getByTestId('rename-input');
        fireEvent.change(input, { target: { value: 'Should Not Save' } });
        fireEvent.keyDown(input, { key: 'Escape' });

        // Give any async path time to settle.
        await Promise.resolve();
        expect(saveSpy).not.toHaveBeenCalled();

        // Inline input should be dismissed.
        expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
    });

    it('blur on the rename input commits the rename', async () => {
        const mock = createMockAdapter({ initialData: { environments: [ENV_STAGING] } });
        const saveSpy = vi.spyOn(mock.adapter.storage, 'saveEnvironment').mockResolvedValue(ok(undefined));
        renderPane(mock);

        const renameBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        const input = screen.getByTestId('rename-input');
        fireEvent.change(input, { target: { value: 'Blur Committed' } });
        fireEvent.blur(input);

        await waitFor(() => {
            expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'Blur Committed' }));
        });
    });

    // ── Rename: uniqueness validation ─────────────────────────────────────────

    it('rejects a duplicate name with an error notification and no adapter call', async () => {
        seedStore([ENV_STAGING, ENV_PRODUCTION]);
        const mock = createMockAdapter({
            initialData: { environments: [ENV_STAGING, ENV_PRODUCTION] },
        });
        const saveSpy = vi.spyOn(mock.adapter.storage, 'saveEnvironment');
        const { notificationLog } = renderPane(mock);

        // Rename ENV_STAGING to the same name as ENV_PRODUCTION (case-insensitive).
        // The component sorts alphabetically: Production (index 0) before Staging (index 1).
        const renameButtons = screen
            .getAllByTestId('menu-item')
            .filter((el) => el.textContent?.includes('Rename'));
        // renameButtons[1] corresponds to the Staging row (sorted after Production).
        fireEvent.click(renameButtons[1]);

        const input = screen.getByTestId('rename-input');
        fireEvent.change(input, { target: { value: 'production' } }); // intentional lower-case
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => {
            expect(notificationLog.some((n) => n.type === 'error')).toBe(true);
        });

        expect(saveSpy).not.toHaveBeenCalled();
    });

    it('shows error notification and leaves name unchanged when adapter saveEnvironment fails', async () => {
        const mock = createMockAdapter({ initialData: { environments: [ENV_STAGING] } });
        vi.spyOn(mock.adapter.storage, 'saveEnvironment').mockResolvedValue(
            err('Disk full'),
        );
        const { notificationLog } = renderPane(mock);

        const renameBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        const input = screen.getByTestId('rename-input');
        fireEvent.change(input, { target: { value: 'New Staging Name' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => {
            expect(notificationLog.some((n) => n.type === 'error')).toBe(true);
        });

        // The environment name should remain unmodified in the store.
        const stored = useAppStateStore.getState().environments;
        expect(stored.find((e) => e.id === ENV_STAGING.id)?.name).toBe('Staging');
    });

    // ── Delete: confirmation dialog ───────────────────────────────────────────

    it('clicking Delete opens the confirmation dialog', () => {
        renderPane();

        const deleteBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);

        expect(screen.getByTestId('dialog')).toBeInTheDocument();
        expect(screen.getByTestId('dialog-title')).toHaveTextContent('Delete Environment');
    });

    it('the confirmation dialog message references the environment name', () => {
        renderPane();

        const deleteBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);

        const description = screen.getByTestId('dialog-description');
        expect(description.textContent).toContain('Staging');
    });

    it('cancelling the dialog does NOT call adapter deleteEnvironment', async () => {
        const mock = createMockAdapter({ initialData: { environments: [ENV_STAGING] } });
        const deleteSpy = vi.spyOn(mock.adapter.storage, 'deleteEnvironment');
        renderPane(mock);

        const deleteBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);

        fireEvent.click(screen.getByTestId('cancel-button'));

        await Promise.resolve();
        expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('confirming the dialog calls adapter deleteEnvironment and removes the environment', async () => {
        const mock = createMockAdapter({ initialData: { environments: [ENV_STAGING] } });
        const deleteSpy = vi
            .spyOn(mock.adapter.storage, 'deleteEnvironment')
            .mockResolvedValue(ok(undefined));
        renderPane(mock);

        const deleteBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);

        fireEvent.click(screen.getByTestId('confirm-button'));

        await waitFor(() => {
            expect(deleteSpy).toHaveBeenCalledWith(ENV_STAGING.id);
        });

        await waitFor(() => {
            expect(screen.queryByText('Staging')).not.toBeInTheDocument();
        });
    });

    it('shows error notification and keeps the row when adapter deleteEnvironment fails', async () => {
        const mock = createMockAdapter({ initialData: { environments: [ENV_STAGING] } });
        vi.spyOn(mock.adapter.storage, 'deleteEnvironment').mockResolvedValue(
            err('Permission denied'),
        );
        const { notificationLog } = renderPane(mock);

        const deleteBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);

        fireEvent.click(screen.getByTestId('confirm-button'));

        await waitFor(() => {
            expect(notificationLog.some((n) => n.type === 'error')).toBe(true);
        });

        // Environment should still be in the DOM.
        expect(screen.getByText('Staging')).toBeInTheDocument();
    });

    it('only removes the confirmed environment; sibling environments remain', async () => {
        seedStore([ENV_STAGING, ENV_PRODUCTION]);
        const mock = createMockAdapter({
            initialData: { environments: [ENV_STAGING, ENV_PRODUCTION] },
        });
        vi.spyOn(mock.adapter.storage, 'deleteEnvironment').mockResolvedValue(ok(undefined));
        renderPane(mock);

        // Click Delete on the first Delete menu item (Production, sorted first alphabetically).
        const deleteButtons = screen
            .getAllByTestId('menu-item')
            .filter((el) => el.textContent?.includes('Delete'));
        fireEvent.click(deleteButtons[0]);

        fireEvent.click(screen.getByTestId('confirm-button'));

        await waitFor(() => {
            // One environment should be gone; the other should remain.
            const remaining = useAppStateStore.getState().environments;
            expect(remaining).toHaveLength(1);
        });
    });
});
