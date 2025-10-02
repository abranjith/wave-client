import React, { useState, useId } from 'react';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../ui/select';
import TextBody from './TextBody';
import { Label } from '../ui/label';
import { SelectNative } from '../ui/select-native';

type BodyType = 'none' | 'text' | 'binary' | 'form' | 'multipart';

const RequestBody: React.FC = () => {
  const BODY_TYPES = [
  'No Body', 'Text', 'Binary', 'Form', 'Multipart Form'
];
  const [selectedBodyType, setSelectedBodyType] = useState<BodyType>('none');
  const bodyTypeSelectId = useId();

  const handleBodyTypeChange = (str: string) => {
    const typeMap: Record<string, BodyType> = {
      'No Body': 'none',
      'Text': 'text',
      'Binary': 'binary',
      'Form': 'form',
      'Multipart Form': 'multipart'
    };
    setSelectedBodyType(typeMap[str] || 'none');
  };

  // Convert body type to display label
  const getDisplayLabel = (type: BodyType): string => {
    const labelMap: Record<BodyType, string> = {
      'none': 'No Body',
      'text': 'Text',
      'binary': 'Binary',
      'form': 'Form',
      'multipart': 'Multipart Form'
    };
    return labelMap[type];
  };

  const renderDropdown = () => (
    <Select value={getDisplayLabel(selectedBodyType)} onValueChange={handleBodyTypeChange}>
      <SelectTrigger id={bodyTypeSelectId} className="w-auto max-w-full min-w-48 bg-white border-slate-300 text-slate-900 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700">
        <SelectValue placeholder="Select type" />
      </SelectTrigger>
      <SelectContent>
        {BODY_TYPES.map(m => (
          <SelectItem key={m} value={m} className="hover:bg-slate-100 dark:hover:bg-slate-700">
            {m}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Conditional Body Content - Takes remaining space */}
      <div className="flex-1 overflow-auto min-h-0">
        {selectedBodyType === 'text' && (
          <TextBody dropdownElement={renderDropdown()} />
        )}
        
        {selectedBodyType === 'binary' && (
          <>
            <div className="flex-shrink-0 mb-4">{renderDropdown()}</div>
            <div className="p-8 text-center border-2 border-dashed rounded-lg bg-slate-50 dark:bg-slate-900/50">
              <p className="text-sm text-muted-foreground">Binary body support coming soon...</p>
            </div>
          </>
        )}
        
        {selectedBodyType === 'form' && (
          <>
            <div className="flex-shrink-0 mb-4">{renderDropdown()}</div>
            <div className="p-8 text-center border-2 border-dashed rounded-lg bg-slate-50 dark:bg-slate-900/50">
              <p className="text-sm text-muted-foreground">Form body support coming soon...</p>
            </div>
          </>
        )}
        
        {selectedBodyType === 'multipart' && (
          <>
            <div className="flex-shrink-0 mb-4">{renderDropdown()}</div>
            <div className="p-8 text-center border-2 border-dashed rounded-lg bg-slate-50 dark:bg-slate-900/50">
              <p className="text-sm text-muted-foreground">Multipart form body support coming soon...</p>
            </div>
          </>
        )}

        {selectedBodyType === 'none' && (
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
