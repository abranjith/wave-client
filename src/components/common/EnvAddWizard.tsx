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

interface EnvAddWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEnvironment: (name: string) => { success: boolean; error?: string };
}

const EnvAddWizard: React.FC<EnvAddWizardProps> = ({
  isOpen,
  onClose,
  onAddEnvironment,
}) => {
  const [environmentName, setEnvironmentName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Validates environment name:
   * - Must have at least one non-whitespace character
   * - Only allows alphanumeric, hyphens, dots, and underscores
   */
  const validateEnvironmentName = (name: string): { isValid: boolean; error?: string } => {
    // Check for non-whitespace content
    if (!name.trim()) {
      return { isValid: false, error: 'Environment name cannot be empty' };
    }

    // Check for special characters (only allow a-z, A-Z, 0-9, -, ., _)
    const validNamePattern = /^[a-zA-Z0-9\-._\s]+$/;
    if (!validNamePattern.test(name)) {
      return { 
        isValid: false, 
        error: 'Environment name can only contain letters, numbers, hyphens, dots, and underscores' 
      };
    }

    return { isValid: true };
  };

  /**
   * Handles save action
   */
  const handleSave = () => {
    setError(null);

    // Validate name
    const validation = validateEnvironmentName(environmentName);
    if (!validation.isValid) {
      setError(validation.error || 'Invalid environment name');
      return;
    }

    setIsSaving(true);

    try {
      // Attempt to add environment
      const result = onAddEnvironment(environmentName.trim());

      if (result.success) {
        // Success - close dialog
        handleClose();
      } else {
        // Show error from store
        setError(result.error || 'Failed to add environment');
      }
    } catch (err: any) {
      setError(`Failed to add environment: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Handles dialog close
   */
  const handleClose = () => {
    setEnvironmentName('');
    setError(null);
    setIsSaving(false);
    onClose();
  };

  /**
   * Handles Enter key press in input field
   */
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && environmentName.trim() && !isSaving) {
      handleSave();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Add Environment
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
            Create a new environment to manage variables across requests
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Environment Name Input */}
          <div className="space-y-2">
            <Label htmlFor="env-name">
              Environment Name
            </Label>
            <Input
              id="env-name"
              type="text"
              placeholder="e.g., development, staging, production"
              value={environmentName}
              onChange={(e) => {
                setEnvironmentName(e.target.value);
                setError(null); // Clear error on change
              }}
              onKeyUp={handleKeyPress}
              disabled={isSaving}
              autoFocus
            />
          </div>

          {/* Helper Text */}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Only letters, numbers, hyphens, dots, and underscores are allowed
          </p>

          {/* Error Message */}
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
            colorTheme="warning"
            icon={<XIcon />}
            text="Cancel"
          />
          <PrimaryButton
            onClick={handleSave}
            disabled={!environmentName.trim() || isSaving}
            colorTheme="main"
            icon={<SaveIcon />}
            text={isSaving ? 'Saving...' : 'Save'}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EnvAddWizard;
