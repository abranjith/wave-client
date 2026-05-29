/**
 * Unit tests for CollectionsPane — collection-level Rename and Delete actions.
 *
 * Tested:
 *  1. Collection dropdown renders Run, Rename, and Delete menu actions.
 *  2. Delete menu item has a visually distinct (red) class.
 *  3. Clicking Rename opens an inline input pre-filled with the collection name.
 *  4. Committing a valid new name on Enter calls saveCollection and updates the store.
 *  5. Pressing Escape cancels the rename without calling saveCollection.
 *  6. Renaming to a duplicate name shows an error notification and does NOT save.
 *  7. Clicking Delete opens the confirmation dialog with title and message.
 *  8. Cancelling the confirm dialog does NOT call deleteCollection.
 *  9. Confirming the dialog calls deleteCollection and removes the collection from the store.
 *
 * Strategy:
 *  - Radix UI DropdownMenu, Tooltip, and Dialog primitives are replaced with
 *    HTML stubs that render all children unconditionally so JSDOM can interact
 *    without hover / keyboard navigation.
 *  - Heavy child components (CollectionTreeItem, modals, wizards) are stubbed
 *    to null so the tests stay focused on collection-header behaviour.
 *  - Adapter calls are tested via vi.spyOn on the mock adapter.
 *  - Zustand store is seeded with useAppStateStore.setState and reset afterEach.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter, type MockNotificationLog } from '../../mocks/mockAdapter';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import CollectionsPane from '../../../components/common/CollectionsPane';
import type { Collection } from '../../../types/collection';

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
        onClick?: () => void;
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

vi.mock('../../../components/common/CollectionsImportWizard', () => ({
    default: () => null,
}));

vi.mock('../../../components/common/CollectionExportWizard', () => ({
    default: () => null,
}));

vi.mock('../../../components/common/RunCollectionModal', () => ({
    default: () => null,
}));

vi.mock('../../../components/common/CollectionTreeItem', () => ({
    default: () => null,
}));

// ── Test Data ─────────────────────────────────────────────────────────────────

const TEST_COLLECTION: Collection = {
    filename: 'my-api.json',
    info: {
        name: 'My API',
        waveId: 'wave-001',
        schema: 'v1',
    },
    item: [],
};

const SECOND_COLLECTION: Collection = {
    filename: 'other-api.json',
    info: {
        name: 'Other API',
        waveId: 'wave-002',
        schema: 'v1',
    },
    item: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
    onRequestSelect: vi.fn(),
    onImportCollection: vi.fn(),
    onExportCollection: vi.fn(),
};

function renderPane(adapterFactory?: ReturnType<typeof createMockAdapter>) {
    const { adapter, notificationLog } = adapterFactory ?? createMockAdapter({
        initialData: { collections: [TEST_COLLECTION] },
    });

    const result = render(
        <AdapterProvider adapter={adapter}>
            <CollectionsPane {...defaultProps} />
        </AdapterProvider>
    );

    return { ...result, adapter, notificationLog };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CollectionsPane — collection menu actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAppStateStore.setState({
            collections: [TEST_COLLECTION],
            isCollectionsLoading: false,
            collectionLoadError: null,
            collectionSearchText: '',
            savedExpandedCollections: null,
            savedExpandedFolders: null,
        });
    });

    afterEach(() => {
        useAppStateStore.setState({ collections: [] });
    });

    // ── Menu contents ────────────────────────────────────────────────────────

    it('renders Run, Rename, and Delete menu actions', () => {
        renderPane();
        const items = screen.getAllByTestId('menu-item');
        const labels = items.map((el) => el.textContent ?? '');
        expect(labels.some((l) => l.includes('Run'))).toBe(true);
        expect(labels.some((l) => l.includes('Rename'))).toBe(true);
        expect(labels.some((l) => l.includes('Delete'))).toBe(true);
    });

    it('applies a red/destructive class to the Delete menu item', () => {
        renderPane();
        const items = screen.getAllByTestId('menu-item');
        const deleteItem = items.find((el) => el.textContent?.includes('Delete'))!;
        expect(deleteItem.className).toMatch(/red/);
    });

    // ── Rename collection ────────────────────────────────────────────────────

    it('opens an inline input pre-filled with the collection name when Rename is clicked', () => {
        renderPane();
        const items = screen.getAllByTestId('menu-item');
        const renameBtn = items.find((el) => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        const input = screen.getByTestId('rename-input') as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.value).toBe('My API');
        expect(input.className).toContain('ring-2');

        fireEvent.focus(input);
        expect(input.selectionStart).toBe(input.value.length);
        expect(input.selectionEnd).toBe(input.value.length);
    });

    it('calls saveCollection with the new name on Enter and updates the store', async () => {
        const mockAdapter = createMockAdapter({
            initialData: { collections: [TEST_COLLECTION] },
        });
        const saveSpy = vi.spyOn(mockAdapter.adapter.storage, 'saveCollection');

        render(
            <AdapterProvider adapter={mockAdapter.adapter}>
                <CollectionsPane {...defaultProps} />
            </AdapterProvider>
        );

        // Open inline rename
        const renameBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        const input = screen.getByTestId('rename-input');
        fireEvent.change(input, { target: { value: 'Updated API' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => {
            expect(saveSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    info: expect.objectContaining({ name: 'Updated API' }),
                })
            );
        });

        expect(useAppStateStore.getState().collections.some(
            (c) => c.info.name === 'Updated API'
        )).toBe(true);
    });

    it('cancels inline rename on Escape without calling saveCollection', async () => {
        const mockAdapter = createMockAdapter({
            initialData: { collections: [TEST_COLLECTION] },
        });
        const saveSpy = vi.spyOn(mockAdapter.adapter.storage, 'saveCollection');

        render(
            <AdapterProvider adapter={mockAdapter.adapter}>
                <CollectionsPane {...defaultProps} />
            </AdapterProvider>
        );

        const renameBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        const input = screen.getByTestId('rename-input');
        fireEvent.change(input, { target: { value: 'Some New Name' } });
        fireEvent.keyDown(input, { key: 'Escape' });

        // Input should be gone after cancel
        await waitFor(() => {
            expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
        });
        expect(saveSpy).not.toHaveBeenCalled();
    });

    it('shows an error notification and does NOT save when renaming to a duplicate name', async () => {
        const notificationLog: MockNotificationLog[] = [];
        const mockAdapter = createMockAdapter({
            initialData: { collections: [TEST_COLLECTION, SECOND_COLLECTION] },
            notificationLog,
        });
        const saveSpy = vi.spyOn(mockAdapter.adapter.storage, 'saveCollection');

        useAppStateStore.setState({
            collections: [TEST_COLLECTION, SECOND_COLLECTION],
        });

        render(
            <AdapterProvider adapter={mockAdapter.adapter}>
                <CollectionsPane {...defaultProps} />
            </AdapterProvider>
        );

        // Rename the first collection to the second's name
        const renameButtons = screen
            .getAllByTestId('menu-item')
            .filter((el) => el.textContent?.includes('Rename'));
        fireEvent.click(renameButtons[0]!);

        const input = screen.getByTestId('rename-input');
        fireEvent.change(input, { target: { value: 'Other API' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => {
            expect(notificationLog.some((n) => n.type === 'error')).toBe(true);
        });
        expect(saveSpy).not.toHaveBeenCalled();
    });

    // ── Delete collection ────────────────────────────────────────────────────

    it('opens the confirmation dialog when Delete is clicked', () => {
        renderPane();
        const deleteBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);

        expect(screen.getByTestId('dialog')).toBeInTheDocument();
        expect(screen.getByTestId('dialog-title').textContent).toMatch(/delete collection/i);
    });

    it('does NOT call deleteCollection when the confirm dialog is cancelled', async () => {
        const mockAdapter = createMockAdapter({
            initialData: { collections: [TEST_COLLECTION] },
        });
        const deleteSpy = vi.spyOn(mockAdapter.adapter.storage, 'deleteCollection');

        render(
            <AdapterProvider adapter={mockAdapter.adapter}>
                <CollectionsPane {...defaultProps} />
            </AdapterProvider>
        );

        const deleteBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);

        const cancelBtn = screen.getByTestId('cancel-button');
        fireEvent.click(cancelBtn);

        await waitFor(() => {
            expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
        });
        expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('calls deleteCollection and removes the collection from the store on confirm', async () => {
        const mockAdapter = createMockAdapter({
            initialData: { collections: [TEST_COLLECTION] },
        });
        const deleteSpy = vi.spyOn(mockAdapter.adapter.storage, 'deleteCollection');

        render(
            <AdapterProvider adapter={mockAdapter.adapter}>
                <CollectionsPane {...defaultProps} />
            </AdapterProvider>
        );

        const deleteBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);

        const confirmBtn = screen.getByTestId('confirm-button');
        fireEvent.click(confirmBtn);

        await waitFor(() => {
            expect(deleteSpy).toHaveBeenCalledWith('my-api.json');
        });

        expect(
            useAppStateStore.getState().collections.some((c) => c.info.name === 'My API')
        ).toBe(false);
    });
});
