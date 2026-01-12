/**
 * Flow Request Search Modal
 * 
 * Modal component for searching and adding existing requests to a flow.
 * Reuses patterns from RunCollectionModal for search/filter functionality.
 */

import React, { useState, useMemo } from 'react';
import { SearchIcon, PlusCircle, FolderIcon } from 'lucide-react';
import type { Collection, CollectionItem } from '../../types/collection';
import { isRequest } from '../../types/collection';
import { urlToString } from '../../utils/collectionParser';
import { getHttpMethodColor, cn } from '../../utils/common';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
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
    /** Callback when a request is selected */
    onSelectRequest: (request: SearchableRequest) => void;
    /** Node IDs already in the flow (to prevent duplicates, optional) */
    existingRequestIds?: string[];
    /** Disable interactions (e.g., while flow is running) */
    isDisabled?: boolean;
}

export interface SearchableRequest {
    id: string;
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
 * Flattens all requests from collections into a searchable list
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
            if (isRequest(item) && item.request) {
                requests.push({
                    id: item.id,
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
    onSelectRequest,
    existingRequestIds = [],
    isDisabled = false,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    
    // Flatten all requests
    const allRequests = useMemo(
        () => flattenCollections(collections),
        [collections]
    );
    
    // Filter requests based on search query
    const filteredRequests = useMemo(() => {
        if (!searchQuery.trim()) return allRequests;
        
        const query = searchQuery.toLowerCase();
        return allRequests.filter(req =>
            req.name.toLowerCase().includes(query) ||
            req.url.toLowerCase().includes(query) ||
            req.method.toLowerCase().includes(query) ||
            req.collectionName.toLowerCase().includes(query)
        );
    }, [allRequests, searchQuery]);
    
    // Handle request selection
    const handleSelect = (request: SearchableRequest) => {
        if (isDisabled) return;
        onSelectRequest(request);
        setSearchQuery('');
    };
    
    // Check if request is already in flow
    const isAlreadyAdded = (requestId: string) => 
        existingRequestIds.includes(requestId);
    
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
                <div className="flex-1 overflow-y-auto mt-4 space-y-1 min-h-[300px]">
                    {filteredRequests.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                            {allRequests.length === 0 
                                ? 'No requests found in collections'
                                : 'No requests match your search'
                            }
                        </div>
                    ) : (
                        filteredRequests.map((request) => {
                            const alreadyAdded = isAlreadyAdded(request.id);
                            
                            return (
                                <div
                                    key={request.id}
                                    className={cn(
                                        'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                                        alreadyAdded
                                            ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                                            : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer',
                                        isDisabled && 'cursor-not-allowed opacity-60'
                                    )}
                                    onClick={() => !alreadyAdded && !isDisabled && handleSelect(request)}
                                >
                                    {/* Method Badge */}
                                    <span className={cn(
                                        'text-xs font-semibold px-2 py-1 rounded flex-shrink-0',
                                        getHttpMethodColor(request.method)
                                    )}>
                                        {request.method}
                                    </span>
                                    
                                    {/* Request Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                                {request.name}
                                            </span>
                                            {alreadyAdded && (
                                                <span className="text-xs text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">
                                                    Already added
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-500 truncate mt-0.5">
                                            {request.url}
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                                            <FolderIcon className="h-3 w-3" />
                                            <span>{request.collectionName}</span>
                                            {request.folderPath.length > 0 && (
                                                <span>/ {request.folderPath.join(' / ')}</span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Add Button */}
                                    {!alreadyAdded && (
                                        <SecondaryButton
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSelect(request);
                                            }}
                                            disabled={isDisabled}
                                        >
                                            <PlusCircle className="h-4 w-4 mr-1" />
                                            Add
                                        </SecondaryButton>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
                
                {/* Footer */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-sm text-slate-500">
                        {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''} found
                    </span>
                    <SecondaryButton onClick={onClose}>
                        Close
                    </SecondaryButton>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default FlowRequestSearch;
