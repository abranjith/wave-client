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
import { type CollectionItem } from '../../types/collection';
import { validateItemName } from '../../utils/collectionParser';

interface FolderAddWizardProps {
  isOpen: boolean;
  onClose: () => void;
  /** Sibling items at the target path for uniqueness validation. */
  siblings: CollectionItem[];
  /** Called with the validated trimmed name. Returns an error string on failure, null on success. */
  onAdd: (name: string) => Promise<string | null>;
}

const FolderAddWizard: React.FC<FolderAddWizardProps> = ({
  isOpen,
  onClose,
  siblings,
  onAdd,
}) => {
  const [folderName, setFolderName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setError(null);
    const validation = validateItemName(folderName, siblings);
    if (!validation.isOk) {
      setError(validation.error);
      return;
    }
    setIsSaving(true);
    const saveError = await onAdd(validation.value);
    setIsSaving(false);
    if (saveError) {
      setError(saveError);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    setFolderName('');
    setError(null);
    setIsSaving(false);
    onClose();
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && folderName.trim() && !isSaving) {
      handleSave();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            New Folder
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
            Create a new folder to organise requests
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="folder-name">Folder Name</Label>
            <Input
              id="folder-name"
              type="text"
              placeholder="e.g., Auth, Users, v2"
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                setError(null);
              }}
              onKeyUp={handleKeyUp}
              disabled={isSaving}
              autoFocus
            />
          </div>

          {error && <Banner message={error} messageType="error" />}
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
            disabled={!folderName.trim() || isSaving}
            icon={<SaveIcon />}
            text={isSaving ? 'Saving...' : 'Save'}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FolderAddWizard;
