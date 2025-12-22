import React, { useState, useEffect } from 'react';
import { XIcon, PlusIcon, RefreshCwIcon } from 'lucide-react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import {
    GlobalValidationRule,
    ValidationRule,
    ValidationRuleCategory,
    StatusValidationRule,
    HeaderValidationRule,
    BodyValidationRule,
    TimeValidationRule,
    NumericOperator,
    StatusOperator,
    StringOperator,
    BodyOperator,
    ExistenceOperator
} from '../../types/validation';

interface ValidationWizardProps {
    rule?: GlobalValidationRule;
    onSave: (rule: ValidationRule) => void;
    onCancel: () => void;
    existingNames: string[];
}

// Operator options for different rule types
const STATUS_OPERATORS: { value: StatusOperator; label: string }[] = [
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

const NUMERIC_OPERATORS: { value: NumericOperator; label: string }[] = [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'greater_than', label: 'Greater Than' },
    { value: 'greater_than_or_equal', label: 'Greater Than or Equal' },
    { value: 'less_than', label: 'Less Than' },
    { value: 'less_than_or_equal', label: 'Less Than or Equal' },
    { value: 'between', label: 'Between' },
    { value: 'in', label: 'In' },
    { value: 'not_in', label: 'Not In' },
];

const STRING_OPERATORS: { value: StringOperator; label: string }[] = [
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

const HEADER_OPERATORS: { value: StringOperator | ExistenceOperator; label: string }[] = [
    { value: 'exists', label: 'Exists' },
    { value: 'not_exists', label: 'Does Not Exist' },
    ...STRING_OPERATORS,
];

const BODY_OPERATORS: { value: BodyOperator; label: string }[] = [
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

const CATEGORIES: { value: ValidationRuleCategory; label: string }[] = [
    { value: 'status', label: 'Status Code' },
    { value: 'header', label: 'Response Header' },
    { value: 'body', label: 'Response Body' },
    { value: 'time', label: 'Response Time' },
];

const ValidationWizard: React.FC<ValidationWizardProps> = ({
    rule,
    onSave,
    onCancel,
    existingNames
}) => {
    // Common fields
    const [name, setName] = useState(rule?.name || '');
    const [description, setDescription] = useState(rule?.description || '');
    const [enabled, setEnabled] = useState(rule?.enabled ?? true);
    const [category, setCategory] = useState<ValidationRuleCategory>(rule?.category || 'status');

    // Status rule fields
    const [statusOperator, setStatusOperator] = useState<StatusOperator>('equals');
    const [statusValue, setStatusValue] = useState<number>(200);
    const [statusValue2, setStatusValue2] = useState<number>(299);
    const [statusValues, setStatusValues] = useState<string>('');

    // Header rule fields
    const [headerName, setHeaderName] = useState('');
    const [headerOperator, setHeaderOperator] = useState<StringOperator | ExistenceOperator>('exists');
    const [headerValue, setHeaderValue] = useState('');
    const [headerValues, setHeaderValues] = useState<string>('');
    const [headerCaseSensitive, setHeaderCaseSensitive] = useState(false);

    // Body rule fields
    const [bodyOperator, setBodyOperator] = useState<BodyOperator>('contains');
    const [bodyValue, setBodyValue] = useState('');
    const [jsonPath, setJsonPath] = useState('');
    const [bodyCaseSensitive, setBodyCaseSensitive] = useState(false);

    // Time rule fields
    const [timeOperator, setTimeOperator] = useState<NumericOperator>('less_than');
    const [timeValue, setTimeValue] = useState<number>(1000);
    const [timeValue2, setTimeValue2] = useState<number>(2000);

    // Validation
    const [nameError, setNameError] = useState<string | null>(null);

    // Initialize form based on existing rule
    useEffect(() => {
        if (rule) {
            setName(rule.name);
            setDescription(rule.description || '');
            setEnabled(rule.enabled);
            setCategory(rule.category);

            // Use category to determine how to initialize fields
            switch (rule.category) {
                case 'status':
                    setStatusOperator(rule.operator as StatusOperator);
                    setStatusValue(typeof rule.value === 'number' ? rule.value : 200);
                    if (rule.value2) setStatusValue2(rule.value2);
                    if (rule.values) setStatusValues((rule.values as number[]).join(', '));
                    break;
                case 'header':
                    setHeaderName(rule.headerName || '');
                    setHeaderOperator(rule.operator as StringOperator | ExistenceOperator);
                    if (rule.value) setHeaderValue(String(rule.value));
                    if (rule.values) setHeaderValues((rule.values as string[]).join(', '));
                    setHeaderCaseSensitive(rule.caseSensitive ?? false);
                    break;
                case 'body':
                    setBodyOperator(rule.operator as BodyOperator);
                    if (rule.value) setBodyValue(String(rule.value));
                    if (rule.jsonPath) setJsonPath(rule.jsonPath);
                    setBodyCaseSensitive(rule.caseSensitive ?? false);
                    break;
                case 'time':
                    setTimeOperator(rule.operator as NumericOperator);
                    setTimeValue(typeof rule.value === 'number' ? rule.value : 1000);
                    if (rule.value2) setTimeValue2(rule.value2);
                    break;
            }
        }
    }, [rule]);

    const validateName = (value: string): boolean => {
        if (!value.trim()) {
            setNameError('Name is required');
            return false;
        }
        if (existingNames.includes(value.trim())) {
            setNameError('A rule with this name already exists');
            return false;
        }
        setNameError(null);
        return true;
    };

    const handleSave = () => {
        if (!validateName(name)) {
            return;
        }

        const baseRule = {
            id: rule?.id || `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            name: name.trim(),
            description: description.trim() || undefined,
            enabled,
        };

        let finalRule: ValidationRule;

        switch (category) {
            case 'status': {
                const statusRule: StatusValidationRule = {
                    ...baseRule,
                    category: 'status',
                    operator: statusOperator,
                    value: statusValue,
                };
                if (statusOperator === 'between') {
                    statusRule.value2 = statusValue2;
                }
                if (statusOperator === 'in' || statusOperator === 'not_in') {
                    statusRule.values = statusValues
                        .split(',')
                        .map(v => parseInt(v.trim(), 10))
                        .filter(v => !isNaN(v));
                }
                finalRule = statusRule;
                break;
            }
            case 'header': {
                const headerRule: HeaderValidationRule = {
                    ...baseRule,
                    category: 'header',
                    headerName: headerName.trim(),
                    operator: headerOperator,
                };
                if (headerOperator !== 'exists' && headerOperator !== 'not_exists') {
                    headerRule.value = headerValue;
                    headerRule.caseSensitive = headerCaseSensitive;
                }
                if (headerOperator === 'in' || headerOperator === 'not_in') {
                    headerRule.values = headerValues
                        .split(',')
                        .map(v => v.trim())
                        .filter(v => v);
                }
                finalRule = headerRule;
                break;
            }
            case 'body': {
                const bodyRule: BodyValidationRule = {
                    ...baseRule,
                    category: 'body',
                    operator: bodyOperator,
                };
                if (!['is_json', 'is_xml', 'is_html'].includes(bodyOperator)) {
                    bodyRule.value = bodyValue;
                    bodyRule.caseSensitive = bodyCaseSensitive;
                }
                if (['json_path_exists', 'json_path_equals', 'json_path_contains'].includes(bodyOperator)) {
                    bodyRule.jsonPath = jsonPath;
                }
                finalRule = bodyRule;
                break;
            }
            case 'time': {
                const timeRule: TimeValidationRule = {
                    ...baseRule,
                    category: 'time',
                    operator: timeOperator,
                    value: timeValue,
                };
                if (timeOperator === 'between') {
                    timeRule.value2 = timeValue2;
                }
                finalRule = timeRule;
                break;
            }
            default:
                return;
        }

        onSave(finalRule);
    };

    const needsValue = (op: string) => !['exists', 'not_exists', 'is_json', 'is_xml', 'is_html'].includes(op);
    const needsSecondValue = (op: string) => op === 'between';
    const needsMultipleValues = (op: string) => op === 'in' || op === 'not_in';
    const needsJsonPath = (op: string) => ['json_path_exists', 'json_path_equals', 'json_path_contains'].includes(op);

    return (
        <div className="space-y-4">
            {/* Common Fields */}
            <div className="space-y-2">
                <Label htmlFor="rule-name" className="text-slate-700 dark:text-slate-300">Name *</Label>
                <Input
                    id="rule-name"
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                        validateName(e.target.value);
                    }}
                    placeholder="e.g., Success Status, Has Auth Header"
                    className={nameError ? 'border-red-500' : ''}
                />
                {nameError && <p className="text-sm text-red-500">{nameError}</p>}
            </div>

            <div className="space-y-2">
                <Label htmlFor="rule-description" className="text-slate-700 dark:text-slate-300">Description</Label>
                <Input
                    id="rule-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description of what this rule validates"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="rule-category" className="text-slate-700 dark:text-slate-300">Category</Label>
                <Select value={category} onValueChange={(value) => setCategory(value as ValidationRuleCategory)}>
                    <SelectTrigger>
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

            {/* Status-specific fields */}
            {category === 'status' && (
                <>
                    <div className="space-y-2">
                        <Label className="text-slate-700 dark:text-slate-300">Operator</Label>
                        <Select value={statusOperator} onValueChange={(value) => setStatusOperator(value as StatusOperator)}>
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

                    {needsMultipleValues(statusOperator) ? (
                        <div className="space-y-2">
                            <Label className="text-slate-700 dark:text-slate-300">Values (comma-separated)</Label>
                            <Input
                                value={statusValues}
                                onChange={(e) => setStatusValues(e.target.value)}
                                placeholder="e.g., 200, 201, 204"
                            />
                        </div>
                    ) : (
                        !['is_success', 'is_not_success'].includes(statusOperator) && (
                            <>
                                <div className="space-y-2">
                                    <Label className="text-slate-700 dark:text-slate-300">Value</Label>
                                    <Input
                                        type="number"
                                        value={statusValue}
                                        onChange={(e) => setStatusValue(parseInt(e.target.value, 10) || 0)}
                                    />
                                </div>
                                {needsSecondValue(statusOperator) && (
                                    <div className="space-y-2">
                                        <Label className="text-slate-700 dark:text-slate-300">Upper Bound</Label>
                                        <Input
                                            type="number"
                                            value={statusValue2}
                                            onChange={(e) => setStatusValue2(parseInt(e.target.value, 10) || 0)}
                                        />
                                    </div>
                                )}
                            </>
                        )
                    )}
                </>
            )}

            {/* Header-specific fields */}
            {category === 'header' && (
                <>
                    <div className="space-y-2">
                        <Label className="text-slate-700 dark:text-slate-300">Header Name</Label>
                        <Input
                            value={headerName}
                            onChange={(e) => setHeaderName(e.target.value)}
                            placeholder="e.g., Content-Type, X-Request-Id"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-slate-700 dark:text-slate-300">Operator</Label>
                        <Select value={headerOperator} onValueChange={(value) => setHeaderOperator(value as StringOperator | ExistenceOperator)}>
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

                    {needsValue(headerOperator) && (
                        needsMultipleValues(headerOperator) ? (
                            <div className="space-y-2">
                                <Label className="text-slate-700 dark:text-slate-300">Values (comma-separated)</Label>
                                <Input
                                    value={headerValues}
                                    onChange={(e) => setHeaderValues(e.target.value)}
                                    placeholder="e.g., application/json, text/plain"
                                />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label className="text-slate-700 dark:text-slate-300">Expected Value</Label>
                                <Input
                                    value={headerValue}
                                    onChange={(e) => setHeaderValue(e.target.value)}
                                    placeholder="e.g., application/json"
                                />
                            </div>
                        )
                    )}

                    {needsValue(headerOperator) && (
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="header-case-sensitive"
                                checked={headerCaseSensitive}
                                onCheckedChange={(checked: boolean) => setHeaderCaseSensitive(checked)}
                            />
                            <Label htmlFor="header-case-sensitive" className="text-sm font-normal text-slate-700 dark:text-slate-300">
                                Case-sensitive comparison
                            </Label>
                        </div>
                    )}
                </>
            )}

            {/* Body-specific fields */}
            {category === 'body' && (
                <>
                    <div className="space-y-2">
                        <Label className="text-slate-700 dark:text-slate-300">Operator</Label>
                        <Select value={bodyOperator} onValueChange={(value) => setBodyOperator(value as BodyOperator)}>
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

                    {needsJsonPath(bodyOperator) && (
                        <div className="space-y-2">
                            <Label className="text-slate-700 dark:text-slate-300">JSON Path</Label>
                            <Input
                                value={jsonPath}
                                onChange={(e) => setJsonPath(e.target.value)}
                                placeholder="e.g., $.data.id or data.items[0].name"
                            />
                        </div>
                    )}

                    {needsValue(bodyOperator) && (
                        <div className="space-y-2">
                            <Label className="text-slate-700 dark:text-slate-300">
                                {bodyOperator === 'json_schema_matches' ? 'JSON Schema' : 'Expected Value'}
                            </Label>
                            <textarea
                                className="w-full min-h-[100px] px-3 py-2 text-sm border border-input bg-background rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                                value={bodyValue}
                                onChange={(e) => setBodyValue(e.target.value)}
                                placeholder={bodyOperator === 'json_schema_matches' 
                                    ? '{"type": "object", "properties": {...}}'
                                    : 'Expected text or value'
                                }
                            />
                        </div>
                    )}

                    {needsValue(bodyOperator) && !['json_schema_matches'].includes(bodyOperator) && (
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="body-case-sensitive"
                                checked={bodyCaseSensitive}
                                onCheckedChange={(checked: boolean) => setBodyCaseSensitive(checked)}
                            />
                            <Label htmlFor="body-case-sensitive" className="text-sm font-normal text-slate-700 dark:text-slate-300">
                                Case-sensitive comparison
                            </Label>
                        </div>
                    )}
                </>
            )}

            {/* Time-specific fields */}
            {category === 'time' && (
                <>
                    <div className="space-y-2">
                        <Label className="text-slate-700 dark:text-slate-300">Operator</Label>
                        <Select value={timeOperator} onValueChange={(value) => setTimeOperator(value as NumericOperator)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {NUMERIC_OPERATORS.filter(op => !['in', 'not_in'].includes(op.value)).map((op) => (
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
                            value={timeValue}
                            onChange={(e) => setTimeValue(parseInt(e.target.value, 10) || 0)}
                        />
                    </div>

                    {needsSecondValue(timeOperator) && (
                        <div className="space-y-2">
                            <Label className="text-slate-700 dark:text-slate-300">Upper Bound (milliseconds)</Label>
                            <Input
                                type="number"
                                value={timeValue2}
                                onChange={(e) => setTimeValue2(parseInt(e.target.value, 10) || 0)}
                            />
                        </div>
                    )}
                </>
            )}

            {/* Enabled checkbox */}
            <div className="flex items-center space-x-2 pt-2">
                <Switch
                    id="rule-enabled"
                    checked={enabled}
                    onCheckedChange={(checked: boolean) => setEnabled(checked)}
                />
                <Label htmlFor="rule-enabled" className="text-sm font-normal text-slate-700 dark:text-slate-300">
                    Rule enabled
                </Label>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-2 pt-4 border-t border-gray-200 dark:border-slate-700">
                <SecondaryButton
                    onClick={onCancel}
                    colorTheme="warning"
                    icon={<XIcon />}
                    text="Cancel"
                />
                <PrimaryButton
                    onClick={handleSave}
                    colorTheme="main"
                    icon={<PlusIcon />}
                    text={rule ? 'Update Rule' : 'Add Rule'}
                />
            </div>
        </div>
    );
};

export default ValidationWizard;
