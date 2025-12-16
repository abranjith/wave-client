import React from 'react';
import { CheckCircleIcon, XCircleIcon, AlertCircleIcon, CircleSlashIcon } from 'lucide-react';
import { ValidationResult, ValidationRuleResult, ValidationRuleCategory } from '../../types/validation';

// Category labels for display
const CATEGORY_LABELS: Record<ValidationRuleCategory, string> = {
    status: 'Status Code',
    header: 'Header',
    body: 'Body',
    time: 'Response Time'
};

interface ResponseValidationProps {
    validationResult?: ValidationResult;
}

/**
 * Component that displays validation results after an HTTP request
 */
const ResponseValidation: React.FC<ResponseValidationProps> = ({ validationResult }) => {
    if (!validationResult || !validationResult.enabled) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-12 text-slate-500 dark:text-slate-400">
                <CircleSlashIcon size={48} className="mb-4 opacity-50" />
                <div className="text-lg font-medium mb-2">Validation Not Enabled</div>
                <div className="text-sm">
                    Enable validation in the request tab to see results here.
                </div>
            </div>
        );
    }

    if (validationResult.totalRules === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-12 text-slate-500 dark:text-slate-400">
                <AlertCircleIcon size={48} className="mb-4 opacity-50" />
                <div className="text-lg font-medium mb-2">No Validation Rules</div>
                <div className="text-sm">
                    Add validation rules to the request to see results here.
                </div>
            </div>
        );
    }

    const { totalRules, passedRules, failedRules, allPassed, results, executedAt } = validationResult;

    return (
        <div className="space-y-4 h-full overflow-auto">
            {/* Summary Header */}
            <div className={`p-4 rounded-lg flex items-center justify-between ${
                allPassed 
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
                <div className="flex items-center gap-3">
                    {allPassed ? (
                        <CheckCircleIcon size={32} className="text-green-500 dark:text-green-400" />
                    ) : (
                        <XCircleIcon size={32} className="text-red-500 dark:text-red-400" />
                    )}
                    <div>
                        <div className={`font-semibold text-lg ${
                            allPassed 
                                ? 'text-green-700 dark:text-green-300' 
                                : 'text-red-700 dark:text-red-300'
                        }`}>
                            {allPassed ? 'All Validations Passed' : 'Validation Failed'}
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">
                            {passedRules} of {totalRules} rules passed
                        </div>
                    </div>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(executedAt).toLocaleTimeString()}
                </div>
            </div>

            {/* Results Table */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400 w-8">
                                
                            </th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">
                                Rule
                            </th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">
                                Category
                            </th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">
                                Result
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.map((result, index) => (
                            <ValidationResultRow key={index} result={result} />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Failed Rules Details */}
            {failedRules > 0 && (
                <div className="space-y-3">
                    <h3 className="font-medium text-slate-900 dark:text-slate-100">
                        Failed Rule Details
                    </h3>
                    {results.filter(r => !r.passed).map((result, index) => (
                        <FailedRuleCard key={index} result={result} />
                    ))}
                </div>
            )}
        </div>
    );
};

/**
 * Individual row for a validation result
 */
const ValidationResultRow: React.FC<{ result: ValidationRuleResult }> = ({ result }) => {
    return (
        <tr className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <td className="px-4 py-3">
                {result.passed ? (
                    <CheckCircleIcon size={18} className="text-green-500" />
                ) : (
                    <XCircleIcon size={18} className="text-red-500" />
                )}
            </td>
            <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                {result.ruleName}
            </td>
            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs">
                    {CATEGORY_LABELS[result.category]}
                </span>
            </td>
            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                {result.passed ? (
                    <span className="text-green-600 dark:text-green-400">Passed</span>
                ) : (
                    <span className="text-red-600 dark:text-red-400">{result.message}</span>
                )}
            </td>
        </tr>
    );
};

/**
 * Detailed card for a failed rule
 */
const FailedRuleCard: React.FC<{ result: ValidationRuleResult }> = ({ result }) => {
    return (
        <div className="p-4 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="flex items-start gap-3">
                <XCircleIcon size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="font-medium text-red-800 dark:text-red-200">
                        {result.ruleName}
                    </div>
                    <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                        {result.message}
                    </div>
                    {(result.expected || result.actual) && (
                        <div className="mt-3 space-y-1 text-sm">
                            {result.expected && (
                                <div className="flex gap-2">
                                    <span className="font-medium text-slate-600 dark:text-slate-400 w-20">Expected:</span>
                                    <code className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded text-slate-800 dark:text-slate-200 font-mono text-xs">
                                        {result.expected}
                                    </code>
                                </div>
                            )}
                            {result.actual && (
                                <div className="flex gap-2">
                                    <span className="font-medium text-slate-600 dark:text-slate-400 w-20">Actual:</span>
                                    <code className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded text-slate-800 dark:text-slate-200 font-mono text-xs">
                                        {result.actual}
                                    </code>
                                </div>
                            )}
                        </div>
                    )}
                    {result.error && (
                        <div className="mt-2 text-xs text-red-600 dark:text-red-400 font-mono">
                            Error: {result.error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ResponseValidation;
