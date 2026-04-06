import React, { useState, useEffect } from 'react';
import { XIcon, PlusIcon } from 'lucide-react';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import {
    GlobalValidationRule,
    ValidationRule,
    createEmptyStatusRule,
} from '../../types/validation';
import { globalRuleToValidationRule } from '../../hooks/store/createValidationRulesSlice';
import { ValidationRuleEditor } from './ValidationRuleEditor';

interface ValidationWizardProps {
    rule?: GlobalValidationRule;
    onSave: (rule: ValidationRule) => void;
    onCancel: () => void;
    existingNames: string[];
}

/** Generates a unique rule ID. */
const generateId = () =>
    `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

/**
 * Dialog form for adding or editing a rule in the global validation store.
 *
 * This component is a thin wrapper around `ValidationRuleEditor`. It owns:
 * - The `rule` state (a `ValidationRule`)
 * - Name-uniqueness validation (`existingNames` check)
 * - The Save / Cancel button strip
 *
 * All form field rendering is delegated to `ValidationRuleEditor`.
 */
const ValidationWizard: React.FC<ValidationWizardProps> = ({
    rule,
    onSave,
    onCancel,
    existingNames,
}) => {
    const [currentRule, setCurrentRule] = useState<ValidationRule>(() =>
        rule ? globalRuleToValidationRule(rule) : createEmptyStatusRule(generateId())
    );
    const [nameError, setNameError] = useState<string | null>(null);

    // Re-initialise when the prop changes (e.g., dialog opens for a different rule)
    useEffect(() => {
        setCurrentRule(
            rule ? globalRuleToValidationRule(rule) : createEmptyStatusRule(generateId())
        );
        setNameError(null);
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

    const handleRuleChange = (updated: ValidationRule) => {
        // Run name validation on every change so errors appear immediately
        validateName(updated.name);
        setCurrentRule(updated);
    };

    const handleSave = () => {
        if (!validateName(currentRule.name)) {
            return;
        }
        // Produce a clean copy with trimmed name/description before saving
        onSave({
            ...currentRule,
            name: currentRule.name.trim(),
            description: currentRule.description?.trim() || undefined,
        });
    };

    return (
        <div className="space-y-4">
            <ValidationRuleEditor
                rule={currentRule}
                onChange={handleRuleChange}
                nameError={nameError}
            />

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
