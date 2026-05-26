/**
 * Unit tests for FlowRequestSearch — exclusion gate (FEAT-011 TASK-002).
 *
 * Tested scenarios:
 *  1.  Renders only HTTP requests from mixed-protocol collections.
 *  2.  WS requests are excluded from the request list.
 *  3.  SSE requests are excluded from the request list.
 *  4.  Footer count reflects HTTP-only requests.
 *  5.  Shows "No requests found in collections" when all requests are WS/SSE.
 *  6.  Legacy requests (no `protocol` field) are included.
 *  7.  Search query filters within the HTTP-only subset.
 *  8.  Selecting one or more requests and clicking Add calls `onAddRequests`.
 *  9.  HTTP requests inside nested folders are included.
 * 10.  WS requests inside nested folders are excluded.
 * 11.  Requests already in the flow are excluded by referenceId.
 * 12.  Request URL is rendered in each row (revealed on hover in UI).
 *
 * Strategy:
 *  - Dialog and UI primitives are mocked with simple HTML equivalents so
 *    JSDOM can render and interact without floating-UI dependencies.
 *  - Collections are constructed inline using raw object literals that conform
 *    to the Collection / CollectionItem types.
 *  - onAddRequests is a vi.fn() spy.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Collection, CollectionItem } from '../../../types/collection';
import { FlowRequestSearch } from '../../../components/flow/FlowRequestSearch';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../components/ui/dialog', () => ({
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
        open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('../../../components/ui/input', () => ({
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
        <input data-testid="search-input" {...props} />
    ),
}));

vi.mock('../../../components/ui/checkbox', () => ({
    Checkbox: ({
        checked,
        onCheckedChange,
        disabled,
    }: {
        checked?: boolean;
        onCheckedChange?: (checked: boolean) => void;
        disabled?: boolean;
    }) => (
        <input
            data-testid="request-checkbox"
            type="checkbox"
            checked={!!checked}
            disabled={disabled}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
        />
    ),
}));

vi.mock('../../../components/ui/PrimaryButton', () => ({
    PrimaryButton: ({
        children,
        onClick,
        disabled,
    }: {
        children: React.ReactNode;
        onClick?: () => void;
        disabled?: boolean;
    }) => (
        <button data-testid="primary-btn" onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
}));

vi.mock('../../../components/ui/SecondaryButton', () => ({
    SecondaryButton: ({
        children,
        onClick,
        disabled,
    }: {
        children: React.ReactNode;
        onClick?: (e?: React.MouseEvent) => void;
        disabled?: boolean;
    }) => (
        <button data-testid="secondary-btn" onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
}));

// ── Test Data ─────────────────────────────────────────────────────────────────

function makeHttpItem(id: string, name: string, method = 'GET'): CollectionItem {
    return {
        id,
        name,
        request: {
            id,
            name,
            protocol: 'http',
            method,
            url: `https://api.example.com/${id}`,
        },
    };
}

function makeLegacyHttpItem(id: string, name: string): CollectionItem {
    return {
        id,
        name,
        // No `protocol` field — legacy HTTP item
        request: {
            id,
            name,
            method: 'POST',
            url: `https://api.example.com/${id}`,
        } as CollectionItem['request'],
    };
}

function makeWsItem(id: string, name: string): CollectionItem {
    return {
        id,
        name,
        request: {
            id,
            name,
            protocol: 'ws',
            url: `ws://api.example.com/${id}`,
        },
    };
}

function makeSseItem(id: string, name: string): CollectionItem {
    return {
        id,
        name,
        request: {
            id,
            name,
            protocol: 'sse',
            method: 'GET',
            url: `https://api.example.com/sse/${id}`,
        },
    };
}

function makeFolderItem(id: string, name: string, children: CollectionItem[]): CollectionItem {
    return { id, name, item: children };
}

function makeCollection(name: string, items: CollectionItem[]): Collection {
    return {
        filename: `${name.toLowerCase().replace(/\s+/g, '-')}.json`,
        info: {
            waveId: `wave-${name}`,
            name,
            schema: 'v1',
        },
        item: items,
    };
}

const DEFAULT_PROPS = {
    isOpen: true,
    onClose: vi.fn(),
    collections: [] as Collection[],
    onAddRequests: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FlowRequestSearch — exclusion gate (FEAT-011)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders only HTTP requests from mixed-protocol collections', () => {
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users'),
                makeWsItem('ws-1', 'Subscribe Events'),
                makeSseItem('sse-1', 'Event Stream'),
                makeHttpItem('http-2', 'Create User'),
            ]),
        ];

        render(<FlowRequestSearch {...DEFAULT_PROPS} collections={collections} />);

        expect(screen.getByText('Get Users')).toBeTruthy();
        expect(screen.getByText('Create User')).toBeTruthy();
    });

    it('WS requests are excluded from the request list', () => {
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users'),
                makeWsItem('ws-1', 'Subscribe Events'),
            ]),
        ];

        render(<FlowRequestSearch {...DEFAULT_PROPS} collections={collections} />);

        expect(screen.queryByText('Subscribe Events')).toBeNull();
    });

    it('SSE requests are excluded from the request list', () => {
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users'),
                makeSseItem('sse-1', 'Event Stream'),
            ]),
        ];

        render(<FlowRequestSearch {...DEFAULT_PROPS} collections={collections} />);

        expect(screen.queryByText('Event Stream')).toBeNull();
    });

    it('footer count reflects HTTP-only requests', () => {
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users'),
                makeHttpItem('http-2', 'Create User'),
                makeWsItem('ws-1', 'Subscribe Events'),
                makeSseItem('sse-1', 'Event Stream'),
            ]),
        ];

        render(<FlowRequestSearch {...DEFAULT_PROPS} collections={collections} />);

        // Footer shows "2 requests found" — WS and SSE are not counted
        expect(screen.getByText('2 requests found')).toBeTruthy();
    });

    it('shows "No requests found in collections" when all requests are WS/SSE', () => {
        const collections = [
            makeCollection('My API', [
                makeWsItem('ws-1', 'Subscribe Events'),
                makeSseItem('sse-1', 'Event Stream'),
            ]),
        ];

        render(<FlowRequestSearch {...DEFAULT_PROPS} collections={collections} />);

        expect(screen.getByText('No requests found in collections')).toBeTruthy();
    });

    it('includes legacy requests (no protocol field) as HTTP', () => {
        const collections = [
            makeCollection('My API', [
                makeLegacyHttpItem('legacy-1', 'Legacy Endpoint'),
                makeWsItem('ws-1', 'Subscribe Events'),
            ]),
        ];

        render(<FlowRequestSearch {...DEFAULT_PROPS} collections={collections} />);

        expect(screen.getByText('Legacy Endpoint')).toBeTruthy();
        expect(screen.queryByText('Subscribe Events')).toBeNull();
    });

    it('search query filters within the HTTP-only subset', () => {
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users'),
                makeHttpItem('http-2', 'Create User'),
                makeWsItem('ws-1', 'WS Get Events'),
            ]),
        ];

        render(<FlowRequestSearch {...DEFAULT_PROPS} collections={collections} />);

        const searchInput = screen.getByTestId('search-input');
        fireEvent.change(searchInput, { target: { value: 'Create' } });

        // Only "Create User" matches; "Get Users" is filtered out (still HTTP, just no match)
        expect(screen.getByText('Create User')).toBeTruthy();
        expect(screen.queryByText('Get Users')).toBeNull();
        // WS item never shows regardless
        expect(screen.queryByText('WS Get Events')).toBeNull();
    });

    it('selecting a request and clicking Add calls onAddRequests with HTTP request data', () => {
        const onAddRequests = vi.fn();
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users', 'GET'),
            ]),
        ];

        render(
            <FlowRequestSearch
                {...DEFAULT_PROPS}
                collections={collections}
                onAddRequests={onAddRequests}
            />
        );

        // Select a request
        const requestName = screen.getByText('Get Users');
        fireEvent.click(requestName.closest('[class]') ?? requestName);

        // Add selected request
        fireEvent.click(screen.getByTestId('primary-btn'));

        expect(onAddRequests).toHaveBeenCalledWith([
            expect.objectContaining({
                id: 'http-1',
                referenceId: 'my-api.json:http-1',
                name: 'Get Users',
                method: 'GET',
            }),
        ]);
    });

    it('supports multi-select and adds selected requests in list order', () => {
        const onAddRequests = vi.fn();
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users', 'GET'),
                makeHttpItem('http-2', 'Create User', 'POST'),
                makeHttpItem('http-3', 'Delete User', 'DELETE'),
            ]),
        ];

        render(
            <FlowRequestSearch
                {...DEFAULT_PROPS}
                collections={collections}
                onAddRequests={onAddRequests}
            />
        );

        fireEvent.click(screen.getByText('Delete User'));
        fireEvent.click(screen.getByText('Get Users'));
        fireEvent.click(screen.getByTestId('primary-btn'));

        expect(onAddRequests).toHaveBeenCalledWith([
            expect.objectContaining({ referenceId: 'my-api.json:http-1', name: 'Get Users' }),
            expect.objectContaining({ referenceId: 'my-api.json:http-3', name: 'Delete User' }),
        ]);
    });

    it('disables Add button until at least one request is selected', () => {
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users'),
            ]),
        ];

        render(<FlowRequestSearch {...DEFAULT_PROPS} collections={collections} />);

        expect(screen.getByTestId('primary-btn')).toBeDisabled();

        fireEvent.click(screen.getByText('Get Users'));

        expect(screen.getByTestId('primary-btn')).not.toBeDisabled();
    });

    it('excludes requests that are already in the flow using referenceId', () => {
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users'),
                makeHttpItem('http-2', 'Create User'),
            ]),
        ];

        render(
            <FlowRequestSearch
                {...DEFAULT_PROPS}
                collections={collections}
                existingRequestIds={['my-api.json:http-2']}
            />
        );

        expect(screen.getByText('Get Users')).toBeTruthy();
        expect(screen.queryByText('Create User')).toBeNull();
    });

    it('renders request URL text in rows', () => {
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users'),
            ]),
        ];

        render(<FlowRequestSearch {...DEFAULT_PROPS} collections={collections} />);

        expect(screen.getByText('https://api.example.com/http-1')).toBeTruthy();
    });

    it('HTTP requests inside nested folders are included', () => {
        const collections = [
            makeCollection('My API', [
                makeFolderItem('folder-1', 'Users', [
                    makeHttpItem('http-1', 'Get Users'),
                    makeHttpItem('http-2', 'Create User'),
                ]),
            ]),
        ];

        render(<FlowRequestSearch {...DEFAULT_PROPS} collections={collections} />);

        expect(screen.getByText('Get Users')).toBeTruthy();
        expect(screen.getByText('Create User')).toBeTruthy();
    });

    it('WS requests inside nested folders are excluded', () => {
        const collections = [
            makeCollection('My API', [
                makeFolderItem('folder-1', 'Realtime', [
                    makeWsItem('ws-1', 'Subscribe Events'),
                    makeHttpItem('http-1', 'Get Users'),
                ]),
            ]),
        ];

        render(<FlowRequestSearch {...DEFAULT_PROPS} collections={collections} />);

        expect(screen.queryByText('Subscribe Events')).toBeNull();
        expect(screen.getByText('Get Users')).toBeTruthy();
    });
});
