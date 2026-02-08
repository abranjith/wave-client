/**
 * Tests for the ArenaReferencesModal component.
 *
 * Covers:
 *  - Rendering the reference list with names, URLs, types, and default badges
 *  - Toggling a reference on/off
 *  - Adding a new user reference
 *  - Removing a user-added reference
 *  - Default references cannot be removed (no remove button)
 *  - Empty state message
 *  - Close via Done button, close via Escape key
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArenaReferencesModal } from '../../components/arena/ArenaReferencesModal';
import type { ArenaReference } from '../../config/arenaConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a default (built-in) reference fixture */
function makeDefaultRef(overrides?: Partial<ArenaReference>): ArenaReference {
  return {
    id: 'mdn',
    name: 'MDN Web Docs',
    url: 'https://developer.mozilla.org',
    description: 'Comprehensive web technology documentation',
    category: 'Documentation',
    type: 'web',
    isDefault: true,
    enabled: true,
    ...overrides,
  };
}

/** Build a user-added reference fixture */
function makeUserRef(overrides?: Partial<ArenaReference>): ArenaReference {
  return {
    id: 'user-custom-api',
    name: 'Custom API Docs',
    url: 'https://example.com/api',
    type: 'web',
    isDefault: false,
    enabled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArenaReferencesModal', () => {
  let onReferencesChange: ReturnType<typeof vi.fn<(references: ArenaReference[]) => void>>;
  let onClose: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    onReferencesChange = vi.fn<(references: ArenaReference[]) => void>();
    onClose = vi.fn<() => void>();
  });

  // ---- Rendering ----

  it('should render the header with the active/total count', () => {
    const refs = [makeDefaultRef(), makeUserRef({ enabled: false })];

    render(
      <ArenaReferencesModal
        references={refs}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('References')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 active')).toBeInTheDocument();
  });

  it('should show each reference name and URL', () => {
    const refs = [makeDefaultRef(), makeUserRef()];

    render(
      <ArenaReferencesModal
        references={refs}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('MDN Web Docs')).toBeInTheDocument();
    expect(screen.getByText('https://developer.mozilla.org')).toBeInTheDocument();
    expect(screen.getByText('Custom API Docs')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/api')).toBeInTheDocument();
  });

  it('should display "Default" badge only for built-in references', () => {
    const refs = [makeDefaultRef(), makeUserRef()];

    render(
      <ArenaReferencesModal
        references={refs}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    // Only one "Default" badge should appear (for the built-in ref)
    const badges = screen.getAllByText('Default');
    expect(badges).toHaveLength(1);
  });

  it('should show empty state when no references are provided', () => {
    render(
      <ArenaReferencesModal
        references={[]}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('No references configured.')).toBeInTheDocument();
  });

  it('should display type labels for each reference', () => {
    const refs = [
      makeDefaultRef({ type: 'web' }),
      makeUserRef({ type: 'document', id: 'doc-1', name: 'A Doc' }),
      makeUserRef({ type: 'mcp', id: 'mcp-1', name: 'An MCP Tool' }),
    ];

    render(
      <ArenaReferencesModal
        references={refs}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    // Type label badges (uppercase in the row)
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('Document')).toBeInTheDocument();
    expect(screen.getByText('MCP Tool')).toBeInTheDocument();
  });

  // ---- Toggle ----

  it('should call onReferencesChange with toggled enabled state', () => {
    const refs = [makeDefaultRef({ enabled: true })];

    render(
      <ArenaReferencesModal
        references={refs}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Toggle MDN Web Docs' });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);

    expect(onReferencesChange).toHaveBeenCalledOnce();
    const updatedRefs = onReferencesChange.mock.calls[0][0] as ArenaReference[];
    expect(updatedRefs[0].enabled).toBe(false);
  });

  // ---- Remove ----

  it('should show remove button only for user-added references', () => {
    const refs = [makeDefaultRef(), makeUserRef()];

    render(
      <ArenaReferencesModal
        references={refs}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    // Only the user ref should have a remove button
    const removeButtons = screen.getAllByTitle('Remove reference');
    expect(removeButtons).toHaveLength(1);
  });

  it('should remove a user-added reference when remove button is clicked', () => {
    const refs = [makeDefaultRef(), makeUserRef()];

    render(
      <ArenaReferencesModal
        references={refs}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    const removeBtn = screen.getByTitle('Remove reference');
    fireEvent.click(removeBtn);

    expect(onReferencesChange).toHaveBeenCalledOnce();
    const updatedRefs = onReferencesChange.mock.calls[0][0] as ArenaReference[];
    // Only the default ref should remain
    expect(updatedRefs).toHaveLength(1);
    expect(updatedRefs[0].id).toBe('mdn');
  });

  // ---- Add ----

  it('should show the add form when "Add Reference" is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ArenaReferencesModal
        references={[]}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByText('Add Reference'));

    // Form fields should be visible
    expect(screen.getByPlaceholderText('Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://...')).toBeInTheDocument();
  });

  it('should add a new user reference when the form is submitted', async () => {
    const user = userEvent.setup();

    render(
      <ArenaReferencesModal
        references={[makeDefaultRef()]}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    // Open add form
    await user.click(screen.getByText('Add Reference'));

    // Fill in name and URL
    await user.type(screen.getByPlaceholderText('Name'), 'My API');
    await user.type(screen.getByPlaceholderText('https://...'), 'https://myapi.dev');

    // Submit
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onReferencesChange).toHaveBeenCalledOnce();
    const updatedRefs = onReferencesChange.mock.calls[0][0] as ArenaReference[];
    expect(updatedRefs).toHaveLength(2); // default + new
    const newRef = updatedRefs[1];
    expect(newRef.name).toBe('My API');
    expect(newRef.url).toBe('https://myapi.dev');
    expect(newRef.isDefault).toBe(false);
    expect(newRef.enabled).toBe(true);
  });

  it('should not add a reference when name or URL is empty', async () => {
    const user = userEvent.setup();

    render(
      <ArenaReferencesModal
        references={[]}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByText('Add Reference'));

    // Click Add without filling in fields
    const addBtn = screen.getByRole('button', { name: 'Add' });
    expect(addBtn).toBeDisabled();

    // Fill only name
    await user.type(screen.getByPlaceholderText('Name'), 'Partial');
    expect(addBtn).toBeDisabled();

    expect(onReferencesChange).not.toHaveBeenCalled();
  });

  it('should hide the add form when Cancel is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ArenaReferencesModal
        references={[]}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByText('Add Reference'));
    expect(screen.getByPlaceholderText('Name')).toBeInTheDocument();

    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Name')).not.toBeInTheDocument();
  });

  // ---- Close ----

  it('should call onClose when Done button is clicked', () => {
    render(
      <ArenaReferencesModal
        references={[]}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText('Done'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('should call onClose when Escape key is pressed', () => {
    render(
      <ArenaReferencesModal
        references={[]}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('should call onClose when the X close button is clicked', () => {
    render(
      <ArenaReferencesModal
        references={[]}
        onReferencesChange={onReferencesChange}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
