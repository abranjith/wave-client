/**
 * ArenaSettings — REMOVED
 *
 * Arena settings are now managed exclusively through the General Settings
 * (SettingsWizard) component.  This stub is kept only so stale imports
 * do not break the build — it renders nothing.
 *
 * @deprecated Use General Settings (SettingsWizard) instead.
 */

export interface ArenaSettingsProps {
  settings: any;
  providerSettings: any;
  onSave: (...args: any[]) => Promise<void>;
  onCancel: () => void;
}

export function ArenaSettings(_props: ArenaSettingsProps): null {
  return null;
}

export default ArenaSettings;
