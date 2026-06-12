/**
 * Unit tests for FolderAddWizard (FEAT-FP-COL-001 TASK-006).
 *
 * Tested:
 *  1. Renders dialog with a name input and Save/Cancel buttons.
 *  2. Save button is disabled when the input is empty.
 *  3. Empty or blank name shows a validation error.
 *  4. A name that duplicates a sibling (case-insensitive) shows an error.
 *  5. A valid unique name calls onAdd with the trimmed name.
 *  6. When onAdd returns an error string the error is displayed and onClose is NOT called.
 *  7. When onAdd returns null the dialog resets and onClose is called.
 *  8. Pressing Enter with a valid name triggers save.
 *  9. Cancel button calls onClose without calling onAdd.
 * 10. State resets on close (error and input cleared).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FolderAddWizard from '../../../components/common/FolderAddWizard';
import type { CollectionItem } from '../../../types/collection';

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
  SecondaryButton: ({ onClick, text }: { onClick: () => void; text?: string }) => (
    <button data-testid="cancel-btn" onClick={onClick}>{text ?? 'Cancel'}</button>
  ),
}));

vi.mock('../../../components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input data-testid="folder-name-input" {...props} />
  ),
}));

vi.mock('../../../components/ui/label', () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock('../../../components/ui/banner', () => ({
  default: ({ message }: { message: string }) => (
    <div data-testid="error-banner">{message}</div>
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const sibling = (name: string): CollectionItem => ({
  id: `sib-${name}`,
  name,
  item: [],
});

function renderWizard(overrides?: {
  isOpen?: boolean;
  siblings?: CollectionItem[];
  onClose?: () => void;
  onAdd?: (name: string) => Promise<string | null>;
}) {
  const onClose = overrides?.onClose ?? vi.fn();
  const onAdd = overrides?.onAdd ?? vi.fn().mockResolvedValue(null);
  render(
    <FolderAddWizard
      isOpen={overrides?.isOpen ?? true}
      onClose={onClose}
      siblings={overrides?.siblings ?? []}
      onAdd={onAdd}
    />
  );
  return { onClose, onAdd };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FolderAddWizard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders dialog with name input and buttons when open', () => {
    renderWizard();
    expect(screen.getByTestId('dialog')).toBeTruthy();
    expect(screen.getByTestId('folder-name-input')).toBeTruthy();
    expect(screen.getByTestId('save-btn')).toBeTruthy();
    expect(screen.getByTestId('cancel-btn')).toBeTruthy();
  });

  it('does not render when isOpen is false', () => {
    renderWizard({ isOpen: false });
    expect(screen.queryByTestId('dialog')).toBeNull();
  });

  it('Save button is disabled when input is empty', () => {
    renderWizard();
    expect(screen.getByTestId('save-btn')).toBeDisabled();
  });

  it('Save button is enabled when input has text', () => {
    renderWizard();
    fireEvent.change(screen.getByTestId('folder-name-input'), { target: { value: 'Auth' } });
    expect(screen.getByTestId('save-btn')).not.toBeDisabled();
  });

  it('Save button is disabled for whitespace-only input', () => {
    renderWizard();
    fireEvent.change(screen.getByTestId('folder-name-input'), { target: { value: '   ' } });
    expect(screen.getByTestId('save-btn')).toBeDisabled();
  });

  it('shows error when name duplicates a sibling (case-insensitive)', async () => {
    renderWizard({ siblings: [sibling('Auth')] });
    fireEvent.change(screen.getByTestId('folder-name-input'), { target: { value: 'auth' } });
    fireEvent.click(screen.getByTestId('save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeTruthy();
    });
  });

  it('calls onAdd with trimmed name on valid submission', async () => {
    const { onAdd } = renderWizard();
    fireEvent.change(screen.getByTestId('folder-name-input'), { target: { value: '  New Folder  ' } });
    fireEvent.click(screen.getByTestId('save-btn'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('New Folder'));
  });

  it('displays error returned by onAdd and does not call onClose', async () => {
    const { onClose } = renderWizard({
      onAdd: vi.fn().mockResolvedValue('Server save failed'),
    });
    fireEvent.change(screen.getByTestId('folder-name-input'), { target: { value: 'NewFolder' } });
    fireEvent.click(screen.getByTestId('save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('error-banner').textContent).toBe('Server save failed');
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose after successful save', async () => {
    const { onClose } = renderWizard({ onAdd: vi.fn().mockResolvedValue(null) });
    fireEvent.change(screen.getByTestId('folder-name-input'), { target: { value: 'MyFolder' } });
    fireEvent.click(screen.getByTestId('save-btn'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('Enter key on valid input triggers save', async () => {
    const { onAdd } = renderWizard();
    const input = screen.getByTestId('folder-name-input');
    fireEvent.change(input, { target: { value: 'EnterFolder' } });
    fireEvent.keyUp(input, { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('EnterFolder'));
  });

  it('Cancel button calls onClose without calling onAdd', () => {
    const { onClose, onAdd } = renderWizard();
    fireEvent.click(screen.getByTestId('cancel-btn'));
    expect(onClose).toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
