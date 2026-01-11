/**
 * Flow Resolver Utility
 * 
 * Resolves {{variable}} placeholders in flow requests using a multi-pass approach:
 * 1. First pass: Resolve from environment variables (global → active)
 * 2. Second pass: Resolve remaining placeholders from completed node responses
 * 
 * Supports dot-path notation for JSON access:
 * - {{alias.$body.data.id}} - Access nested JSON from response body
 * - {{alias.$body.items[0].name}} - Array access
 * - {{alias.$headers.content-type}} - Access response headers
 * - {{alias.$status}} - Access response status code
 */

import type { HttpResponseResult } from '../types/adapters';
import type { FlowContext, FlowResolveResult } from '../types/flow';
import type { CollectionRequest } from '../types/collection';
import { resolveParameterizedValue } from './common';

// ============================================================================
// Constants
// ============================================================================

/** Regex to match {{variable}} placeholders */
const PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;

/** Regex to detect if a variable looks like a flow path (could be just a property or have a dot path) */
const FLOW_PATH_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*/;

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
 * // Flow variable: {{getUser.$body.data.id}} → "123" (from response JSON)
 * resolveFlowVariables(
 *   "{{baseUrl}}/users/{{getUser.$body.data.id}}",
 *   envVars,
 *   flowContext
 * );
 * // Returns: { resolved: "https://api.example.com/users/123", unresolved: [], resolvedFromFlow: ["getUser.$body.data.id"] }
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
 * Resolves a flow path like "alias.$body.data.id" to its value.
 * 
 * Supported paths:
 * - alias.$body.* - Access response body (parsed as JSON)
 * - alias.$headers.* - Access response headers
 * - alias.$status - Access response status code
 * - alias.$statusText - Access response status text
 * 
 * @param path - The flow path to resolve (e.g., "getUser.$body.data.id")
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
 * parseFlowPath("alias.$body.items[0].name")
 * // Returns: ["alias", "$body", "items", "0", "name"]
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
        case '$body':
            return resolveBodyPath(response.body, remainingPath, response.headers);
            
        case '$headers':
            return resolveHeadersPath(response.headers, remainingPath);
            
        case '$status':
            return String(response.status);
            
        case '$statusText':
            return response.statusText;
            
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
 * getAliasFromPath("getUser.$body.data.id") // Returns "getUser"
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

/**
 * Creates dynamic environment variables from flow context responses.
 * Only includes values that are actually referenced in the collection request.
 * 
 * This enables dependency-aware parameter resolution where only variables from
 * nodes that the current node depends on are available.
 * 
 * Supports multiple reference formats:
 * - With alias: `{{alias.$body.data.id}}`, `{{alias.$headers.key}}`, `{{alias.$status}}`, `{{alias.$statusText}}`
 * - Without alias: `{{$body.data.id}}`, `{{$headers.key}}`, `{{$status}}`, `{{$statusText}}`
 * - Body shorthand: `{{data.id}}` (assumes $body when no $ prefix)
 * 
 * @param flowContext - Flow context containing all node responses
 * @param allowedNodeIds - Set of node IDs whose responses can be used (upstream dependencies)
 * @param nodeIdToAliasMap - Map from node ID to node alias for filtering
 * @param collectionRequest - The collection request to extract variable references from
 * @returns Record of environment variable name → value (preserves original placeholder format)
 * 
 * @example
 * // Request URL: "{{baseUrl}}/users/{{getUser.$body.data.id}}"
 * // Context has: { "getUser": { body: '{"data": {"id": 123}}', status: 200 } }
 * // Allowed nodes: Set(["node-1"]) where node-1 has alias "getUser"
 * flowContextToDynamicEnvVars(context, allowedNodeIds, nodeAliasMap, request)
 * // Returns: { "getUser.$body.data.id": "123" }
 */
export function flowContextToDynamicEnvVars(
    flowContext: FlowContext,
    allowedNodeIds: Set<string>,
    nodeIdToAliasMap: Map<string, string>,
    collectionRequest: CollectionRequest
): Record<string, string> {
    const envVars: Record<string, string> = {};
    
    // Get allowed aliases from allowed node IDs
    const allowedAliases = new Set<string>();
    for (const nodeId of allowedNodeIds) {
        const alias = nodeIdToAliasMap.get(nodeId);
        if (alias) {
            allowedAliases.add(alias);
        }
    }
    
    // Extract all variables from the collection request
    const allVariables = extractVariablesFromRequest(collectionRequest);
    
    // For each variable, try to resolve from allowed responses
    for (const variable of allVariables) {
        const value = resolveVariableFromContext(
            variable,
            flowContext,
            allowedAliases
        );
        
        if (value !== null) {
            envVars[variable] = value;
        }
    }
    
    return envVars;
}

/**
 * Extracts all {{variable}} placeholders from a collection request.
 */
function extractVariablesFromRequest(request: CollectionRequest): Set<string> {
    const variables = new Set<string>();
    
    // Extract from URL
    const url = typeof request.url === 'string' ? request.url : request.url?.raw || '';
    extractVariables(url).forEach(v => variables.add(v));
    
    // Extract from headers
    if (request.header) {
        for (const header of request.header) {
            if (header.key) {
                extractVariables(header.key).forEach(v => variables.add(v));
            }
            if (header.value) {
                extractVariables(header.value).forEach(v => variables.add(v));
            }
        }
    }
    
    // Extract from query params
    if (typeof request.url === 'object' && request.url?.query) {
        for (const param of request.url.query) {
            if (param.key) {
                extractVariables(param.key).forEach(v => variables.add(v));
            }
            if (param.value) {
                extractVariables(param.value).forEach(v => variables.add(v));
            }
        }
    }
    
    // Extract from body
    if (request.body?.raw) {
        extractVariables(request.body.raw).forEach(v => variables.add(v));
    }
    
    if (request.body?.urlencoded) {
        for (const field of request.body.urlencoded) {
            if (field.key) {
                extractVariables(field.key).forEach(v => variables.add(v));
            }
            if (field.value) {
                extractVariables(field.value).forEach(v => variables.add(v));
            }
        }
    }
    
    return variables;
}

/**
 * Resolves a variable from flow context based on allowed aliases.
 * 
 * Supports formats:
 * - alias.$body.data.id
 * - alias.$headers.key
 * - alias.$status
 * - alias.$statusText
 * - $body.data.id (tries all allowed aliases)
 * - $headers.key (tries all allowed aliases)
 * - $status (tries all allowed aliases)
 * - $statusText (tries all allowed aliases)
 * - data.id (assumes $body, tries all allowed aliases)
 */
function resolveVariableFromContext(
    variable: string,
    flowContext: FlowContext,
    allowedAliases: Set<string>
): string | null {
    // Parse the variable to extract alias (if present) and path
    const parsed = parseVariableReference(variable);
    
    if (parsed.alias) {
        // Variable has explicit alias - check if it's allowed
        if (!allowedAliases.has(parsed.alias)) {
            return null;
        }
        
        // Get response for this alias
        const response = flowContext.responses.get(parsed.alias);
        if (!response) {
            return null;
        }
        
        // Resolve the path within the response
        return resolvePathInResponse(response, parsed.section, parsed.path);
    } else {
        // No explicit alias - try all allowed aliases (most recent first)
        const orderedAliases = flowContext.executionOrder
            .filter(alias => allowedAliases.has(alias))
            .reverse();
        
        for (const alias of orderedAliases) {
            const response = flowContext.responses.get(alias);
            if (!response) {
                continue;
            }
            
            const value = resolvePathInResponse(response, parsed.section, parsed.path);
            if (value !== null) {
                return value;
            }
        }
        
        return null;
    }
}

/**
 * Parses a variable reference into components.
 * 
 * @example
 * parseVariableReference("alias.$body.data.id") 
 * // { alias: "alias", section: "$body", path: ["data", "id"] }
 * 
 * parseVariableReference("$body.data.id")
 * // { alias: null, section: "$body", path: ["data", "id"] }
 * 
 * parseVariableReference("data.id")
 * // { alias: null, section: "$body", path: ["data", "id"] }
 */
function parseVariableReference(variable: string): {
    alias: string | null;
    section: '$body' | '$headers' | '$status' | '$statusText';
    path: string[];
} {
    const parts = parseFlowPath(variable);
    
    if (parts.length === 0) {
        return { alias: null, section: '$body', path: [] };
    }
    
    // Check if first part is a known section keyword
    const firstPart = parts[0];
    if (firstPart === '$body' || firstPart === '$headers' || firstPart === '$status' || firstPart === '$statusText') {
        // No alias, starts with section
        return {
            alias: null,
            section: firstPart as '$body' | '$headers' | '$status' | '$statusText',
            path: parts.slice(1),
        };
    }
    
    // Check if second part is a known section keyword
    if (parts.length >= 2) {
        const secondPart = parts[1];
        if (secondPart === '$body' || secondPart === '$headers' || secondPart === '$status' || secondPart === '$statusText') {
            // First part is alias, second is section
            return {
                alias: firstPart,
                section: secondPart as '$body' | '$headers' | '$status' | '$statusText',
                path: parts.slice(2),
            };
        }
    }
    
    // No section keyword found - assume $body
    return {
        alias: null,
        section: '$body',
        path: parts,
    };
}

/**
 * Resolves a path within a response based on section.
 */
function resolvePathInResponse(
    response: HttpResponseResult,
    section: '$body' | '$headers' | '$status' | '$statusText',
    path: string[]
): string | null {
    switch (section) {
        case '$status':
            return String(response.status);
            
        case '$statusText':
            return response.statusText;
            
        case '$headers':
            if (path.length === 0) {
                return JSON.stringify(response.headers);
            }
            return resolveHeadersPath(response.headers, path);
            
        case '$body':
            return resolveBodyPath(response.body, path, response.headers);
            
        default:
            return null;
    }
}
