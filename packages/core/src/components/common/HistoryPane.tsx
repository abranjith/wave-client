import React from 'react';
import { ClockIcon, Trash2Icon } from 'lucide-react';
import { CollectionRequest, getRawUrl } from '../../types/collection';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { getHttpMethodColor } from '../../utils/common';
import { Button } from '../ui/button';
import { useStorageAdapter, useNotificationAdapter } from '../../hooks/useAdapter';

interface HistoryPaneProps {
  onRequestSelect: (request: CollectionRequest) => void;
  onRetry?: () => void;
}

const HistoryPane: React.FC<HistoryPaneProps> = ({ onRequestSelect, onRetry }) => {
  const history = useAppStateStore((state) => state.history);
  const isLoading = useAppStateStore((state) => state.isHistoryLoading);
  const error = useAppStateStore((state) => state.historyLoadError);
  const activeTab = useAppStateStore((state) => state.getActiveTab());
  const currentRequestId = activeTab?.id;
  const removeHistoryItem = useAppStateStore((state) => state.removeHistoryItem);

  const storageAdapter = useStorageAdapter();
  const notification = useNotificationAdapter();

  const handleRequestClick = (request: CollectionRequest) => {
    if (onRequestSelect) {
      onRequestSelect(request);
    }
  };

  /**
   * Deletes a single history entry via the adapter, then removes it from the
   * store only when the adapter confirms success. Stops row-click propagation
   * so clicking the remove button does not trigger request selection.
   */
  const handleRemoveItem = async (e: React.MouseEvent, request: CollectionRequest) => {
    e.stopPropagation();
    if (!request.id) return;
    const result = await storageAdapter.deleteHistoryItem(request.id);
    if (result.isOk) {
      removeHistoryItem(request.id);
    } else {
      notification.showNotification('error', `Failed to remove history item: ${result.error}`);
    }
  };

  const getDisplayName = (request: CollectionRequest): string => {
    if (request.name && request.name !== 'Untitled Request') {
      return request.name;
    }
    return getRawUrl(request.url) || 'Untitled Request';
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">History</h2>
          </div>
        </div>
        <div className="flex items-center justify-center h-[calc(100%-5rem)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Loading history...</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">History</h2>
          </div>
        </div>
        <div className="flex items-center justify-center h-[calc(100%-5rem)] p-4">
          <div className="text-center">
            <div className="text-red-500 mb-2">⚠️</div>
            <p className="text-sm text-red-600 dark:text-red-400 mb-2">Error loading history</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{error}</p>
            {onRetry && (
              <Button
                onClick={onRetry}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                Retry
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  if (history.length === 0) {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">History</h2>
          </div>
        </div>
        <div className="flex items-center justify-center h-[calc(100%-5rem)] p-4">
          <div className="text-center">
            <ClockIcon className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">No history found</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your request history will appear here
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full overflow-hidden bg-white dark:bg-slate-900">
      <div className="h-full overflow-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">History</h2>
          <span className="text-xs text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded-full">
            {history.length}
          </span>
        </div>
        
        <div className="space-y-2">
          {history.map((request, index) => {
            const isActive = request.id === currentRequestId;
            return (
            <div
              key={request.id || index}
              className={`flex items-center py-2 px-3 border border-slate-200 dark:border-slate-700 cursor-pointer rounded-lg group transition-colors ${
                isActive 
                  ? 'bg-blue-100 dark:bg-blue-900/40 border-l-2 border-blue-500' 
                  : 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
              }`}
              onClick={() => handleRequestClick(request)}
            >
              <div className="flex items-center flex-1 min-w-0">
                <span className={`text-xs font-medium mr-3 px-2 py-1 rounded-full flex-shrink-0 ${getHttpMethodColor(request.method)}`}>
                  {request.method}
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                  {getDisplayName(request)}
                </span>
              </div>
              {/* Per-item remove button — only visible on group hover */}
              <button
                aria-label="Remove history item"
                className="opacity-0 group-hover:opacity-100 ml-2 flex-shrink-0 p-0.5 rounded text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 transition-opacity"
                onClick={(e) => handleRemoveItem(e, request)}
              >
                <Trash2Icon className="h-3 w-3" />
              </button>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export type { HistoryPaneProps };
export default HistoryPane;
