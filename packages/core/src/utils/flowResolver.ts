/**
 * Flow Resolver Utility
 *
 * Resolves {{variable}} placeholders in flow requests using a multi-pass approach:
 * 1. First pass: Resolve from environment variables (global → active)
 * 2. Second pass: Resolve remaining placeholders from completed node responses
 *
 * Flow variable references support explicit sections and JSONPath subpaths:
 * - {{get-employee.$body:$.data.id}}
 * - {{get-employee.$body:$..id}}
 * - {{get-employee.$headers:content-type}}
 * - {{get-employee.$status}}
 * - {{get-employee.$statusText}}
 *
 * Body shorthand (no alias) is also supported:
 * - {{$body:$.data.id}}
 * - {{$.data.id}}
 * - {{data.id}}
 */

import type { HttpResponseResult } from '../types/adapters';
import type { FlowContext, FlowResolveResult } from '../types/flow';
import type { CollectionRequest } from '../types/collection';
import { evaluateJsonPath } from './jsonPath';

// ============================================================================
// Constants
// ============================================================================

/** Regex to match {{variable}} placeholders */
const PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;

const FLOW_REFERENCE_SECTIONS = ['$statusText', '$status', '$headers', '$body'] as const;

type FlowReferenceSection = '$body' | '$headers' | '$status' | '$statusText';

interface ParsedVariableReference {
    alias: string | null;
    section: FlowReferenceSection;
    subpath: string;
    valid: boolean;
}

/**
 * Finds the first section keyword in a variable reference.
 */
function findFirstSectionKeyword(reference: string): { section: FlowReferenceSection; index: number } | null {
    let bestMatch: { section: FlowReferenceSection; index: number } | null = null;

    for (const section of FLOW_REFERENCE_SECTIONS) {
        const index = reference.indexOf(section);
        if (index === -1) {
            continue;
        }

        if (
            !bestMatch
            || index < bestMatch.index
            || (index === bestMatch.index && section.length > bestMatch.section.length)
        ) {
            bestMatch = { section, index };
        }
    }

    return bestMatch;
}

/**
 * Parses a variable reference into alias + section + subpath components.
 *
 * Grammar:
 * - [alias.]$section[:subpath]
 * - $section in {$body, $headers, $status, $statusText}
 * - no section keyword => shorthand body reference
 */
function parseVariableReference(variable: string): ParsedVariableReference {
    const trimmed = variable.trim();
    if (!trimmed) {
        return { alias: null, section: '$body', subpath: '', valid: false };
    }

    const sectionMatch = findFirstSectionKeyword(trimmed);
    if (!sectionMatch) {
        return {
            alias: null,
            section: '$body',
            subpath: trimmed,
            valid: true,
        };
    }

    const { section, index } = sectionMatch;
    const aliasPart = trimmed.slice(0, index).trim();

    // Explicit aliases must use the alias.$section shape.
    if (aliasPart && !aliasPart.endsWith('.')) {
        return { alias: null, section: '$body', subpath: '', valid: false };
    }

    const aliasWithoutDot = aliasPart.endsWith('.')
        ? aliasPart.slice(0, -1).trim()
        : aliasPart;

    if (aliasWithoutDot.includes('$') || aliasWithoutDot.includes('.') || aliasWithoutDot.includes(':')) {
        return { alias: null, section: '$body', subpath: '', valid: false };
    }

    const alias = aliasWithoutDot.length > 0 ? aliasWithoutDot : null;
    const afterSection = trimmed.slice(index + section.length).trim();

    if (!afterSection) {
        return {
            alias,
            section,
            subpath: '',
            valid: true,
        };
    }

    if (!afterSection.startsWith(':')) {
        // Legacy dot form (alias.$body.data.id) is intentionally unsupported.
        return { alias: null, section: '$body', subpath: '', valid: false };
    }

    return {
        alias,
        section,
        subpath: afterSection.slice(1).trim(),
        valid: true,
    };
}

function normalizeBodyJsonPath(subpath: string): string {
    const trimmed = subpath.trim();

    if (!trimmed) {
        return '$';
    }

    if (trimmed.startsWith('$')) {
        return trimmed;
    }

    if (trimmed.startsWith('[') || trimmed.startsWith('.')) {
        return `$${trimmed}`;
    }

    return `$.${trimmed}`;
}

/**
 * Resolves a path within the response body using JSONPath.
 */
function resolveBodyPath(body: string, subpath: string): string | null {
    if (subpath.trim().length === 0) {
        return body;
    }

    const jsonPath = normalizeBodyJsonPath(subpath);
    const jsonPathResult = evaluateJsonPath(body, jsonPath);

    if (!jsonPathResult.found) {
        return null;
    }

    return valueToString(jsonPathResult.value);
}

/**
 * Resolves a path within response headers.
 */
function resolveHeadersPath(headers: Record<string, string>, subpath: string): string | null {
    const headerName = subpath.trim();
    if (headerName.length === 0) {
        return JSON.stringify(headers);
    }

    const headerValue = Object.entries(headers)
        .find(([key]) => key.toLowerCase() === headerName.toLowerCase())?.[1];

    return headerValue ?? null;
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

    return JSON.stringify(value);
}

/**
 * Resolves a path within a response based on section.
 */
function resolvePathInResponse(
    response: HttpResponseResult,
    section: FlowReferenceSection,
    subpath: string
): string | null {
    switch (section) {
        case '$status':
            return subpath.trim().length === 0 ? String(response.status) : null;

        case '$statusText':
            return subpath.trim().length === 0 ? response.statusText : null;

        case '$headers':
            return resolveHeadersPath(response.headers, subpath);

        case '$body':
            return resolveBodyPath(response.body, subpath);

        default:
            return null;
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if a string contains any unresolved {{variable}} placeholders.
 */
export function hasUnresolvedVariables(text: string): boolean {
    PLACEHOLDER_REGEX.lastIndex = 0;
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
 * Supported formats:
 * - With alias: `{{alias.$body:$.data.id}}`, `{{alias.$headers:content-type}}`, `{{alias.$status}}`, `{{alias.$statusText}}`
 * - Without alias: `{{$body:$.data.id}}`, `{{$headers:content-type}}`, `{{$status}}`, `{{$statusText}}`
 * - Body shorthand: `{{$.data.id}}` or `{{data.id}}` (assumes `$body`)
 *
 * @param flowContext - Flow context containing all node responses
 * @param allowedNodeIds - Set of node IDs whose responses can be used (upstream dependencies)
 * @param nodeIdToAliasMap - Map from node ID to node alias for filtering
 * @param collectionRequest - The collection request to extract variable references from
 * @returns Record of environment variable name → value (preserves original placeholder format)
 *
 * @example
 * // Request URL: "{{baseUrl}}/users/{{get-user.$body:$.data.id}}"
 * // Context has: { "get-user": { body: '{"data":{"id":123}}', status: 200 } }
 * // Allowed nodes: Set(["node-1"]) where node-1 has alias "get-user"
 * flowContextToDynamicEnvVars(context, allowedNodeIds, nodeAliasMap, request)
 * // Returns: { "get-user.$body:$.data.id": "123" }
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
    
    // Extract from body based on body mode
    if (request.body) {
        if (request.body.mode === 'raw' && request.body.raw) {
            extractVariables(request.body.raw).forEach(v => variables.add(v));
        }
        
        if (request.body.mode === 'urlencoded' && request.body.urlencoded) {
            for (const field of request.body.urlencoded) {
                if (field.key) {
                    extractVariables(field.key).forEach(v => variables.add(v));
                }
                if (field.value) {
                    extractVariables(field.value).forEach(v => variables.add(v));
                }
            }
        }
    }
    
    return variables;
}

/**
 * Resolves a variable from flow context based on allowed aliases.
 *
 * Supports formats:
 * - alias.$body:$.data.id
 * - alias.$headers:content-type
 * - alias.$status
 * - alias.$statusText
 * - $body:$.data.id (tries all allowed aliases)
 * - $.data.id (body shorthand, tries all allowed aliases)
 * - data.id (body shorthand, tries all allowed aliases)
 */
function resolveVariableFromContext(
    variable: string,
    flowContext: FlowContext,
    allowedAliases: Set<string>
): string | null {
    // Parse the variable to extract alias (if present), section, and subpath.
    const parsed = parseVariableReference(variable);

    if (!parsed.valid) {
        return null;
    }
    
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
        return resolvePathInResponse(response, parsed.section, parsed.subpath);
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
            
            const value = resolvePathInResponse(response, parsed.section, parsed.subpath);
            if (value !== null) {
                return value;
            }
        }
        
        return null;
    }
}
