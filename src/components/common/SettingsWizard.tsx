import React, { useState, useEffect } from 'react';
import { SaveIcon, XIcon, FolderOpenIcon, RotateCcwIcon, InfoIcon, AlertTriangleIcon, ShieldAlertIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { AppSettings, DEFAULT_SETTINGS } from '../../hooks/store/createSettingsSlice';

interface SettingsWizardProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onCancel: () => void;
  onBrowseDirectory?: () => void; // Optional callback for directory selection
  defaultSaveLocation?: string; // Default location from extension (homeDir/.waveclient)
}

const SettingsWizard: React.FC<SettingsWizardProps> = ({
  settings,
  onSave,
  onCancel,
  onBrowseDirectory,
  defaultSaveLocation = ''
}) => {
  // Form state
  const [saveFilesLocation, setSaveFilesLocation] = useState(settings.saveFilesLocation || defaultSaveLocation);
  const [maxRedirects, setMaxRedirects] = useState(settings.maxRedirects);
  const [requestTimeoutSeconds, setRequestTimeoutSeconds] = useState(settings.requestTimeoutSeconds);
  const [maxHistoryItems, setMaxHistoryItems] = useState(settings.maxHistoryItems);
  const [commonHeaderNames, setCommonHeaderNames] = useState((settings.commonHeaderNames || []).join(', '));
  const [encryptionKeyEnvVar, setEncryptionKeyEnvVar] = useState(settings.encryptionKeyEnvVar);
  const [ignoreCertificateValidation, setIgnoreCertificateValidation] = useState(settings.ignoreCertificateValidation);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sync state when settings prop changes
  useEffect(() => {
    setSaveFilesLocation(settings.saveFilesLocation || defaultSaveLocation);
    setMaxRedirects(settings.maxRedirects);
    setRequestTimeoutSeconds(settings.requestTimeoutSeconds);
    setMaxHistoryItems(settings.maxHistoryItems);
    setCommonHeaderNames((settings.commonHeaderNames || []).join(', '));
    setEncryptionKeyEnvVar(settings.encryptionKeyEnvVar);
    setIgnoreCertificateValidation(settings.ignoreCertificateValidation);
  }, [settings, defaultSaveLocation]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (maxRedirects < 0) {
      newErrors.maxRedirects = 'Redirects must be 0 or greater';
    }

    if (requestTimeoutSeconds < 0) {
      newErrors.requestTimeoutSeconds = 'Timeout must be 0 or greater';
    }

    if (maxHistoryItems < 1) {
      newErrors.maxHistoryItems = 'History items must be at least 1';
    }

    if (!encryptionKeyEnvVar.trim()) {
      newErrors.encryptionKeyEnvVar = 'Encryption key environment variable is required';
    } else if (!/^[A-Z_][A-Z0-9_]*$/i.test(encryptionKeyEnvVar.trim())) {
      newErrors.encryptionKeyEnvVar = 'Invalid environment variable name format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) return;

    // Parse comma-separated header names and filter out empty values
    const parsedHeaderNames = commonHeaderNames
      .split(',')
      .map(h => h.trim())
      .filter(h => h.length > 0);

    const updatedSettings: AppSettings = {
      saveFilesLocation: saveFilesLocation.trim(),
      maxRedirects,
      requestTimeoutSeconds,
      maxHistoryItems,
      commonHeaderNames: parsedHeaderNames,
      encryptionKeyEnvVar: encryptionKeyEnvVar.trim(),
      ignoreCertificateValidation,
    };

    onSave(updatedSettings);
  };

  const handleReset = () => {
    setSaveFilesLocation(defaultSaveLocation || DEFAULT_SETTINGS.saveFilesLocation);
    setMaxRedirects(DEFAULT_SETTINGS.maxRedirects);
    setRequestTimeoutSeconds(DEFAULT_SETTINGS.requestTimeoutSeconds);
    setMaxHistoryItems(DEFAULT_SETTINGS.maxHistoryItems);
    setCommonHeaderNames('');
    setEncryptionKeyEnvVar(DEFAULT_SETTINGS.encryptionKeyEnvVar);
    setIgnoreCertificateValidation(DEFAULT_SETTINGS.ignoreCertificateValidation);
    setErrors({});
  };

  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
      {/* General Settings Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b pb-2">
          General Settings
        </h3>
        
        <div>
          <Label htmlFor="saveFilesLocation">Data Storage Location</Label>
          <div className="flex gap-2 mt-1">
            <Input
              id="saveFilesLocation"
              value={saveFilesLocation}
              onChange={(e) => setSaveFilesLocation(e.target.value)}
              placeholder="Defaults to ~/.waveclient if left empty"
              className="flex-1"
            />
            {onBrowseDirectory && (
              <Button
                variant="outline"
                size="sm"
                onClick={onBrowseDirectory}
                title="Browse for directory"
              >
                <FolderOpenIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
          {errors.saveFilesLocation && (
            <p className="text-xs text-red-500 mt-1">{errors.saveFilesLocation}</p>
          )}
          <div className="flex items-start gap-2 mt-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
            <InfoIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Ensure you have read/write access to this location. This is where your collections, environments, and other data will be stored.
            </p>
          </div>
        </div>
      </div>

      {/* Request Settings Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b pb-2">
          Request Settings
        </h3>
        
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="maxRedirects">Max Redirects</Label>
            <Input
              id="maxRedirects"
              type="number"
              min={0}
              value={maxRedirects}
              onChange={(e) => setMaxRedirects(parseInt(e.target.value) || 0)}
              className="mt-1"
            />
            {errors.maxRedirects && (
              <p className="text-xs text-red-500 mt-1">{errors.maxRedirects}</p>
            )}
            <p className="text-xs text-slate-500 mt-1">HTTP redirects to follow (0 = none)</p>
          </div>

          <div>
            <Label htmlFor="requestTimeoutSeconds">Request Timeout (sec)</Label>
            <Input
              id="requestTimeoutSeconds"
              type="number"
              min={0}
              value={requestTimeoutSeconds}
              onChange={(e) => setRequestTimeoutSeconds(parseInt(e.target.value) || 0)}
              className="mt-1"
            />
            {errors.requestTimeoutSeconds && (
              <p className="text-xs text-red-500 mt-1">{errors.requestTimeoutSeconds}</p>
            )}
            <p className="text-xs text-slate-500 mt-1">Timeout in seconds (0 = none)</p>
          </div>

          <div>
            <Label htmlFor="maxHistoryItems">Max History Items</Label>
            <Input
              id="maxHistoryItems"
              type="number"
              min={1}
              max={100}
              value={maxHistoryItems}
              onChange={(e) => setMaxHistoryItems(parseInt(e.target.value) || 10)}
              className="mt-1"
            />
            {errors.maxHistoryItems && (
              <p className="text-xs text-red-500 mt-1">{errors.maxHistoryItems}</p>
            )}
            <p className="text-xs text-slate-500 mt-1">Requests to keep in history</p>
          </div>
        </div>

        <div>
          <Label htmlFor="commonHeaderNames">Common Header Names (optional)</Label>
          <Input
            id="commonHeaderNames"
            value={commonHeaderNames}
            onChange={(e) => setCommonHeaderNames(e.target.value)}
            placeholder="e.g., Authorization, X-API-Key, X-Request-ID"
            className="mt-1"
          />
          <p className="text-xs text-slate-500 mt-1">
            Comma-separated header names that will be suggested when adding headers to requests.
          </p>
        </div>
      </div>

      {/* Security Settings Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b pb-2">
          Security Settings
        </h3>
        
        <div>
          <Label htmlFor="encryptionKeyEnvVar">Encryption Key Environment Variable *</Label>
          <Input
            id="encryptionKeyEnvVar"
            value={encryptionKeyEnvVar}
            onChange={(e) => setEncryptionKeyEnvVar(e.target.value)}
            placeholder="WAVECLIENT_SECRET_KEY"
            className="mt-1"
          />
          {errors.encryptionKeyEnvVar && (
            <p className="text-xs text-red-500 mt-1">{errors.encryptionKeyEnvVar}</p>
          )}
          <div className="flex items-start gap-2 mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
            <AlertTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <strong>WARNING:</strong> Do not change this value once set, and never lose it! Changing or losing this key will result in permanent loss of all encrypted data (secrets, passwords, etc.). Make sure to back up this environment variable.
            </p>
          </div>
        </div>

        <div className="pt-2">
          <div className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-md">
            <div className="flex-1">
              <Label htmlFor="ignoreCertificateValidation" className="cursor-pointer">
                Ignore Certificate Validation
              </Label>
              <p className="text-xs text-slate-500 mt-1">
                Skip SSL/TLS certificate verification when making requests
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="ignoreCertificateValidation"
                checked={ignoreCertificateValidation}
                onChange={(e) => setIgnoreCertificateValidation(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
          
          {ignoreCertificateValidation && (
            <div className="flex items-start gap-2 mt-2 p-2 bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-800">
              <ShieldAlertIcon className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-300">
                <strong>SECURITY WARNING:</strong> Disabling certificate validation is highly NOT recommended for production use. Only enable this for testing purposes with self-signed certificates in development environments. This makes your connection vulnerable to man-in-the-middle attacks.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between pt-4 border-t sticky bottom-0 bg-white dark:bg-slate-900 pb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="text-slate-600 hover:text-slate-700"
          title="Reset to defaults"
        >
          <RotateCcwIcon className="h-4 w-4 mr-1" /> Reset
        </Button>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            className="text-green-600 hover:text-green-700 hover:border-green-300"
            title="Save settings"
          >
            Save <SaveIcon className="h-4 w-4 ml-1" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="text-red-600 hover:text-red-700 hover:border-red-300"
            title="Cancel"
          >
            Cancel <XIcon className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsWizard;
