/**
 * Flow Request Search Modal
 * 
 * Modal component for searching and adding existing requests to a flow.
 * Reuses patterns from RunCollectionModal for search/filter functionality.
 */

import React, { useState, useMemo } from 'react';
import { PlusIcon, SearchIcon, XIcon } from 'lucide-react';
import type { Collection, CollectionItem } from '../../types/collection';
import { isRequest } from '../../types/collection';
import { isHttpRequest } from '../../utils/requestTypeGuards';
import { urlToString } from '../../utils/collectionParser';
import { cn, getHttpMethodColor } from '../../utils/common';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';

// ============================================================================
// Types
// ============================================================================

interface FlowRequestSearchProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Callback to close the modal */
    onClose: () => void;
    /** Available collections to search from */
    collections: Collection[];
    /** Callback when one or more requests are selected */
    onAddRequests: (requests: SearchableRequest[]) => void;
    /** Node IDs already in the flow (to prevent duplicates, optional) */
    existingRequestIds?: string[];
    /** Disable interactions (e.g., while flow is running) */
    isDisabled?: boolean;
}

export interface SearchableRequest {
    id: string;
    referenceId: string;
    name: string;
    method: string;
    url: string;
    collectionName: string;
    collectionFilename: string;
    folderPath: string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Flattens all HTTP requests from collections into a searchable list.
 *
 * WS and SSE requests are intentionally excluded — flows only support HTTP
 * request nodes. Items without a `protocol` field are treated as HTTP for
 * backward-compatibility with collections saved before the discriminant was
 * introduced.
 */
function flattenCollections(collections: Collection[]): SearchableRequest[] {
    const requests: SearchableRequest[] = [];
    
    function processItems(
        items: CollectionItem[],
        collectionName: string,
        collectionFilename: string,
        folderPath: string[]
    ) {
        for (const item of items) {
            if (isRequest(item) && item.request && isHttpRequest(item.request)) {
                const referenceId = collectionFilename
                    ? `${collectionFilename}:${item.id}`
                    : item.id;

                requests.push({
                    id: item.id,
                    referenceId,
                    name: item.name,
                    method: item.request.method || 'GET',
                    url: urlToString(item.request.url),
                    collectionName,
                    collectionFilename: collectionFilename || '',
                    folderPath,
                });
            }
            
            if (item.item && item.item.length > 0) {
                processItems(
                    item.item,
                    collectionName,
                    collectionFilename,
                    [...folderPath, item.name]
                );
            }
        }
    }
    
    for (const collection of collections) {
        processItems(
            collection.item,
            collection.info.name,
            collection.filename || '',
            []
        );
    }
    
    return requests;
}

// ============================================================================
// Main Component
// ============================================================================

export const FlowRequestSearch: React.FC<FlowRequestSearchProps> = ({
    isOpen,
    onClose,
    collections,
    onAddRequests,
    existingRequestIds = [],
    isDisabled = false,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    
    // Flatten all requests
    const allRequests = useMemo(
        () => flattenCollections(collections),
        [collections]
    );
    
    // Filter out requests that are already in the flow
    const availableRequests = useMemo(() => {
        const existingIds = new Set(existingRequestIds);
        return allRequests.filter((request) => !existingIds.has(request.referenceId));
    }, [allRequests, existingRequestIds]);

    // Filter requests based on search query
    const filteredRequests = useMemo(() => {
        if (!searchQuery.trim()) return availableRequests;
        
        const query = searchQuery.toLowerCase();
        return availableRequests.filter(req =>
            req.name.toLowerCase().includes(query) ||
            req.url.toLowerCase().includes(query) ||
            req.method.toLowerCase().includes(query) ||
            req.collectionName.toLowerCase().includes(query)
        );
    }, [availableRequests, searchQuery]);
    
    const handleToggleSelection = (referenceId: string) => {
        if (isDisabled) return;

        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(referenceId)) {
                next.delete(referenceId);
            } else {
                next.add(referenceId);
            }
            return next;
        });
    };
    
    const handleAdd = () => {
        if (isDisabled || selectedIds.size === 0) {
            return;
        }

        const selectedRequests = availableRequests.filter((request) =>
            selectedIds.has(request.referenceId)
        );

        if (selectedRequests.length === 0) {
            return;
        }

        onAddRequests(selectedRequests);
        setSelectedIds(new Set());
        setSearchQuery('');
        onClose();
    };

    React.useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
            setSelectedIds(new Set());
        }
    }, [isOpen]);
    
    return (
        <Dialog open={isOpen && !isDisabled} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Add Request to Flow</DialogTitle>
                </DialogHeader>
                
                {/* Search Input */}
                <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        type="text"
                        placeholder="Search requests by name, URL, or collection..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        disabled={isDisabled}
                        className="pl-9"
                        autoFocus
                    />
                </div>
                
                {/* Results */}
                <div className="flex-1 overflow-y-auto min-h-[300px] border border-slate-200 dark:border-slate-700 rounded-lg">
                    {filteredRequests.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                            {availableRequests.length === 0
                                ? 'No requests found in collections'
                                : 'No requests match your search'
                            }
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-200 dark:divide-slate-700">
                            {filteredRequests.map((request) => {
                                const isSelected = selectedIds.has(request.referenceId);

                                return (
                                    <div
                                        key={request.referenceId}
                                        className={cn(
                                            'group flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50',
                                            isSelected && 'bg-blue-50 dark:bg-blue-900/20',
                                            isDisabled && 'cursor-not-allowed opacity-60'
                                        )}
                                        onClick={() => handleToggleSelection(request.referenceId)}
                                    >
                                        <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={() => handleToggleSelection(request.referenceId)}
                                            disabled={isDisabled}
                                        />
                                        <span
                                            className={cn(
                                                'text-xs font-mono font-semibold px-1.5 py-0.5 rounded',
                                                getHttpMethodColor(request.method)
                                            )}
                                        >
                                            {request.method}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                                                {request.name}
                                            </div>
                                            <div className="text-xs text-slate-500 truncate">
                                                {request.collectionName}{' '}
                                                {request.folderPath.length > 0 && `/ ${request.folderPath.join(' / ')}`}
                                            </div>
                                            <div className="text-xs text-slate-400 truncate max-h-0 opacity-0 overflow-hidden transition-all group-hover:max-h-6 group-hover:opacity-100 group-hover:mt-1 group-focus-within:max-h-6 group-focus-within:opacity-100 group-focus-within:mt-1">
                                                {request.url}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                
                {/* Footer */}
                <div className="flex justify-between items-center pt-2">
                    <span className="text-sm text-slate-500">
                        {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''} found
                    </span>
                    <div className="flex items-center gap-2">
                        <SecondaryButton 
                            onClick={onClose}
                            text="Cancel"
                            icon={<XIcon />}
                         />
                        <PrimaryButton 
                            onClick={handleAdd} 
                            disabled={selectedIds.size === 0 || isDisabled}
                            text={`Add ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
                            icon={<PlusIcon />}
                         />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default FlowRequestSearch;
