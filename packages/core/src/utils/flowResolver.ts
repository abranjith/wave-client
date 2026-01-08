/**
 * Flow Resolver Utility
 * 
 * Resolves {{variable}} placeholders in flow requests using a multi-pass approach:
 * 1. First pass: Resolve from environment variables (global → active)
 * 2. Second pass: Resolve remaining placeholders from completed node responses
 * 
 * Supports dot-path notation for JSON access:
 * - {{alias.body.data.id}} - Access nested JSON from response body
 * - {{alias.body.items[0].name}} - Array access
 * - {{alias.headers.content-type}} - Access response headers
 * - {{alias.status}} - Access response status code
 */

import type { HttpResponseResult } from '../types/adapters';
import type { FlowContext, FlowResolveResult } from '../types/flow';
import { resolveParameterizedValue } from './common';

// ============================================================================
// Constants
// ============================================================================

/** Regex to match {{variable}} placeholders */
const PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;

/** Regex to detect if a variable looks like a flow path (contains a dot) */
const FLOW_PATH_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*\./;

// ============================================================================
// Main Resolution Function
// ============================================================================

/**
 * Resolves all {{variable}} placeholders in a string using env vars and flow context.
 * 
 * Resolution order:
 * 1. Environment variables (global → active environment)
 * 2. Flow context (completed node responses, most recent first)
 * 
 * @param template - String containing {{variable}} placeholders
 * @param envVars - Map of environment variable name → value
 * @param flowContext - Context containing completed node responses
 * @returns Resolution result with resolved string and unresolved/resolved lists
 * 
 * @example
 * // Environment variable: {{baseUrl}} → "https://api.example.com"
 * // Flow variable: {{getUser.body.data.id}} → "123" (from response JSON)
 * resolveFlowVariables(
 *   "{{baseUrl}}/users/{{getUser.body.data.id}}",
 *   envVars,
 *   flowContext
 * );
 * // Returns: { resolved: "https://api.example.com/users/123", unresolved: [], resolvedFromFlow: ["getUser.body.data.id"] }
 */
export function resolveFlowVariables(
    template: string,
    envVars: Map<string, string>,
    flowContext: FlowContext
): FlowResolveResult {
    const unresolved: string[] = [];
    const resolvedFromFlow: string[] = [];
    
    // First pass: Resolve environment variables
    const envResult = resolveParameterizedValue(template, envVars);
    let currentTemplate = envResult.resolved;
    
    // Second pass: Resolve flow variables from context
    const resolved = currentTemplate.replace(PLACEHOLDER_REGEX, (match, variableName) => {
        const trimmedName = variableName.trim();
        
        // Check if this looks like a flow path (alias.path.to.field)
        if (FLOW_PATH_REGEX.test(trimmedName)) {
            const result = resolveFlowPath(trimmedName, flowContext);
            
            if (result !== null) {
                resolvedFromFlow.push(trimmedName);
                return result;
            }
        }
        
        // Variable couldn't be resolved
        unresolved.push(trimmedName);
        return match; // Keep original placeholder
    });
    
    return { resolved, unresolved, resolvedFromFlow };
}

// ============================================================================
// Flow Path Resolution
// ============================================================================

/**
 * Resolves a flow path like "alias.body.data.id" to its value.
 * 
 * Supported paths:
 * - alias.body.* - Access response body (parsed as JSON)
 * - alias.headers.* - Access response headers
 * - alias.status - Access response status code
 * - alias.statusText - Access response status text
 * - alias.elapsedTime - Access response elapsed time
 * 
 * @param path - The flow path to resolve (e.g., "getUser.body.data.id")
 * @param flowContext - Context containing completed node responses
 * @returns The resolved value as a string, or null if not found
 */
export function resolveFlowPath(
    path: string,
    flowContext: FlowContext
): string | null {
    const parts = parseFlowPath(path);
    
    if (parts.length < 2) {
        return null; // Need at least alias.property
    }
    
    const alias = parts[0];
    const property = parts[1];
    
    // Look up response by alias
    const response = flowContext.responses.get(alias);
    
    if (!response) {
        // Try case-insensitive lookup
        const aliasLower = alias.toLowerCase();
        for (const [key, value] of flowContext.responses) {
            if (key.toLowerCase() === aliasLower) {
                return resolvePropertyPath(value, parts.slice(1));
            }
        }
        return null;
    }
    
    return resolvePropertyPath(response, parts.slice(1));
}

/**
 * Parses a flow path string into parts, handling array notation.
 * 
 * @example
 * parseFlowPath("alias.body.items[0].name")
 * // Returns: ["alias", "body", "items", "0", "name"]
 */
function parseFlowPath(path: string): string[] {
    const parts: string[] = [];
    let current = '';
    let i = 0;
    
    while (i < path.length) {
        const char = path[i];
        
        if (char === '.') {
            if (current) {
                parts.push(current);
                current = '';
            }
        } else if (char === '[') {
            if (current) {
                parts.push(current);
                current = '';
            }
            // Find matching ]
            i++;
            while (i < path.length && path[i] !== ']') {
                current += path[i];
                i++;
            }
            if (current) {
                parts.push(current);
                current = '';
            }
        } else if (char === ']') {
            // Skip
        } else {
            current += char;
        }
        
        i++;
    }
    
    if (current) {
        parts.push(current);
    }
    
    return parts;
}

/**
 * Resolves a property path within an HttpResponseResult.
 * 
 * @param response - The HTTP response to access
 * @param pathParts - Path parts after the alias (e.g., ["body", "data", "id"])
 * @returns The resolved value as string, or null if not found
 */
function resolvePropertyPath(
    response: HttpResponseResult,
    pathParts: string[]
): string | null {
    if (pathParts.length === 0) {
        return null;
    }
    
    const property = pathParts[0];
    const remainingPath = pathParts.slice(1);
    
    switch (property) {
        case 'body':
            return resolveBodyPath(response.body, remainingPath, response.headers);
            
        case 'headers':
            return resolveHeadersPath(response.headers, remainingPath);
            
        case 'status':
            return String(response.status);
            
        case 'statusText':
            return response.statusText;
            
        case 'elapsedTime':
            return String(response.elapsedTime);
            
        case 'size':
            return String(response.size);
            
        default:
            return null;
    }
}

/**
 * Resolves a path within the response body (JSON).
 */
function resolveBodyPath(
    body: string,
    pathParts: string[],
    headers: Record<string, string>
): string | null {
    // Check if response is JSON
    const contentType = Object.entries(headers)
        .find(([key]) => key.toLowerCase() === 'content-type')?.[1] || '';
    
    if (!contentType.toLowerCase().includes('json')) {
        // Not JSON - can only access raw body
        if (pathParts.length === 0) {
            return body;
        }
        return null;
    }
    
    // Parse JSON and traverse path
    try {
        const parsed = JSON.parse(body);
        return traverseJsonPath(parsed, pathParts);
    } catch {
        // Not valid JSON
        if (pathParts.length === 0) {
            return body;
        }
        return null;
    }
}

/**
 * Resolves a path within response headers.
 */
function resolveHeadersPath(
    headers: Record<string, string>,
    pathParts: string[]
): string | null {
    if (pathParts.length === 0) {
        return JSON.stringify(headers);
    }
    
    const headerName = pathParts[0];
    
    // Case-insensitive header lookup
    const headerValue = Object.entries(headers)
        .find(([key]) => key.toLowerCase() === headerName.toLowerCase())?.[1];
    
    return headerValue ?? null;
}

/**
 * Traverses a JSON object using a path array.
 * 
 * @param obj - The object to traverse
 * @param pathParts - Array of keys/indices to follow
 * @returns The value at the path as a string, or null if not found
 */
function traverseJsonPath(obj: unknown, pathParts: string[]): string | null {
    if (pathParts.length === 0) {
        return valueToString(obj);
    }
    
    if (obj === null || obj === undefined) {
        return null;
    }
    
    const key = pathParts[0];
    const remaining = pathParts.slice(1);
    
    if (Array.isArray(obj)) {
        const index = parseInt(key, 10);
        if (isNaN(index) || index < 0 || index >= obj.length) {
            return null;
        }
        return traverseJsonPath(obj[index], remaining);
    }
    
    if (typeof obj === 'object') {
        const record = obj as Record<string, unknown>;
        
        // Try exact match first
        if (key in record) {
            return traverseJsonPath(record[key], remaining);
        }
        
        // Try case-insensitive match
        const matchingKey = Object.keys(record).find(
            k => k.toLowerCase() === key.toLowerCase()
        );
        
        if (matchingKey) {
            return traverseJsonPath(record[matchingKey], remaining);
        }
        
        return null;
    }
    
    return null;
}

/**
 * Converts a value to its string representation.
 */
function valueToString(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }
    
    if (typeof value === 'string') {
        return value;
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    
    // Objects and arrays get JSON stringified
    return JSON.stringify(value);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if a string contains any unresolved {{variable}} placeholders.
 */
export function hasUnresolvedVariables(text: string): boolean {
    return PLACEHOLDER_REGEX.test(text);
}

/**
 * Extracts all variable names from a string.
 */
export function extractVariables(text: string): string[] {
    const variables: string[] = [];
    const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g');
    let match;
    
    while ((match = regex.exec(text)) !== null) {
        variables.push(match[1].trim());
    }
    
    return variables;
}

/**
 * Checks if a variable name looks like a flow path (alias.property).
 */
export function isFlowPath(variableName: string): boolean {
    return FLOW_PATH_REGEX.test(variableName);
}

/**
 * Gets the alias portion of a flow path.
 * 
 * @example
 * getAliasFromPath("getUser.body.data.id") // Returns "getUser"
 */
export function getAliasFromPath(path: string): string | null {
    const match = path.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\./);
    return match ? match[1] : null;
}

/**
 * Creates an empty flow context.
 */
export function createEmptyFlowContext(): FlowContext {
    return {
        responses: new Map(),
        executionOrder: [],
    };
}

/**
 * Adds a node response to the flow context.
 */
export function addToFlowContext(
    context: FlowContext,
    alias: string,
    response: HttpResponseResult
): FlowContext {
    const newResponses = new Map(context.responses);
    newResponses.set(alias, response);
    
    return {
        responses: newResponses,
        executionOrder: [...context.executionOrder, alias],
    };
}
