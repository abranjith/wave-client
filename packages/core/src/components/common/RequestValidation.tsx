import React, { useState, useMemo } from 'react';
import { Trash2Icon, PlusIcon, PencilIcon, LinkIcon, UnlinkIcon, XIcon, SaveIcon, CheckIcon } from 'lucide-react';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Switch } from '../ui/switch';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../ui/table';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { globalRuleToValidationRule } from '../../hooks/store/createValidationRulesSlice';
import { 
    ValidationRule, 
    ValidationRuleRef, 
    ValidationRuleCategory,
    createEmptyStatusRule,
    createEmptyHeaderRule,
    createEmptyBodyRule,
    createEmptyTimeRule,
    isStatusRule,
    isHeaderRule,
    isBodyRule,
    isTimeRule
} from '../../types/validation';
import { ValidationRuleEditor, BODY_OPERATORS } from './ValidationRuleEditor';

// Helper function to generate a simple ID
const generateId = () => `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Category display names
const CATEGORY_LABELS: Record<ValidationRuleCategory, string> = {
    status: 'Status Code',
    header: 'Header',
    body: 'Body',
    time: 'Response Time'
};

// Create empty rule for a category
function createEmptyRule(category: ValidationRuleCategory): ValidationRule {
    const id = generateId();
    switch (category) {
        case 'status':
            return createEmptyStatusRule(id);
        case 'header':
            return createEmptyHeaderRule(id);
        case 'body':
            return createEmptyBodyRule(id);
        case 'time':
            return createEmptyTimeRule(id);
    }
}

// Get rule description for display
function getRuleDescription(rule: ValidationRule): string {
    if (isStatusRule(rule)) {
        if (rule.operator === 'between') {
            return `Status code ${rule.operator.replace(/_/g, ' ')} ${rule.value} and ${rule.value2 ?? '?'}`;
        }
        if (rule.operator === 'in' || rule.operator === 'not_in') {
            return `Status code ${rule.operator.replace(/_/g, ' ')} (${rule.values?.join(', ') ?? '?'})`;
        }
        if (['is_success', 'is_not_success'].includes(rule.operator)) {
            return `Status code ${rule.operator.replace(/_/g, ' ')}`;
        }
        return `Status code ${rule.operator.replace(/_/g, ' ')} ${rule.value}`;
    }
    
    if (isHeaderRule(rule)) {
        if (rule.operator === 'exists' || rule.operator === 'not_exists') {
            return `Header '${rule.headerName}' ${rule.operator.replace(/_/g, ' ')}`;
        }
        return `Header '${rule.headerName}' ${rule.operator.replace(/_/g, ' ')} '${rule.value ?? ''}'`;
    }
    
    if (isBodyRule(rule)) {
        if (['is_json', 'is_xml', 'is_html'].includes(rule.operator)) {
            const opLabel = BODY_OPERATORS.find(op => op.value === rule.operator)?.label ?? rule.operator.replace(/_/g, ' ');
            return `Body ${opLabel}`;
        }
        if (rule.operator.startsWith('json_path_')) {
            return `JSON path '${rule.jsonPath ?? '?'}' ${rule.operator.replace('json_path_', '').replace(/_/g, ' ')} '${rule.value ?? ''}'`;
        }
        return `Body ${rule.operator.replace(/_/g, ' ')} '${rule.value ?? ''}'`;
    }
    
    if (isTimeRule(rule)) {
        if (rule.operator === 'between') {
            return `Response time ${rule.operator.replace(/_/g, ' ')} ${rule.value}ms and ${rule.value2 ?? '?'}ms`;
        }
        return `Response time ${rule.operator.replace(/_/g, ' ')} ${rule.value}ms`;
    }
    
    return 'Unknown rule';
}

interface RuleEditorDialogProps {
    rule: ValidationRule | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (rule: ValidationRule) => void;
    title: string;
}

/**
 * Dialog for editing a validation rule.
 * All form field rendering is delegated to `ValidationRuleEditor`.
 */
const RuleEditorDialog: React.FC<RuleEditorDialogProps> = ({ rule, isOpen, onClose, onSave, title }) => {
    const [editedRule, setEditedRule] = useState<ValidationRule | null>(rule);

    React.useEffect(() => {
        setEditedRule(rule);
    }, [rule]);

    if (!editedRule) return null;

    const handleSave = () => {
        if (editedRule) {
            onSave(editedRule);
        }
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">{title}</DialogTitle>
                    <DialogDescription>
                        Configure the validation rule settings.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    <ValidationRuleEditor rule={editedRule} onChange={setEditedRule} />
                </div>

                <DialogFooter>
                    <DialogClose asChild>
                        <SecondaryButton
                            colorTheme="warning"
                            icon={<XIcon />}
                            text="Cancel"
                        />
                    </DialogClose>
                    <PrimaryButton
                        onClick={handleSave}
                        colorTheme="main"
                        icon={<SaveIcon />}
                        text="Save Rule"
                    />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

interface GlobalRuleSelectorDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (ruleId: string) => void;
    existingRuleIds: string[];
}

/**
 * Dialog for selecting a global rule to reference
 */
const GlobalRuleSelectorDialog: React.FC<GlobalRuleSelectorDialogProps> = ({ 
    isOpen, 
    onClose, 
    onSelect,
    existingRuleIds 
}) => {
    const globalRules = useAppStateStore((state) => state.validationRules);
    
    // Filter out already referenced rules
    const availableRules = globalRules.filter((rule) => !existingRuleIds.includes(rule.id));
    
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                        Link Global Rule
                    </DialogTitle>
                    <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
                        Select a rule from the global validation store to reference.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="max-h-64 overflow-y-auto py-4">
                    {availableRules.length === 0 ? (
                        <div className="text-center text-slate-500 dark:text-slate-400 py-4">
                            No available global rules to link.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {availableRules.map((rule) => {
                                const validationRule = globalRuleToValidationRule(rule);
                                return (
                                    <div 
                                        key={rule.id}
                                        className="p-3 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                        onClick={() => {
                                            onSelect(rule.id);
                                            onClose();
                                        }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-slate-800 dark:text-slate-200">{rule.name}</span>
                                            <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded">
                                                {CATEGORY_LABELS[rule.category]}
                                            </span>
                                        </div>
                                        <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                            {getRuleDescription(validationRule)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                
                <DialogFooter>
                    <DialogClose asChild>
                        <SecondaryButton
                            colorTheme="warning"
                            icon={<XIcon />}
                            text="Cancel"
                        />
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

/**
 * Request Validation Component
 * Manages validation rules for a specific request tab
 */
const RequestValidation: React.FC = () => {
    const activeTab = useAppStateStore((state) => state.getActiveTab());
    const validation = activeTab?.validation;
    const globalRules = useAppStateStore((state) => state.validationRules);
    
    // Actions from store
    const setValidationEnabled = useAppStateStore((state) => state.setRequestValidationEnabled);
    const addValidationRule = useAppStateStore((state) => state.addRequestValidationRule);
    const removeValidationRule = useAppStateStore((state) => state.removeRequestValidationRule);
    const updateValidationRule = useAppStateStore((state) => state.updateRequestValidationRule);
    
    // Local state for dialogs
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [isGlobalSelectorOpen, setIsGlobalSelectorOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<ValidationRule | null>(null);
    const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => {},
    });
    
    // Resolve rules to their actual definitions (converted to ValidationRule)
    const resolvedRules = useMemo(() => {
        if (!validation?.rules) return [];
        
        return validation.rules.map((ruleRef, index) => {
            if (ruleRef.ruleId) {
                // Find global rule by ID and convert to ValidationRule
                const globalRule = globalRules.find(r => r.id === ruleRef.ruleId);
                const validationRule = globalRule ? globalRuleToValidationRule(globalRule) : null;
                return {
                    index,
                    ruleRef,
                    rule: validationRule,
                    isGlobal: true
                };
            } else if (ruleRef.rule) {
                return {
                    index,
                    ruleRef,
                    rule: ruleRef.rule,
                    isGlobal: false
                };
            }
            return { index, ruleRef, rule: null as ValidationRule | null, isGlobal: false };
        });
    }, [validation?.rules, globalRules]);
    
    // Get existing rule IDs for filtering global selector
    const existingGlobalRuleIds = useMemo(() => {
        return validation?.rules
            .filter(r => r.ruleId)
            .map(r => r.ruleId as string) || [];
    }, [validation?.rules]);
    
    // Handle creating a new inline rule
    const handleCreateNewRule = () => {
        setEditingRule(createEmptyRule('status'));
        setEditingRuleIndex(null);
        setIsEditorOpen(true);
    };
    
    // Handle editing an existing inline rule
    const handleEditRule = (index: number, rule: ValidationRule) => {
        setEditingRule({ ...rule });
        setEditingRuleIndex(index);
        setIsEditorOpen(true);
    };
    
    // Handle saving a rule (new or edited)
    const handleSaveRule = (rule: ValidationRule) => {
        if (editingRuleIndex !== null) {
            // Update existing rule
            updateValidationRule(editingRuleIndex, { rule });
        } else {
            // Add new rule
            addValidationRule({ rule });
        }
        setEditingRule(null);
        setEditingRuleIndex(null);
    };
    
    // Handle linking a global rule
    const handleLinkGlobalRule = (ruleId: string) => {
        addValidationRule({ ruleId });
    };
    
    // Handle removing a rule
    const handleRemoveRule = (index: number) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Delete Validation Rule',
            message: 'Are you sure you want to delete this validation rule?',
            onConfirm: () => {
                removeValidationRule(index);
                setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
            },
        });
    };
    
    if (!activeTab) {
        return (
            <div className="text-center text-slate-500 dark:text-slate-400 py-8">
                No active request tab.
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            {/* Enable/Disable Validation */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div>
                    <h3 className="font-medium text-slate-900 dark:text-slate-100">
                        Response Validation
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Enable to validate responses against defined rules
                    </p>
                </div>
                <Switch
                    checked={validation?.enabled ?? false}
                    onCheckedChange={(checked: boolean) => setValidationEnabled(checked)}
                />
            </div>
            
            {/* Rules List */}
            {validation?.enabled && (
                <>
                    <div className="flex items-center justify-between">
                        <h4 className="font-medium text-slate-900 dark:text-slate-100">
                            Validation Rules
                        </h4>
                        <div className="flex gap-2">
                            <SecondaryButton 
                                size="sm"
                                onClick={() => setIsGlobalSelectorOpen(true)}
                                colorTheme="main"
                                icon={<LinkIcon />}
                                text="Link Global Rule"
                            />
                            <SecondaryButton
                                size="sm"
                                onClick={handleCreateNewRule}
                                colorTheme="main"
                                icon={<PlusIcon />}
                                text="Add Inline Rule"
                            />
                        </div>
                    </div>
                    
                    {resolvedRules.length === 0 ? (
                        <div className="text-center text-slate-500 dark:text-slate-400 py-8 border border-dashed rounded-lg">
                            No validation rules configured. Add rules to validate responses.
                        </div>
                    ) : (
                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[8%]">Enabled</TableHead>
                                    <TableHead className="w-[18%]">Name</TableHead>
                                    <TableHead className="w-[12%]">Category</TableHead>
                                    <TableHead className="w-[32%]">Description</TableHead>
                                    <TableHead className="w-[12%]">Type</TableHead>
                                    <TableHead className="w-[18%]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {resolvedRules.map(({ index, ruleRef, rule, isGlobal }) => {
                                    const isEnabled = rule?.enabled ?? false;
                                    
                                    const handleToggleEnabled = () => {
                                        if (rule && !isGlobal) {
                                            // For inline rules, update the rule's enabled state directly
                                            updateValidationRule(index, { 
                                                rule: { ...rule, enabled: !isEnabled } 
                                            });
                                        }
                                        // Global rules' enabled state is controlled from the global store
                                    };
                                    
                                    return (
                                    <TableRow key={index}>
                                        <TableCell>
                                            <Switch
                                                checked={isEnabled}
                                                onCheckedChange={handleToggleEnabled}
                                                disabled={!rule || isGlobal}
                                                title={isGlobal ? 'Global rule enabled state is controlled from Validation Store' : undefined}
                                            />
                                        </TableCell>
                                        <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                                            <span className={`font-medium text-sm ${
                                                isEnabled 
                                                    ? 'text-slate-800 dark:text-slate-200' 
                                                    : 'text-slate-500 dark:text-slate-400'
                                            }`}>
                                                {rule?.name || (isGlobal ? '(Missing Rule)' : 'Unknown')}
                                            </span>
                                        </TableCell>
                                        <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                                            <span className={`text-sm ${
                                                isEnabled 
                                                    ? 'text-slate-700 dark:text-slate-300' 
                                                    : 'text-slate-500 dark:text-slate-400'
                                            }`}>
                                                {rule ? CATEGORY_LABELS[rule.category] : '-'}
                                            </span>
                                        </TableCell>
                                        <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                                            <span className={`text-sm ${
                                                isEnabled 
                                                    ? 'text-slate-700 dark:text-slate-300' 
                                                    : 'text-slate-500 dark:text-slate-400'
                                            }`}>
                                                {rule ? getRuleDescription(rule) : '-'}
                                            </span>
                                        </TableCell>
                                        <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                                            {isGlobal ? (
                                                <span className="inline-flex items-center text-xs px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded">
                                                    <LinkIcon size={12} className="mr-1" />
                                                    Global
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center text-xs px-2 py-1 bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded">
                                                    <UnlinkIcon size={12} className="mr-1" />
                                                    Inline
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {!isGlobal && rule && (
                                                    <SecondaryButton
                                                        size="sm"
                                                        onClick={() => handleEditRule(index, rule)}
                                                        colorTheme="main"
                                                        icon={<PencilIcon />}
                                                        tooltip="Edit rule"
                                                    />
                                                )}
                                                <SecondaryButton
                                                    size="sm"
                                                    onClick={() => handleRemoveRule(index)}
                                                    colorTheme="error"
                                                    icon={<Trash2Icon />}
                                                    tooltip="Delete rule"
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                        </div>
                    )}
                    
                    {/* Info about rule evaluation */}
                    <div className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                        <strong>Note:</strong> All rules are evaluated (AND condition). 
                        All failures will be reported after the request completes.
                        Rules can reference environment variables using {`{{variableName}}`} syntax.
                    </div>
                </>
            )}
            
            {/* Rule Editor Dialog */}
            <RuleEditorDialog
                rule={editingRule}
                isOpen={isEditorOpen}
                onClose={() => {
                    setIsEditorOpen(false);
                    setEditingRule(null);
                    setEditingRuleIndex(null);
                }}
                onSave={handleSaveRule}
                title={editingRuleIndex !== null ? 'Edit Validation Rule' : 'New Validation Rule'}
            />
            
            {/* Global Rule Selector Dialog */}
            <GlobalRuleSelectorDialog
                isOpen={isGlobalSelectorOpen}
                onClose={() => setIsGlobalSelectorOpen(false)}
                onSelect={handleLinkGlobalRule}
                existingRuleIds={existingGlobalRuleIds}
            />
            {/* Confirmation Dialog */}
            <Dialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, isOpen: open }))}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">{confirmDialog.title}</DialogTitle>
                        <DialogDescription>{confirmDialog.message}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <SecondaryButton
                            onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                            colorTheme="warning"
                            icon={<XIcon />}
                            text="Cancel"
                        />
                        <PrimaryButton
                            onClick={confirmDialog.onConfirm}
                            colorTheme="error"
                            icon={<Trash2Icon />}
                            text="Confirm"
                        />
                    </DialogFooter>
                </DialogContent>
            </Dialog>        </div>
    );
};

export { RuleEditorDialog };

export default RequestValidation;
