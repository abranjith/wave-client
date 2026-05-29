/**
 * Unit tests for CollectionTreeItem — Rename and Delete menu actions.
 *
 * Tested:
 *  1. Folder row renders Run, Rename, Delete menu actions.
 *  2. Request row renders Rename and Delete menu actions.
 *  3. Rename opens inline input for folder and commits the new name.
 *  4. Rename cancels on Escape without calling onRenameItem.
 *  5. Delete for a folder calls onDeleteItem with the correct item and path.
 *  6. Delete for a request calls onDeleteItem with the correct item and path.
 *  7. Clicking the folder header does not toggle when inline rename is active.
 *  8. Clicking the request row does not select the request when rename is active.
 *
 * Strategy:
 *  - Radix UI DropdownMenu and Tooltip are replaced with HTML stubs that
 *    render all children unconditionally so JSDOM can find actions without
 *    simulating hover/keyboard to open the menu.
 *  - State-driving is done via userEvent / fireEvent on the stub buttons.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CollectionTreeItem from '../../../components/common/CollectionTreeItem';
import type { CollectionItem } from '../../../types/collection';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="dropdown">{children}</div>
    ),
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
    }: React.InputHTMLAttributes<HTMLInputElement>) => (
        <input
            data-testid="rename-input"
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            autoFocus={autoFocus}
            onClick={onClick}
            className={className}
        />
    ),
}));

// ── Test Data ─────────────────────────────────────────────────────────────────

const requestItem: CollectionItem = {
    id: 'req-1',
    name: 'Get Users',
    request: {
        id: 'req-1',
        name: 'Get Users',
        method: 'GET',
        url: 'https://api.example.com/users',
        header: [],
        sourceRef: {
            collectionFilename: 'col.json',
            collectionName: 'My API',
            itemPath: [],
        },
    },
};

const folderItem: CollectionItem = {
    id: 'folder-1',
    name: 'Auth',
    item: [requestItem],
};

const defaultProps = {
    item: folderItem,
    depth: 0,
    collectionFilename: 'col.json',
    collectionName: 'My API',
    itemPath: [],
    currentRequestId: undefined,
    expandedFolders: new Set<string>(['col.json:Auth']),
    onToggleFolder: vi.fn(),
    onRequestSelect: vi.fn(),
    onRunFolder: vi.fn(),
    onRenameItem: vi.fn().mockResolvedValue(undefined),
    onDeleteItem: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CollectionTreeItem — folder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders Run, Rename, and Delete menu actions for a folder', () => {
        render(<CollectionTreeItem {...defaultProps} />);
        const items = screen.getAllByTestId('menu-item');
        const labels = items.map((el) => el.textContent ?? '');
        expect(labels.some(l => l.includes('Run'))).toBe(true);
        expect(labels.some(l => l.includes('Rename'))).toBe(true);
        expect(labels.some(l => l.includes('Delete'))).toBe(true);
    });

    it('opens inline rename input when Rename is clicked', () => {
        render(<CollectionTreeItem {...defaultProps} />);
        const items = screen.getAllByTestId('menu-item');
        const renameBtn = items.find((el) => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);
        const input = screen.getByTestId('rename-input') as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.value).toBe('Auth');
        expect(input.className).toContain('ring-2');

        fireEvent.focus(input);
        expect(input.selectionStart).toBe(input.value.length);
        expect(input.selectionEnd).toBe(input.value.length);
    });

    it('commits rename on Enter and calls onRenameItem', async () => {
        render(<CollectionTreeItem {...defaultProps} />);
        const renameBtn = screen.getAllByTestId('menu-item').find(el => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        const input = screen.getByTestId('rename-input');
        fireEvent.change(input, { target: { value: 'AuthV2' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => {
            expect(defaultProps.onRenameItem).toHaveBeenCalledWith('folder-1', 'AuthV2', []);
        });
        expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
    });

    it('cancels rename on Escape without calling onRenameItem', () => {
        render(<CollectionTreeItem {...defaultProps} />);
        const renameBtn = screen.getAllByTestId('menu-item').find(el => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        const input = screen.getByTestId('rename-input');
        fireEvent.change(input, { target: { value: 'SomethingElse' } });
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(defaultProps.onRenameItem).not.toHaveBeenCalled();
        expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
    });

    it('does not call onRenameItem when name is unchanged (blur)', async () => {
        render(<CollectionTreeItem {...defaultProps} />);
        const renameBtn = screen.getAllByTestId('menu-item').find(el => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        const input = screen.getByTestId('rename-input');
        // No change — blur without modification
        fireEvent.blur(input);

        await waitFor(() => {
            expect(defaultProps.onRenameItem).not.toHaveBeenCalled();
        });
    });

    it('calls onDeleteItem with correct item and parentItemPath when Delete is clicked', () => {
        render(<CollectionTreeItem {...defaultProps} />);
        const deleteBtn = screen.getAllByTestId('menu-item').find(el => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);
        expect(defaultProps.onDeleteItem).toHaveBeenCalledWith(folderItem, []);
    });

    it('does not call onToggleFolder when rename input is active', () => {
        render(<CollectionTreeItem {...defaultProps} />);
        const renameBtn = screen.getAllByTestId('menu-item').find(el => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        // When isEditing is true the name text is replaced by the rename input.
        // Click the folder header container (2 levels up from the input) to
        // verify the !isEditing guard prevents onToggleFolder from being called.
        const input = screen.getByTestId('rename-input');
        fireEvent.click(input.parentElement!.parentElement!);
        // onToggleFolder should NOT fire while editing
        expect(defaultProps.onToggleFolder).not.toHaveBeenCalled();
    });
});

describe('CollectionTreeItem — request', () => {
    const requestProps = {
        ...defaultProps,
        item: requestItem,
        expandedFolders: new Set<string>(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders Rename and Delete menu actions for a request (no Run)', () => {
        render(<CollectionTreeItem {...requestProps} />);
        const items = screen.getAllByTestId('menu-item');
        const labels = items.map(el => el.textContent ?? '');
        expect(labels.some(l => l.includes('Rename'))).toBe(true);
        expect(labels.some(l => l.includes('Delete'))).toBe(true);
        expect(labels.every(l => !l.includes('Run'))).toBe(true);
    });

    it('opens inline rename input with current request name', () => {
        render(<CollectionTreeItem {...requestProps} />);
        const renameBtn = screen.getAllByTestId('menu-item').find(el => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        const input = screen.getByTestId('rename-input');
        expect((input as HTMLInputElement).value).toBe('Get Users');
        expect((input as HTMLInputElement).className).toContain('ring-2');
    });

    it('commits request rename on Enter', async () => {
        render(<CollectionTreeItem {...requestProps} />);
        const renameBtn = screen.getAllByTestId('menu-item').find(el => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        const input = screen.getByTestId('rename-input');
        fireEvent.change(input, { target: { value: 'Get All Users' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => {
            expect(defaultProps.onRenameItem).toHaveBeenCalledWith('req-1', 'Get All Users', []);
        });
    });

    it('calls onDeleteItem with the request item and parentItemPath', () => {
        render(<CollectionTreeItem {...requestProps} />);
        const deleteBtn = screen.getAllByTestId('menu-item').find(el => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);
        expect(defaultProps.onDeleteItem).toHaveBeenCalledWith(requestItem, []);
    });

    it('does not trigger onRequestSelect while rename is active', () => {
        render(<CollectionTreeItem {...requestProps} />);
        const renameBtn = screen.getAllByTestId('menu-item').find(el => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        // click the row that would normally select the request
        const nameSpan = screen.getByTestId('rename-input');
        fireEvent.click(nameSpan);
        expect(defaultProps.onRequestSelect).not.toHaveBeenCalled();
    });

    it('passes correct parentItemPath for a nested item', async () => {
        // Simulate a request nested inside a folder: itemPath = ['Auth']
        const nestedProps = {
            ...requestProps,
            itemPath: ['Auth'],
        };
        render(<CollectionTreeItem {...nestedProps} />);
        const renameBtn = screen.getAllByTestId('menu-item').find(el => el.textContent?.includes('Rename'))!;
        fireEvent.click(renameBtn);

        const input = screen.getByTestId('rename-input');
        fireEvent.change(input, { target: { value: 'Updated Name' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => {
            expect(defaultProps.onRenameItem).toHaveBeenCalledWith('req-1', 'Updated Name', ['Auth']);
        });
    });
});
