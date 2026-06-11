import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import RequestSaveWizard from '../../../components/common/RequestSaveWizard';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import type { Collection } from '../../../types/collection';

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
  PrimaryButton: ({ onClick, text, disabled }: { onClick: () => void; text: string; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>
      {text}
    </button>
  ),
}));

vi.mock('../../../components/ui/SecondaryButton', () => ({
  SecondaryButton: ({ onClick, text, disabled }: { onClick: () => void; text: string; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>
      {text}
    </button>
  ),
}));

vi.mock('../../../components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('../../../components/ui/label', () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

// The mock mirrors the real component's contract: a normal selection also
// notifies onCreateNewOption(false) — the wizard must not lose the selection
// when that happens (regression: move dialog wiped the destination).
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
  info: {
    waveId: 'wave-1',
    name: 'Sample Collection',
  },
  item: [
    {
      id: 'folder-1',
      name: 'Folder',
      item: [
        {
          id: 'folder-2',
          name: 'Subfolder',
          item: [],
        },
      ],
    },
    {
      id: 'folder-slash',
      name: 'a/b',
      item: [],
    },
  ],
};

const collectionWithoutFolders: Collection = {
  filename: 'flat.json',
  info: {
    waveId: 'wave-2',
    name: 'Flat Collection',
  },
  item: [
    {
      id: 'flat-request',
      name: 'Flat Request',
      request: {
        id: 'flat-request',
        name: 'Flat Request',
        method: 'GET',
        url: 'https://example.com/flat',
        header: [],
      },
    },
  ],
};

// Destination option indexes derived from the store collections above:
// 0: Sample Collection (root)
// 1: Sample Collection / Folder
// 2: Sample Collection / Folder / Subfolder
// 3: Sample Collection / a/b
// 4: Flat Collection (root)

beforeEach(() => {
  useAppStateStore.setState({
    collections: [collectionWithFolders, collectionWithoutFolders],
  });
});

describe('RequestSaveWizard', () => {
  it('shows save mode title and request-name field by default', () => {
    render(
      <RequestSaveWizard
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
      />
    );

    expect(screen.getByText('Save Request to Collection')).toBeInTheDocument();
    expect(screen.getByLabelText(/Request Name/i)).toBeInTheDocument();
    expect(screen.queryByText(/Current location:/i)).not.toBeInTheDocument();
  });

  it('lists collection roots and all nested folders as destinations', () => {
    render(
      <RequestSaveWizard
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
      />
    );

    const destinationSelect = screen.getByTestId('destination-select');
    expect(within(destinationSelect).getByText('Sample Collection')).toBeInTheDocument();
    expect(within(destinationSelect).getByText('Sample Collection / Folder')).toBeInTheDocument();
    expect(
      within(destinationSelect).getByText('Sample Collection / Folder / Subfolder')
    ).toBeInTheDocument();
    expect(within(destinationSelect).getByText('Sample Collection / a/b')).toBeInTheDocument();
    expect(within(destinationSelect).getByText('Flat Collection')).toBeInTheDocument();
  });

  it('shows move mode title and renders current location with collection + full path', () => {
    render(
      <RequestSaveWizard
        isOpen={true}
        mode="move"
        initialCollectionName="Sample Collection"
        sourceCollectionName="My Collection"
        currentPath={['Folder1', 'Sub']}
        initialRequestName="Get Users"
        onClose={() => {}}
        onSave={() => {}}
      />
    );

    expect(screen.getByText('Move Request to Collection')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Request Name/i)).not.toBeInTheDocument();
    expect(screen.getByText('Current location: My Collection / Folder1 / Sub')).toBeInTheDocument();
  });

  it('renders root location text in move mode when current path is empty', () => {
    render(
      <RequestSaveWizard
        isOpen={true}
        mode="move"
        initialCollectionName="Sample Collection"
        sourceCollectionName="My Collection"
        currentPath={[]}
        initialRequestName="Get Users"
        onClose={() => {}}
        onSave={() => {}}
      />
    );

    expect(screen.getByText('Current location: My Collection (root)')).toBeInTheDocument();
  });

  it('prefills the destination with the current location in move mode', () => {
    render(
      <RequestSaveWizard
        isOpen={true}
        mode="move"
        initialCollectionName="Sample Collection"
        sourceCollectionName="Sample Collection"
        currentPath={['Folder']}
        initialRequestName="Get Users"
        onClose={() => {}}
        onSave={() => {}}
      />
    );

    expect((screen.getByTestId('destination-select') as HTMLSelectElement).value).toBe('1');
  });

  it('submits move mode with initial request name', () => {
    const onSave = vi.fn();

    render(
      <RequestSaveWizard
        isOpen={true}
        mode="move"
        initialCollectionName="Sample Collection"
        sourceCollectionName="Sample Collection"
        currentPath={['Folder']}
        initialRequestName="Get Users"
        onClose={() => {}}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByText('Move'));

    expect(onSave).toHaveBeenCalledWith('Sample Collection', 'Get Users', ['Folder']);
  });

  it('keeps the destination after a single selection in move mode', () => {
    const onSave = vi.fn();

    render(
      <RequestSaveWizard
        isOpen={true}
        mode="move"
        initialCollectionName="Sample Collection"
        sourceCollectionName="Sample Collection"
        currentPath={['Folder']}
        initialRequestName="Get Users"
        onClose={() => {}}
        onSave={onSave}
      />
    );

    // One change to another collection root must stick, even though the
    // select also fires onCreateNewOption(false).
    fireEvent.change(screen.getByTestId('destination-select'), {
      target: { value: '4' },
    });

    expect((screen.getByTestId('destination-select') as HTMLSelectElement).value).toBe('4');

    fireEvent.click(screen.getByText('Move'));

    expect(onSave).toHaveBeenCalledWith('Flat Collection', 'Get Users', []);
  });

  it('submits save mode with a selected nested folder path', () => {
    const onSave = vi.fn();

    render(
      <RequestSaveWizard
        isOpen={true}
        onClose={() => {}}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText(/Request Name/i), {
      target: { value: 'Create User' },
    });
    fireEvent.change(screen.getByTestId('destination-select'), {
      target: { value: '2' },
    });

    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledWith('Sample Collection', 'Create User', ['Folder', 'Subfolder']);
  });

  it('uses delimiter-safe destination values for folder names containing slash', () => {
    const onSave = vi.fn();

    render(
      <RequestSaveWizard
        isOpen={true}
        onClose={() => {}}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText(/Request Name/i), {
      target: { value: 'Create User' },
    });
    fireEvent.change(screen.getByTestId('destination-select'), {
      target: { value: '3' },
    });

    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledWith('Sample Collection', 'Create User', ['a/b']);
  });

  it('disables save until a destination is chosen', () => {
    render(
      <RequestSaveWizard
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText(/Request Name/i), {
      target: { value: 'Create User' },
    });

    expect(screen.getByText('Save')).toBeDisabled();

    fireEvent.change(screen.getByTestId('destination-select'), {
      target: { value: '0' },
    });

    expect(screen.getByText('Save')).not.toBeDisabled();
  });

  it('saves to the root of a new collection created from the wizard', () => {
    const onSave = vi.fn();

    render(
      <RequestSaveWizard
        isOpen={true}
        onClose={() => {}}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText(/Request Name/i), {
      target: { value: 'Create User' },
    });
    fireEvent.click(screen.getByTestId('destination-select-create'));

    const newCollectionInput = screen.getByPlaceholderText('Enter new collection name...');
    fireEvent.change(newCollectionInput, {
      target: { value: 'Brand New API' },
    });

    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledWith('Brand New API', 'Create User', []);
  });
});
