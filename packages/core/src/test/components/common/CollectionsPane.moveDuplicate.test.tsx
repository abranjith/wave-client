import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdapterProvider } from '../../../hooks/useAdapter';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import { createMockAdapter, type MockNotificationLog } from '../../mocks/mockAdapter';
import type { Collection, CollectionItem } from '../../../types/collection';
import { err } from '../../../utils/result';

let CollectionsPaneComponent: React.ComponentType<any>;

vi.mock('../../../hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    openConfirmDialog: vi.fn(),
    ConfirmDialogComponent: () => null,
  }),
}));

vi.mock('../../../components/common/CollectionsImportWizard', () => ({ default: () => null }));
vi.mock('../../../components/common/CollectionExportWizard', () => ({ default: () => null }));
vi.mock('../../../components/common/RunCollectionModal', () => ({ default: () => null }));

vi.mock('../../../components/common/RequestSaveWizard', () => ({
  default: ({
    isOpen,
    mode,
    itemKind,
    initialCollectionName,
    currentPath,
    onSave,
    onClose,
    filterDestination,
  }: {
    isOpen: boolean;
    mode?: 'save' | 'move';
    itemKind?: 'request' | 'folder';
    initialCollectionName?: string;
    currentPath?: string[];
    onSave: (collectionName: string, requestName: string, folderPath: string[]) => void;
    onClose: () => void;
    filterDestination?: (collectionFilename: string, collectionName: string, folderPath: string[]) => boolean;
  }) => {
    if (!isOpen) {
      return null;
    }

    return (
      <div data-testid="move-wizard" data-mode={mode} data-item-kind={itemKind}>
        <button
          data-testid="confirm-same-path"
          onClick={() => onSave(initialCollectionName || '', 'Get Users', currentPath || [])}
        >
          confirm-same-path
        </button>
        <button
          data-testid="confirm-child-path"
          onClick={() => onSave(initialCollectionName || '', 'Get Users', [...(currentPath || []), 'child'])}
        >
          confirm-child-path
        </button>
        <button
          data-testid="confirm-other-collection"
          onClick={() => onSave('Other API', 'Get Users', [])}
        >
          confirm-other-collection
        </button>
        <button
          data-testid="confirm-new-collection"
          onClick={() => onSave('Brand New API', 'Get Users', [])}
        >
          confirm-new-collection
        </button>
        <button data-testid="close-move" onClick={onClose}>
          close
        </button>
        {filterDestination && (
          <div data-testid="filter-present">
            filter-destination-present
          </div>
        )}
      </div>
    );
  },
}));

vi.mock('../../../components/common/CollectionTreeItem', () => ({
  default: ({
    item,
    itemPath,
    onMoveItem,
    onDuplicateItem,
  }: {
    item: CollectionItem;
    itemPath: string[];
    onMoveItem?: (item: CollectionItem, parentItemPath: string[]) => void;
    onDuplicateItem?: (item: CollectionItem, parentItemPath: string[]) => void;
  }) => {
    const isFolder = Array.isArray(item.item);
    return (
      <div>
        <div>{item.name}</div>
        {item.request && (
          <>
            <button data-testid={`move-${item.id}`} onClick={() => onMoveItem?.(item, itemPath)}>
              move-request
            </button>
            <button
              data-testid={`duplicate-${item.id}`}
              onClick={() => onDuplicateItem?.(item, itemPath)}
            >
              duplicate
            </button>
          </>
        )}
        {isFolder && (
          <button data-testid={`move-folder-${item.id}`} onClick={() => onMoveItem?.(item, itemPath)}>
            move-folder
          </button>
        )}
      </div>
    );
  },
}));

function buildCollections(): { source: Collection; other: Collection; requestId: string } {
  const requestId = 'req-1';

  const source: Collection = {
    filename: 'source.json',
    info: {
      waveId: 'wave-source',
      name: 'Source API',
    },
    item: [
      {
        id: requestId,
        name: 'Get Users',
        request: {
          id: requestId,
          name: 'Get Users',
          method: 'GET',
          url: 'https://api.example.com/users',
          header: [],
        },
      },
    ],
  };

  const other: Collection = {
    filename: 'other.json',
    info: {
      waveId: 'wave-other',
      name: 'Other API',
    },
    item: [],
  };

  return { source, other, requestId };
}

function buildCollectionsWithConflict(): { source: Collection; other: Collection; requestId: string } {
  const requestId = 'req-1';
  const conflictRequestId = 'req-2';

  const source: Collection = {
    filename: 'source.json',
    info: {
      waveId: 'wave-source',
      name: 'Source API',
    },
    item: [
      {
        id: requestId,
        name: 'Get Users',
        request: {
          id: requestId,
          name: 'Get Users',
          method: 'GET',
          url: 'https://api.example.com/users',
          header: [],
        },
      },
    ],
  };

  const other: Collection = {
    filename: 'other.json',
    info: {
      waveId: 'wave-other',
      name: 'Other API',
    },
    item: [
      {
        id: conflictRequestId,
        name: 'Get Users',
        request: {
          id: conflictRequestId,
          name: 'Get Users',
          method: 'GET',
          url: 'https://api.example.com/other-users',
          header: [],
        },
      },
    ],
  };

  return { source, other, requestId };
}

function buildCollectionsWithFolders(): { source: Collection; folderId: string; nestedRequestId: string } {
  const folderId = 'folder-1';
  const nestedRequestId = 'req-nested';

  const source: Collection = {
    filename: 'source.json',
    info: {
      waveId: 'wave-source',
      name: 'Source API',
    },
    item: [
      {
        id: folderId,
        name: 'Auth',
        item: [
          {
            id: nestedRequestId,
            name: 'Login',
            request: {
              id: nestedRequestId,
              name: 'Login',
              method: 'POST',
              url: 'https://api.example.com/login',
              header: [],
            },
          },
        ],
      },
    ],
  };

  return { source, folderId, nestedRequestId };
}

const defaultProps = {
  onRequestSelect: vi.fn(),
  onImportCollection: vi.fn(),
  onExportCollection: vi.fn(),
};

function renderPane(collections: Collection[]) {
  const notificationLog: MockNotificationLog[] = [];
  const mock = createMockAdapter({
    initialData: { collections },
    notificationLog,
  });

  useAppStateStore.setState({
    collections,
    isCollectionsLoading: false,
    collectionLoadError: null,
    collectionSearchText: '',
    savedExpandedCollections: null,
    savedExpandedFolders: null,
  });

  render(
    <AdapterProvider adapter={mock.adapter}>
      <CollectionsPaneComponent {...defaultProps} />
    </AdapterProvider>
  );

  return { ...mock, notificationLog };
}

describe('CollectionsPane move/duplicate actions', () => {
  beforeAll(async () => {
    CollectionsPaneComponent = (
      await import('../../../components/common/CollectionsPane')
    ).default as React.ComponentType<any>;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks move when destination collection/path equals source collection/path', async () => {
    const { source, requestId } = buildCollections();
    const { adapter, notificationLog } = renderPane([source]);

    const moveSpy = vi.spyOn(adapter.storage, 'moveCollectionItem');

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`move-${requestId}`));
    expect(screen.getByTestId('move-wizard')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-same-path'));

    await waitFor(() => {
      expect(notificationLog.some((entry) => entry.type === 'error')).toBe(true);
    });

    expect(moveSpy).not.toHaveBeenCalled();
  });

  it('blocks move when destination already has an item with the same name', async () => {
    const { source, other, requestId } = buildCollectionsWithConflict();
    const { adapter, notificationLog } = renderPane([source, other]);

    const moveSpy = vi.spyOn(adapter.storage, 'moveCollectionItem');

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`move-${requestId}`));
    fireEvent.click(screen.getByTestId('confirm-other-collection'));

    await waitFor(() => {
      expect(
        notificationLog.some(
          (entry) => entry.type === 'error' && entry.message.toLowerCase().includes('destination already contains')
        )
      ).toBe(true);
    });

    expect(moveSpy).not.toHaveBeenCalled();
  });

  it('request move now uses single atomic moveCollectionItem call (not save+delete)', async () => {
    const { source, requestId } = buildCollections();
    const { adapter } = renderPane([source]);

    const moveSpy = vi.spyOn(adapter.storage, 'moveCollectionItem');

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`move-${requestId}`));
    fireEvent.click(screen.getByTestId('confirm-child-path'));

    await waitFor(() => {
      expect(moveSpy).toHaveBeenCalledWith(
        'source.json',
        [],
        requestId,
        'source.json',
        ['child'],
        undefined
      );
    });

    expect(moveSpy).toHaveBeenCalledTimes(1);
  });

  it('moves across collections and updates both source and destination in store', async () => {
    const { source, other, requestId } = buildCollections();
    const { adapter } = renderPane([source, other]);

    const moveSpy = vi.spyOn(adapter.storage, 'moveCollectionItem');

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`move-${requestId}`));
    fireEvent.click(screen.getByTestId('confirm-other-collection'));

    await waitFor(() => {
      expect(moveSpy).toHaveBeenCalledWith(
        'source.json',
        [],
        requestId,
        'other.json',
        [],
        undefined
      );
    });

    const sourceState = useAppStateStore
      .getState()
      .collections.find((collection) => collection.info.name === 'Source API');
    const destinationState = useAppStateStore
      .getState()
      .collections.find((collection) => collection.info.name === 'Other API');

    expect(sourceState?.item.some((item) => item.id === requestId)).toBe(false);
    expect(destinationState?.item.some((item) => item.id === requestId)).toBe(true);
  });

  it('moves into a new collection when destination name does not exist', async () => {
    const { source, requestId } = buildCollections();
    const { adapter } = renderPane([source]);

    const moveSpy = vi.spyOn(adapter.storage, 'moveCollectionItem');

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`move-${requestId}`));
    fireEvent.click(screen.getByTestId('confirm-new-collection'));

    await waitFor(() => {
      expect(moveSpy).toHaveBeenCalledWith(
        'source.json',
        [],
        requestId,
        'brand_new_api.json',
        [],
        'Brand New API'
      );
    });

    const sourceState = useAppStateStore
      .getState()
      .collections.find((collection) => collection.info.name === 'Source API');
    const destinationState = useAppStateStore
      .getState()
      .collections.find((collection) => collection.info.name === 'Brand New API');

    expect(sourceState?.item.some((item) => item.id === requestId)).toBe(false);
    expect(destinationState?.item.some((item) => item.id === requestId)).toBe(true);
  });

  it('aborts move when moveCollectionItem fails and leaves store untouched', async () => {
    const { source, other, requestId } = buildCollections();
    const { adapter, notificationLog } = renderPane([source, other]);

    const moveSpy = vi
      .spyOn(adapter.storage, 'moveCollectionItem')
      .mockResolvedValueOnce(err('move failed'));

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`move-${requestId}`));
    fireEvent.click(screen.getByTestId('confirm-other-collection'));

    await waitFor(() => {
      expect(moveSpy).toHaveBeenCalled();
    });

    expect(notificationLog.some((entry) => entry.type === 'error')).toBe(true);

    // Store should be untouched - item still in source
    const sourceState = useAppStateStore
      .getState()
      .collections.find((collection) => collection.info.name === 'Source API');
    expect(sourceState?.item.some((item) => item.id === requestId)).toBe(true);
  });

  it('duplicates request in place with fresh ids and unique "Copy" names', async () => {
    const { source, requestId } = buildCollections();
    const { adapter } = renderPane([source]);

    const saveSpy = vi.spyOn(adapter.storage, 'saveRequestToCollection');

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`duplicate-${requestId}`));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    const firstDuplicate = saveSpy.mock.calls[0][2] as CollectionItem;
    expect(firstDuplicate.name).toBe('Get Users Copy');
    expect(firstDuplicate.id).not.toBe(requestId);
    expect(firstDuplicate.request?.id).not.toBe(requestId);

    fireEvent.click(screen.getByTestId(`duplicate-${requestId}`));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(2);
    });

    const secondDuplicate = saveSpy.mock.calls[1][2] as CollectionItem;
    expect(secondDuplicate.name).toBe('Get Users Copy 2');
  });

  it('renders folder move button and opens wizard with folder itemKind', async () => {
    const { source, folderId } = buildCollectionsWithFolders();
    renderPane([source]);

    fireEvent.click(screen.getByText('Source API'));
    const folderMoveButton = screen.getByTestId(`move-folder-${folderId}`);
    expect(folderMoveButton).toBeInTheDocument();

    fireEvent.click(folderMoveButton);

    await waitFor(() => {
      const wizard = screen.getByTestId('move-wizard');
      expect(wizard).toBeInTheDocument();
      expect(wizard.getAttribute('data-item-kind')).toBe('folder');
    });
  });

  it('folder move wizard includes filterDestination for cycle prevention', async () => {
    const { source, folderId } = buildCollectionsWithFolders();
    renderPane([source]);

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`move-folder-${folderId}`));

    await waitFor(() => {
      expect(screen.getByTestId('filter-present')).toBeInTheDocument();
    });
  });

  it('moves folder with all nested content preserved', async () => {
    const { source, folderId, nestedRequestId } = buildCollectionsWithFolders();
    const { adapter } = renderPane([source]);

    const moveSpy = vi.spyOn(adapter.storage, 'moveCollectionItem');

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`move-folder-${folderId}`));
    fireEvent.click(screen.getByTestId('confirm-child-path'));

    await waitFor(() => {
      expect(moveSpy).toHaveBeenCalledWith(
        'source.json',
        [],
        folderId,
        'source.json',
        ['child'],
        undefined
      );
    });

    // Verify nested structure is preserved in store
    const collection = useAppStateStore
      .getState()
      .collections.find((c) => c.filename === 'source.json');

    const childFolder = collection?.item.find((item) => item.name === 'child');
    expect(childFolder).toBeDefined();

    const movedFolder = (childFolder?.item as CollectionItem[])?.find((item) => item.name === 'Auth');
    expect(movedFolder).toBeDefined();
    expect(Array.isArray(movedFolder?.item)).toBe(true);
    expect((movedFolder?.item as CollectionItem[]).some((item) => item.id === nestedRequestId)).toBe(true);
  });
});
