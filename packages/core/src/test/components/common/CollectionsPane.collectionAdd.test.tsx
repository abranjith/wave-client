/**
 * Unit tests for CollectionsPane — Add Collection flow.
 *
 * Covered:
 *  1. Header shows Add Collection (+) action.
 *  2. Clicking Add opens CollectionAddWizard.
 *  3. Saving creates a schema-valid empty collection payload and persists it.
 *  4. Filename generation avoids collisions when normalized stems match.
 *  5. Duplicate collection names are rejected before persistence.
 *  6. Adapter save failures are surfaced and do not mutate store state.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter } from '../../mocks/mockAdapter';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import CollectionsPane from '../../../components/common/CollectionsPane';
import type { Collection } from '../../../types/collection';
import { CURRENT_COLLECTION_SCHEMA_VERSION } from '../../../schemas/collectionSchema';

// ── UI stubs ─────────────────────────────────────────────────────────────────

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
  PrimaryButton: ({
    onClick,
    text,
    disabled,
  }: {
    onClick: () => void;
    text?: string;
    disabled?: boolean;
  }) => (
    <button data-testid="save-button" onClick={onClick} disabled={disabled}>
      {text ?? 'Save'}
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
    <button data-testid="cancel-button" onClick={onClick} disabled={disabled}>
      {text ?? children ?? 'Cancel'}
    </button>
  ),
}));

vi.mock('../../../components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode; onOpenChange?: (open: boolean) => void }) => (
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
  TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>,
  TooltipContent: () => null,
}));

vi.mock('../../../components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('../../../components/ui/input', () => ({
  Input: ({
    id,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      id={id}
      data-testid={id === 'collection-name' ? 'collection-name-input' : 'search-input'}
      {...props}
    />
  ),
}));

vi.mock('../../../components/ui/label', () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

vi.mock('../../../components/ui/banner', () => ({
  default: ({ message }: { message: string }) => <div data-testid="error-banner">{message}</div>,
}));

vi.mock('../../../components/common/CollectionsImportWizard', () => ({ default: () => null }));
vi.mock('../../../components/common/CollectionExportWizard', () => ({ default: () => null }));
vi.mock('../../../components/common/RunCollectionModal', () => ({ default: () => null }));
vi.mock('../../../components/common/CollectionTreeItem', () => ({ default: () => null }));
vi.mock('../../../components/common/RequestSaveWizard', () => ({ default: () => null }));
vi.mock('../../../components/common/FolderAddWizard', () => ({ default: () => null }));

// ── Helpers ──────────────────────────────────────────────────────────────────

const defaultProps = {
  onRequestSelect: vi.fn(),
  onImportCollection: vi.fn(),
  onExportCollection: vi.fn(),
};

function setStoreCollections(collections: Collection[]) {
  useAppStateStore.setState({
    collections,
    isCollectionsLoading: false,
    collectionLoadError: null,
    collectionSearchText: '',
    savedExpandedCollections: null,
    savedExpandedFolders: null,
  });
}

function renderPane(collections: Collection[]) {
  const mock = createMockAdapter({
    initialData: { collections },
  });

  render(
    <AdapterProvider adapter={mock.adapter}>
      <CollectionsPane {...defaultProps} />
    </AdapterProvider>
  );

  return mock;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CollectionsPane — Add Collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStoreCollections([]);
  });

  afterEach(() => {
    useAppStateStore.setState({ collections: [] });
  });

  it('renders Add Collection button in header', () => {
    renderPane([]);
    expect(screen.getByRole('button', { name: /add collection/i })).toBeInTheDocument();
  });

  it('opens add-collection dialog when Add Collection button is clicked', () => {
    renderPane([]);
    fireEvent.click(screen.getByRole('button', { name: /add collection/i }));

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add Collection')).toBeInTheDocument();
  });

  it('persists a schema-valid empty collection and resolves filename collisions', async () => {
    const existingCollection: Collection = {
      filename: 'a_b.json',
      info: { waveId: 'existing-wave-id', name: 'A-B' },
      item: [],
    };

    setStoreCollections([existingCollection]);
    const mock = renderPane([existingCollection]);
    const saveSpy = vi.spyOn(mock.adapter.storage, 'saveCollection');

    fireEvent.click(screen.getByRole('button', { name: /add collection/i }));
    fireEvent.change(screen.getByTestId('collection-name-input'), { target: { value: 'A B' } });
    fireEvent.click(screen.getByTestId('save-button'));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    const payload = saveSpy.mock.calls[0][0] as Collection;
    expect(payload.filename).toBe('a_b_1.json');
    expect(payload.info.name).toBe('A B');
    expect(payload.info.version).toBe(CURRENT_COLLECTION_SCHEMA_VERSION);
    expect(typeof payload.info.waveId).toBe('string');
    expect(payload.info.waveId.length).toBeGreaterThan(0);
    expect(payload.item).toEqual([]);

    await waitFor(() => {
      const storeCollections = useAppStateStore.getState().collections;
      expect(storeCollections.some((collection) => collection.info.name === 'A B')).toBe(true);
    });
  });

  it('rejects duplicate collection names (case-insensitive) before saveCollection', async () => {
    const existingCollection: Collection = {
      filename: 'my_api.json',
      info: { waveId: 'existing-wave-id', name: 'My API' },
      item: [],
    };

    setStoreCollections([existingCollection]);
    const mock = renderPane([existingCollection]);
    const saveSpy = vi.spyOn(mock.adapter.storage, 'saveCollection');

    fireEvent.click(screen.getByRole('button', { name: /add collection/i }));
    fireEvent.change(screen.getByTestId('collection-name-input'), { target: { value: 'my api' } });
    fireEvent.click(screen.getByTestId('save-button'));

    await waitFor(() => {
      expect(screen.getByTestId('error-banner').textContent).toContain('already exists');
    });

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('shows adapter save errors and keeps store unchanged', async () => {
    const existingCollection: Collection = {
      filename: 'existing.json',
      info: { waveId: 'existing-wave-id', name: 'Existing' },
      item: [],
    };

    setStoreCollections([existingCollection]);
    const mock = renderPane([existingCollection]);
    vi.spyOn(mock.adapter.storage, 'saveCollection').mockResolvedValue({
      isOk: false,
      error: 'Disk full',
    } as any);

    fireEvent.click(screen.getByRole('button', { name: /add collection/i }));
    fireEvent.change(screen.getByTestId('collection-name-input'), { target: { value: 'New API' } });
    fireEvent.click(screen.getByTestId('save-button'));

    await waitFor(() => {
      expect(screen.getByTestId('error-banner').textContent).toBe('Disk full');
    });

    const storeCollections = useAppStateStore.getState().collections;
    expect(storeCollections).toHaveLength(1);
    expect(storeCollections[0]?.info.name).toBe('Existing');
  });
});
