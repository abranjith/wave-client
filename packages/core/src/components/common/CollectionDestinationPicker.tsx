import React, { useMemo } from 'react';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import SearchableSelect from '../ui/searchable-select';
import { Input } from '../ui/input';
import { getFolderPathOptions } from '../../utils/collectionParser';

/** A resolved destination inside a collection (controlled value). */
export interface SelectedDestination {
  collectionName: string;
  folderPath: string[];
}

export interface CollectionDestinationPickerProps {
  selected: SelectedDestination | null;
  onSelectedChange: (dest: SelectedDestination | null) => void;
  /** Whether the "Create new collection" name input is currently active (controlled). */
  isCreatingNew: boolean;
  onIsCreatingNewChange: (isCreating: boolean) => void;
  /** Controlled value of the new-collection name input. */
  newCollectionName: string;
  onNewCollectionNameChange: (name: string) => void;
  /** Show the "Create new collection" option. Default: true. */
  includeCreateNew?: boolean;
  /**
   * Return false to hide a destination entry.
   * Used for cycle prevention: a folder must not be movable into itself or its
   * descendants.
   */
  filterDestination?: (
    collectionFilename: string,
    collectionName: string,
    folderPath: string[]
  ) => boolean;
  /** Forwarded to the new-collection name Input for Enter-to-confirm. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** id attribute forwarded to the SearchableSelect. Defaults to "destination-select". */
  selectId?: string;
}

const pathsEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((s, i) => s === right[i]);

const CollectionDestinationPicker: React.FC<CollectionDestinationPickerProps> = ({
  selected,
  onSelectedChange,
  isCreatingNew,
  onIsCreatingNewChange,
  newCollectionName,
  onNewCollectionNameChange,
  includeCreateNew = true,
  filterDestination,
  onKeyDown,
  selectId = 'destination-select',
}) => {
  const collections = useAppStateStore((state) => state.collections);

  const destinationOptions = useMemo(() => {
    const options: Array<{
      collectionFilename: string;
      collectionName: string;
      folderPath: string[];
      label: string;
    }> = [];
    for (const collection of collections) {
      const collectionFilename = collection.filename ?? '';
      const collectionName = collection.info.name;
      for (const folderOption of getFolderPathOptions(collection)) {
        if (
          filterDestination &&
          !filterDestination(collectionFilename, collectionName, folderOption.path)
        ) {
          continue;
        }
        options.push({
          collectionFilename,
          collectionName,
          folderPath: folderOption.path,
          label:
            folderOption.path.length === 0
              ? collectionName
              : `${collectionName} / ${folderOption.displayPath}`,
        });
      }
    }
    return options;
  }, [collections, filterDestination]);

  const selectedIndex = useMemo(() => {
    if (!selected) return -1;
    return destinationOptions.findIndex(
      (opt) =>
        opt.collectionName === selected.collectionName &&
        pathsEqual(opt.folderPath, selected.folderPath)
    );
  }, [destinationOptions, selected]);

  return (
    <>
      <SearchableSelect
        id={selectId}
        name="Collection"
        placeholder="Select destination..."
        options={destinationOptions.map((opt, idx) => ({
          label: opt.label,
          // Index-based values so '/' inside folder names is never ambiguous.
          value: String(idx),
        }))}
        setSelectedValue={(value) => {
          const idx = Number.parseInt(value, 10);
          const opt = Number.isNaN(idx) ? undefined : destinationOptions[idx];
          onSelectedChange(
            opt ? { collectionName: opt.collectionName, folderPath: opt.folderPath } : null
          );
        }}
        selectedValue={selectedIndex >= 0 ? String(selectedIndex) : ''}
        includeOptionToCreateNew={includeCreateNew}
        onCreateNewOption={(isSelected) => {
          onIsCreatingNewChange(isSelected);
          if (isSelected) {
            onSelectedChange(null);
          }
        }}
      />
      {isCreatingNew && (
        <Input
          id="collection-name"
          type="text"
          placeholder="Enter new collection name..."
          value={newCollectionName}
          onChange={(e) => onNewCollectionNameChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full text-sm rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
        />
      )}
    </>
  );
};

export default CollectionDestinationPicker;
