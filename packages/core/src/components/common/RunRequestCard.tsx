import React, { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, LoaderCircle, CheckCircle2, XCircle, Circle } from 'lucide-react';
import { CollectionRequest } from '../../types/collection';
import { getHttpMethodColor } from '../../utils/common';
import { Checkbox } from '../ui/checkbox';

// ==================== Types ====================

export type RunStatus = 'idle' | 'pending' | 'running' | 'success' | 'error';
export type ValidationStatus = 'idle' | 'pending' | 'pass' | 'fail';

export interface RunRequestData {
  id: string;
  name: string;
  method: string;
  url: string;
  request: CollectionRequest;
  folderPath: string[];
  // Run state
  runStatus: RunStatus;
  responseStatus?: number;
  responseTime?: number;
  validationStatus: ValidationStatus;
  // Response data
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  isResponseEncoded?: boolean;
  // Error info
  error?: string;
}

interface RunRequestCardProps {
  data: RunRequestData;
  isSelected?: boolean;
  onSelectionChange?: (id: string, selected: boolean) => void;
  showSelection?: boolean;
  onCardClick?: (id: string) => void;
}

// ==================== Helper Components ====================

const StatusIndicator: React.FC<{ status: RunStatus; responseStatus?: number; responseTime?: number }> = ({
  status,
  responseStatus,
  responseTime,
}) => {
  if (status === 'idle') {
    return <Circle className="h-4 w-4 text-slate-400" />;
  }

  if (status === 'pending') {
    return <Circle className="h-4 w-4 text-blue-400" />;
  }

  if (status === 'running') {
    return <LoaderCircle className="h-4 w-4 text-blue-500 animate-spin" />;
  }

  if (status === 'success' && responseStatus !== undefined) {
    const statusColor = responseStatus >= 200 && responseStatus < 300
      ? 'text-green-600'
      : responseStatus >= 400 && responseStatus < 500
        ? 'text-yellow-600'
        : responseStatus >= 500
          ? 'text-red-600'
          : 'text-slate-600';

    return (
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className={statusColor}>{responseStatus}</span>
        {responseTime !== undefined && (
          <span className="text-slate-500">{responseTime}ms</span>
        )}
      </div>
    );
  }

  if (status === 'error') {
    return <XCircle className="h-4 w-4 text-red-500" />;
  }

  return null;
};

const ValidationIndicator: React.FC<{ status: ValidationStatus }> = ({ status }) => {
  if (status === 'idle') {
    return null;
  }

  if (status === 'pending') {
    return <LoaderCircle className="h-4 w-4 text-blue-400 animate-spin" />;
  }

  if (status === 'pass') {
    return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  }

  if (status === 'fail') {
    return <XCircle className="h-4 w-4 text-red-500" />;
  }

  return null;
};

// ==================== Request Tabs Content ====================

const BASE_TABS = ['Response Headers', 'Response Body', 'Request Headers', 'Request Body', 'Validation'] as const;
type RequestCardTab = 'Error' | typeof BASE_TABS[number];

/**
 * Returns the list of tabs, with Error tab first if there's an error
 */
function getTabsForRequest(hasError: boolean): RequestCardTab[] {
  if (hasError) {
    return ['Error', ...BASE_TABS];
  }
  return [...BASE_TABS];
}

interface CardTabContentProps {
  activeTab: RequestCardTab;
  data: RunRequestData;
}

const CardTabContent: React.FC<CardTabContentProps> = ({ activeTab, data }) => {
  const renderHeaders = (headers: Record<string, string> | undefined) => {
    if (!headers || Object.keys(headers).length === 0) {
      return <div className="text-slate-500 text-sm italic">No headers</div>;
    }

    return (
      <div className="space-y-1">
        {Object.entries(headers).map(([key, value]) => (
          <div key={key} className="flex text-sm font-mono">
            <span className="text-blue-600 dark:text-blue-400 min-w-40">{key}:</span>
            <span className="text-slate-700 dark:text-slate-300 break-all">{value}</span>
          </div>
        ))}
      </div>
    );
  };

  switch (activeTab) {
    case 'Error':
      return (
        <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700 dark:text-red-300 break-all">
            {data.error || 'An unknown error occurred'}
          </div>
        </div>
      );

    case 'Request Headers': {
      const headers = data.request.header?.reduce((acc, h) => {
        if (!h.disabled) {
          acc[h.key] = h.value;
        }
        return acc;
      }, {} as Record<string, string>);
      return renderHeaders(headers);
    }

    case 'Request Body': {
      const body = data.request.body;
      if (!body || body.mode === 'none') {
        return <div className="text-slate-500 text-sm italic">No body</div>;
      }

      if (body.mode === 'raw' && body.raw) {
        return (
          <pre className="text-sm font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all bg-slate-50 dark:bg-slate-800 p-3 rounded-md">
            {body.raw}
          </pre>
        );
      }

      if (body.mode === 'urlencoded' && body.urlencoded) {
        return (
          <div className="space-y-1">
            {body.urlencoded.map((field, idx) => (
              <div key={idx} className="flex text-sm font-mono">
                <span className="text-blue-600 dark:text-blue-400 min-w-40">{field.key}:</span>
                <span className="text-slate-700 dark:text-slate-300">{field.value}</span>
              </div>
            ))}
          </div>
        );
      }

      if (body.mode === 'formdata' && body.formdata) {
        return (
          <div className="space-y-1">
            {body.formdata.map((field, idx) => (
              <div key={idx} className="flex text-sm font-mono">
                <span className="text-blue-600 dark:text-blue-400 min-w-40">{field.key}:</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {field.fieldType === 'file' 
                    ? `[File: ${field.value instanceof File ? field.value.name : 'Unknown'}]` 
                    : String(field.value || '')}
                </span>
              </div>
            ))}
          </div>
        );
      }

      return <div className="text-slate-500 text-sm italic">Unsupported body type</div>;
    }

    case 'Response Headers':
      return renderHeaders(data.responseHeaders);

    case 'Response Body': {
      if (!data.responseBody) {
        return <div className="text-slate-500 text-sm italic">No response body</div>;
      }
      
      let displayBody = data.responseBody;
      
      // Decode base64 if response is encoded
      if (data.isResponseEncoded && data.responseBody) {
        try {
          displayBody = atob(data.responseBody);
        } catch (e) {
          // Keep original if decoding fails
          displayBody = data.responseBody;
        }
      }
      
      return (
        <pre className="text-sm font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all bg-slate-50 dark:bg-slate-800 p-3 rounded-md max-h-64 overflow-auto">
          {displayBody}
        </pre>
      );
    }

    case 'Validation':
      if (data.validationStatus === 'idle') {
        return <div className="text-slate-500 text-sm italic">Validation not run yet</div>;
      }
      return (
        <div className="flex items-center gap-2">
          <ValidationIndicator status={data.validationStatus} />
          <span className={data.validationStatus === 'pass' ? 'text-green-600' : 'text-red-600'}>
            {data.validationStatus === 'pass' ? 'All validations passed' : 'Validation failed'}
          </span>
        </div>
      );

    default:
      return null;
  }
};

// ==================== Main Component ====================

const RunRequestCard: React.FC<RunRequestCardProps> = ({
  data,
  isSelected = false,
  onSelectionChange,
  showSelection = true,
  onCardClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<RequestCardTab>('Response Headers');

  const method = data.method.toUpperCase();
  const hasError = !!data.error;
  const tabs = getTabsForRequest(hasError);

  // Auto-switch to Error tab when error appears
  React.useEffect(() => {
    if (hasError && activeTab !== 'Error') {
      setActiveTab('Error');
    }
  }, [hasError, activeTab]);

  const handleHeaderClick = () => {
    setIsExpanded((prev) => !prev);
    onCardClick?.(data.id);
  };

  return (
    <div className={`border rounded-lg transition-colors ${
      isSelected 
        ? 'border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800' 
        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
    }`}>
      {/* Card Header */}
      <div 
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
        onClick={handleHeaderClick}
      >
        {/* Checkbox (optional) */}
        {showSelection && (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelectionChange?.(data.id, Boolean(checked))}
            />
          </div>
        )}

        {/* Expand/Collapse Icon */}
        {isExpanded ? (
          <ChevronDownIcon className="h-4 w-4 text-slate-500 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-slate-500 flex-shrink-0" />
        )}

        {/* Method Badge */}
        <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${getHttpMethodColor(method)}`}>
          {method}
        </span>

        {/* Request Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {data.folderPath.length > 0 && (
              <>
                {data.folderPath.map((folder, idx) => (
                  <React.Fragment key={idx}>
                    <span className="text-slate-400 dark:text-slate-500">{folder}</span>
                    <span className="text-slate-300 dark:text-slate-600 mx-1">/</span>
                  </React.Fragment>
                ))}
              </>
            )}
            <span className="text-slate-800 dark:text-slate-200">{data.name}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {data.url}
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusIndicator 
            status={data.runStatus} 
            responseStatus={data.responseStatus}
            responseTime={data.responseTime}
          />
          {data.runStatus !== 'running' && <ValidationIndicator status={data.validationStatus} />}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          {/* Tabs */}
          <div className="flex gap-0 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={`px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab
                    ? tab === 'Error'
                      ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-b-2 border-red-500'
                      : 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                    : tab === 'Error'
                      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-4 max-h-80 overflow-auto">
            <CardTabContent activeTab={activeTab} data={data} />
          </div>
        </div>
      )}
    </div>
  );
};

export default RunRequestCard;
