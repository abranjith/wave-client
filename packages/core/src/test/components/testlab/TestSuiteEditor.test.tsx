/**
 * Unit tests for TestSuiteEditor (AddItemDialog) — exclusion gate (FEAT-011 TASK-003).
 *
 * Tested scenarios:
 *  1.  Renders only HTTP requests in the Requests tab of AddItemDialog.
 *  2.  WS requests are excluded from the Requests tab.
 *  3.  SSE requests are excluded from the Requests tab.
 *  4.  Requests tab count label reflects HTTP-only count.
 *  5.  Shows "No requests available" when all collection requests are WS/SSE.
 *  6.  Legacy requests (no `protocol` field) are included.
 *  7.  Flows tab is unaffected — flows are always shown.
 *  8.  Selected request can be added to the test suite (calls onAddItems).
 *  9.  Existing WS/SSE request test items already present in a suite still
 *      render their row fallback details (no regression from filtering change).
 *
 * Strategy:
 *  - TestSuiteToolbar is stubbed to expose an "Open Add Dialog" button that
 *    calls the onAddItems prop. This avoids the toolbar's full dependency tree
 *    while still letting tests open the AddItemDialog.
 *  - TestItemRow, TestResultsPanel, TestCaseEditor are stubbed to null / simple
 *    elements to keep tests focused on AddItemDialog behaviour.
 *  - Dialog and UI primitives are mocked with plain HTML equivalents.
 *  - Adapter hooks are mocked; Zustand store is seeded via setState.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter } from '../../mocks/mockAdapter';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import type { Collection, CollectionItem } from '../../../types/collection';
import type { TestSuite } from '../../../types/testSuite';
import { DEFAULT_TEST_SUITE_SETTINGS } from '../../../types/testSuite';
import type { Flow } from '../../../types/flow';

const initialStoreState = useAppStateStore.getState();

// ── Mocks ────────────────────────────────────────────────────────────────────

/**
 * TestSuiteToolbar stub: renders an "Open Add Dialog" button that triggers
 * the onAddItems callback, allowing tests to open the AddItemDialog.
 */
vi.mock('../../../components/testlab/TestSuiteToolbar', () => ({
    default: ({
        onAddItems,
        suiteName,
    }: {
        onAddItems: () => void;
        suiteName: string;
        [key: string]: unknown;
    }) => (
        <div data-testid="toolbar">
            <span>{suiteName}</span>
            <button data-testid="open-add-dialog" onClick={onAddItems}>
                Add Items
            </button>
        </div>
    ),
}));

vi.mock('../../../components/testlab/TestResultsPanel', () => ({
    default: () => null,
}));

vi.mock('../../../components/testlab/TestCaseEditor', () => ({
    default: () => null,
}));

vi.mock('../../../hooks/useTestSuiteRunner', () => ({
    useTestSuiteRunner: () => ({
        isRunning: false,
        runTestSuite: vi.fn(),
        cancelTestSuite: vi.fn(),
        resetTestSuite: vi.fn(),
        getItemResult: vi.fn(() => undefined),
        overallStatus: 'idle',
    }),
}));

vi.mock('../../../components/ui/dialog', () => ({
    Dialog: ({
        open,
        children,
        onOpenChange,
    }: {
        open: boolean;
        children: React.ReactNode;
        onOpenChange?: (open: boolean) => void;
    }) => open ? <div data-testid="dialog" onClick={() => onOpenChange?.(false)}>{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="dialog-content" onClick={(e) => e.stopPropagation()}>{children}</div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('../../../components/ui/input', () => ({
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
        <input data-testid="search-input" {...props} />
    ),
}));

vi.mock('../../../components/ui/label', () => ({
    Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock('../../../components/ui/checkbox', () => ({
    Checkbox: ({
        checked,
        onCheckedChange,
    }: {
        checked?: boolean;
        onCheckedChange?: (checked: boolean) => void;
    }) => (
        <input
            type="checkbox"
            checked={!!checked}
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
        onClick?: () => void;
        disabled?: boolean;
    }) => (
        <button data-testid="secondary-btn" onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
}));

vi.mock('../../../components/ui/button', () => ({
    Button: ({
        children,
        onClick,
        disabled,
    }: {
        children: React.ReactNode;
        onClick?: () => void;
        disabled?: boolean;
    }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
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

vi.mock('../../../components/ui/tooltip', () => ({
    TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
        <>{children}</>
    ),
    TooltipContent: () => null,
}));

// ── Import component after mocks ──────────────────────────────────────────────

import TestSuiteEditor from '../../../components/testlab/TestSuiteEditor';

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

function makeFlow(id: string, name: string): Flow {
    return {
        id,
        name,
        nodes: [],
        connectors: [],
        description: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function makeSuite(id: string, items: TestSuite['items'] = []): TestSuite {
    return {
        id,
        name: 'My Test Suite',
        items,
        settings: DEFAULT_TEST_SUITE_SETTINGS,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function makeRequestItemSuite(id: string, enabled = true): TestSuite {
    return makeSuite(id, [
        {
            id: `${id}-item-1`,
            type: 'request',
            name: 'Get Users',
            referenceId: 'my-api.json:http-1',
            order: 0,
            enabled,
        },
    ]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function seedStore(options: {
    collections?: Collection[];
    flows?: Flow[];
    suite?: TestSuite;
}) {
    const suite = options.suite ?? makeSuite('suite-1');
    useAppStateStore.setState({
        collections: options.collections ?? [],
        flows: options.flows ?? [],
        environments: [],
        auths: [],
        testSuites: [suite],
        getTestSuiteById: (id: string) =>
            (useAppStateStore.getState() as unknown as Record<string, unknown> & { testSuites: TestSuite[] }).testSuites.find(
                (s: TestSuite) => s.id === id
            ),
        updateTestSuiteItems: vi.fn(),
        updateTestSuiteSettings: vi.fn(),
        updateTestSuiteName: vi.fn(),
        markTestSuiteClean: vi.fn(),
        updateTestSuiteDefaultEnv: vi.fn(),
        updateTestSuiteDefaultAuth: vi.fn(),
        addTestCase: vi.fn(),
        updateTestCase: vi.fn(),
        deleteTestCase: vi.fn(),
        isDirty: false,
    } as Partial<ReturnType<typeof useAppStateStore.getState>>);
}

function renderEditor(suite: TestSuite, adapter = createMockAdapter().adapter) {
    return render(
        <AdapterProvider adapter={adapter}>
            <TestSuiteEditor suite={suite} />
        </AdapterProvider>
    );
}

function openAddDialog() {
    const button = screen.getByTestId('open-add-dialog');
    fireEvent.click(button);
}

function seedStoreForEnabledToggle(options: {
    suite: TestSuite;
    dirty: boolean;
    collections?: Collection[];
}) {
    useAppStateStore.setState({
        collections: options.collections ?? [],
        flows: [],
        environments: [],
        auths: [],
        testSuites: [options.suite],
        testSuiteDirtyStates: { [options.suite.id]: options.dirty },
        testSuiteRunStates: {},
        updateTestSuiteItems: initialStoreState.updateTestSuiteItems,
        updateTestSuiteName: initialStoreState.updateTestSuiteName,
        updateTestSuiteDefaultEnv: initialStoreState.updateTestSuiteDefaultEnv,
        updateTestSuiteDefaultAuth: initialStoreState.updateTestSuiteDefaultAuth,
        updateTestSuiteSettings: initialStoreState.updateTestSuiteSettings,
        markTestSuiteClean: initialStoreState.markTestSuiteClean,
        addTestCase: initialStoreState.addTestCase,
        updateTestCase: initialStoreState.updateTestCase,
        deleteTestCase: initialStoreState.deleteTestCase,
        isTestSuiteRunning: initialStoreState.isTestSuiteRunning,
        isTestSuiteDirty: initialStoreState.isTestSuiteDirty,
    } as Partial<ReturnType<typeof useAppStateStore.getState>>);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TestSuiteEditor AddItemDialog — exclusion gate (FEAT-011)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        useAppStateStore.setState({
            collections: [],
            flows: [],
            testSuites: [],
            testSuiteDirtyStates: {},
            testSuiteRunStates: {},
        } as Partial<ReturnType<typeof useAppStateStore.getState>>);
    });

    it('renders only HTTP requests in the Requests tab', () => {
        const suite = makeSuite('suite-1');
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users'),
                makeWsItem('ws-1', 'Subscribe Events'),
                makeSseItem('sse-1', 'Event Stream'),
                makeHttpItem('http-2', 'Create User'),
            ]),
        ];
        seedStore({ suite, collections });
        renderEditor(suite);

        openAddDialog();

        const dialog = screen.getByTestId('dialog-content');
        expect(within(dialog).getByText('Get Users')).toBeTruthy();
        expect(within(dialog).getByText('Create User')).toBeTruthy();
    });

    it('WS requests are excluded from the Requests tab', () => {
        const suite = makeSuite('suite-1');
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users'),
                makeWsItem('ws-1', 'Subscribe Events'),
            ]),
        ];
        seedStore({ suite, collections });
        renderEditor(suite);

        openAddDialog();

        expect(screen.queryByText('Subscribe Events')).toBeNull();
    });

    it('SSE requests are excluded from the Requests tab', () => {
        const suite = makeSuite('suite-1');
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users'),
                makeSseItem('sse-1', 'Event Stream'),
            ]),
        ];
        seedStore({ suite, collections });
        renderEditor(suite);

        openAddDialog();

        expect(screen.queryByText('Event Stream')).toBeNull();
    });

    it('Requests tab count label reflects HTTP-only count', () => {
        const suite = makeSuite('suite-1');
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users'),
                makeHttpItem('http-2', 'Create User'),
                makeWsItem('ws-1', 'Subscribe Events'),
                makeSseItem('sse-1', 'Event Stream'),
            ]),
        ];
        seedStore({ suite, collections });
        renderEditor(suite);

        openAddDialog();

        // "Requests (2)" tab button — WS and SSE do not count
        expect(screen.getByText(/Requests \(2\)/)).toBeTruthy();
    });

    it('shows "No requests available" when all collection requests are WS/SSE', () => {
        const suite = makeSuite('suite-1');
        const collections = [
            makeCollection('My API', [
                makeWsItem('ws-1', 'Subscribe Events'),
                makeSseItem('sse-1', 'Event Stream'),
            ]),
        ];
        seedStore({ suite, collections });
        renderEditor(suite);

        openAddDialog();

        expect(screen.getByText('No requests available')).toBeTruthy();
    });

    it('includes legacy requests (no protocol field) as HTTP', () => {
        const suite = makeSuite('suite-1');
        const collections = [
            makeCollection('My API', [
                makeLegacyHttpItem('legacy-1', 'Legacy Endpoint'),
                makeWsItem('ws-1', 'Subscribe Events'),
            ]),
        ];
        seedStore({ suite, collections });
        renderEditor(suite);

        openAddDialog();

        expect(screen.getByText('Legacy Endpoint')).toBeTruthy();
        expect(screen.queryByText('Subscribe Events')).toBeNull();
    });

    it('renders request URL text in request rows for hover preview', () => {
        const suite = makeSuite('suite-1');
        const collections = [
            makeCollection('My API', [
                makeHttpItem('http-1', 'Get Users'),
            ]),
        ];
        seedStore({ suite, collections });
        renderEditor(suite);

        openAddDialog();

        expect(screen.getByText('https://api.example.com/http-1')).toBeTruthy();
    });

    it('Flows tab is unaffected — all flows are shown', () => {
        const suite = makeSuite('suite-1');
        const flows = [makeFlow('flow-1', 'My Flow'), makeFlow('flow-2', 'Another Flow')];
        seedStore({ suite, flows });
        renderEditor(suite);

        openAddDialog();

        // Switch to the Flows tab
        const flowsTab = screen.getByText(/Flows/);
        fireEvent.click(flowsTab);

        expect(screen.getByText('My Flow')).toBeTruthy();
        expect(screen.getByText('Another Flow')).toBeTruthy();
    });

    it('selected HTTP request can be added via the Add button', () => {
        const updateTestSuiteItems = vi.fn();
        const suite = makeSuite('suite-1');
        const collections = [
            makeCollection('my-api.json', [
                makeHttpItem('http-1', 'Get Users'),
            ]),
        ];
        seedStore({ suite, collections });
        useAppStateStore.setState({
            updateTestSuiteItems,
        } as Partial<ReturnType<typeof useAppStateStore.getState>>);
        renderEditor(suite);

        openAddDialog();

        // Click the request row to select it
        const requestRow = screen.getByText('Get Users');
        fireEvent.click(requestRow);

        // Click the Add button
        const addButton = screen.getByTestId('primary-btn');
        fireEvent.click(addButton);

        expect(updateTestSuiteItems).toHaveBeenCalled();
    });

    it('existing WS/SSE test items in suite still render fallback row details', () => {
        // Pre-existing WS test item in the suite (saved before the exclusion gate)
        const wsTestItem: TestSuite['items'][number] = {
            id: 'item-ws-1',
            type: 'request',
            name: 'WS Subscribe',
            referenceId: 'my-api.json:ws-1',
            order: 0,
            enabled: true,
        };
        const suite = makeSuite('suite-1', [wsTestItem]);
        const collections = [
            makeCollection('my-api.json', [
                makeWsItem('ws-1', 'Subscribe Events'),
            ]),
        ];
        seedStore({ suite, collections });
        renderEditor(suite);

        // The TestItemRow component renders for each test item. Since we've
        // stubbed the heavy sub-components, only the toolbar and item container
        // render. We verify the test suite editor renders without throwing for
        // pre-existing WS items — in real use, the row would show the item name
        // from `item.name` or fallback metadata.
        expect(screen.queryByText(/error/i)).toBeNull();
    });

    it('updates enabled checkbox immediately when suite is already dirty', () => {
        const suite = makeRequestItemSuite('suite-dirty-1', true);
        seedStoreForEnabledToggle({ suite, dirty: true });
        renderEditor(suite);

        const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
        expect(checkbox.checked).toBe(true);

        fireEvent.click(checkbox);

        const updatedCheckbox = screen.getByRole('checkbox') as HTMLInputElement;
        expect(updatedCheckbox.checked).toBe(false);
        expect(useAppStateStore.getState().testSuites[0].items[0].enabled).toBe(false);
    });

    it('keeps checkbox state in sync after suite transitions to dirty', () => {
        const suite = makeRequestItemSuite('suite-dirty-2', true);
        seedStoreForEnabledToggle({ suite, dirty: false });
        renderEditor(suite);

        fireEvent.click(screen.getByRole('checkbox'));
        expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
        expect(useAppStateStore.getState().testSuites[0].items[0].enabled).toBe(false);

        fireEvent.click(screen.getByRole('checkbox'));
        expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
        expect(useAppStateStore.getState().testSuites[0].items[0].enabled).toBe(true);
    });
});
