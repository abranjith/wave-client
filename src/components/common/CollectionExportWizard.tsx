import React, { useState } from 'react';
import { DownloadIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import SearchableSelect from '../ui/searchable-select';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import DescriptiveSelect from '../ui/select-description';

interface CollectionExportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onExportCollection: (collectionName: string) => void;
}

const CollectionExportWizard: React.FC<CollectionExportWizardProps> = ({
  isOpen,
  onClose,
  onExportCollection,
}) => {
  const [selectedCollection, setSelectedCollection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const collections = useAppStateStore((state) => state.collections);

  /**
   * Handles export action
   */
  const handleExport = async () => {
    if (!selectedCollection) {
      setError('Please select a collection to export');
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      // Call the onExportCollection callback with the selected collection name
      onExportCollection(selectedCollection);

      // Close the dialog
      handleClose();
    } catch (err: any) {
      setError(`Failed to export collection: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Handles dialog close
   */
  const handleClose = () => {
    setSelectedCollection('');
    setError(null);
    setIsExporting(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Export Collection
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
            Select a collection to export as a JSON file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Collection Selection Dropdown */}
          <div className="space-y-2">
            <Label htmlFor="collection-select" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Select Collection <span className="text-red-500">*</span>
            </Label>
            <SearchableSelect
              options={collections.map((collection) => ({
                label: collection.name,
                value: collection.name,
              }))}
              setSelectedValue={setSelectedCollection}
              selectedValue={selectedCollection}
            />
          </div>

          {/* Collection Info */}
          {selectedCollection && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">
                {selectedCollection}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                {(() => {
                  const collection = collections.find(c => c.name === selectedCollection);
                  if (!collection) return '';
                  const totalRequests = collection.requests.length + 
                    collection.folders.reduce((acc, folder) => acc + folder.requests.length, 0);
                  return `${collection.folders.length} folder${collection.folders.length !== 1 ? 's' : ''}, ${totalRequests} request${totalRequests !== 1 ? 's' : ''}`;
                })()}
              </p>
            </div>
          )}

          {/* No Collections Message */}
          {collections.length === 0 && (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No collections available to export
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                Create or import a collection first
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={!selectedCollection || isExporting || collections.length === 0}
          >
            <DownloadIcon className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CollectionExportWizard;
