import React, { useState, useId, useEffect } from 'react';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../ui/select';
import TextBody from './TextBody';
import BinaryBody from './BinaryBody';
import FormBody from './FormBody';
import MultiPartFormBody from './MultiPartFormBody';
import useAppStateStore from '../../hooks/store/useAppStateStore';

type BodyType = 'none' | 'text' | 'binary' | 'form' | 'multipart';

const RequestBody: React.FC = () => {
  const BODY_TYPES = [
  'No Body', 'Text', 'Binary', 'Form', 'Multipart Form'
  ];

  const updateBodyType = useAppStateStore((state) => state.updateCurrentBodyType);
  const currentBodyType = useAppStateStore((state) => state.body.currentBodyType);
  const bodyTypeSelectId = useId();
  

  const handleBodyTypeChange = (str: string) => {
    const typeMap: Record<string, BodyType> = {
      'No Body': 'none',
      'Text': 'text',
      'Binary': 'binary',
      'Form': 'form',
      'Multipart Form': 'multipart'
    };
    const newType = typeMap[str] || 'none';
    updateBodyType(newType);
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
    <Select value={getDisplayLabel(currentBodyType)} onValueChange={handleBodyTypeChange}>
      <SelectTrigger id={bodyTypeSelectId} className="w-auto max-w-full min-w-48 bg-white border-slate-300 text-slate-900 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700">
        <SelectValue placeholder="Select Type" />
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
        {currentBodyType === 'text' && (
          <TextBody dropdownElement={renderDropdown()} />
        )}

        {currentBodyType === 'binary' && (
          <BinaryBody dropdownElement={renderDropdown()} />
        )}

        {currentBodyType === 'form' && (
          <FormBody dropdownElement={renderDropdown()} />
        )}

        {currentBodyType === 'multipart' && (
          <MultiPartFormBody dropdownElement={renderDropdown()} />
        )}

        {currentBodyType === 'none' && (
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
