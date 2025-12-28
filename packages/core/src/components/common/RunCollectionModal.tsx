import React, { useState, useMemo, useCallback, useId, useRef, useEffect } from 'react';
import { PlayIcon, StopCircleIcon, ChevronDownIcon, ChevronRightIcon, SearchIcon } from 'lucide-react';
import { CollectionItem, isRequest } from '../../types/collection';
import { urlToString } from '../../utils/collectionParser';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import RunRequestCard, { RunRequestData } from './RunRequestCard';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { useCollectionRunner, RunRequestItem, RunStatus, ValidationStatus } from '../../hooks/useCollectionRunner';
import { RequestValidation, StatusValidationRule } from '../../types/validation';

// ==================== Types ====================

interface RunCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  collectionName: string;
  items: CollectionItem[];
  itemPath?: string[];
}

interface RunSettings {
  concurrentCalls: number;
  delayBetweenCalls: number;
}

interface RunMetrics {
  totalRequests: number;
  passed: number;
  failed: number;
  averageTime: number;
}

// ==================== Helper Functions ====================

/**
 * Default validation rule: HTTP status is success (2xx)
 */
const DEFAULT_STATUS_SUCCESS_RULE: StatusValidationRule = {
  id: 'default-status-success',
  name: 'Status is Success',
  description: 'Validates that HTTP response status is 2xx',
  enabled: true,
  category: 'status',
  operator: 'is_success',
  value: 200, // Not used for is_success, but required by type
};

/**
 * Default validation configuration using status success rule
 */
const DEFAULT_VALIDATION: RequestValidation = {
  enabled: true,
  rules: [{ rule: DEFAULT_STATUS_SUCCESS_RULE }],
};

/**
 * Recursively flattens all requests from collection items
 */
function flattenRequests(
  items: CollectionItem[],
  parentPath: string[] = []
): RunRequestItem[] {
  const requests: RunRequestItem[] = [];

  for (const item of items) {
    if (isRequest(item) && item.request) {
      // Use request validation if defined and enabled, otherwise use default
      const validation = item.request.validation?.enabled 
        ? item.request.validation 
        : DEFAULT_VALIDATION;

      requests.push({
        id: item.id,
        name: item.name,
        method: item.request.method || 'GET',
        url: urlToString(item.request.url),
        request: item.request,
        folderPath: parentPath,
        validation,
      });
    }

    if (item.item && item.item.length > 0) {
      requests.push(...flattenRequests(item.item, [...parentPath, item.name]));
    }
  }

  return requests;
}

/**
 * Converts RunRequestItem to RunRequestData for display
 */
function toRunRequestData(
  item: RunRequestItem,
  runStatus: RunStatus = 'idle',
  validationStatus: ValidationStatus = 'idle',
  responseStatus?: number,
  responseTime?: number,
  error?: string
): RunRequestData {
  return {
    id: item.id,
    name: item.name,
    method: item.method,
    url: item.url,
    request: item.request!,
    folderPath: item.folderPath,
    runStatus,
    validationStatus,
    responseStatus,
    responseTime,
    error,
  };
}

// ==================== Sub Components ====================

interface RunSettingsSectionProps {
  settings: RunSettings;
  onSettingsChange: (settings: RunSettings) => void;
}

const RunSettingsSection: React.FC<RunSettingsSectionProps> = ({ settings, onSettingsChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const concurrentId = useId();
  const delayId = useId();

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDownIcon className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-slate-500" />
        )}
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Run Settings</span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-200 dark:border-slate-700">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={concurrentId} className="text-sm text-slate-600 dark:text-slate-400">
                Concurrent Requests
              </Label>
              <Input
                id={concurrentId}
                type="number"
                min={1}
                max={10}
                value={settings.concurrentCalls}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  concurrentCalls: Math.max(1, Math.min(10, parseInt(e.target.value) || 1))
                })}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={delayId} className="text-sm text-slate-600 dark:text-slate-400">
                Delay Between Calls (ms)
              </Label>
              <Input
                id={delayId}
                type="number"
                min={0}
                max={10000}
                step={100}
                value={settings.delayBetweenCalls}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  delayBetweenCalls: Math.max(0, parseInt(e.target.value) || 0)
                })}
                className="w-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface RunMetricsSectionProps {
  metrics: RunMetrics;
}

const RunMetricsSection: React.FC<RunMetricsSectionProps> = ({ metrics }) => {
  return (
    <div className="flex items-center gap-6 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="text-center">
        <div className="text-lg font-semibold text-slate-800 dark:text-slate-200">{metrics.totalRequests}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Total</div>
      </div>
      <div className="h-8 w-px bg-slate-300 dark:bg-slate-600" />
      <div className="text-center">
        <div className="text-lg font-semibold text-green-600">{metrics.passed}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Passed</div>
      </div>
      <div className="h-8 w-px bg-slate-300 dark:bg-slate-600" />
      <div className="text-center">
        <div className="text-lg font-semibold text-red-600">{metrics.failed}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Failed</div>
      </div>
      <div className="h-8 w-px bg-slate-300 dark:bg-slate-600" />
      <div className="text-center">
        <div className="text-lg font-semibold text-blue-600">
          {metrics.averageTime > 0 ? `${metrics.averageTime}ms` : '-'}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Avg Time</div>
      </div>
    </div>
  );
};

// ==================== Main Component ====================

const RunCollectionModal: React.FC<RunCollectionModalProps> = ({
  isOpen,
  onClose,
  collectionName,
  items,
  itemPath = [],
}) => {
  // Global store
  const environments = useAppStateStore((state) => state.environments);
  const auths = useAppStateStore((state) => state.auths);

  // Collection runner hook
  const runner = useCollectionRunner({
    environments,
    auths,
  });

  // Local state
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null);
  const [selectedAuthId, setSelectedAuthId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [settings, setSettings] = useState<RunSettings>({
    concurrentCalls: 1,
    delayBetweenCalls: 0,
  });
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);

  // IDs for accessibility
  const environmentSelectId = useId();
  const authSelectId = useId();
  const searchInputId = useId();

  // Flatten all requests
  const allRequests = useMemo(() => {
    return flattenRequests(items);
  }, [items]);

  // Initialize selection and reset runner when modal opens
  React.useEffect(() => {
    if (isOpen && !isInitialized) {
      setSelectedRequestIds(new Set(allRequests.map(r => r.id)));
      runner.resetResults();
      setIsInitialized(true);
    }
    if (!isOpen) {
      setIsInitialized(false);
      // Cancel any in-progress run when modal closes
      if (runner.isRunning) {
        runner.cancelRun();
      }
    }
  }, [isOpen, allRequests, isInitialized, runner]);

  // Filter requests by search query
  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) {
      return allRequests;
    }

    const query = searchQuery.toLowerCase();
    return allRequests.filter(
      (req) =>
        req.name.toLowerCase().includes(query) ||
        req.url.toLowerCase().includes(query) ||
        req.method.toLowerCase().includes(query)
    );
  }, [allRequests, searchQuery]);

  // Convert filtered requests to RunRequestData with runner results
  const displayRequests = useMemo<RunRequestData[]>(() => {
    return filteredRequests.map((req) => {
      const result = runner.getResult(req.id);
      if (result) {
        return toRunRequestData(
          req,
          result.status,
          result.validationStatus,
          result.response?.status,
          result.elapsedTime,
          result.error
        );
      }
      return toRunRequestData(req);
    });
  }, [filteredRequests, runner]);

  // Calculate metrics from runner progress
  const metrics = useMemo<RunMetrics>(() => {
    const selectedCount = selectedRequestIds.size;
    const { completed, failed } = runner.progress;
    const passed = completed - failed;
    
    return {
      totalRequests: selectedCount,
      passed,
      failed,
      averageTime: Math.round(runner.averageTime),
    };
  }, [selectedRequestIds.size, runner.progress, runner.averageTime]);

  // Handlers
  const handleEnvironmentChange = useCallback((value: string) => {
    setSelectedEnvironmentId(value === 'none' ? null : value);
  }, []);

  const handleAuthChange = useCallback((value: string) => {
    setSelectedAuthId(value === 'none' ? null : value);
  }, []);

  const handleSelectionChange = useCallback((id: string, selected: boolean) => {
    setSelectedRequestIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedRequestIds(new Set(filteredRequests.map(r => r.id)));
  }, [filteredRequests]);

  const handleDeselectAll = useCallback(() => {
    setSelectedRequestIds(new Set());
  }, []);

  const handleRun = useCallback(() => {
    // Get selected requests as RunRequestItems
    const selectedRequests = allRequests.filter(r => selectedRequestIds.has(r.id));
    
    runner.runCollection(
      selectedRequests,
      {
        concurrentCalls: settings.concurrentCalls,
        delayBetweenCalls: settings.delayBetweenCalls,
      },
      selectedEnvironmentId,
      selectedAuthId
    );
  }, [allRequests, selectedRequestIds, selectedEnvironmentId, selectedAuthId, settings, runner]);

  const handleStop = useCallback(() => {
    runner.cancelRun();
  }, [runner]);

  // Derive display name
  const displayName = itemPath.length > 0 
    ? `${collectionName} / ${itemPath.join(' / ')}` 
    : collectionName;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Run Collection: {displayName}
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* Top Controls: Environment, Auth, Run Button */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Auth Selector */}
            <div className="flex items-center gap-2">
              <Label htmlFor={authSelectId} className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                Default Auth:
              </Label>
              <Select
                value={selectedAuthId || 'none'}
                onValueChange={handleAuthChange}
              >
                <SelectTrigger
                  id={authSelectId}
                  className="w-40 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                >
                  <SelectValue placeholder="Select Auth" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Auth</SelectItem>
                  {auths?.map((auth) => (
                    <SelectItem key={auth.id} value={auth.id}>
                      {auth.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Environment Selector */}
            <div className="flex items-center gap-2">
              <Label htmlFor={environmentSelectId} className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                Default Env:
              </Label>
              <Select
                value={selectedEnvironmentId || 'none'}
                onValueChange={handleEnvironmentChange}
              >
                <SelectTrigger
                  id={environmentSelectId}
                  className="w-40 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                >
                  <SelectValue placeholder="Select Environment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {environments?.filter(env => env.name.toLowerCase() !== 'global').map((env) => (
                    <SelectItem key={env.id} value={env.id}>
                      {env.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Run/Stop Button */}
            <div className="ml-auto flex items-center gap-2">
              {runner.isRunning ? (
                <PrimaryButton
                  onClick={handleStop}
                  colorTheme="error"
                >
                  <StopCircleIcon className="h-4 w-4 mr-2" />
                  Stop
                </PrimaryButton>
              ) : (
                <PrimaryButton
                  onClick={handleRun}
                  disabled={selectedRequestIds.size === 0}
                  colorTheme="main"
                >
                  <PlayIcon className="h-4 w-4 mr-2" />
                  Run ({selectedRequestIds.size})
                </PrimaryButton>
              )}
            </div>
          </div>

          {/* Run Settings */}
          <RunSettingsSection settings={settings} onSettingsChange={setSettings} />

          {/* Metrics */}
          <RunMetricsSection metrics={metrics} />

          {/* Search and Selection Controls */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id={searchInputId}
                type="search"
                placeholder="Search requests..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Selection Controls */}
            <div className="flex items-center gap-2">
              <SecondaryButton
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                className="text-xs"
              >
                Select All
              </SecondaryButton>
              <SecondaryButton
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
                className="text-xs"
              >
                Deselect All
              </SecondaryButton>
            </div>
          </div>

          {/* Request Cards */}
          <div className="space-y-2">
            {displayRequests.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-slate-500 dark:text-slate-400 text-lg font-medium mb-2">
                  {allRequests.length === 0 ? 'No requests found' : 'No matching requests'}
                </div>
                <div className="text-slate-400 dark:text-slate-500 text-sm">
                  {allRequests.length === 0
                    ? 'This folder does not contain any requests.'
                    : 'Try adjusting your search query.'}
                </div>
              </div>
            ) : (
              displayRequests.map((request) => (
                <RunRequestCard
                  key={request.id}
                  data={request}
                  isSelected={selectedRequestIds.has(request.id)}
                  onSelectionChange={handleSelectionChange}
                />
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RunCollectionModal;
