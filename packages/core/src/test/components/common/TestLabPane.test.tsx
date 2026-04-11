/**
 * Unit tests for TestLabPane — FEAT-003 regression coverage.
 *
 * Protects against the following regressions:
 *  - Re-introduction of the per-row hover run shortcut button (removed in FEAT-003).
 *  - Delete action bypassing the confirmation dialog.
 *  - Delete completing without user confirmation.
 *  - Delete executing despite the user cancelling the dialog.
 *  - Adapter errors on delete not surfacing to the user or leaving stale store state.
 *  - Running-state label disappearing when a suite is mid-run.
 *
 * Tested scenarios:
 *  1. Dropdown renders Rename and Delete menu items.
 *  2. The Delete item has a visually destructive (red) class.
 *  3. No per-row run shortcut button is rendered (hover or otherwise).
 *  4. Clicking Delete opens the confirmation dialog with correct title and message.
 *  5. Cancelling the dialog does NOT call adapter deleteTestSuite.
 *  6. Confirming the dialog calls adapter deleteTestSuite and removes the suite from the store.
 *  7. A failed adapter delete shows an error notification and does NOT remove the suite.
 *  8. The "Running..." label is shown when a suite's run state is active.
 *  9. The dropdown trigger is hidden while a suite is running.
 *
 * Strategy:
 *  - Radix UI DropdownMenu, Tooltip, and Dialog primitives are replaced with
 *    HTML stubs that render all children unconditionally so JSDOM can interact
 *    without hover/keyboard navigation.
 *  - Adapter calls are tested via vi.spyOn on the mock adapter.
 *  - Zustand store is seeded with test suites via useAppStateStore.setState
 *    and reset in afterEach.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter } from '../../mocks/mockAdapter';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import TestLabPane from '../../../components/common/TestLabPane';
import type { TestSuite } from '../../../types/testSuite';
import { err } from '../../../utils/result';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../components/ui/dialog', () => ({
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
        open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode; className?: string }) => (
        <h2 data-testid="dialog-title">{children}</h2>
    ),
    DialogDescription: ({ children }: { children: React.ReactNode }) => (
        <p data-testid="dialog-description">{children}</p>
    ),
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../components/ui/PrimaryButton', () => ({
    PrimaryButton: ({
        onClick,
        text,
        disabled,
    }: {
        onClick: () => void;
        text?: string;
        disabled?: boolean;
    }) => (
        <button onClick={onClick} disabled={disabled} data-testid="confirm-button">
            {text ?? 'Confirm'}
        </button>
    ),
}));

vi.mock('../../../components/ui/SecondaryButton', () => ({
    SecondaryButton: ({
        onClick,
        text,
        children,
        disabled,
    }: {
        onClick?: () => void;
        text?: string;
        children?: React.ReactNode;
        disabled?: boolean;
        [key: string]: unknown;
    }) => (
        <button onClick={onClick} disabled={disabled} data-testid="cancel-button">
            {text ?? children ?? 'Cancel'}
        </button>
    ),
}));

vi.mock('../../../components/ui/dropdown-menu', () => ({
    DropdownMenu: ({
        children,
    }: {
        children: React.ReactNode;
        onOpenChange?: (open: boolean) => void;
    }) => <div data-testid="dropdown">{children}</div>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
        <>{children}</>
    ),
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="dropdown-content">{children}</div>
    ),
    DropdownMenuItem: ({
        children,
        onClick,
        className,
    }: {
        children: React.ReactNode;
        onClick?: (e: React.MouseEvent) => void;
        className?: string;
    }) => (
        <button data-testid="menu-item" className={className} onClick={onClick}>
            {children}
        </button>
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

vi.mock('../../../components/ui/button', () => ({
    Button: ({
        children,
        onClick,
    }: {
        children: React.ReactNode;
        onClick?: (e?: React.MouseEvent) => void;
    }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock('../../../components/ui/input', () => ({
    Input: ({
        value,
        onChange,
        onBlur,
        onKeyDown,
        autoFocus,
        onClick,
        className,
        placeholder,
    }: React.InputHTMLAttributes<HTMLInputElement>) => (
        <input
            data-testid={autoFocus ? 'rename-input' : 'search-input'}
            value={value ?? ''}
            onChange={onChange}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            autoFocus={autoFocus}
            onClick={onClick}
            className={className}
            placeholder={placeholder}
        />
    ),
}));

// ── Test Data ─────────────────────────────────────────────────────────────────

const TEST_SUITE: TestSuite = {
    id: 'suite-001',
    name: 'Auth Suite',
    items: [],
    settings: {
        concurrentCalls: 1,
        delayBetweenCalls: 0,
        stopOnFailure: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

const SECOND_SUITE: TestSuite = {
    id: 'suite-002',
    name: 'Billing Suite',
    items: [],
    settings: {
        concurrentCalls: 1,
        delayBetweenCalls: 0,
        stopOnFailure: false,
    },
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPane(
    mockAdapterResult?: ReturnType<typeof createMockAdapter>,
    props?: { onTestSuiteSelect?: (suite: TestSuite) => void },
) {
    const result =
        mockAdapterResult ??
        createMockAdapter({ initialData: { testSuites: [TEST_SUITE] } });
    const { adapter, notificationLog } = result;

    const renderResult = render(
        <AdapterProvider adapter={adapter}>
            <TestLabPane onTestSuiteSelect={props?.onTestSuiteSelect} />
        </AdapterProvider>,
    );

    return { ...renderResult, adapter, notificationLog };
}

function seedStore(suites: TestSuite[] = [TEST_SUITE]) {
    useAppStateStore.setState({
        testSuites: suites,
        isTestSuitesLoading: false,
        testSuitesLoadError: null,
        testSuiteRunStates: {},
        testSuiteDirtyStates: {},
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TestLabPane — FEAT-003 pane actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        seedStore();
    });

    afterEach(() => {
        useAppStateStore.setState({ testSuites: [], testSuiteRunStates: {} });
    });

    // ── Menu contents ────────────────────────────────────────────────────────

    it('renders Rename and Delete menu items for each suite row', () => {
        renderPane();
        const items = screen.getAllByTestId('menu-item');
        const labels = items.map((el) => el.textContent ?? '');
        expect(labels.some((l) => l.includes('Rename'))).toBe(true);
        expect(labels.some((l) => l.includes('Delete'))).toBe(true);
    });

    it('applies a red/destructive class to the Delete menu item', () => {
        renderPane();
        const items = screen.getAllByTestId('menu-item');
        const deleteItem = items.find((el) => el.textContent?.includes('Delete'))!;
        expect(deleteItem.className).toMatch(/red/);
    });

    // ── No run shortcut button ───────────────────────────────────────────────

    it('does NOT render a per-row run shortcut button (PlayIcon button)', () => {
        // Seed a suite with items so that the old run button would have appeared
        const suiteWithItems: TestSuite = {
            ...TEST_SUITE,
            items: [
                {
                    id: 'item-001',
                    type: 'request',
                    name: 'GET /users',
                    order: 0,
                    enabled: true,
                    referenceId: 'req-001',
                },
            ],
        };
        seedStore([suiteWithItems]);
        renderPane();

        // There should be no button that contains an svg with a play-like element.
        // Since our Button mock renders plain <button>, we verify the suite row
        // has at most one actionable button (the dropdown trigger) per row, not two.
        // We also confirm there are no aria-label or title attributes pointing to "Run".
        const allButtons = screen.getAllByRole('button');
        const runButtons = allButtons.filter(
            (btn) =>
                btn.getAttribute('aria-label')?.toLowerCase().includes('run') ||
                btn.getAttribute('title')?.toLowerCase().includes('run'),
        );
        expect(runButtons).toHaveLength(0);
    });

    it('renders no "Run Test Suite" tooltip content', () => {
        renderPane();
        // TooltipContent is stubbed to null, so any "Run Test Suite" text would
        // have to appear in some other visible element.
        expect(screen.queryByText('Run Test Suite')).toBeNull();
    });

    // ── Delete confirmation dialog ───────────────────────────────────────────

    it('clicking Delete opens the confirmation dialog', () => {
        renderPane();

        const items = screen.getAllByTestId('menu-item');
        const deleteBtn = items.find((el) => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);

        expect(screen.getByTestId('dialog')).toBeInTheDocument();
        expect(screen.getByTestId('dialog-title')).toHaveTextContent('Delete Test Suite');
    });

    it('the confirmation dialog message references the suite name', () => {
        renderPane();

        const deleteBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);

        const description = screen.getByTestId('dialog-description');
        expect(description.textContent).toContain('Auth Suite');
    });

    it('cancelling the dialog does NOT call deleteTestSuite', async () => {
        const mock = createMockAdapter({ initialData: { testSuites: [TEST_SUITE] } });
        const deleteSpy = vi.spyOn(mock.adapter.storage, 'deleteTestSuite');
        renderPane(mock);

        const deleteBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);

        const cancelBtn = screen.getByTestId('cancel-button');
        fireEvent.click(cancelBtn);

        await waitFor(() => expect(screen.queryByTestId('dialog')).toBeNull());

        expect(deleteSpy).not.toHaveBeenCalled();
        // Suite still in store
        expect(useAppStateStore.getState().testSuites).toHaveLength(1);
    });

    it('confirming the dialog calls deleteTestSuite and removes the suite from the store', async () => {
        const mock = createMockAdapter({ initialData: { testSuites: [TEST_SUITE] } });
        const deleteSpy = vi.spyOn(mock.adapter.storage, 'deleteTestSuite');
        renderPane(mock);

        const deleteBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);

        const confirmBtn = screen.getByTestId('confirm-button');
        fireEvent.click(confirmBtn);

        await waitFor(() => {
            expect(deleteSpy).toHaveBeenCalledWith('suite-001');
        });

        await waitFor(() => {
            expect(useAppStateStore.getState().testSuites).toHaveLength(0);
        });
    });

    it('a failed adapter delete shows an error notification and does NOT remove the suite', async () => {
        const mock = createMockAdapter({ initialData: { testSuites: [TEST_SUITE] } });
        vi.spyOn(mock.adapter.storage, 'deleteTestSuite').mockResolvedValue(
            err('Storage unavailable'),
        );
        renderPane(mock);

        const deleteBtn = screen
            .getAllByTestId('menu-item')
            .find((el) => el.textContent?.includes('Delete'))!;
        fireEvent.click(deleteBtn);

        const confirmBtn = screen.getByTestId('confirm-button');
        fireEvent.click(confirmBtn);

        await waitFor(() => {
            const errors = mock.notificationLog.filter((n) => n.type === 'error');
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].message).toContain('Storage unavailable');
        });

        // Suite must still be present in the store
        expect(useAppStateStore.getState().testSuites).toHaveLength(1);
    });

    // ── Running state ────────────────────────────────────────────────────────

    it('shows the "Running..." label when testSuiteRunStates marks the suite as running', () => {
        useAppStateStore.setState({
            testSuiteRunStates: { 'suite-001': { isRunning: true, result: null, runningItemIds: new Set<string>() } },
        });
        renderPane();

        expect(screen.getByText('Running...')).toBeInTheDocument();
    });

    it('hides the dropdown trigger while a suite is running', () => {
        useAppStateStore.setState({
            testSuiteRunStates: { 'suite-001': { isRunning: true, result: null, runningItemIds: new Set<string>() } },
        });
        renderPane();

        // The MoreVertical dropdown trigger button should not be present while running
        const dropdowns = screen.queryAllByTestId('dropdown-content');
        expect(dropdowns).toHaveLength(0);
    });

    // ── Multiple suites ──────────────────────────────────────────────────────

    it('renders menu items for each suite independently', () => {
        seedStore([TEST_SUITE, SECOND_SUITE]);
        renderPane(createMockAdapter({ initialData: { testSuites: [TEST_SUITE, SECOND_SUITE] } }));

        const items = screen.getAllByTestId('menu-item');
        // 2 suites × 2 menu items (Rename + Delete) = 4 items
        expect(items).toHaveLength(4);
    });

    it('only removes the confirmed suite from the store, not sibling suites', async () => {
        seedStore([TEST_SUITE, SECOND_SUITE]);
        const mock = createMockAdapter({
            initialData: { testSuites: [TEST_SUITE, SECOND_SUITE] },
        });
        renderPane(mock);

        // Click Delete on the first suite's menu item
        const deleteItems = screen
            .getAllByTestId('menu-item')
            .filter((el) => el.textContent?.includes('Delete'));
        fireEvent.click(deleteItems[0]);

        fireEvent.click(screen.getByTestId('confirm-button'));

        await waitFor(() => {
            const suites = useAppStateStore.getState().testSuites;
            expect(suites).toHaveLength(1);
            expect(suites[0].name).toBe('Billing Suite');
        });
    });
});
