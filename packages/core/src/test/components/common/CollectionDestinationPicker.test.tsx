import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import CollectionDestinationPicker from '../../../components/common/CollectionDestinationPicker';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import type { Collection } from '../../../types/collection';

vi.mock('../../../components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

// Mirror the contract the real SearchableSelect exposes, including the
// onCreateNewOption(false) call on every regular selection.
vi.mock('../../../components/ui/searchable-select', () => ({
  default: ({
    id,
    options,
    selectedValue,
    setSelectedValue,
    disabled,
    includeOptionToCreateNew,
    onCreateNewOption,
  }: {
    id: string;
    options: Array<{ label: string; value: string }>;
    selectedValue: string;
    setSelectedValue: (value: string) => void;
    disabled?: boolean;
    includeOptionToCreateNew?: boolean;
    onCreateNewOption?: (isSelected: boolean) => void;
  }) => (
    <div>
      <select
        id={id}
        data-testid={id}
        value={selectedValue}
        onChange={(event) => {
          setSelectedValue(event.target.value);
          onCreateNewOption?.(false);
        }}
        disabled={disabled}
      >
        <option value="">(none)</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {includeOptionToCreateNew && (
        <button data-testid={`${id}-create`} onClick={() => onCreateNewOption?.(true)}>
          create-new
        </button>
      )}
    </div>
  ),
}));

const collectionWithFolders: Collection = {
  filename: 'sample.json',
  info: { waveId: 'wave-1', name: 'Sample Collection' },
  item: [
    {
      id: 'folder-1',
      name: 'Folder',
      item: [{ id: 'sub-1', name: 'Subfolder', item: [] }],
    },
    { id: 'slash-folder', name: 'a/b', item: [] },
  ],
};

const flatCollection: Collection = {
  filename: 'flat.json',
  info: { waveId: 'wave-2', name: 'Flat Collection' },
  item: [],
};

// Destination option indexes:
// 0: Sample Collection (root)
// 1: Sample Collection / Folder
// 2: Sample Collection / Folder / Subfolder
// 3: Sample Collection / a/b
// 4: Flat Collection (root)

function makeControlledProps(overrides: Partial<React.ComponentProps<typeof CollectionDestinationPicker>> = {}) {
  let selected: React.ComponentProps<typeof CollectionDestinationPicker>['selected'] = null;
  let isCreatingNew = false;
  let newCollectionName = '';

  const onSelectedChange = vi.fn((dest) => { selected = dest; });
  const onIsCreatingNewChange = vi.fn((v: boolean) => { isCreatingNew = v; });
  const onNewCollectionNameChange = vi.fn((v: string) => { newCollectionName = v; });

  return {
    selected,
    onSelectedChange,
    isCreatingNew,
    onIsCreatingNewChange,
    newCollectionName,
    onNewCollectionNameChange,
    ...overrides,
  };
}

beforeEach(() => {
  useAppStateStore.setState({ collections: [collectionWithFolders, flatCollection] });
});

describe('CollectionDestinationPicker', () => {
  it('renders all collection roots and nested folders as selectable options', () => {
    render(<CollectionDestinationPicker {...makeControlledProps()} />);

    const select = screen.getByTestId('destination-select');
    expect(within(select).getByText('Sample Collection')).toBeInTheDocument();
    expect(within(select).getByText('Sample Collection / Folder')).toBeInTheDocument();
    expect(within(select).getByText('Sample Collection / Folder / Subfolder')).toBeInTheDocument();
    expect(within(select).getByText('Sample Collection / a/b')).toBeInTheDocument();
    expect(within(select).getByText('Flat Collection')).toBeInTheDocument();
  });

  it('preserves folder names containing "/" in option labels', () => {
    render(<CollectionDestinationPicker {...makeControlledProps()} />);
    const select = screen.getByTestId('destination-select');
    expect(within(select).getByText('Sample Collection / a/b')).toBeInTheDocument();
  });

  it('calls onSelectedChange with the correct collectionName and folderPath on selection', () => {
    const props = makeControlledProps();
    render(<CollectionDestinationPicker {...props} />);

    fireEvent.change(screen.getByTestId('destination-select'), { target: { value: '2' } });

    expect(props.onSelectedChange).toHaveBeenCalledWith({
      collectionName: 'Sample Collection',
      folderPath: ['Folder', 'Subfolder'],
    });
  });

  it('calls onSelectedChange with folderPath=[] for a collection root selection', () => {
    const props = makeControlledProps();
    render(<CollectionDestinationPicker {...props} />);

    fireEvent.change(screen.getByTestId('destination-select'), { target: { value: '4' } });

    expect(props.onSelectedChange).toHaveBeenCalledWith({
      collectionName: 'Flat Collection',
      folderPath: [],
    });
  });

  it('calls onIsCreatingNewChange(true) and onSelectedChange(null) when create-new is toggled on', () => {
    const props = makeControlledProps();
    render(<CollectionDestinationPicker {...props} />);

    fireEvent.click(screen.getByTestId('destination-select-create'));

    expect(props.onIsCreatingNewChange).toHaveBeenCalledWith(true);
    expect(props.onSelectedChange).toHaveBeenCalledWith(null);
  });

  it('shows new-collection name input when isCreatingNew is true', () => {
    const props = makeControlledProps({ isCreatingNew: true });
    render(<CollectionDestinationPicker {...props} />);

    expect(screen.getByPlaceholderText('Enter new collection name...')).toBeInTheDocument();
  });

  it('hides new-collection name input when isCreatingNew is false', () => {
    const props = makeControlledProps({ isCreatingNew: false });
    render(<CollectionDestinationPicker {...props} />);

    expect(screen.queryByPlaceholderText('Enter new collection name...')).not.toBeInTheDocument();
  });

  it('calls onNewCollectionNameChange when the user types in the new-name input', () => {
    const props = makeControlledProps({ isCreatingNew: true });
    render(<CollectionDestinationPicker {...props} />);

    fireEvent.change(screen.getByPlaceholderText('Enter new collection name...'), {
      target: { value: 'My API' },
    });

    expect(props.onNewCollectionNameChange).toHaveBeenCalledWith('My API');
  });

  it('hides destinations for which filterDestination returns false', () => {
    const filterDestination = vi.fn(
      (_filename: string, collectionName: string, folderPath: string[]) =>
        // hide Sample Collection root and its Folder child
        !(collectionName === 'Sample Collection' && folderPath.length === 0) &&
        !(collectionName === 'Sample Collection' && folderPath[0] === 'Folder' && folderPath.length === 1)
    );

    render(<CollectionDestinationPicker {...makeControlledProps({ filterDestination })} />);

    const select = screen.getByTestId('destination-select');
    expect(within(select).queryByText('Sample Collection')).not.toBeInTheDocument();
    expect(within(select).queryByText('Sample Collection / Folder')).not.toBeInTheDocument();
    // Deeper entries and other collections still visible
    expect(within(select).getByText('Sample Collection / Folder / Subfolder')).toBeInTheDocument();
    expect(within(select).getByText('Flat Collection')).toBeInTheDocument();
  });

  it('does not show create-new button when includeCreateNew is false', () => {
    render(<CollectionDestinationPicker {...makeControlledProps({ includeCreateNew: false })} />);
    expect(screen.queryByTestId('destination-select-create')).not.toBeInTheDocument();
  });

  it('uses a custom selectId when provided', () => {
    render(<CollectionDestinationPicker {...makeControlledProps({ selectId: 'my-picker' })} />);
    expect(screen.getByTestId('my-picker')).toBeInTheDocument();
  });
});
