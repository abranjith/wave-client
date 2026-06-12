import React, { useState } from 'react';
import { XIcon, SaveIcon } from 'lucide-react';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import Banner from '../ui/banner';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface CollectionAddWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCollection: (name: string) => Promise<{ success: boolean; error?: string }>;
}

const CollectionAddWizard: React.FC<CollectionAddWizardProps> = ({
  isOpen,
  onClose,
  onAddCollection,
}) => {
  const [collectionName, setCollectionName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const validateCollectionName = (name: string): { isValid: boolean; error?: string } => {
    if (!name.trim()) {
      return { isValid: false, error: 'Collection name cannot be empty' };
    }
    return { isValid: true };
  };

  const handleSave = async () => {
    setError(null);

    const validation = validateCollectionName(collectionName);
    if (!validation.isValid) {
      setError(validation.error || 'Invalid collection name');
      return;
    }

    setIsSaving(true);
    try {
      const result = await onAddCollection(collectionName.trim());
      if (result.success) {
        handleClose();
      } else {
        setError(result.error || 'Failed to add collection');
      }
    } catch (err: any) {
      setError(`Failed to add collection: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setCollectionName('');
    setError(null);
    setIsSaving(false);
    onClose();
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && collectionName.trim() && !isSaving) {
      handleSave();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Add Collection
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
            Create a new empty collection and save it to your collections directory
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="collection-name">Collection Name</Label>
            <Input
              id="collection-name"
              type="text"
              placeholder="e.g., My API"
              value={collectionName}
              onChange={(e) => {
                setCollectionName(e.target.value);
                setError(null);
              }}
              onKeyUp={handleKeyUp}
              disabled={isSaving}
              autoFocus
            />
          </div>

          {error && (
            <Banner
              message={error}
              messageType="error"
            />
          )}
        </div>

        <DialogFooter>
          <SecondaryButton
            onClick={handleClose}
            disabled={isSaving}
            icon={<XIcon />}
            text="Cancel"
          />
          <PrimaryButton
            onClick={handleSave}
            disabled={!collectionName.trim() || isSaving}
            icon={<SaveIcon />}
            text={isSaving ? 'Saving...' : 'Save'}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CollectionAddWizard;