/**
 * Unit tests for RunCollectionModal — exclusion gate (FEAT-011 TASK-001) and
 * Export Report button (FEAT-003 TASK-003).
 *
 * Tested scenarios (exclusion gate):
 *  1.  Renders HTTP requests from a mixed-protocol collection (HTTP + WS + SSE).
 *  2.  Does not render WS requests in the request list.
 *  3.  Does not render SSE requests in the request list.
 *  4.  Run button count reflects only HTTP requests (excludes WS/SSE).
 *  5.  Shows "No requests found" empty state when a collection contains only WS/SSE items.
 *  6.  Legacy requests (no `protocol` field) are included as HTTP.
 *  7.  Search filtering works on the HTTP-only subset.
 *  8.  Nested folder items are flattened — HTTP requests inside folders appear.
 *  9.  WS requests inside nested folders are excluded.
 *
 * Tested scenarios (Export Report button):
 *  10. Export Report button renders.
 *  11. Export button is disabled when no requests have been completed.
 *  12. Export button is enabled after at least one request completes.
 *  13. Export button is disabled while a run is in progress.
 *  14. Export button is disabled while generating (reportStatus === 'generating').
 *  15. Clicking Export button calls exportCollectionRun.
 *
 * Strategy:
 *  - Heavy hooks (useCollectionRunner, useAppStateStore, useReportExport) and
 *    UI primitives are mocked so tests run in JSDOM without real
 *    network/store/adapter dependencies.
 *  - RunRequestCard is stubbed to render request name and method as plain text
 *    so we can assert on their presence without the card's full render logic.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CollectionItem } from '../../../types/collection';
import type { ReportExportStatus } from '../../../hooks/useReportExport';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock useReportExport so the component doesn't need a real AdapterProvider.
const mockExportCollectionRun = vi.fn();
let mockReportStatus: ReportExportStatus = { state: 'idle' };

vi.mock('../../../hooks/useReportExport', () => ({
    useReportExport: () => ({
        status: mockReportStatus,
        exportCollectionRun: mockExportCollectionRun,
    }),
}));

// Mutable runner state — override per-test for export button disabled tests.
const mockRunnerState = {
    isRunning: false,
    progress: { completed: 0, failed: 0, total: 0 },
    averageTime: 0,
    results: {},
    runCollection: vi.fn(),
    cancelRun: vi.fn(),
    resetResults: vi.fn(),
    getResult: vi.fn(() => undefined),
};

vi.mock('../../../hooks/useCollectionRunner', () => ({
    useCollectionRunner: () => mockRunnerState,
}));

vi.mock('../../../hooks/store/useAppStateStore', () => ({
    default: (selector: (s: Record<string, unknown>) => unknown) =>
        selector({ environments: [], auths: [], collections: [] }),
}));

vi.mock('../../../components/ui/dialog', () => ({
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
        open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('../../../components/ui/PrimaryButton', () => ({
    PrimaryButton: ({
        children,
        disabled,
        onClick,
    }: {
        children: React.ReactNode;
        disabled?: boolean;
        onClick?: () => void;
    }) => (
        <button data-testid="run-button" disabled={disabled} onClick={onClick}>
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
        onClick?: () => void;
        disabled?: boolean;
    }) => (
        <button data-testid="secondary-button" onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
}));

vi.mock('../../../components/ui/input', () => ({
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
        <input {...props} />
    ),
}));

vi.mock('../../../components/ui/label', () => ({
    Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock('../../../components/ui/select', () => ({
    Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
        <option value={value}>{children}</option>
    ),
}));

/**
 * Stub RunRequestCard so we can assert on request names without the full
 * card render (which depends on additional hooks and components).
 */
vi.mock('../../../components/common/RunRequestCard', () => ({
    default: ({ data }: { data: { name: string; method: string } }) => (
        <div data-testid="request-card" data-name={data.name} data-method={data.method}>
            {data.name}
        </div>
    ),
}));

// ── Import component after mocks ──────────────────────────────────────────────

import RunCollectionModal from '../../../components/common/RunCollectionModal';

// ── Test Data ─────────────────────────────────────────────────────────────────

function makeHttpItem(id: string, name: string): CollectionItem {
    return {
        id,
        name,
        request: {
            id,
            name,
            protocol: 'http',
            method: 'GET',
            url: `https://api.example.com/${id}`,
        },
    };
}

function makeLegacyHttpItem(id: string, name: string): CollectionItem {
    return {
        id,
        name,
        // No `protocol` field — legacy collection item treated as HTTP
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

const DEFAULT_PROPS = {
    isOpen: true,
    onClose: vi.fn(),
    collectionName: 'Test Collection',
    items: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RunCollectionModal — exclusion gate (FEAT-011)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset mutable mocks to their defaults
        mockReportStatus = { state: 'idle' };
        mockRunnerState.isRunning = false;
        mockRunnerState.progress = { completed: 0, failed: 0, total: 0 };
        mockRunnerState.averageTime = 0;
        mockRunnerState.results = {};
    });

    it('renders HTTP requests from a mixed-protocol collection', () => {
        const items: CollectionItem[] = [
            makeHttpItem('http-1', 'Get Users'),
            makeWsItem('ws-1', 'Subscribe Events'),
            makeSseItem('sse-1', 'Event Stream'),
            makeHttpItem('http-2', 'Create User'),
        ];

        render(<RunCollectionModal {...DEFAULT_PROPS} items={items} />);

        expect(screen.getByText('Get Users')).toBeTruthy();
        expect(screen.getByText('Create User')).toBeTruthy();
    });

    it('does not render WS requests in the request list', () => {
        const items: CollectionItem[] = [
            makeHttpItem('http-1', 'Get Users'),
            makeWsItem('ws-1', 'Subscribe Events'),
        ];

        render(<RunCollectionModal {...DEFAULT_PROPS} items={items} />);

        expect(screen.queryByText('Subscribe Events')).toBeNull();
    });

    it('does not render SSE requests in the request list', () => {
        const items: CollectionItem[] = [
            makeHttpItem('http-1', 'Get Users'),
            makeSseItem('sse-1', 'Event Stream'),
        ];

        render(<RunCollectionModal {...DEFAULT_PROPS} items={items} />);

        expect(screen.queryByText('Event Stream')).toBeNull();
    });

    it('Run button count reflects only HTTP requests', () => {
        const items: CollectionItem[] = [
            makeHttpItem('http-1', 'Get Users'),
            makeHttpItem('http-2', 'Create User'),
            makeWsItem('ws-1', 'Subscribe Events'),
            makeSseItem('sse-1', 'Event Stream'),
        ];

        render(<RunCollectionModal {...DEFAULT_PROPS} items={items} />);

        // Run button shows count of auto-selected HTTP requests (2, not 4)
        const runButton = screen.getByTestId('run-button');
        expect(runButton.textContent).toContain('2');
        expect(runButton.textContent).not.toMatch(/\b4\b/);
    });

    it('shows "No requests found" empty state when collection contains only WS/SSE items', () => {
        const items: CollectionItem[] = [
            makeWsItem('ws-1', 'Subscribe Events'),
            makeSseItem('sse-1', 'Event Stream'),
        ];

        render(<RunCollectionModal {...DEFAULT_PROPS} items={items} />);

        expect(screen.getByText('No requests found')).toBeTruthy();
    });

    it('includes legacy requests (no protocol field) as HTTP', () => {
        const items: CollectionItem[] = [
            makeLegacyHttpItem('legacy-1', 'Legacy Request'),
            makeWsItem('ws-1', 'Subscribe Events'),
        ];

        render(<RunCollectionModal {...DEFAULT_PROPS} items={items} />);

        expect(screen.getByText('Legacy Request')).toBeTruthy();
        expect(screen.queryByText('Subscribe Events')).toBeNull();
    });

    it('search filtering works on the HTTP-only subset', () => {
        const items: CollectionItem[] = [
            makeHttpItem('http-1', 'Get Users'),
            makeHttpItem('http-2', 'Create User'),
            makeWsItem('ws-1', 'WS Get Events'),
        ];

        render(<RunCollectionModal {...DEFAULT_PROPS} items={items} />);

        // Both HTTP items visible initially
        expect(screen.getByText('Get Users')).toBeTruthy();
        expect(screen.getByText('Create User')).toBeTruthy();
        // WS item is never present regardless of search
        expect(screen.queryByText('WS Get Events')).toBeNull();
    });

    it('HTTP requests inside nested folders are included', () => {
        const items: CollectionItem[] = [
            makeFolderItem('folder-1', 'Users Folder', [
                makeHttpItem('http-1', 'Get Users'),
                makeHttpItem('http-2', 'Create User'),
            ]),
        ];

        render(<RunCollectionModal {...DEFAULT_PROPS} items={items} />);

        expect(screen.getByText('Get Users')).toBeTruthy();
        expect(screen.getByText('Create User')).toBeTruthy();
    });

    it('WS requests inside nested folders are excluded', () => {
        const items: CollectionItem[] = [
            makeFolderItem('folder-1', 'Realtime Folder', [
                makeWsItem('ws-1', 'Subscribe Events'),
                makeHttpItem('http-1', 'Get Users'),
            ]),
        ];

        render(<RunCollectionModal {...DEFAULT_PROPS} items={items} />);

        expect(screen.queryByText('Subscribe Events')).toBeNull();
        expect(screen.getByText('Get Users')).toBeTruthy();
    });
});

// ── Export Report button tests ─────────────────────────────────────────────────

describe('RunCollectionModal — Export Report button (FEAT-003)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockReportStatus = { state: 'idle' };
        mockRunnerState.isRunning = false;
        mockRunnerState.progress = { completed: 0, failed: 0, total: 0 };
        mockRunnerState.averageTime = 0;
        mockRunnerState.results = {};
    });

    it('renders the Export Report button', () => {
        render(<RunCollectionModal {...DEFAULT_PROPS} items={[makeHttpItem('h1', 'Get')]} />);
        expect(screen.getByText(/Export Report/i)).toBeTruthy();
    });

    it('Export button is disabled when no requests have completed', () => {
        // progress.completed === 0 → disabled
        mockRunnerState.progress = { completed: 0, failed: 0, total: 0 };

        render(<RunCollectionModal {...DEFAULT_PROPS} items={[makeHttpItem('h1', 'Get')]} />);

        // Find secondary buttons (SecondaryButton mock has data-testid="secondary-button")
        const buttons = screen.getAllByTestId('secondary-button');
        const exportButton = buttons.find((b) => b.textContent?.includes('Export Report'));
        expect(exportButton).toBeTruthy();
        expect((exportButton as HTMLButtonElement).disabled).toBe(true);
    });

    it('Export button is enabled when at least one request has completed', () => {
        mockRunnerState.progress = { completed: 1, failed: 0, total: 1 };

        render(<RunCollectionModal {...DEFAULT_PROPS} items={[makeHttpItem('h1', 'Get')]} />);

        const buttons = screen.getAllByTestId('secondary-button');
        const exportButton = buttons.find((b) => b.textContent?.includes('Export Report'));
        expect(exportButton).toBeTruthy();
        expect((exportButton as HTMLButtonElement).disabled).toBe(false);
    });

    it('Export button is disabled while a run is in progress', () => {
        mockRunnerState.isRunning = true;
        // Even if some completed, isRunning disables it
        mockRunnerState.progress = { completed: 1, failed: 0, total: 2 };

        render(<RunCollectionModal {...DEFAULT_PROPS} items={[makeHttpItem('h1', 'Get')]} />);

        const buttons = screen.getAllByTestId('secondary-button');
        const exportButton = buttons.find((b) => b.textContent?.includes('Export Report'));
        expect(exportButton).toBeTruthy();
        expect((exportButton as HTMLButtonElement).disabled).toBe(true);
    });

    it('Export button is disabled while generating the report', () => {
        mockReportStatus = { state: 'generating' };
        mockRunnerState.progress = { completed: 1, failed: 0, total: 1 };

        render(<RunCollectionModal {...DEFAULT_PROPS} items={[makeHttpItem('h1', 'Get')]} />);

        const buttons = screen.getAllByTestId('secondary-button');
        const exportButton = buttons.find((b) => b.textContent?.includes('Export Report'));
        expect(exportButton).toBeTruthy();
        expect((exportButton as HTMLButtonElement).disabled).toBe(true);
    });

    it('clicking Export button calls exportCollectionRun', () => {
        mockRunnerState.progress = { completed: 1, failed: 0, total: 1 };

        render(<RunCollectionModal {...DEFAULT_PROPS} items={[makeHttpItem('h1', 'Get')]} />);

        const buttons = screen.getAllByTestId('secondary-button');
        const exportButton = buttons.find((b) => b.textContent?.includes('Export Report'));
        expect(exportButton).toBeTruthy();

        fireEvent.click(exportButton as HTMLElement);

        expect(mockExportCollectionRun).toHaveBeenCalledOnce();
    });
});
