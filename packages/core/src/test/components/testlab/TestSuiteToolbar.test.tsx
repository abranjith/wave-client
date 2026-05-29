import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TestSuiteToolbar from '../../../components/testlab/TestSuiteToolbar';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import type { Environment } from '../../../types/collection';
import type { Auth } from '../../../hooks/store/createAuthSlice';

vi.mock('../../../components/ui/PrimaryButton', () => ({
    PrimaryButton: ({
        onClick,
        disabled,
        text,
    }: {
        onClick?: () => void;
        disabled?: boolean;
        text?: string;
    }) => (
        <button onClick={onClick} disabled={disabled}>
            {text ?? 'Primary'}
        </button>
    ),
}));

vi.mock('../../../components/ui/SecondaryButton', () => ({
    SecondaryButton: ({
        onClick,
        disabled,
        children,
    }: {
        onClick?: () => void;
        disabled?: boolean;
        children?: React.ReactNode;
    }) => (
        <button onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
}));

vi.mock('../../../components/ui/select', () => ({
    Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../components/ui/tooltip', () => ({
    TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const ENVIRONMENTS: Environment[] = [];
const AUTHS: Auth[] = [];

function renderToolbar(overrides?: Partial<React.ComponentProps<typeof TestSuiteToolbar>>) {
    const onNameChange = overrides?.onNameChange ?? vi.fn();

    render(
        <TestSuiteToolbar
            suiteId="suite-001"
            suiteName={overrides?.suiteName ?? 'Smoke Suite'}
            onNameChange={onNameChange}
            onAddItems={overrides?.onAddItems ?? vi.fn()}
            onRun={overrides?.onRun ?? vi.fn()}
            onCancel={overrides?.onCancel ?? vi.fn()}
            onToggleSettings={overrides?.onToggleSettings}
            isSettingsExpanded={overrides?.isSettingsExpanded ?? false}
            onSave={overrides?.onSave}
            isDirty={overrides?.isDirty ?? false}
            environments={overrides?.environments ?? ENVIRONMENTS}
            selectedEnvId={overrides?.selectedEnvId}
            onEnvChange={overrides?.onEnvChange ?? vi.fn()}
            auths={overrides?.auths ?? AUTHS}
            selectedAuthId={overrides?.selectedAuthId}
            onAuthChange={overrides?.onAuthChange ?? vi.fn()}
            enabledItemCount={overrides?.enabledItemCount ?? 1}
        />,
    );

    return { onNameChange };
}

describe('TestSuiteToolbar rename keyboard behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAppStateStore.setState({ testSuiteRunStates: {} });
    });

    it('uses a prominent focus style for the test suite name input', () => {
        renderToolbar();

        const input = screen.getByPlaceholderText('Test Suite Name') as HTMLInputElement;
        expect(input.className).toContain('focus:ring-2');
        expect(input.className).toContain('bg-slate-50');
    });

    it('places the caret at the end of the current suite name on focus', () => {
        renderToolbar();

        const input = screen.getByPlaceholderText('Test Suite Name') as HTMLInputElement;
        fireEvent.focus(input);

        expect(input.selectionStart).toBe(input.value.length);
        expect(input.selectionEnd).toBe(input.value.length);
    });

    it('pressing Enter blurs the suite name input', () => {
        const blurSpy = vi.spyOn(HTMLInputElement.prototype, 'blur');
        renderToolbar();

        const input = screen.getByPlaceholderText('Test Suite Name');
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(blurSpy).toHaveBeenCalled();
        blurSpy.mockRestore();
    });

    it('pressing Escape reverts the suite name to the value from focus start', () => {
        const onNameChange = vi.fn();
        renderToolbar({ suiteName: 'Smoke Suite', onNameChange });

        const input = screen.getByPlaceholderText('Test Suite Name');
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'Smoke Suite Updated' } });
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(onNameChange).toHaveBeenNthCalledWith(1, 'Smoke Suite Updated');
        expect(onNameChange).toHaveBeenLastCalledWith('Smoke Suite');
    });
});
