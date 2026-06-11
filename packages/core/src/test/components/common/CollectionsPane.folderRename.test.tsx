/**
 * Unit tests for CollectionsPane — folder rename path-consumer follow-through (FEAT-003 TASK-006).
 *
 * Tested:
 *  1. Renaming a folder updates open tabs whose collectionRef.itemPath runs through it.
 *  2. Renaming a folder updates nested paths (parent segment replaced, children preserved).
 *  3. Renaming a folder that is NOT in a tab's path leaves that tab untouched.
 *  4. Folder delete calls deleteRequestFromCollection and removes the folder from the store.
 *
 * Strategy:
 *  - CollectionTreeItem is stubbed to expose rename/delete buttons that call the
 *    onRenameItem / onDeleteItem callbacks with controlled arguments.
 *  - useConfirmDialog is stubbed to auto-confirm (calls onConfirm synchronously).
 *  - The collection header is clicked to expand it before interacting with tree items.
 *  - Zustand store is seeded directly with useAppStateStore.setState; tabs carry
 *    collectionRef so the folder-rename handler can update them.
 */

import React from 'react';
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter } from '../../mocks/mockAdapter';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import { createEmptyTab } from '../../../types/tab';
import type { Collection, CollectionItem } from '../../../types/collection';
import type { TabData } from '../../../types/tab';

// ── UI stubs ──────────────────────────────────────────────────────────────────

vi.mock('../../../components/ui/dialog', () => ({
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
        open ? <div>{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../components/ui/PrimaryButton', () => ({
    PrimaryButton: ({ onClick, text }: { onClick: () => void; text?: string }) => (
        <button onClick={onClick}>{text ?? 'Confirm'}</button>
    ),
}));

vi.mock('../../../components/ui/SecondaryButton', () => ({
    SecondaryButton: ({
        onClick,
        text,
        children,
    }: {
        onClick?: () => void;
        text?: string;
        children?: React.ReactNode;
        [key: string]: unknown;
    }) => <button onClick={onClick}>{text ?? children ?? 'Cancel'}</button>,
}));

vi.mock('../../../components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
    Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
        <button onClick={onClick}>{children}</button>
    ),
}));

vi.mock('../../../components/ui/input', () => ({
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('../../../components/common/CollectionsImportWizard', () => ({ default: () => null }));
vi.mock('../../../components/common/CollectionExportWizard', () => ({ default: () => null }));
vi.mock('../../../components/common/RunCollectionModal', () => ({ default: () => null }));
vi.mock('../../../components/common/RequestSaveWizard', () => ({ default: () => null }));

// ── useConfirmDialog: auto-confirm ────────────────────────────────────────────

vi.mock('../../../hooks/useConfirmDialog', () => ({
    useConfirmDialog: () => ({
        openConfirmDialog: vi.fn(({ onConfirm }: { onConfirm: () => void }) => onConfirm()),
        ConfirmDialogComponent: () => null,
    }),
}));

// ── CollectionTreeItem stub ────────────────────────────────────────────────────

vi.mock('../../../components/common/CollectionTreeItem', () => ({
    default: ({
        item,
        itemPath,
        onRenameItem,
        onDeleteItem,
    }: {
        item: CollectionItem;
        itemPath: string[];
        onRenameItem?: (itemId: string, newName: string, parentItemPath: string[]) => Promise<void>;
        onDeleteItem?: (item: CollectionItem, parentItemPath: string[]) => void;
    }) => (
        <div>
            <span>{item.name}</span>
            <button
                data-testid={`rename-item-${item.id}`}
                onClick={() => onRenameItem?.(item.id, 'Renamed Folder', itemPath)}
            >
                rename
            </button>
            <button
                data-testid={`delete-item-${item.id}`}
                onClick={() => onDeleteItem?.(item, itemPath)}
            >
                delete
            </button>
        </div>
    ),
}));

// ── Test Data ─────────────────────────────────────────────────────────────────

const FOLDER_ID = 'folder-1';
const REQ_ID = 'req-1';
const COL_FILENAME = 'col.json';
const COL_WAVE_ID = 'wave-col';
const COL_NAME = 'My API';

function buildCollection(): Collection {
    return {
        filename: COL_FILENAME,
        info: { waveId: COL_WAVE_ID, name: COL_NAME, version: '0.0.1' },
        item: [
            {
                id: FOLDER_ID,
                name: 'FolderA',
                item: [
                    {
                        id: REQ_ID,
                        name: 'Get Users',
                        request: {
                            id: 'rr-1',
                            name: 'Get Users',
                            method: 'GET',
                            url: 'https://api.example.com',
                        },
                    },
                ],
            },
        ],
    };
}

function buildTab(itemPath: string[], tabId = 'tab-1'): TabData {
    return {
        ...createEmptyTab(),
        id: tabId,
        collectionRef: {
            collectionFilename: COL_FILENAME,
            collectionName: COL_NAME,
            itemPath,
        },
    };
}

const defaultProps = {
    onRequestSelect: vi.fn(),
    onImportCollection: vi.fn(),
    onExportCollection: vi.fn(),
};

function seedStoreAndRender(
    collections: Collection[],
    tabs: TabData[] = [],
    CollectionsPaneComponent: React.ComponentType<any>
) {
    useAppStateStore.setState({
        collections,
        tabs,
        activeTabId: tabs[0]?.id ?? '',
        isCollectionsLoading: false,
        collectionLoadError: null,
        collectionSearchText: '',
        savedExpandedCollections: null,
        savedExpandedFolders: null,
    });

    const mock = createMockAdapter({ initialData: { collections } });
    render(
        <AdapterProvider adapter={mock.adapter}>
            <CollectionsPaneComponent {...defaultProps} />
        </AdapterProvider>
    );
    return mock;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CollectionsPane — folder rename path-consumer follow-through (TASK-006)', () => {
    let CollectionsPaneComponent: React.ComponentType<any>;

    beforeAll(async () => {
        const mod = await import('../../../components/common/CollectionsPane');
        CollectionsPaneComponent = mod.default;
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        useAppStateStore.setState({ collections: [], tabs: [], activeTabId: '' });
    });

    // ── Folder rename → tab collectionRef.itemPath update ────────────────────

    it('updates collectionRef.itemPath on a tab whose path runs through the renamed folder', async () => {
        const collection = buildCollection();
        const tab = buildTab(['FolderA']);

        seedStoreAndRender([collection], [tab], CollectionsPaneComponent);

        // Expand the collection to reveal tree items
        fireEvent.click(screen.getByText(COL_NAME));
        fireEvent.click(screen.getByTestId(`rename-item-${FOLDER_ID}`));

        await waitFor(() => {
            const updatedTab = useAppStateStore.getState().tabs.find(t => t.id === tab.id);
            expect(updatedTab?.collectionRef?.itemPath).toEqual(['Renamed Folder']);
        });
    });

    it('updates the renamed segment and preserves deeper segments', async () => {
        const collection = buildCollection();
        const tab = buildTab(['FolderA', 'Nested']);

        seedStoreAndRender([collection], [tab], CollectionsPaneComponent);

        fireEvent.click(screen.getByText(COL_NAME));
        fireEvent.click(screen.getByTestId(`rename-item-${FOLDER_ID}`));

        await waitFor(() => {
            const updatedTab = useAppStateStore.getState().tabs.find(t => t.id === tab.id);
            expect(updatedTab?.collectionRef?.itemPath).toEqual(['Renamed Folder', 'Nested']);
        });
    });

    it('leaves tabs that reference a different folder untouched', async () => {
        const collection = buildCollection();
        const tab = buildTab(['OtherFolder']);

        seedStoreAndRender([collection], [tab], CollectionsPaneComponent);

        fireEvent.click(screen.getByText(COL_NAME));
        fireEvent.click(screen.getByTestId(`rename-item-${FOLDER_ID}`));

        // Wait until the collection item is renamed in the store
        await waitFor(() => {
            const col = useAppStateStore
                .getState()
                .collections.find(c => c.filename === COL_FILENAME);
            expect(col?.item[0].name).toBe('Renamed Folder');
        });

        // Tab pointing to OtherFolder must remain untouched
        const updated = useAppStateStore.getState().tabs.find(t => t.id === tab.id);
        expect(updated?.collectionRef?.itemPath).toEqual(['OtherFolder']);
    });

    // ── Folder delete → store update ─────────────────────────────────────────

    it('calls deleteRequestFromCollection and removes the folder from the store', async () => {
        const collection = buildCollection();
        const { adapter } = seedStoreAndRender([collection], [], CollectionsPaneComponent);
        const deleteSpy = vi.spyOn(adapter.storage, 'deleteRequestFromCollection');

        fireEvent.click(screen.getByText(COL_NAME));
        fireEvent.click(screen.getByTestId(`delete-item-${FOLDER_ID}`));

        await waitFor(() => {
            expect(deleteSpy).toHaveBeenCalledWith(
                COL_FILENAME,
                expect.any(Array),
                FOLDER_ID
            );
            const col = useAppStateStore
                .getState()
                .collections.find(c => c.filename === COL_FILENAME);
            expect(col?.item.find(i => i.id === FOLDER_ID)).toBeUndefined();
        });
    });
});
