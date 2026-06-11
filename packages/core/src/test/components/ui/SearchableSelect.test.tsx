import React, { useState } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchableSelect from '../../../components/ui/searchable-select';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const OPTIONS = [
  { label: 'Sample Collection', value: 'Sample Collection' },
  { label: 'Archive', value: 'Archive' },
];

function MoveModeCollectionHarness() {
  const [collectionName, setCollectionName] = useState('Sample Collection');
  const [isCollectionInput, setIsCollectionInput] = useState(false);

  return (
    <div>
      <SearchableSelect
        id="collection-search"
        name="Collection"
        options={OPTIONS}
        selectedValue={collectionName}
        setSelectedValue={setCollectionName}
        includeOptionToCreateNew
        onCreateNewOption={(isSelected) => {
          // Only reset on entering create mode; regular selections also fire
          // onCreateNewOption(false) and must keep the selected value.
          if (isSelected) {
            setCollectionName('');
          }
          setIsCollectionInput(isSelected);
        }}
      />

      {isCollectionInput && (
        <input
          aria-label="Collection Name"
          value={collectionName}
          onChange={(event) => setCollectionName(event.target.value)}
        />
      )}
    </div>
  );
}

describe('SearchableSelect', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('changes the selected value with a single click', async () => {
    const user = userEvent.setup();

    render(<MoveModeCollectionHarness />);

    expect(screen.getByRole('combobox')).toHaveTextContent('Sample Collection');

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Archive/i }));

    expect(screen.getByRole('combobox')).toHaveTextContent('Archive');
  });

  it('selects the highlighted option with Tab', async () => {
    const user = userEvent.setup();

    render(<MoveModeCollectionHarness />);

    await user.click(screen.getByRole('combobox'));
    await screen.findByRole('option', { name: /Archive/i });

    // Narrow the list so Archive is the highlighted option, then accept with Tab.
    await user.keyboard('Arch');
    await user.keyboard('{Tab}');

    expect(screen.getByRole('combobox')).toHaveTextContent('Archive');
  });

  it('keeps the value selected when the same option is clicked again', async () => {
    const user = userEvent.setup();

    render(<MoveModeCollectionHarness />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Sample Collection/i }));

    expect(screen.getByRole('combobox')).toHaveTextContent('Sample Collection');
  });

  it('clears move preselected value when switching to create mode and keeps input editable', async () => {
    const user = userEvent.setup();

    render(<MoveModeCollectionHarness />);

    expect(screen.getByRole('combobox')).toHaveTextContent('Sample Collection');

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('button', { name: /Create New Collection/i }));

    const collectionInput = screen.getByLabelText('Collection Name');
    expect(collectionInput).toHaveValue('');

    await user.type(collectionInput, 'New Move Destination');
    expect(collectionInput).toHaveValue('New Move Destination');
  });
});
