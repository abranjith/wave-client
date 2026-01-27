import React, { useId } from 'react';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../ui/select';
import TextBody from './TextBody';
import BinaryBody from './BinaryBody';
import FormBody from './FormBody';
import MultiPartFormBody from './MultiPartFormBody';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { BodyMode } from '../../types/collection';

// Map between UI display names and BodyMode values
type DisplayLabel = 'No Body' | 'Raw' | 'File' | 'URL Encoded' | 'Form Data';

const DISPLAY_LABELS: DisplayLabel[] = [
  'No Body', 'Raw', 'File', 'URL Encoded', 'Form Data'
];

const displayToMode: Record<DisplayLabel, BodyMode> = {
  'No Body': 'none',
  'Raw': 'raw',
  'File': 'file',
  'URL Encoded': 'urlencoded',
  'Form Data': 'formdata'
};

const modeToDisplay: Record<BodyMode, DisplayLabel> = {
  'none': 'No Body',
  'raw': 'Raw',
  'file': 'File',
  'urlencoded': 'URL Encoded',
  'formdata': 'Form Data'
};

const RequestBody: React.FC = () => {
  const activeTab = useAppStateStore((state) => state.getActiveTab());
  const updateBodyMode = useAppStateStore((state) => state.updateBodyMode);
  const bodyMode: BodyMode = activeTab?.body?.mode || 'none';
  const bodyTypeSelectId = useId();

  const handleBodyTypeChange = (displayLabel: string) => {
    const mode = displayToMode[displayLabel as DisplayLabel] || 'none';
    updateBodyMode(mode);
  };

  const renderDropdown = () => (
    <Select value={modeToDisplay[bodyMode]} onValueChange={handleBodyTypeChange}>
      <SelectTrigger id={bodyTypeSelectId} className="w-auto max-w-full min-w-48 bg-white border-slate-300 text-slate-900 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700">
        <SelectValue placeholder="Select Type" />
      </SelectTrigger>
      <SelectContent>
        {DISPLAY_LABELS.map(label => (
          <SelectItem key={label} value={label} className="hover:bg-slate-100 dark:hover:bg-slate-700">
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Conditional Body Content - Takes remaining space */}
      <div className="flex-1 min-h-0">
        {bodyMode === 'raw' && (
          <TextBody dropdownElement={renderDropdown()} />
        )}

        {bodyMode === 'file' && (
          <BinaryBody dropdownElement={renderDropdown()} />
        )}

        {bodyMode === 'urlencoded' && (
          <FormBody dropdownElement={renderDropdown()} />
        )}

        {bodyMode === 'formdata' && (
          <MultiPartFormBody dropdownElement={renderDropdown()} />
        )}

        {bodyMode === 'none' && (
          <>
            <div className="flex-shrink-0 mb-4">{renderDropdown()}</div>
            <div className="p-8 text-center border-2 border-dashed rounded-lg bg-slate-50 dark:bg-slate-900/50">
              <p className="text-sm text-muted-foreground">No body will be sent with this request</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RequestBody;
