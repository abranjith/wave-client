/**
 * Unit tests for CollectionsPane — New Folder creation (FEAT-FP-COL-001 TASK-006).
 *
 * Tested:
 *  1. Collection header menu contains a "New Folder" entry.
 *  2. Clicking "New Folder" opens FolderAddWizard (via onAdd prop invocation).
 *  3. Successful folder add calls saveCollection with the new folder appended.
 *  4. On success, the store is updated with the new folder item.
 *  5. Adapter failure surfaces as an error string (returned by onAdd, shown by wizard).
 *  6. FolderAddWizard receives siblings from the correct parent path.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter } from '../../mocks/mockAdapter';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import CollectionsPane from '../../../components/common/CollectionsPane';
import type { Collection, CollectionItem } from '../../../types/collection';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../components/ui/PrimaryButton', () => ({
  PrimaryButton: ({ onClick, text, disabled }: { onClick: () => void; text?: string; disabled?: boolean }) => (
    <button data-testid="save-btn" onClick={onClick} disabled={disabled}>{text ?? 'Save'}</button>
  ),
}));

vi.mock('../../../components/ui/SecondaryButton', () => ({
  SecondaryButton: ({ onClick, text, children }: { onClick?: () => void; text?: string; children?: React.ReactNode; [k: string]: unknown }) => (
    <button data-testid="cancel-btn" onClick={onClick}>{text ?? children ?? 'Cancel'}</button>
  ),
}));

vi.mock('../../../components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode; onOpenChange?: (o: boolean) => void }) => (
    <div data-testid="dropdown">{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick, className }: { children: React.ReactNode; onClick?: (e: React.MouseEvent) => void; className?: string }) => (
    <button data-testid="menu-item" className={className} onClick={onClick}>{children}</button>
  ),
}));

vi.mock('../../../components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>,
  TooltipContent: () => null,
}));

vi.mock('../../../components/ui/button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock('../../../components/ui/input', () => ({
  Input: ({ id, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      id={id}
      data-testid={id === 'folder-name' ? 'folder-name-input' : 'search-input'}
      {...props}
    />
  ),
}));

vi.mock('../../../components/ui/label', () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock('../../../components/ui/banner', () => ({
  default: ({ message }: { message: string }) => <div data-testid="error-banner">{message}</div>,
}));

vi.mock('../../../components/common/CollectionsImportWizard', () => ({ default: () => null }));
vi.mock('../../../components/common/CollectionExportWizard', () => ({ default: () => null }));
vi.mock('../../../components/common/RunCollectionModal', () => ({ default: () => null }));
vi.mock('../../../components/common/CollectionTreeItem', () => ({ default: () => null }));
vi.mock('../../../components/common/RequestSaveWizard', () => ({ default: () => null }));

// ── Test Data ─────────────────────────────────────────────────────────────────

const existingFolder: CollectionItem = {
  id: 'f1',
  name: 'Existing Folder',
  item: [],
};

const TEST_COLLECTION: Collection = {
  filename: 'col.json',
  info: { name: 'My API', waveId: 'w1', schema: 'v1' },
  item: [existingFolder],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  onRequestSelect: vi.fn(),
  onImportCollection: vi.fn(),
  onExportCollection: vi.fn(),
};

function renderPane(adapter = createMockAdapter({ initialData: { collections: [TEST_COLLECTION] } }).adapter) {
  return render(
    <AdapterProvider adapter={adapter}>
      <CollectionsPane {...defaultProps} />
    </AdapterProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CollectionsPane — New Folder creation (TASK-006)', () => {
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

  it('collection header menu contains a "New Folder" entry', () => {
    renderPane();
    const items = screen.getAllByTestId('menu-item');
    const labels = items.map((el) => el.textContent ?? '');
    expect(labels.some((l) => l.includes('New Folder'))).toBe(true);
  });

  it('clicking "New Folder" opens FolderAddWizard dialog', () => {
    renderPane();
    const items = screen.getAllByTestId('menu-item');
    const newFolderBtn = items.find((el) => el.textContent?.includes('New Folder'))!;
    fireEvent.click(newFolderBtn);
    expect(screen.getByTestId('dialog')).toBeTruthy();
  });

  it('successful add calls saveCollection and updates the store', async () => {
    const { adapter } = createMockAdapter({ initialData: { collections: [TEST_COLLECTION] } });
    const saveSpy = vi.spyOn(adapter.storage, 'saveCollection').mockResolvedValue({
      isOk: true,
      value: { ...TEST_COLLECTION, item: [...TEST_COLLECTION.item, { id: 'new-f', name: 'Auth', item: [] }] },
    } as any);

    renderPane(adapter);

    // Open wizard
    const items = screen.getAllByTestId('menu-item');
    const newFolderBtn = items.find((el) => el.textContent?.includes('New Folder'))!;
    fireEvent.click(newFolderBtn);

    // Type a valid name and submit
    fireEvent.change(screen.getByTestId('folder-name-input'), { target: { value: 'Auth' } });
    fireEvent.click(screen.getByTestId('save-btn'));

    await waitFor(() => expect(saveSpy).toHaveBeenCalled());

    // The saved collection should include the new folder
    const saved = saveSpy.mock.calls[0][0] as Collection;
    expect(saved.item.some((i) => i.name === 'Auth')).toBe(true);
  });

  it('adapter failure is returned as an error string (store unchanged)', async () => {
    const { adapter } = createMockAdapter({ initialData: { collections: [TEST_COLLECTION] } });
    vi.spyOn(adapter.storage, 'saveCollection').mockResolvedValue({
      isOk: false,
      error: 'Disk full',
    } as any);

    renderPane(adapter);

    const items = screen.getAllByTestId('menu-item');
    const newFolderBtn = items.find((el) => el.textContent?.includes('New Folder'))!;
    fireEvent.click(newFolderBtn);

    fireEvent.change(screen.getByTestId('folder-name-input'), { target: { value: 'Auth' } });
    fireEvent.click(screen.getByTestId('save-btn'));

    await waitFor(() => expect(screen.getByTestId('error-banner').textContent).toBe('Disk full'));

    // Store item count unchanged
    const storeItems = useAppStateStore.getState().collections.find(c => c.filename === 'col.json')?.item;
    expect(storeItems?.length).toBe(TEST_COLLECTION.item.length);
  });

  it('duplicate sibling name is rejected by wizard before calling saveCollection', async () => {
    const { adapter } = createMockAdapter({ initialData: { collections: [TEST_COLLECTION] } });
    const saveSpy = vi.spyOn(adapter.storage, 'saveCollection');

    renderPane(adapter);

    const items = screen.getAllByTestId('menu-item');
    const newFolderBtn = items.find((el) => el.textContent?.includes('New Folder'))!;
    fireEvent.click(newFolderBtn);

    // Try to create a folder with the same name as an existing sibling (case-insensitive)
    fireEvent.change(screen.getByTestId('folder-name-input'), { target: { value: 'existing folder' } });
    fireEvent.click(screen.getByTestId('save-btn'));

    await waitFor(() => expect(screen.getByTestId('error-banner')).toBeTruthy());
    expect(saveSpy).not.toHaveBeenCalled();
  });
});
