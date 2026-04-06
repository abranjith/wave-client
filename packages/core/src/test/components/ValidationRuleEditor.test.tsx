/**
 * Tests for ValidationRuleEditor, ValidationWizard, and RuleEditorDialog.
 *
 * Tested:
 *  1-4   Status field visibility: operator, value, upper bound, multi-value, no-value
 *  5-7   Header field visibility: header name, exists hides value, equals shows value + case
 *  8-12  Body field visibility: contains, json_path_equals, json_path_exists, schema, is_json
 *  13-14 Time field visibility: value input, between shows upper bound
 *  15    Category change resets fields but retains name
 *  16    nameError prop shows error message
 *  17    onChange fires when name input changes
 *  18    onChange fires when operator select changes
 *  19-20 ValidationWizard smoke tests: add mode, edit mode
 *  21    RuleEditorDialog smoke test: renders ValidationRuleEditor form
 *  FEAT-003 (T1-T10): Tooltips, regex placeholder, schema validation indicator
 *
 * Test strategy:
 * - ValidationRuleEditor is fully controlled.  Field-visibility tests pass rules
 *   with specific operators and assert on the rendered DOM without any UI
 *   interaction.
 * - onChange and selection tests use fireEvent on native inputs produced by the
 *   mocked Radix primitives.
 * - Radix Select, Switch, Dialog, and Tooltip are mocked with native HTML
 *   equivalents for reliable JSDOM testing.
 * - validateJsonSchemaString is mocked to allow indicator state control.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
    createEmptyStatusRule,
    createEmptyHeaderRule,
    createEmptyBodyRule,
    createEmptyTimeRule,
} from '../../types/validation';
import type { ValidationRule, GlobalValidationRule } from '../../types/validation';
import { ValidationRuleEditor } from '../../components/common/ValidationRuleEditor';
import ValidationWizard from '../../components/common/ValidationWizard';
import { RuleEditorDialog } from '../../components/common/RequestValidation';
import * as schemaValidationModule from '../../utils/schemaValidation';

// ── Mocks ────────────────────────────────────────────────────────────────────

/**
 * Replace Radix Select with a native <select> so fireEvent.change() works
 * and JSDOM does not need floating-UI/pointer-event support.
 */
vi.mock('../../components/ui/select', () => ({
    Select: ({ value, onValueChange, children }: any) => (
        <select
            value={value}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onValueChange(e.target.value)}
        >
            {children}
        </select>
    ),
    // SelectTrigger renders null so the <select> only contains <option> children
    SelectTrigger: () => null,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
    SelectValue: () => null,
}));

/** Replace Radix Switch with a native checkbox. */
vi.mock('../../components/ui/switch', () => ({
    Switch: ({ id, checked, onCheckedChange, disabled, title }: any) => (
        <input
            type="checkbox"
            id={id}
            checked={Boolean(checked)}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onCheckedChange?.(e.target.checked)}
            disabled={disabled}
            title={title}
        />
    ),
}));

/** Replace Radix Dialog with a simple conditional wrapper. */
vi.mock('../../components/ui/dialog', () => ({
    Dialog: ({ children, open }: any) =>
        open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: any) => <div>{children}</div>,
    DialogHeader: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <h2>{children}</h2>,
    DialogDescription: ({ children }: any) => <p>{children}</p>,
    DialogFooter: ({ children }: any) => <div>{children}</div>,
    DialogClose: ({ children }: any) => <>{children}</>,
}));

/**
 * Replace Radix Tooltip with simple pass-through wrappers so tooltip content
 * is rendered into the DOM and queryable in JSDOM tests.
 */
vi.mock('../../components/ui/tooltip', () => ({
    Tooltip: ({ children }: any) => <>{children}</>,
    TooltipTrigger: ({ children }: any) => <>{children}</>,
    TooltipContent: ({ children }: any) => <span data-testid="tooltip-content">{children}</span>,
}));

/**
 * Mock validateJsonSchemaString so tests can control its return value without
 * needing a real ajv instance in JSDOM environment.
 */
vi.mock('../../utils/schemaValidation', () => ({
    validateJsonSchemaString: vi.fn(() => ({ valid: true })),
}));

/**
 * Pure-function mock so ValidationWizard does not need the Zustand store.
 * Converts a flat GlobalValidationRule to the minimal ValidationRule shape
 * that ValidationRuleEditor needs.
 */
vi.mock('../../hooks/store/createValidationRulesSlice', () => ({
    globalRuleToValidationRule: (rule: GlobalValidationRule): ValidationRule => {
        const { id, name, description, enabled, category } = rule;
        switch (category) {
            case 'status':
                return {
                    id, name, description, enabled, category,
                    operator: (rule.operator as any) ?? 'equals',
                    value: (rule.value as number) ?? 200,
                };
            case 'header':
                return {
                    id, name, description, enabled, category,
                    operator: (rule.operator as any) ?? 'exists',
                    headerName: (rule as any).headerName ?? '',
                };
            case 'body':
                return {
                    id, name, description, enabled, category,
                    operator: (rule.operator as any) ?? 'contains',
                    value: (rule.value as string) ?? '',
                };
            default: // 'time'
                return {
                    id, name, description, enabled, category: 'time',
                    operator: (rule.operator as any) ?? 'less_than',
                    value: (rule.value as number) ?? 1000,
                };
        }
    },
}));

/** Prevent RequestValidation.tsx's useAppStateStore from touching real Zustand state. */
vi.mock('../../hooks/store/useAppStateStore', () => ({
    default: vi.fn(() => null),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_ID = 'test-rule-1';

/**
 * Returns all native <select> elements inside the rendered container.
 * Index 0 = Category, Index 1 = category-specific operator (when present).
 */
function getSelects(container: HTMLElement): NodeListOf<HTMLSelectElement> {
    return container.querySelectorAll('select');
}

// ============================================================================
// ValidationRuleEditor
// ============================================================================

describe('ValidationRuleEditor', () => {
    let onChange: Mock<(rule: ValidationRule) => void>;

    beforeEach(() => {
        onChange = vi.fn<(rule: ValidationRule) => void>();
    });

    // ── Status ──────────────────────────────────────────────────────────────

    it('(status) renders operator select and Value input; no Upper Bound with default "equals"', () => {
        const { container } = render(
            <ValidationRuleEditor
                rule={{ ...createEmptyStatusRule(TEST_ID), operator: 'equals', value: 200 }}
                onChange={onChange}
            />
        );
        // Category + Operator selects
        expect(getSelects(container).length).toBeGreaterThanOrEqual(2);
        // Numeric spinbutton for the Value field
        expect(screen.getByRole('spinbutton')).toBeInTheDocument();
        expect(screen.queryByText(/upper bound/i)).not.toBeInTheDocument();
    });

    it('(status) "between" operator shows Upper Bound input', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyStatusRule(TEST_ID), operator: 'between', value: 200, value2: 299 }}
                onChange={onChange}
            />
        );
        expect(screen.getByText(/upper bound/i)).toBeInTheDocument();
        expect(screen.getAllByRole('spinbutton').length).toBe(2);
    });

    it('(status) "in" operator shows comma-separated input and hides single-value spinbutton', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyStatusRule(TEST_ID), operator: 'in', values: [200, 201] }}
                onChange={onChange}
            />
        );
        expect(screen.getByPlaceholderText(/200, 201, 204/)).toBeInTheDocument();
        expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    });

    it('(status) "is_success" hides all value fields', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyStatusRule(TEST_ID), operator: 'is_success' }}
                onChange={onChange}
            />
        );
        expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
        expect(screen.queryByText(/upper bound/i)).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/comma-separated/i)).not.toBeInTheDocument();
    });

    // ── Header ──────────────────────────────────────────────────────────────

    it('(header) renders Header Name input', () => {
        render(
            <ValidationRuleEditor
                rule={createEmptyHeaderRule(TEST_ID)}
                onChange={onChange}
            />
        );
        expect(screen.getByPlaceholderText(/content-type/i)).toBeInTheDocument();
    });

    it('(header) "exists" operator hides Expected Value input and Case-sensitive toggle', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyHeaderRule(TEST_ID), operator: 'exists' }}
                onChange={onChange}
            />
        );
        expect(screen.queryByText(/expected value/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/case-sensitive/i)).not.toBeInTheDocument();
    });

    it('(header) "equals" operator shows Expected Value input and Case-sensitive toggle', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyHeaderRule(TEST_ID), operator: 'equals', value: '' }}
                onChange={onChange}
            />
        );
        expect(screen.getByText(/expected value/i)).toBeInTheDocument();
        expect(screen.getByText(/case-sensitive/i)).toBeInTheDocument();
    });

    // ── Body ────────────────────────────────────────────────────────────────

    it('(body) "contains" shows value textarea; no JSON Path input', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyBodyRule(TEST_ID), operator: 'contains', value: '' }}
                onChange={onChange}
            />
        );
        expect(screen.getByPlaceholderText(/expected text or value/i)).toBeInTheDocument();
        expect(screen.queryByText('JSON Path')).not.toBeInTheDocument();
    });

    it('(body) "json_path_equals" shows both JSON Path input and value textarea', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyBodyRule(TEST_ID), operator: 'json_path_equals', value: '', jsonPath: '' }}
                onChange={onChange}
            />
        );
        expect(screen.getByText('JSON Path')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/expected text or value/i)).toBeInTheDocument();
    });

    it('(body) "json_path_exists" shows JSON Path input but no value textarea', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyBodyRule(TEST_ID), operator: 'json_path_exists', jsonPath: '' }}
                onChange={onChange}
            />
        );
        expect(screen.getByText('JSON Path')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/expected text or value/i)).not.toBeInTheDocument();
    });

    it('(body) "json_schema_matches" shows JSON Schema label; hides Case-sensitive toggle', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyBodyRule(TEST_ID), operator: 'json_schema_matches', value: '' }}
                onChange={onChange}
            />
        );
        // The label changes to "JSON Schema" for this operator
        expect(screen.getByText('JSON Schema')).toBeInTheDocument();
        expect(screen.queryByText(/case-sensitive/i)).not.toBeInTheDocument();
    });

    it('(body) "is_json" hides value textarea and JSON Path input', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyBodyRule(TEST_ID), operator: 'is_json' }}
                onChange={onChange}
            />
        );
        expect(screen.queryByPlaceholderText(/expected text or value/i)).not.toBeInTheDocument();
        expect(screen.queryByText('JSON Path')).not.toBeInTheDocument();
    });

    // ── Time ────────────────────────────────────────────────────────────────

    it('(time) renders Value (milliseconds) label and spinbutton', () => {
        render(
            <ValidationRuleEditor
                rule={createEmptyTimeRule(TEST_ID)}
                onChange={onChange}
            />
        );
        expect(screen.getByText(/value \(milliseconds\)/i)).toBeInTheDocument();
        expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    });

    it('(time) "between" operator shows Upper Bound (milliseconds) input', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyTimeRule(TEST_ID), operator: 'between', value: 500, value2: 2000 }}
                onChange={onChange}
            />
        );
        expect(screen.getByText(/upper bound \(milliseconds\)/i)).toBeInTheDocument();
        expect(screen.getAllByRole('spinbutton').length).toBe(2);
    });

    // ── Common / interaction ─────────────────────────────────────────────────

    it('category change calls onChange with new category and retains the rule name', () => {
        const { container } = render(
            <ValidationRuleEditor
                rule={{ ...createEmptyStatusRule(TEST_ID), name: 'My Rule' }}
                onChange={onChange}
            />
        );
        // Category is the first <select> in the DOM
        const categorySelect = getSelects(container)[0];
        fireEvent.change(categorySelect, { target: { value: 'body' } });

        expect(onChange).toHaveBeenCalledOnce();
        const updated = onChange.mock.calls[0][0] as ValidationRule;
        expect(updated.category).toBe('body');
        expect(updated.name).toBe('My Rule');
    });

    it('shows the nameError message when the nameError prop is set', () => {
        render(
            <ValidationRuleEditor
                rule={createEmptyStatusRule(TEST_ID)}
                onChange={onChange}
                nameError="Name is required"
            />
        );
        expect(screen.getByText('Name is required')).toBeInTheDocument();
    });

    it('calls onChange with the updated name when the Name input changes', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyStatusRule(TEST_ID), name: 'Old Name' }}
                onChange={onChange}
            />
        );
        const nameInput = screen.getByPlaceholderText(/success status/i);
        fireEvent.change(nameInput, { target: { value: 'New Name' } });

        expect(onChange).toHaveBeenCalledOnce();
        expect(onChange.mock.calls[0][0].name).toBe('New Name');
    });

    it('calls onChange with the updated operator when the operator select changes', () => {
        const { container } = render(
            <ValidationRuleEditor
                rule={{ ...createEmptyStatusRule(TEST_ID), operator: 'equals' }}
                onChange={onChange}
            />
        );
        // Operator is the second <select> (after Category)
        const operatorSelect = getSelects(container)[1];
        fireEvent.change(operatorSelect, { target: { value: 'not_equals' } });

        expect(onChange).toHaveBeenCalledOnce();
        expect(onChange.mock.calls[0][0].operator).toBe('not_equals');
    });
});

// ============================================================================
// ValidationWizard smoke tests
// ============================================================================

describe('ValidationWizard', () => {
    it('renders in "add" mode when no rule prop is provided', () => {
        render(
            <ValidationWizard
                onSave={vi.fn()}
                onCancel={vi.fn()}
                existingNames={[]}
            />
        );
        // The ValidationRuleEditor form should be rendered
        expect(screen.getByText('Name *')).toBeInTheDocument();
    });

    it('pre-fills the rule name when an existing GlobalValidationRule is passed', () => {
        const globalRule: GlobalValidationRule = {
            id: 'gr-1',
            name: 'Status 200',
            description: 'Checks status code',
            enabled: true,
            category: 'status',
            operator: 'equals',
            value: 200,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        render(
            <ValidationWizard
                rule={globalRule}
                onSave={vi.fn()}
                onCancel={vi.fn()}
                existingNames={['Other Rule']}
            />
        );
        // The name input should be pre-filled with the rule's name
        expect(screen.getByDisplayValue('Status 200')).toBeInTheDocument();
    });
});

// ============================================================================
// RuleEditorDialog smoke test
// ============================================================================

describe('RuleEditorDialog', () => {
    it('renders the ValidationRuleEditor form fields when the dialog is open', () => {
        render(
            <RuleEditorDialog
                rule={createEmptyStatusRule('rd-1')}
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
                title="Edit Validation Rule"
            />
        );
        expect(screen.getByTestId('dialog')).toBeInTheDocument();
        // The ValidationRuleEditor form must be visible
        expect(screen.getByText('Name *')).toBeInTheDocument();
    });
});

// ============================================================================
// FEAT-003: Tooltips, Placeholders & Schema Validation
// ============================================================================

describe('FEAT-003: Tooltips, Placeholders & Schema Validation', () => {
    let onChange: Mock<(rule: ValidationRule) => void>;
    let validateMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        onChange = vi.fn<(rule: ValidationRule) => void>();
        validateMock = vi.mocked(schemaValidationModule.validateJsonSchemaString);
        validateMock.mockClear();
        validateMock.mockReturnValue({ valid: true });
    });

    // T1: body category tooltip appears for body rules
    it('T1: renders info icon (aria-label) for body category tooltip', () => {
        render(
            <ValidationRuleEditor
                rule={createEmptyBodyRule('t1')}
                onChange={onChange}
            />
        );
        const bodyTooltipText = 'Body validation only supports text-based response content (JSON, XML, HTML, plain text). Binary responses are not supported.';
        expect(screen.getByLabelText(bodyTooltipText)).toBeInTheDocument();
    });

    // T2: body category tooltip does NOT appear for non-body rules
    it('T2: does not render body category tooltip icon for status rules', () => {
        render(
            <ValidationRuleEditor
                rule={createEmptyStatusRule('t2')}
                onChange={onChange}
            />
        );
        const bodyTooltipText = 'Body validation only supports text-based response content (JSON, XML, HTML, plain text). Binary responses are not supported.';
        expect(screen.queryByLabelText(bodyTooltipText)).not.toBeInTheDocument();
    });

    // T3: JSON Path tooltip appears for json_path_equals
    it('T3: renders JSON Path field tooltip for json_path_equals operator', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyBodyRule('t3'), operator: 'json_path_equals', jsonPath: '', value: '' }}
                onChange={onChange}
            />
        );
        // The mocked TooltipContent renders as <span data-testid="tooltip-content">
        const tooltipContents = screen.getAllByTestId('tooltip-content');
        const jsonPathTooltip = tooltipContents.find((el) =>
            el.textContent?.includes('JSONPath expression')
        );
        expect(jsonPathTooltip).toBeTruthy();
    });

    // T4: JSON Schema tooltip appears for json_schema_matches
    it('T4: renders JSON Schema field tooltip for json_schema_matches operator', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyBodyRule('t4'), operator: 'json_schema_matches', value: '' }}
                onChange={onChange}
            />
        );
        const tooltipContents = screen.getAllByTestId('tooltip-content');
        const schemaTooltip = tooltipContents.find((el) =>
            el.textContent?.includes('valid JSON Schema')
        );
        expect(schemaTooltip).toBeTruthy();
    });

    // T5: JSON Schema tooltip does NOT appear for non-schema operators
    it('T5: does not render JSON Schema tooltip for "contains" operator', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyBodyRule('t5'), operator: 'contains', value: '' }}
                onChange={onChange}
            />
        );
        const tooltipContents = screen.queryAllByTestId('tooltip-content');
        const schemaTooltip = tooltipContents.find((el) =>
            el.textContent?.includes('valid JSON Schema')
        );
        expect(schemaTooltip).toBeFalsy();
    });

    // T6: matches_regex header operator shows regex placeholder
    it('T6: shows regex placeholder for matches_regex header operator', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyHeaderRule('t6'), operator: 'matches_regex', value: '' }}
                onChange={onChange}
            />
        );
        // The regex UUID placeholder should be present in one of the inputs
        const input = screen.getByPlaceholderText(/\^.*\[0-9a-f\]/);
        expect(input).toBeInTheDocument();
    });

    // T7: non-regex header operator shows default placeholder
    it('T7: shows default placeholder for "equals" header operator', () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyHeaderRule('t7'), operator: 'equals', value: '' }}
                onChange={onChange}
            />
        );
        expect(screen.getByPlaceholderText('e.g., application/json')).toBeInTheDocument();
    });

    // T8: valid schema → shows "Valid JSON Schema" indicator
    it('T8: shows valid schema indicator when validateJsonSchemaString returns valid', async () => {
        validateMock.mockReturnValue({ valid: true });

        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyBodyRule('t8'), operator: 'json_schema_matches', value: '{"type":"object"}' }}
                onChange={onChange}
            />
        );

        // useEffect runs after render; wrap in act to flush it
        await act(async () => {});

        expect(screen.getByText('Valid JSON Schema')).toBeInTheDocument();
    });

    // T9: invalid schema → shows error messages
    it('T9: shows error indicator when validateJsonSchemaString returns invalid', async () => {
        validateMock.mockReturnValue({ valid: false, errors: ['Invalid JSON Schema: bad type'] });

        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyBodyRule('t9'), operator: 'json_schema_matches', value: '{"type":"bad"}' }}
                onChange={onChange}
            />
        );

        await act(async () => {});

        expect(screen.getByText('Invalid JSON Schema: bad type')).toBeInTheDocument();
    });

    // T10: empty schema value → no indicator shown
    it('T10: hides schema indicator when schema value is empty', async () => {
        render(
            <ValidationRuleEditor
                rule={{ ...createEmptyBodyRule('t10'), operator: 'json_schema_matches', value: '' }}
                onChange={onChange}
            />
        );

        await act(async () => {});

        expect(screen.queryByText('Valid JSON Schema')).not.toBeInTheDocument();
        // validateJsonSchemaString should NOT have been called for empty value
        expect(validateMock).not.toHaveBeenCalled();
    });
});
