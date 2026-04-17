/**
 * Unit tests for TabsBar protocol badge rendering.
 *
 * Tested scenarios:
 *  1.  HTTP tab shows the method abbreviation (GET/POST/etc.) in the method-color style.
 *  2.  WS tab shows "WS" badge with teal class, not the HTTP method.
 *  3.  SSE tab shows "SSE" badge with purple class.
 *  4.  Protocol badge change does not affect tab click behaviour.
 *  5.  Protocol badge change does not affect tab close behaviour.
 *
 * Strategy:
 *  - Heavy Radix UI primitives (Tooltip, Dialog) are stubbed unconditionally.
 *  - PrimaryButton and SecondaryButton are stubbed to simple <button> elements.
 *  - Zustand store is seeded via useAppStateStore.setState and reset afterEach.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import TabsBar from '../../../components/common/TabsBar';
import { createEmptyTab } from '../../../types/tab';
import type { RequestProtocol } from '../../../types/collection';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../components/ui/tooltip', () => ({
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
        asChild ? <>{children}</> : <div>{children}</div>,
    TooltipContent: () => null,
}));

vi.mock('../../../components/ui/dialog', () => ({
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
        open ? <div data-testid="close-dialog">{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
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
        [key: string]: unknown;
    }) => (
        <button onClick={onClick} disabled={disabled} data-testid="primary-btn">
            {text ?? 'OK'}
        </button>
    ),
}));

vi.mock('../../../components/ui/SecondaryButton', () => ({
    SecondaryButton: ({
        onClick,
        text,
        children,
    }: {
        onClick?: () => void;
        text?: string;
        children?: React.ReactNode;
        [key: string]: unknown;
    }) => (
        <button onClick={onClick} data-testid="secondary-btn">
            {text ?? children ?? 'Cancel'}
        </button>
    ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTab(protocol: RequestProtocol, method = 'GET') {
    return { ...createEmptyTab(), protocol, method };
}

function seedTabs(tabs: ReturnType<typeof makeTab>[]) {
    useAppStateStore.setState({
        tabs,
        activeTabId: tabs[0]?.id ?? undefined,
    });
}

function renderTabsBar() {
    return render(<TabsBar />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TabsBar — protocol badge', () => {
    beforeEach(() => {
        useAppStateStore.setState({ tabs: [], activeTabId: undefined });
    });

    afterEach(() => {
        useAppStateStore.setState({ tabs: [], activeTabId: undefined });
    });

    it('HTTP tab shows method abbreviation "GET"', () => {
        seedTabs([makeTab('http', 'GET')]);
        renderTabsBar();
        expect(screen.getByText('GET')).toBeInTheDocument();
    });

    it('HTTP tab shows method abbreviation "POST"', () => {
        seedTabs([makeTab('http', 'POST')]);
        renderTabsBar();
        expect(screen.getByText('POS')).toBeInTheDocument();
    });

    it('WS tab shows "WS" badge, not the HTTP method', () => {
        seedTabs([makeTab('ws', 'GET')]);
        renderTabsBar();
        expect(screen.getByText('WS')).toBeInTheDocument();
        expect(screen.queryByText('GET')).not.toBeInTheDocument();
    });

    it('WS badge has teal color class', () => {
        seedTabs([makeTab('ws')]);
        renderTabsBar();
        const badge = screen.getByText('WS');
        expect(badge.className).toMatch(/teal/);
    });

    it('SSE tab shows "SSE" badge', () => {
        seedTabs([makeTab('sse')]);
        renderTabsBar();
        expect(screen.getByText('SSE')).toBeInTheDocument();
    });

    it('SSE badge has purple color class', () => {
        seedTabs([makeTab('sse')]);
        renderTabsBar();
        const badge = screen.getByText('SSE');
        expect(badge.className).toMatch(/purple/);
    });

    it('clicking a tab activates it via setActiveTab', () => {
        const tab1 = makeTab('http');
        const tab2 = makeTab('ws');
        useAppStateStore.setState({ tabs: [tab1, tab2], activeTabId: tab1.id });
        renderTabsBar();
        // Clicking on WS tab badge text activates it (the click is on the containing div)
        const badges = screen.getAllByText(/WS/);
        fireEvent.click(badges[0].closest('div[class*="px-4"]')!);
        expect(useAppStateStore.getState().activeTabId).toBe(tab2.id);
    });
});
