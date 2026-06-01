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
    initialCollectionName,
    currentPath,
    onSave,
    onClose,
  }: {
    isOpen: boolean;
    mode?: 'save' | 'move';
    initialCollectionName?: string;
    currentPath?: string[];
    onSave: (collectionName: string, requestName: string, folderPath: string[]) => void;
    onClose: () => void;
  }) => {
    if (!isOpen) {
      return null;
    }

    return (
      <div data-testid="move-wizard" data-mode={mode}>
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
  }) => (
    <div>
      <div>{item.name}</div>
      {item.request && (
        <>
          <button data-testid={`move-${item.id}`} onClick={() => onMoveItem?.(item, itemPath)}>
            move
          </button>
          <button
            data-testid={`duplicate-${item.id}`}
            onClick={() => onDuplicateItem?.(item, itemPath)}
          >
            duplicate
          </button>
        </>
      )}
    </div>
  ),
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

    const saveSpy = vi.spyOn(adapter.storage, 'saveRequestToCollection');
    const deleteSpy = vi.spyOn(adapter.storage, 'deleteRequestFromCollection');

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`move-${requestId}`));
    expect(screen.getByTestId('move-wizard')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-same-path'));

    await waitFor(() => {
      expect(notificationLog.some((entry) => entry.type === 'error')).toBe(true);
    });

    expect(saveSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('allows move to a child path and calls save before delete', async () => {
    const { source, requestId } = buildCollections();
    const { adapter } = renderPane([source]);

    const saveSpy = vi.spyOn(adapter.storage, 'saveRequestToCollection');
    const deleteSpy = vi.spyOn(adapter.storage, 'deleteRequestFromCollection');

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`move-${requestId}`));
    fireEvent.click(screen.getByTestId('confirm-child-path'));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        'source.json',
        ['child'],
        expect.objectContaining({ id: requestId })
      );
    });

    expect(deleteSpy).toHaveBeenCalledWith('source.json', [], requestId);
    expect(saveSpy.mock.invocationCallOrder[0]).toBeLessThan(deleteSpy.mock.invocationCallOrder[0]);
  });

  it('moves across collections and updates both source and destination in store', async () => {
    const { source, other, requestId } = buildCollections();
    const { adapter } = renderPane([source, other]);

    const saveSpy = vi.spyOn(adapter.storage, 'saveRequestToCollection');
    const deleteSpy = vi.spyOn(adapter.storage, 'deleteRequestFromCollection');

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`move-${requestId}`));
    fireEvent.click(screen.getByTestId('confirm-other-collection'));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        'other.json',
        [],
        expect.objectContaining({ id: requestId })
      );
    });

    expect(deleteSpy).toHaveBeenCalledWith('source.json', [], requestId);

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

    const saveSpy = vi.spyOn(adapter.storage, 'saveRequestToCollection');
    const deleteSpy = vi.spyOn(adapter.storage, 'deleteRequestFromCollection');

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`move-${requestId}`));
    fireEvent.click(screen.getByTestId('confirm-new-collection'));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        'brand_new_api.json',
        [],
        expect.objectContaining({ id: requestId }),
        'Brand New API'
      );
    });

    expect(deleteSpy).toHaveBeenCalledWith('source.json', [], requestId);

    const sourceState = useAppStateStore
      .getState()
      .collections.find((collection) => collection.info.name === 'Source API');
    const destinationState = useAppStateStore
      .getState()
      .collections.find((collection) => collection.info.name === 'Brand New API');

    expect(sourceState?.item.some((item) => item.id === requestId)).toBe(false);
    expect(destinationState?.item.some((item) => item.id === requestId)).toBe(true);
  });

  it('aborts move when save fails and does not call delete', async () => {
    const { source, other, requestId } = buildCollections();
    const { adapter, notificationLog } = renderPane([source, other]);

    const saveSpy = vi
      .spyOn(adapter.storage, 'saveRequestToCollection')
      .mockResolvedValueOnce(err('save failed'));
    const deleteSpy = vi.spyOn(adapter.storage, 'deleteRequestFromCollection');

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`move-${requestId}`));
    fireEvent.click(screen.getByTestId('confirm-other-collection'));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalled();
    });

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(notificationLog.some((entry) => entry.type === 'error')).toBe(true);
  });

  it('reports delete failure after save and keeps source item to avoid silent loss', async () => {
    const { source, other, requestId } = buildCollections();
    const { adapter, notificationLog } = renderPane([source, other]);

    vi.spyOn(adapter.storage, 'deleteRequestFromCollection').mockResolvedValueOnce(err('delete failed'));

    fireEvent.click(screen.getByText('Source API'));
    fireEvent.click(screen.getByTestId(`move-${requestId}`));
    fireEvent.click(screen.getByTestId('confirm-other-collection'));

    await waitFor(() => {
      expect(notificationLog.some((entry) => entry.type === 'error')).toBe(true);
    });

    const sourceState = useAppStateStore
      .getState()
      .collections.find((collection) => collection.info.name === 'Source API');
    const destinationState = useAppStateStore
      .getState()
      .collections.find((collection) => collection.info.name === 'Other API');

    expect(sourceState?.item.some((item) => item.id === requestId)).toBe(true);
    expect(destinationState?.item.some((item) => item.id === requestId)).toBe(true);
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
});
