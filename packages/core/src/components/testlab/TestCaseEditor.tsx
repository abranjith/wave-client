/**
 * Test Case Editor Component
 * 
 * Modal for creating and editing test cases for data-driven testing.
 * 
 * Two modes:
 * - Request Mode: For single request test cases with full data overrides (headers, params, body, auth, variables)
 * - Flow Mode: For flow test cases with only variable overrides (simpler, avoids confusion with multi-request flows)
 * 
 * Initial version uses JSON editor; future enhancements will add form-based editors.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { 
    SaveIcon, 
    AlertCircleIcon,
} from 'lucide-react';
import type { TestCase, TestCaseData } from '../../types/testSuite';
import type { Auth } from '../../hooks/store/createAuthSlice';
import type { RequestBody } from '../../types/tab';
import type { RequestBodyType } from '../../types/collection';
import { createTestCase } from '../../types/testSuite';
import { createEmptyRequestBody } from '../../types/tab';
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

/** Editor mode determines which fields are shown */
export type TestCaseEditorMode = 'request' | 'flow';

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
    /** 
     * Editor mode: 'request' shows all fields (variables, headers, params, body, auth, validation)
     * 'flow' shows only name, description, enabled, and variables
     * @default 'request'
     */
    mode?: TestCaseEditorMode;
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
    mode = 'request',
}) => {
    const isEditMode = !!testCase;
    const isFlowMode = mode === 'flow';

    // ========================================================================
    // Common State (both modes)
    // ========================================================================
    const [name, setName] = useState(testCase?.name || '');
    const [description, setDescription] = useState(testCase?.description || '');
    const [enabled, setEnabled] = useState(testCase?.enabled ?? true);
    const [variablesJson, setVariablesJson] = useState('');

    // Common validation errors
    const [nameError, setNameError] = useState<string | undefined>();
    const [variablesError, setVariablesError] = useState<string | undefined>();

    // ========================================================================
    // Request Mode Only State
    // ========================================================================
    const [authId, setAuthId] = useState(testCase?.data.authId || NO_AUTH_OVERRIDE);
    const [headersJson, setHeadersJson] = useState('');
    const [paramsJson, setParamsJson] = useState('');
    const [hasBodyOverride, setHasBodyOverride] = useState(!!testCase?.data.body);
    const [bodyOverride, setBodyOverride] = useState<RequestBody>(createEmptyRequestBody());

    // Request mode validation errors
    const [headersError, setHeadersError] = useState<string | undefined>();
    const [paramsError, setParamsError] = useState<string | undefined>();

    // ========================================================================
    // Initialize form state when testCase changes
    // ========================================================================
    useEffect(() => {
        if (testCase) {
            // Common fields (both modes)
            setName(testCase.name);
            setDescription(testCase.description || '');
            setEnabled(testCase.enabled);
            setVariablesJson(
                testCase.data.variables 
                    ? JSON.stringify(testCase.data.variables, null, 2) 
                    : ''
            );
            
            // Request mode only fields
            if (!isFlowMode) {
                setAuthId(testCase.data.authId || NO_AUTH_OVERRIDE);
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
                
                if (testCase.data.body) {
                    setHasBodyOverride(true);
                    setBodyOverride(testCase.data.body);
                } else {
                    setHasBodyOverride(false);
                    setBodyOverride(createEmptyRequestBody());
                }
            }
        } else {
            // Reset for new test case - common fields
            setName('');
            setDescription('');
            setEnabled(true);
            setVariablesJson('');
            
            // Reset request mode fields
            if (!isFlowMode) {
                setAuthId(NO_AUTH_OVERRIDE);
                setHeadersJson('');
                setParamsJson('');
                setHasBodyOverride(false);
                setBodyOverride(createEmptyRequestBody());
            }
        }
        
        // Clear errors
        setNameError(undefined);
        setVariablesError(undefined);
        if (!isFlowMode) {
            setHeadersError(undefined);
            setParamsError(undefined);
        }
    }, [testCase, isOpen, isFlowMode]);

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

    // ========================================================================
    // Handle Save
    // ========================================================================
    const handleSave = useCallback(() => {
        // Validate common fields
        const nameValidation = validateName(name);
        const variablesValidation = validateJson(variablesJson, 'variables');

        setNameError(nameValidation.error);
        setVariablesError(variablesValidation.error);

        // Flow mode: only validate name and variables
        if (isFlowMode) {
            if (!nameValidation.valid || !variablesValidation.valid) {
                return;
            }

            // Build flow test case data (variables only)
            const data: TestCaseData = {};
            if (variablesJson.trim()) {
                data.variables = JSON.parse(variablesJson);
            }

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
            return;
        }

        // Request mode: validate all fields
        const headersValidation = validateJson(headersJson, 'headers');
        const paramsValidation = validateJson(paramsJson, 'params');

        setHeadersError(headersValidation.error);
        setParamsError(paramsValidation.error);

        if (!nameValidation.valid || !variablesValidation.valid || 
            !headersValidation.valid || !paramsValidation.valid) {
            return;
        }

        // Build request test case data (all overrides)
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
        if (hasBodyOverride) {
            data.body = bodyOverride;
        }
        if (authId && authId !== NO_AUTH_OVERRIDE) {
            data.authId = authId;
        }

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
        name, description, enabled, isFlowMode, variablesJson,
        // Request mode dependencies
        authId, headersJson, paramsJson, hasBodyOverride, bodyOverride,
        // Functions
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
                    {/* ========================================================================
                        COMMON FIELDS (both flow and request modes)
                        ======================================================================== */}
                    
                    {/* Name Input */}
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
                            placeholder={isFlowMode ? "e.g., Happy path with valid data" : "e.g., Valid user login"}
                            className={cn(nameError && 'border-red-500')}
                        />
                        {nameError && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                                <AlertCircleIcon className="h-3 w-3" />
                                {nameError}
                            </p>
                        )}
                    </div>

                    {/* Description Input */}
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

                    {/* Enabled Checkbox */}
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

                    {/* ========================================================================
                        FLOW MODE: Variables Only
                        ======================================================================== */}
                    {isFlowMode && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                    Variable Overrides
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Define variables for this test case. Use <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{variableName}}'}</code> syntax in your flow requests.
                                    Test case variables override environment variables with the same name but are overridden by flow output variables.
                                </p>
                            </div>

                            <JsonEditorSection
                                label="Variables"
                                value={variablesJson}
                                onChange={(v) => {
                                    setVariablesJson(v);
                                    setVariablesError(undefined);
                                }}
                                placeholder={`{\n  "userId": "123",\n  "apiKey": "test-key-xyz"\n}`}
                                helpText="Key-value pairs that override environment variables for all nodes in the flow"
                                error={variablesError}
                            />
                        </div>
                    )}

                    {/* ========================================================================
                        REQUEST MODE: Full Data Overrides
                        ======================================================================== */}
                    {!isFlowMode && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                    Data Overrides
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Override request data for this test case. Use <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{variableName}}'}</code> syntax for environment variables.
                                    Test case variables override environment variables with the same name.
                                </p>
                            </div>

                            {/* Auth Override */}
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
                                placeholder={`[\n  { "key": "Authorization", "value": "Bearer {{token}}" }\n]`}
                                helpText="Array of header objects to merge with base request"
                                error={headersError}
                            />

                            {/* Query Params */}
                            <JsonEditorSection
                                label="Query Params Override"
                                value={paramsJson}
                                onChange={(v) => {
                                    setParamsJson(v);
                                    setParamsError(undefined);
                                }}
                                placeholder={`[\n  { "key": "page", "value": "1" }\n]`}
                                helpText="Array of param objects to merge with base request"
                                error={paramsError}
                            />

                            <hr className="border-slate-200 dark:border-slate-700" />

                            {/* Body Override Section */}
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="tc-body-override"
                                    checked={hasBodyOverride}
                                    onCheckedChange={(checked) => {
                                        setHasBodyOverride(!!checked);
                                        if (!checked) {
                                            setBodyOverride(createEmptyRequestBody());
                                        }
                                    }}
                                />
                                <Label htmlFor="tc-body-override" className="text-sm cursor-pointer font-medium">
                                    Override Request Body
                                </Label>
                            </div>

                            {hasBodyOverride && (
                                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/30 space-y-3">
                                    <p className="text-xs text-slate-600 dark:text-slate-400">
                                        Configure a custom request body for this test case. This will replace the base request body.
                                    </p>
                                    
                                    {/* Body Type Selector */}
                                    <div className="space-y-1.5">
                                        <Label className="text-sm font-medium">Body Type</Label>
                                        <Select 
                                            value={bodyOverride.currentBodyType} 
                                            onValueChange={(value) => {
                                                setBodyOverride({
                                                    ...bodyOverride,
                                                    currentBodyType: value as RequestBodyType
                                                });
                                            }}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No Body</SelectItem>
                                                <SelectItem value="text">Text</SelectItem>
                                                <SelectItem value="binary">Binary</SelectItem>
                                                <SelectItem value="form">Form</SelectItem>
                                                <SelectItem value="multipart">Multipart Form</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Body Content */}
                                    {bodyOverride.currentBodyType === 'text' && bodyOverride.textData && (
                                        <div className="space-y-1.5">
                                            <Label className="text-sm font-medium">Text Content</Label>
                                            <Textarea
                                                value={bodyOverride.textData.data || ''}
                                                onChange={(e) => {
                                                    setBodyOverride({
                                                        ...bodyOverride,
                                                        textData: {
                                                            ...bodyOverride.textData!,
                                                            data: e.target.value
                                                        }
                                                    });
                                                }}
                                                placeholder='{"key": "value"}'
                                                className="font-mono text-sm min-h-[100px] resize-y"
                                            />
                                        </div>
                                    )}

                                    {bodyOverride.currentBodyType === 'none' && (
                                        <div className="p-3 text-center text-sm text-slate-500 bg-white dark:bg-slate-800 rounded border border-dashed">
                                            No body will be sent
                                        </div>
                                    )}

                                    {(bodyOverride.currentBodyType === 'binary' || 
                                      bodyOverride.currentBodyType === 'form' || 
                                      bodyOverride.currentBodyType === 'multipart') && (
                                        <div className="p-3 text-center text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 rounded">
                                            <p>Advanced body types are currently only editable when creating/editing requests.</p>
                                            <p className="mt-1">Please use the main request editor to configure {bodyOverride.currentBodyType} bodies.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
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
