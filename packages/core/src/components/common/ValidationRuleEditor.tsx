import React, { useState, useEffect } from 'react';
import { InfoIcon, CheckIcon, XIcon } from 'lucide-react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { validateJsonSchemaString } from '../../utils/schemaValidation';
import {
    ValidationRule,
    ValidationRuleCategory,
    StatusOperator,
    StringOperator,
    BodyOperator,
    NumericOperator,
    ExistenceOperator,
    StatusValidationRule,
    HeaderValidationRule,
    BodyValidationRule,
    TimeValidationRule,
    isStatusRule,
    isHeaderRule,
    isBodyRule,
    isTimeRule,
    createEmptyStatusRule,
    createEmptyHeaderRule,
    createEmptyBodyRule,
    createEmptyTimeRule,
} from '../../types/validation';

// ============================================================================
// Operator & Category constants — single source of truth for all validation UIs
// ============================================================================

export const STATUS_OPERATORS: { value: StatusOperator; label: string }[] = [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'greater_than', label: 'Greater Than' },
    { value: 'greater_than_or_equal', label: 'Greater Than or Equal' },
    { value: 'less_than', label: 'Less Than' },
    { value: 'less_than_or_equal', label: 'Less Than or Equal' },
    { value: 'between', label: 'Between' },
    { value: 'in', label: 'In' },
    { value: 'not_in', label: 'Not In' },
    { value: 'is_success', label: 'Is Success (2xx)' },
    { value: 'is_not_success', label: 'Is Not Success' },
];

export const NUMERIC_OPERATORS: { value: NumericOperator; label: string }[] = [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'greater_than', label: 'Greater Than' },
    { value: 'greater_than_or_equal', label: 'Greater Than or Equal' },
    { value: 'less_than', label: 'Less Than' },
    { value: 'less_than_or_equal', label: 'Less Than or Equal' },
    { value: 'between', label: 'Between' },
];

export const STRING_OPERATORS: { value: StringOperator; label: string }[] = [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'not_contains', label: 'Not Contains' },
    { value: 'starts_with', label: 'Starts With' },
    { value: 'ends_with', label: 'Ends With' },
    { value: 'matches_regex', label: 'Matches Regex' },
    { value: 'in', label: 'In' },
    { value: 'not_in', label: 'Not In' },
];

export const EXISTENCE_OPERATORS: { value: ExistenceOperator; label: string }[] = [
    { value: 'exists', label: 'Exists' },
    { value: 'not_exists', label: 'Does Not Exist' },
];

export const HEADER_OPERATORS: { value: StringOperator | ExistenceOperator; label: string }[] = [
    ...EXISTENCE_OPERATORS,
    ...STRING_OPERATORS,
];

export const BODY_OPERATORS: { value: BodyOperator; label: string }[] = [
    { value: 'contains', label: 'Contains' },
    { value: 'not_contains', label: 'Not Contains' },
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'is_json', label: 'Is Valid JSON' },
    { value: 'is_xml', label: 'Is XML' },
    { value: 'is_html', label: 'Is HTML' },
    { value: 'json_path_exists', label: 'JSON Path Exists' },
    { value: 'json_path_equals', label: 'JSON Path Equals' },
    { value: 'json_path_contains', label: 'JSON Path Contains' },
    { value: 'json_schema_matches', label: 'Matches JSON Schema' },
];

export const CATEGORIES: { value: ValidationRuleCategory; label: string }[] = [
    { value: 'status', label: 'Status Code' },
    { value: 'header', label: 'Response Header' },
    { value: 'body', label: 'Response Body' },
    { value: 'time', label: 'Response Time' },
];

// ============================================================================
// Helper predicates for conditional field rendering
// ============================================================================

/** Operators that require no value input for status/time rules */
const STATUS_NO_VALUE_OPERATORS = new Set<StatusOperator>(['is_success', 'is_not_success']);
/** Operators that require a second bound value (between) */
const NEEDS_SECOND_VALUE_OPERATORS = new Set<string>(['between']);
/** Operators that use a comma-separated multi-value input */
const MULTI_VALUE_OPERATORS = new Set<string>(['in', 'not_in']);
/** Body operators that require no value textarea */
const BODY_NO_VALUE_OPERATORS = new Set<BodyOperator>(['is_json', 'is_xml', 'is_html', 'json_path_exists']);
/** Body operators that show the JSON path input */
const BODY_JSON_PATH_OPERATORS = new Set<BodyOperator>([
    'json_path_exists',
    'json_path_equals',
    'json_path_contains',
]);
/** Body operators that hide the case-sensitive toggle */
const BODY_NO_CASE_SENSITIVE_OPERATORS = new Set<BodyOperator>([
    'is_json',
    'is_xml',
    'is_html',
    'json_path_exists',
    'json_path_equals',
    'json_path_contains',
    'json_schema_matches',
]);

// ============================================================================
// FieldTooltip — internal helper for annotating field labels with an info icon
// ============================================================================

/**
 * Renders a small info icon that reveals a tooltip on hover.
 * Used to annotate field labels with additional contextual guidance.
 * Not exported — for internal use within ValidationRuleEditor only.
 */
const FieldTooltip: React.FC<{ content: string }> = ({ content }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <InfoIcon
                className="inline-block h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0"
                aria-label={content}
            />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{content}</TooltipContent>
    </Tooltip>
);

// ============================================================================
// Internal sub-components for category-specific fields
// ============================================================================

const StatusFields: React.FC<{
    rule: StatusValidationRule;
    onChange: (rule: ValidationRule) => void;
}> = ({ rule, onChange }) => {
    const isMulti = MULTI_VALUE_OPERATORS.has(rule.operator);
    const isNoValue = STATUS_NO_VALUE_OPERATORS.has(rule.operator);
    const hasTwoValues = NEEDS_SECOND_VALUE_OPERATORS.has(rule.operator);

    return (
        <>
            <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Operator</Label>
                <Select
                    value={rule.operator}
                    onValueChange={(value) => onChange({ ...rule, operator: value as StatusOperator })}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPERATORS.map((op) => (
                            <SelectItem key={op.value} value={op.value}>
                                {op.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {isMulti ? (
                <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-slate-300">Values (comma-separated)</Label>
                    <Input
                        value={rule.values?.join(', ') ?? ''}
                        onChange={(e) => {
                            const values = e.target.value
                                .split(',')
                                .map((v) => parseInt(v.trim(), 10))
                                .filter((v) => !isNaN(v));
                            onChange({ ...rule, values });
                        }}
                        placeholder="e.g., 200, 201, 204"
                    />
                </div>
            ) : (
                !isNoValue && (
                    <>
                        <div className="space-y-2">
                            <Label className="text-slate-700 dark:text-slate-300">Value</Label>
                            <Input
                                type="number"
                                value={rule.value ?? 200}
                                placeholder="e.g., 200"
                                onChange={(e) =>
                                    onChange({ ...rule, value: parseInt(e.target.value, 10) || 0 })
                                }
                            />
                        </div>
                        {hasTwoValues && (
                            <div className="space-y-2">
                                <Label className="text-slate-700 dark:text-slate-300">Upper Bound</Label>
                                <Input
                                    type="number"
                                    value={rule.value2 ?? 299}
                                    placeholder="e.g., 299"
                                    onChange={(e) =>
                                        onChange({ ...rule, value2: parseInt(e.target.value, 10) || 0 })
                                    }
                                />
                            </div>
                        )}
                    </>
                )
            )}
        </>
    );
};

const HeaderFields: React.FC<{
    rule: HeaderValidationRule;
    onChange: (rule: ValidationRule) => void;
}> = ({ rule, onChange }) => {
    const isExistence = rule.operator === 'exists' || rule.operator === 'not_exists';
    const isMulti = MULTI_VALUE_OPERATORS.has(rule.operator);

    return (
        <>
            <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Header Name</Label>
                <Input
                    value={rule.headerName}
                    onChange={(e) => onChange({ ...rule, headerName: e.target.value })}
                    placeholder="e.g., Content-Type, Authorization, X-Request-Id"
                />
            </div>

            <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Operator</Label>
                <Select
                    value={rule.operator}
                    onValueChange={(value) =>
                        onChange({ ...rule, operator: value as StringOperator | ExistenceOperator })
                    }
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {HEADER_OPERATORS.map((op) => (
                            <SelectItem key={op.value} value={op.value}>
                                {op.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {!isExistence && (
                isMulti ? (
                    <div className="space-y-2">
                        <Label className="text-slate-700 dark:text-slate-300">Values (comma-separated)</Label>
                        <Input
                            value={rule.values?.join(', ') ?? ''}
                            onChange={(e) => {
                                const values = e.target.value
                                    .split(',')
                                    .map((v) => v.trim())
                                    .filter((v) => v.length > 0);
                                onChange({ ...rule, values });
                            }}
                            placeholder="e.g., application/json, text/plain"
                        />
                    </div>
                ) : (
                    <div className="space-y-2">
                        <Label className="text-slate-700 dark:text-slate-300">Expected Value</Label>
                        <Input
                            value={rule.value ?? ''}
                            onChange={(e) => onChange({ ...rule, value: e.target.value })}
                            placeholder={
                                rule.operator === 'matches_regex'
                                    ? 'e.g., ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                    : 'e.g., application/json'
                            }
                        />
                    </div>
                )
            )}

            {!isExistence && (
                <div className="flex items-center space-x-2">
                    <Switch
                        id="header-case-sensitive"
                        checked={rule.caseSensitive ?? false}
                        onCheckedChange={(checked) => onChange({ ...rule, caseSensitive: checked })}
                    />
                    <Label
                        htmlFor="header-case-sensitive"
                        className="text-sm font-normal text-slate-700 dark:text-slate-300"
                    >
                        Case-sensitive comparison
                    </Label>
                </div>
            )}
        </>
    );
};

const BodyFields: React.FC<{
    rule: BodyValidationRule;
    onChange: (rule: ValidationRule) => void;
}> = ({ rule, onChange }) => {
    const needsJsonPath = BODY_JSON_PATH_OPERATORS.has(rule.operator);
    const needsValue = !BODY_NO_VALUE_OPERATORS.has(rule.operator);
    const needsCaseSensitive = needsValue && !BODY_NO_CASE_SENSITIVE_OPERATORS.has(rule.operator);
    const isJsonSchema = rule.operator === 'json_schema_matches';

    /**
     * Schema validation state — updated whenever the value or operator changes.
     * Null means no indicator should be shown (empty value or non-schema operator).
     */
    const [schemaValidation, setSchemaValidation] = useState<{ valid: boolean; errors?: string[] } | null>(null);

    useEffect(() => {
        if (!isJsonSchema) {
            setSchemaValidation(null);
            return;
        }
        const value = rule.value ?? '';
        if (!value.trim()) {
            setSchemaValidation(null);
            return;
        }
        setSchemaValidation(validateJsonSchemaString(value));
    }, [rule.value, isJsonSchema]);

    return (
        <>
            <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Operator</Label>
                <Select
                    value={rule.operator}
                    onValueChange={(value) => onChange({ ...rule, operator: value as BodyOperator, value: '', jsonPath: '' })}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {BODY_OPERATORS.map((op) => (
                            <SelectItem key={op.value} value={op.value}>
                                {op.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {needsJsonPath && (
                <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                        <Label className="text-slate-700 dark:text-slate-300">JSON Path</Label>
                        <FieldTooltip content="JSONPath expression to navigate the JSON response body. Uses jq style syntax. Example: $.data.users[0].name or $.items[*].id" />
                    </div>
                    <Input
                        value={rule.jsonPath ?? ''}
                        onChange={(e) => onChange({ ...rule, jsonPath: e.target.value })}
                        placeholder="e.g., $.data.users[0].name or $.items[*].id"
                    />
                </div>
            )}

            {needsValue && (
                <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                        <Label className="text-slate-700 dark:text-slate-300">
                            {isJsonSchema ? 'JSON Schema' : 'Expected Value'}
                        </Label>
                        {isJsonSchema && (
                            <FieldTooltip content="Provide a valid JSON Schema. The response body will be validated against this schema." />
                        )}
                    </div>
                    <textarea
                        className="w-full min-h-[100px] px-3 py-2 text-sm border border-input bg-background rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                        value={rule.value ?? ''}
                        onChange={(e) => onChange({ ...rule, value: e.target.value })}
                        placeholder={
                            isJsonSchema
                                ? '{"type": "object", "properties": {...}}'
                                : 'Expected text or value'
                        }
                    />
                    {/* Real-time JSON Schema validity indicator */}
                    {isJsonSchema && schemaValidation !== null && (
                        schemaValidation.valid ? (
                            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                <CheckIcon className="h-3.5 w-3.5" />
                                Valid JSON Schema
                            </p>
                        ) : (
                            <div className="text-xs text-red-500 space-y-0.5">
                                {schemaValidation.errors?.map((err, i) => (
                                    <p key={i} className="flex items-start gap-1">
                                        <XIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                        {err}
                                    </p>
                                ))}
                            </div>
                        )
                    )}
                </div>
            )}

            {needsCaseSensitive && (
                <div className="flex items-center space-x-2">
                    <Switch
                        id="body-case-sensitive"
                        checked={rule.caseSensitive ?? false}
                        onCheckedChange={(checked) => onChange({ ...rule, caseSensitive: checked })}
                    />
                    <Label
                        htmlFor="body-case-sensitive"
                        className="text-sm font-normal text-slate-700 dark:text-slate-300"
                    >
                        Case-sensitive comparison
                    </Label>
                </div>
            )}
        </>
    );
};

const TimeFields: React.FC<{
    rule: TimeValidationRule;
    onChange: (rule: ValidationRule) => void;
}> = ({ rule, onChange }) => {
    const hasTwoValues = NEEDS_SECOND_VALUE_OPERATORS.has(rule.operator);

    return (
        <>
            <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Operator</Label>
                <Select
                    value={rule.operator}
                    onValueChange={(value) => onChange({ ...rule, operator: value as NumericOperator })}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {NUMERIC_OPERATORS.map((op) => (
                            <SelectItem key={op.value} value={op.value}>
                                {op.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Value (milliseconds)</Label>
                <Input
                    type="number"
                    value={rule.value}
                    placeholder="e.g., 1000"
                    onChange={(e) => onChange({ ...rule, value: parseInt(e.target.value, 10) || 0 })}
                />
            </div>

            {hasTwoValues && (
                <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-slate-300">Upper Bound (milliseconds)</Label>
                    <Input
                        type="number"
                        value={rule.value2 ?? 2000}
                        placeholder="e.g., 2000"
                        onChange={(e) =>
                            onChange({ ...rule, value2: parseInt(e.target.value, 10) || 0 })
                        }
                    />
                </div>
            )}
        </>
    );
};

// ============================================================================
// Public component
// ============================================================================

export interface ValidationRuleEditorProps {
    /** The current rule being edited (fully controlled). */
    rule: ValidationRule;
    /** Called with the updated rule whenever any field changes. */
    onChange: (rule: ValidationRule) => void;
    /**
     * Optional validation error message shown beneath the Name field.
     * Supplied by the parent (e.g. ValidationWizard's name-uniqueness check).
     */
    nameError?: string | null;
}

/**
 * Shared, fully-controlled form component for editing any `ValidationRule`.
 *
 * This component owns no local state — all changes are propagated upward via
 * `onChange`. It renders the common fields (name, description, category,
 * enabled) and the category-specific fields for status, header, body, and time
 * rules. It does NOT include Save/Cancel buttons — those are the caller's
 * responsibility.
 *
 * Used by:
 * - `ValidationWizard` (global validation store dialog)
 * - `RuleEditorDialog` in `RequestValidation` (per-request inline rule dialog)
 */
export const ValidationRuleEditor: React.FC<ValidationRuleEditorProps> = ({
    rule,
    onChange,
    nameError,
}) => {
    const handleCategoryChange = (category: ValidationRuleCategory) => {
        const { id, name, description, enabled } = rule;
        let newRule: ValidationRule;
        switch (category) {
            case 'status':
                newRule = { ...createEmptyStatusRule(id), name, description, enabled };
                break;
            case 'header':
                newRule = { ...createEmptyHeaderRule(id), name, description, enabled };
                break;
            case 'body':
                newRule = { ...createEmptyBodyRule(id), name, description, enabled };
                break;
            case 'time':
                newRule = { ...createEmptyTimeRule(id), name, description, enabled };
                break;
        }
        onChange(newRule);
    };

    return (
        <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
                <Label htmlFor="rule-name" className="text-slate-700 dark:text-slate-300">
                    Name *
                </Label>
                <Input
                    id="rule-name"
                    value={rule.name}
                    onChange={(e) => onChange({ ...rule, name: e.target.value })}
                    placeholder="e.g., Success Status, Has Auth Header"
                    className={nameError ? 'border-red-500' : ''}
                />
                {nameError && <p className="text-sm text-red-500">{nameError}</p>}
            </div>

            {/* Description */}
            <div className="space-y-2">
                <Label htmlFor="rule-description" className="text-slate-700 dark:text-slate-300">
                    Description
                </Label>
                <Input
                    id="rule-description"
                    value={rule.description ?? ''}
                    onChange={(e) => onChange({ ...rule, description: e.target.value })}
                    placeholder="Optional description of what this rule validates"
                />
            </div>

            {/* Category */}
            <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                    <Label htmlFor="rule-category" className="text-slate-700 dark:text-slate-300">
                        Category
                    </Label>
                    {isBodyRule(rule) && (
                        <FieldTooltip content="Body validation only supports text-based response content (JSON, XML, HTML, plain text). Binary responses are not supported." />
                    )}
                </div>
                <Select value={rule.category} onValueChange={handleCategoryChange}>
                    <SelectTrigger id="rule-category">
                        <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                        {CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                                {cat.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Category-specific fields */}
            {isStatusRule(rule) && <StatusFields rule={rule} onChange={onChange} />}
            {isHeaderRule(rule) && <HeaderFields rule={rule} onChange={onChange} />}
            {isBodyRule(rule) && <BodyFields rule={rule} onChange={onChange} />}
            {isTimeRule(rule) && <TimeFields rule={rule} onChange={onChange} />}

            {/* Enabled toggle */}
            <div className="flex items-center space-x-2 pt-2">
                <Switch
                    id="rule-enabled"
                    checked={rule.enabled}
                    onCheckedChange={(checked) => onChange({ ...rule, enabled: checked })}
                />
                <Label
                    htmlFor="rule-enabled"
                    className="text-sm font-normal text-slate-700 dark:text-slate-300"
                >
                    Rule enabled
                </Label>
            </div>
        </div>
    );
};
