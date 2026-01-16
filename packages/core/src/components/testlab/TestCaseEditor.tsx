/**
 * Test Case Editor Component
 * 
 * Modal for creating and editing test cases for data-driven testing.
 * Features:
 * - Name and description inputs
 * - JSON editor for data overrides (headers, params, body, variables)
 * - Auth profile selector
 * - Validation rules configuration
 * 
 * Initial version uses JSON editor; future enhancements will add form-based editors.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
    XIcon, 
    SaveIcon, 
    PlusIcon,
    Trash2Icon,
    AlertCircleIcon,
    CheckCircleIcon,
    CopyIcon,
} from 'lucide-react';
import type { TestCase, TestCaseData } from '../../types/testSuite';
import type { RequestValidation } from '../../types/validation';
import type { Auth } from '../../hooks/store/createAuthSlice';
import { createTestCase } from '../../types/testSuite';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { cn } from '../../utils/common';

// ============================================================================
// Constants
// ============================================================================

/** Sentinel value for "no auth override" since Radix Select doesn't allow empty string values */
const NO_AUTH_OVERRIDE = '__none__';

// ============================================================================
// Types
// ============================================================================

interface TestCaseEditorProps {
    /** Open state of the dialog */
    isOpen: boolean;
    /** Callback to close the dialog */
    onClose: () => void;
    /** Test case to edit (undefined for create mode) */
    testCase?: TestCase;
    /** Callback when test case is saved */
    onSave: (testCase: TestCase) => void;
    /** Available auth profiles */
    auths: Auth[];
    /** Order for new test case (used in create mode) */
    nextOrder: number;
    /** Existing test case names for uniqueness validation */
    existingNames: string[];
}

interface JsonEditorSectionProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    helpText?: string;
    error?: string;
}

// ============================================================================
// JSON Editor Section
// ============================================================================

const JsonEditorSection: React.FC<JsonEditorSectionProps> = ({
    label,
    value,
    onChange,
    placeholder,
    helpText,
    error,
}) => {
    return (
        <div className="space-y-1.5">
            <Label className="text-sm font-medium">{label}</Label>
            <Textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={cn(
                    'font-mono text-sm min-h-[100px] resize-y',
                    error && 'border-red-500 focus:ring-red-500'
                )}
            />
            {helpText && !error && (
                <p className="text-xs text-slate-500">{helpText}</p>
            )}
            {error && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircleIcon className="h-3 w-3" />
                    {error}
                </p>
            )}
        </div>
    );
};

// ============================================================================
// Main Component
// ============================================================================

export const TestCaseEditor: React.FC<TestCaseEditorProps> = ({
    isOpen,
    onClose,
    testCase,
    onSave,
    auths,
    nextOrder,
    existingNames,
}) => {
    const isEditMode = !!testCase;

    // Form state
    const [name, setName] = useState(testCase?.name || '');
    const [description, setDescription] = useState(testCase?.description || '');
    const [enabled, setEnabled] = useState(testCase?.enabled ?? true);
    const [authId, setAuthId] = useState(testCase?.data.authId || NO_AUTH_OVERRIDE);

    // JSON data state (stored as strings for editing)
    const [variablesJson, setVariablesJson] = useState('');
    const [headersJson, setHeadersJson] = useState('');
    const [paramsJson, setParamsJson] = useState('');
    const [bodyOverride, setBodyOverride] = useState('');

    // Validation errors
    const [nameError, setNameError] = useState<string | undefined>();
    const [variablesError, setVariablesError] = useState<string | undefined>();
    const [headersError, setHeadersError] = useState<string | undefined>();
    const [paramsError, setParamsError] = useState<string | undefined>();

    // Initialize form state when testCase changes
    useEffect(() => {
        if (testCase) {
            setName(testCase.name);
            setDescription(testCase.description || '');
            setEnabled(testCase.enabled);
            setAuthId(testCase.data.authId || NO_AUTH_OVERRIDE);
            
            // Serialize data to JSON strings for editing
            setVariablesJson(
                testCase.data.variables 
                    ? JSON.stringify(testCase.data.variables, null, 2) 
                    : ''
            );
            setHeadersJson(
                testCase.data.headers 
                    ? JSON.stringify(testCase.data.headers, null, 2) 
                    : ''
            );
            setParamsJson(
                testCase.data.params 
                    ? JSON.stringify(testCase.data.params, null, 2) 
                    : ''
            );
            setBodyOverride(testCase.data.body || '');
        } else {
            // Reset for new test case
            setName('');
            setDescription('');
            setEnabled(true);
            setAuthId(NO_AUTH_OVERRIDE);
            setVariablesJson('');
            setHeadersJson('');
            setParamsJson('');
            setBodyOverride('');
        }
        // Clear errors
        setNameError(undefined);
        setVariablesError(undefined);
        setHeadersError(undefined);
        setParamsError(undefined);
    }, [testCase, isOpen]);

    // Validate JSON
    const validateJson = useCallback((json: string, fieldName: string): { valid: boolean; error?: string } => {
        if (!json.trim()) {
            return { valid: true }; // Empty is valid (no override)
        }
        try {
            JSON.parse(json);
            return { valid: true };
        } catch (e) {
            return { valid: false, error: `Invalid JSON for ${fieldName}` };
        }
    }, []);

    // Validate name
    const validateName = useCallback((value: string): { valid: boolean; error?: string } => {
        if (!value.trim()) {
            return { valid: false, error: 'Name is required' };
        }
        const normalizedName = value.trim().toLowerCase();
        const isDuplicate = existingNames.some(
            n => n.toLowerCase() === normalizedName && 
                 (!testCase || testCase.name.toLowerCase() !== normalizedName)
        );
        if (isDuplicate) {
            return { valid: false, error: 'A test case with this name already exists' };
        }
        return { valid: true };
    }, [existingNames, testCase]);

    // Handle save
    const handleSave = useCallback(() => {
        // Validate all fields
        const nameValidation = validateName(name);
        const variablesValidation = validateJson(variablesJson, 'variables');
        const headersValidation = validateJson(headersJson, 'headers');
        const paramsValidation = validateJson(paramsJson, 'params');

        setNameError(nameValidation.error);
        setVariablesError(variablesValidation.error);
        setHeadersError(headersValidation.error);
        setParamsError(paramsValidation.error);

        if (!nameValidation.valid || !variablesValidation.valid || 
            !headersValidation.valid || !paramsValidation.valid) {
            return;
        }

        // Build test case data
        const data: TestCaseData = {};
        
        if (variablesJson.trim()) {
            data.variables = JSON.parse(variablesJson);
        }
        if (headersJson.trim()) {
            data.headers = JSON.parse(headersJson);
        }
        if (paramsJson.trim()) {
            data.params = JSON.parse(paramsJson);
        }
        if (bodyOverride.trim()) {
            data.body = bodyOverride;
        }
        if (authId && authId !== NO_AUTH_OVERRIDE) {
            data.authId = authId;
        }

        // Create or update test case
        const savedTestCase: TestCase = testCase
            ? {
                ...testCase,
                name: name.trim(),
                description: description.trim() || undefined,
                enabled,
                data,
            }
            : {
                ...createTestCase(name.trim(), nextOrder),
                description: description.trim() || undefined,
                enabled,
                data,
            };

        onSave(savedTestCase);
        onClose();
    }, [
        name, description, enabled, authId,
        variablesJson, headersJson, paramsJson, bodyOverride,
        validateName, validateJson,
        testCase, nextOrder, onSave, onClose,
    ]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>
                        {isEditMode ? 'Edit Test Case' : 'New Test Case'}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 py-4">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="tc-name" className="text-sm font-medium">
                                Name <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="tc-name"
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value);
                                    setNameError(undefined);
                                }}
                                placeholder="e.g., Valid user login"
                                className={cn(nameError && 'border-red-500')}
                            />
                            {nameError && (
                                <p className="text-xs text-red-500 flex items-center gap-1">
                                    <AlertCircleIcon className="h-3 w-3" />
                                    {nameError}
                                </p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="tc-auth" className="text-sm font-medium">
                                Auth Override
                            </Label>
                            <Select value={authId} onValueChange={setAuthId}>
                                <SelectTrigger id="tc-auth">
                                    <SelectValue placeholder="Use default" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_AUTH_OVERRIDE}>Use default</SelectItem>
                                    {auths.map((auth) => (
                                        <SelectItem key={auth.id} value={auth.id}>
                                            {auth.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="tc-description" className="text-sm font-medium">
                            Description
                        </Label>
                        <Input
                            id="tc-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What does this test case verify?"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="tc-enabled"
                            checked={enabled}
                            onCheckedChange={(checked) => setEnabled(!!checked)}
                        />
                        <Label htmlFor="tc-enabled" className="text-sm cursor-pointer">
                            Enabled
                        </Label>
                    </div>

                    <hr className="border-slate-200 dark:border-slate-700" />

                    {/* Data Overrides Section */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            Data Overrides
                        </h3>
                        <p className="text-xs text-slate-500">
                            Override request data for this test case. Use <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{variableName}}'}</code> syntax for environment variables.
                            Test case variables override environment variables with the same name.
                        </p>
                    </div>

                    {/* Variables */}
                    <JsonEditorSection
                        label="Variables"
                        value={variablesJson}
                        onChange={(v) => {
                            setVariablesJson(v);
                            setVariablesError(undefined);
                        }}
                        placeholder={`{\n  "userId": "123",\n  "token": "abc-def"\n}`}
                        helpText="Key-value pairs that override environment variables"
                        error={variablesError}
                    />

                    {/* Headers */}
                    <JsonEditorSection
                        label="Headers Override"
                        value={headersJson}
                        onChange={(v) => {
                            setHeadersJson(v);
                            setHeadersError(undefined);
                        }}
                        placeholder={`[\n  { "key": "Authorization", "value": "Bearer {{token}}", "disabled": false }\n]`}
                        helpText="Array of header objects to merge with base request"
                        error={headersError}
                    />

                    {/* Params */}
                    <JsonEditorSection
                        label="Query Params Override"
                        value={paramsJson}
                        onChange={(v) => {
                            setParamsJson(v);
                            setParamsError(undefined);
                        }}
                        placeholder={`[\n  { "key": "page", "value": "1", "disabled": false }\n]`}
                        helpText="Array of param objects to merge with base request"
                        error={paramsError}
                    />

                    {/* Body */}
                    <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Body Override</Label>
                        <Textarea
                            value={bodyOverride}
                            onChange={(e) => setBodyOverride(e.target.value)}
                            placeholder={`{\n  "username": "{{userId}}",\n  "password": "test123"\n}`}
                            className="font-mono text-sm min-h-[100px] resize-y"
                        />
                        <p className="text-xs text-slate-500">
                            Raw body content that replaces the entire request body
                        </p>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                    <PrimaryButton onClick={handleSave}>
                        <SaveIcon className="h-4 w-4 mr-1" />
                        {isEditMode ? 'Update' : 'Create'}
                    </PrimaryButton>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default TestCaseEditor;
