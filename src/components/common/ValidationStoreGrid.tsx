import React, { useState } from 'react';
import { ArrowLeftIcon, PlusIcon, PencilIcon, Trash2Icon, CheckCircleIcon, XCircleIcon, ClipboardCheckIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import Banner from '../ui/banner';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { GlobalValidationRule, ValidationRule } from '../../types/validation';
import ValidationWizard from './ValidationWizard';

interface ValidationStoreGridProps {
    onBack: () => void;
    onSaveValidationRules: (rules: GlobalValidationRule[]) => void;
}

const getCategoryLabel = (category: string): string => {
    switch (category) {
        case 'status': return 'Status';
        case 'header': return 'Header';
        case 'body': return 'Body';
        case 'time': return 'Time';
        default: return category;
    }
};

const getCategoryColor = (category: string): string => {
    switch (category) {
        case 'status': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
        case 'header': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
        case 'body': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
        case 'time': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
};

const getRuleSummary = (rule: GlobalValidationRule): string => {
    switch (rule.category) {
        case 'status': {
            const statusRule = rule as any;
            if (statusRule.operator === 'between') {
                return `${statusRule.value} - ${statusRule.value2}`;
            }
            if (statusRule.operator === 'in' || statusRule.operator === 'not_in') {
                return `${statusRule.operator.replace('_', ' ')} [${statusRule.values?.join(', ')}]`;
            }
            return `${statusRule.operator.replace(/_/g, ' ')} ${statusRule.value}`;
        }
        case 'header': {
            const headerRule = rule as any;
            if (headerRule.operator === 'exists' || headerRule.operator === 'not_exists') {
                return `'${headerRule.headerName}' ${headerRule.operator.replace('_', ' ')}`;
            }
            return `'${headerRule.headerName}' ${headerRule.operator.replace(/_/g, ' ')} '${headerRule.value}'`;
        }
        case 'body': {
            const bodyRule = rule as any;
            if (['is_json', 'is_xml', 'is_html'].includes(bodyRule.operator)) {
                return bodyRule.operator.replace(/_/g, ' ');
            }
            if (bodyRule.jsonPath) {
                return `${bodyRule.jsonPath} ${bodyRule.operator.replace(/_/g, ' ')}`;
            }
            const valuePreview = bodyRule.value?.substring(0, 30) + (bodyRule.value?.length > 30 ? '...' : '');
            return `${bodyRule.operator.replace(/_/g, ' ')} '${valuePreview}'`;
        }
        case 'time': {
            const timeRule = rule as any;
            if (timeRule.operator === 'between') {
                return `${timeRule.value}ms - ${timeRule.value2}ms`;
            }
            return `${timeRule.operator.replace(/_/g, ' ')} ${timeRule.value}ms`;
        }
        default:
            return '';
    }
};

const ValidationStoreGrid: React.FC<ValidationStoreGridProps> = ({ onBack, onSaveValidationRules }) => {
    const validationRules = useAppStateStore((state) => state.validationRules);
    const addValidationRule = useAppStateStore((state) => state.addValidationRule);
    const removeValidationRule = useAppStateStore((state) => state.removeValidationRule);
    const updateValidationRule = useAppStateStore((state) => state.updateValidationRule);
    const toggleRuleEnabled = useAppStateStore((state) => state.toggleRuleEnabled);

    const isInitialMount = React.useRef(true);
    const lastSavedRules = React.useRef<string>('');

    React.useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            lastSavedRules.current = JSON.stringify(validationRules);
            return;
        }

        const currentRulesString = JSON.stringify(validationRules);
        if (currentRulesString !== lastSavedRules.current) {
            onSaveValidationRules(validationRules);
            lastSavedRules.current = currentRulesString;
        }
    }, [validationRules, onSaveValidationRules]);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<GlobalValidationRule | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);

    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
    });

    const handleAddNew = () => {
        setEditingRule(undefined);
        setError(null);
        setIsDialogOpen(true);
    };

    const handleEdit = (rule: GlobalValidationRule) => {
        setEditingRule(rule);
        setError(null);
        setIsDialogOpen(true);
    };

    const handleSave = (rule: ValidationRule) => {
        if (editingRule) {
            // Update existing
            const result = updateValidationRule(editingRule.id, rule);
            if (result.isErr) {
                setError(result.error);
                return;
            }
        } else {
            // Add new
            const result = addValidationRule(rule);
            if (result.isErr) {
                setError(result.error);
                return;
            }
        }
        setIsDialogOpen(false);
        setEditingRule(undefined);
        setError(null);
    };

    const handleCancel = () => {
        setIsDialogOpen(false);
        setEditingRule(undefined);
        setError(null);
    };

    const handleToggle = (id: string) => {
        const result = toggleRuleEnabled(id);
        if (result.isErr) {
            console.error('Failed to toggle rule:', result.error);
        }
    };

    const handleDelete = (id: string) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Delete Validation Rule',
            message: 'Are you sure you want to delete this validation rule? This may affect requests that reference it.',
            onConfirm: () => {
                const result = removeValidationRule(id);
                if (result.isErr) {
                    console.error('Failed to delete rule:', result.error);
                }
                setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
            },
        });
    };

    const existingNames = validationRules.map(r => r.name);

    return (
        <div className="h-full bg-white dark:bg-slate-900 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
                <div className="flex items-center space-x-3">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onBack}
                        className="text-slate-600 hover:text-slate-700 hover:border-slate-300"
                    >
                        <ArrowLeftIcon className="h-4 w-4 mr-2" />
                        Back
                    </Button>
                    <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Validation Rules Store</h1>
                </div>
            </div>

            {/* Rules Table */}
            <div className="flex-1 overflow-auto p-4">
                {validationRules.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <ClipboardCheckIcon className="h-12 w-12 mb-4 opacity-50 mx-auto text-slate-400" />
                            <p className="text-lg text-slate-600 dark:text-slate-400 mb-2">No validation rules</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                                Add reusable validation rules to assert HTTP responses against expected values.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleAddNew}
                                className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
                            >
                                <PlusIcon className="h-4 w-4 mr-2" />
                                Add New Rule
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-slate-700">
                                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-[25%]">
                                        Name
                                    </th>
                                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-[15%]">
                                        Category
                                    </th>
                                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-[40%]">
                                        Condition
                                    </th>
                                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-[20%]">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {validationRules.map((rule) => {
                                    const isEnabled = rule.enabled;

                                    return (
                                        <tr
                                            key={rule.id}
                                            className={`border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 ${!isEnabled ? 'opacity-40' : ''
                                                }`}
                                        >
                                            <td className="py-3 px-4">
                                                <div className={`flex flex-col gap-1 ${isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                                                    }`}>
                                                    <span className="text-sm font-medium">{rule.name}</span>
                                                    {rule.description && (
                                                        <span className="text-xs text-slate-500 dark:text-slate-400">{rule.description}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(rule.category)}`}>
                                                    {getCategoryLabel(rule.category)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={`text-sm font-mono ${isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                                                    }`}>
                                                    {getRuleSummary(rule)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleEdit(rule)}
                                                        className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
                                                        title="Edit rule"
                                                    >
                                                        <PencilIcon className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleToggle(rule.id)}
                                                        className={`${isEnabled
                                                            ? 'text-green-600 hover:text-green-700 hover:border-green-300'
                                                            : 'text-slate-400 hover:text-slate-600 hover:border-slate-300'
                                                            }`}
                                                        title={isEnabled ? 'Disable rule' : 'Enable rule'}
                                                    >
                                                        {isEnabled ? (
                                                            <CheckCircleIcon className="h-4 w-4" />
                                                        ) : (
                                                            <XCircleIcon className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleDelete(rule.id)}
                                                        className="text-red-600 hover:text-red-700 hover:border-red-300"
                                                        title="Delete rule"
                                                    >
                                                        <Trash2Icon className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Action Buttons - Beneath the data grid */}
                {validationRules.length > 0 && (
                    <div className="flex justify-start gap-2 pt-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAddNew}
                            className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
                        >
                            <PlusIcon className="h-4 w-4 mr-2" />
                            Add New Rule
                        </Button>
                    </div>
                )}
            </div>

            {/* Validation Wizard Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingRule ? 'Edit Validation Rule' : 'Add New Validation Rule'}
                        </DialogTitle>
                    </DialogHeader>
                    {error && (
                        <Banner
                            message={error}
                            messageType="error"
                            onClose={() => setError(null)}
                        />
                    )}
                    <ValidationWizard
                        rule={editingRule}
                        onSave={handleSave}
                        onCancel={handleCancel}
                        existingNames={editingRule ? existingNames.filter(n => n !== editingRule.name) : existingNames}
                    />
                </DialogContent>
            </Dialog>

            {/* Confirmation Dialog */}
            <Dialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, isOpen: open }))}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{confirmDialog.title}</DialogTitle>
                        <DialogDescription>{confirmDialog.message}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDialog.onConfirm}
                        >
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ValidationStoreGrid;
