/**
 * Validation Rules Slice
 * Manages global validation rules that can be referenced by requests.
 */

import { StateCreator } from 'zustand';
import { Result, ok, err } from '../../utils/result';
import {
    GlobalValidationRule,
    ValidationRule,
    ValidationRuleCategory,
    createEmptyStatusRule,
    createEmptyHeaderRule,
    createEmptyBodyRule,
    createEmptyTimeRule
} from '../../types/validation';

// ==================== Slice Interface ====================

export interface ValidationRulesSlice {
    validationRules: GlobalValidationRule[];
    
    // CRUD operations
    addValidationRule: (rule: ValidationRule) => Result<GlobalValidationRule, string>;
    removeValidationRule: (id: string) => Result<void, string>;
    updateValidationRule: (id: string, updates: Partial<ValidationRule>) => Result<GlobalValidationRule, string>;
    
    // Utility operations
    toggleRuleEnabled: (id: string) => Result<void, string>;
    getRuleById: (id: string) => GlobalValidationRule | undefined;
    getRuleByName: (name: string) => GlobalValidationRule | undefined;
    getRulesByCategory: (category: ValidationRuleCategory) => GlobalValidationRule[];
    getEnabledRules: () => GlobalValidationRule[];
    isRuleNameUnique: (name: string, excludeId?: string) => boolean;
    clearAllRules: () => void;
    setValidationRules: (rules: GlobalValidationRule[]) => void;
    
    // Factory methods
    createNewRule: (category: ValidationRuleCategory) => ValidationRule;
}

// ==================== Helper Functions ====================

/**
 * Generates a unique ID for a new rule
 */
function generateRuleId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates a GlobalValidationRule from a ValidationRule
 */
function toGlobalRule(rule: ValidationRule): GlobalValidationRule {
    const now = new Date().toISOString();
    // Extract common and specific fields from the rule
    const globalRule: GlobalValidationRule = {
        id: rule.id,
        name: rule.name,
        description: rule.description,
        enabled: rule.enabled,
        category: rule.category,
        operator: rule.operator,
        createdAt: now,
        updatedAt: now
    };
    
    // Copy rule-specific fields based on category
    if ('value' in rule) globalRule.value = rule.value;
    if ('value2' in rule) globalRule.value2 = rule.value2;
    if ('values' in rule) globalRule.values = rule.values;
    if ('headerName' in rule) globalRule.headerName = rule.headerName;
    if ('jsonPath' in rule) globalRule.jsonPath = rule.jsonPath;
    if ('caseSensitive' in rule) globalRule.caseSensitive = rule.caseSensitive;
    
    return globalRule;
}

/**
 * Converts a GlobalValidationRule back to a ValidationRule for processing
 */
export function globalRuleToValidationRule(globalRule: GlobalValidationRule): ValidationRule {
    const baseProps = {
        id: globalRule.id,
        name: globalRule.name,
        description: globalRule.description,
        enabled: globalRule.enabled
    };
    
    switch (globalRule.category) {
        case 'status':
            return {
                ...baseProps,
                category: 'status',
                operator: globalRule.operator as any,
                value: globalRule.value as number,
                value2: globalRule.value2,
                values: globalRule.values as number[]
            };
        case 'header':
            return {
                ...baseProps,
                category: 'header',
                headerName: globalRule.headerName || '',
                operator: globalRule.operator as any,
                value: globalRule.value as string,
                values: globalRule.values as string[],
                caseSensitive: globalRule.caseSensitive
            };
        case 'body':
            return {
                ...baseProps,
                category: 'body',
                operator: globalRule.operator as any,
                value: globalRule.value as string,
                jsonPath: globalRule.jsonPath,
                caseSensitive: globalRule.caseSensitive
            };
        case 'time':
            return {
                ...baseProps,
                category: 'time',
                operator: globalRule.operator as any,
                value: globalRule.value as number,
                value2: globalRule.value2
            };
        default:
            throw new Error(`Unknown rule category: ${globalRule.category}`);
    }
}

// ==================== Slice Creator ====================

const createValidationRulesSlice: StateCreator<ValidationRulesSlice> = (set, get) => ({
    validationRules: [],

    setValidationRules: (rules) => set({ validationRules: rules }),

    // Add a new validation rule
    addValidationRule: (rule) => {
        // Check if name is unique
        const nameExists = get().validationRules.some(r => r.name === rule.name);
        if (nameExists) {
            return err(`Validation rule with name "${rule.name}" already exists`);
        }
        
        // Validate rule has required fields
        if (!rule.name || rule.name.trim() === '') {
            return err('Rule name is required');
        }
        
        const globalRule = toGlobalRule(rule);
        
        set((state) => ({
            validationRules: [...state.validationRules, globalRule]
        }));
        
        return ok(globalRule);
    },

    // Remove a rule by ID
    removeValidationRule: (id) => {
        const rule = get().validationRules.find(r => r.id === id);
        if (!rule) {
            return err(`Validation rule with id "${id}" not found`);
        }
        
        set((state) => ({
            validationRules: state.validationRules.filter((r) => r.id !== id)
        }));
        
        return ok(undefined);
    },

    // Update an existing rule
    updateValidationRule: (id, updates) => {
        const rule = get().validationRules.find(r => r.id === id);
        if (!rule) {
            return err(`Validation rule with id "${id}" not found`);
        }
        
        // If updating name, check uniqueness
        if (updates.name && updates.name !== rule.name) {
            const nameExists = get().validationRules.some(r => r.id !== id && r.name === updates.name);
            if (nameExists) {
                return err(`Validation rule with name "${updates.name}" already exists`);
            }
        }
        
        // Validate rule name if being updated
        if (updates.name !== undefined && (!updates.name || updates.name.trim() === '')) {
            return err('Rule name cannot be empty');
        }
        
        const updatedRule: GlobalValidationRule = { 
            ...rule, 
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        set((state) => ({
            validationRules: state.validationRules.map((r) =>
                r.id === id ? updatedRule : r
            )
        }));
        
        return ok(updatedRule);
    },

    // Toggle rule enabled state
    toggleRuleEnabled: (id) => {
        const rule = get().validationRules.find(r => r.id === id);
        if (!rule) {
            return err(`Validation rule with id "${id}" not found`);
        }
        
        set((state) => ({
            validationRules: state.validationRules.map((r) =>
                r.id === id ? { ...r, enabled: !r.enabled, updatedAt: new Date().toISOString() } : r
            )
        }));
        
        return ok(undefined);
    },

    // Get a rule by ID
    getRuleById: (id) => {
        return get().validationRules.find(r => r.id === id);
    },

    // Get a rule by name
    getRuleByName: (name) => {
        return get().validationRules.find(r => r.name === name);
    },

    // Get rules by category
    getRulesByCategory: (category) => {
        return get().validationRules.filter(r => r.category === category);
    },

    // Get all enabled rules
    getEnabledRules: () => {
        return get().validationRules.filter(r => r.enabled);
    },

    // Check if a rule name is unique
    isRuleNameUnique: (name, excludeId) => {
        return !get().validationRules.some(r => 
            r.name === name && (excludeId === undefined || r.id !== excludeId)
        );
    },

    // Clear all rules
    clearAllRules: () => {
        set({ validationRules: [] });
    },

    // Factory method to create a new rule of a specific category
    createNewRule: (category) => {
        const id = generateRuleId();
        
        switch (category) {
            case 'status':
                return createEmptyStatusRule(id);
            case 'header':
                return createEmptyHeaderRule(id);
            case 'body':
                return createEmptyBodyRule(id);
            case 'time':
                return createEmptyTimeRule(id);
            default:
                return createEmptyStatusRule(id);
        }
    }
});

export default createValidationRulesSlice;
