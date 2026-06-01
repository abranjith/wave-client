import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

vi.mock('../../../components/ui/searchable-select', () => ({
  default: ({
    id,
    options,
    selectedValue,
    setSelectedValue,
    includeOptionToCreateNew,
    onCreateNewOption,
  }: {
    id: string;
    options: Array<{ label: string; value: string }>;
    selectedValue: string;
    setSelectedValue: (value: string) => void;
    includeOptionToCreateNew?: boolean;
    onCreateNewOption?: (isSelected: boolean) => void;
  }) => (
    <div>
      <select
        id={id}
        data-testid={id}
        value={selectedValue}
        onChange={(event) => setSelectedValue(event.target.value)}
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
  ],
};

beforeEach(() => {
  useAppStateStore.setState({
    collections: [collectionWithFolders],
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
  });

  it('shows move mode title and hides request-name field', () => {
    render(
      <RequestSaveWizard
        isOpen={true}
        mode="move"
        initialCollectionName="Sample Collection"
        currentPath={['Folder']}
        initialRequestName="Get Users"
        onClose={() => {}}
        onSave={() => {}}
      />
    );

    expect(screen.getByText('Move Request to Collection')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Request Name/i)).not.toBeInTheDocument();
    expect(screen.getByText('Current path: Folder')).toBeInTheDocument();
  });

  it('submits move mode with initial request name', () => {
    const onSave = vi.fn();

    render(
      <RequestSaveWizard
        isOpen={true}
        mode="move"
        initialCollectionName="Sample Collection"
        currentPath={['Folder']}
        initialRequestName="Get Users"
        onClose={() => {}}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByText('Move'));

    expect(onSave).toHaveBeenCalledWith('Sample Collection', 'Get Users', ['Folder']);
  });

  it('submits save mode with selected folder path', () => {
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
    fireEvent.change(screen.getByTestId('collection-search'), {
      target: { value: 'Sample Collection' },
    });

    const folderSelect = screen.getByTestId('folder-path');
    fireEvent.change(folderSelect, {
      target: { value: 'Folder/Subfolder' },
    });

    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledWith('Sample Collection', 'Create User', ['Folder', 'Subfolder']);
  });
});
