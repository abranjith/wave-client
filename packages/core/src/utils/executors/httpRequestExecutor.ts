/**
 * HTTP Request Executor
 * 
 * Executes HTTP requests from collection references with support for:
 * - Request overrides (headers, params, body, variables, auth) for data-driven testing
 * - Flow context for variable resolution from upstream nodes
 * - Validation rules execution
 * 
 * This is the core execution unit used by all runners.
 */

import type { HttpRequestConfig, HttpResponseResult } from '../../types/adapters';
import type { CollectionRequest } from '../../types/collection';
import type { FlowNode, Flow } from '../../types/flow';
import type {
    IItemExecutor,
    ExecutionContext,
    RequestOverrides,
    HttpExecutionInput,
    HttpExecutionResult,
} from './types';
import {
    mergeHeadersWithOverrides,
    mergeParamsWithOverrides,
    mergeEnvVarsWithOverrides,
    extractUrlParts,
} from './types';
import { findRequestById } from '../collectionLookup';
import { buildHttpRequest } from '../requestBuilder';
import { determineExecutionStatus, determineValidationStatus, extractErrorMessage } from '../../types/execution';

// Import flow utilities for flow context resolution
import { flowContextToDynamicEnvVars } from '../flowResolver';
import { getUpstreamNodeIds } from '../flowUtils';
import { StatusValidationRule, RequestValidation } from '../../types/validation';


/**
 * Default validation rule: HTTP status is success (2xx)
 */
const DEFAULT_STATUS_SUCCESS_RULE: StatusValidationRule = {
  id: 'default-status-success',
  name: 'Status is Success',
  description: 'Validates that HTTP response status is 2xx',
  enabled: true,
  category: 'status',
  operator: 'is_success',
  value: 200, // Not used for is_success, but required by type
};

/**
 * Default validation configuration using status success rule
 */
const DEFAULT_VALIDATION: RequestValidation = {
  enabled: true,
  rules: [{ rule: DEFAULT_STATUS_SUCCESS_RULE }],
};

// ============================================================================
// HTTP Request Executor Class
// ============================================================================

/**
 * Executor for HTTP requests referenced from collections
 */
export class HttpRequestExecutor implements IItemExecutor<HttpExecutionInput, HttpExecutionResult> {
    /**
     * Executes a single HTTP request
     * 
     * @param input - Input containing reference ID and optional execution ID
     * @param context - Execution context with dependencies
     * @param overrides - Optional request overrides for data-driven testing
     */
    async execute(
        input: HttpExecutionInput,
        context: ExecutionContext,
        overrides?: RequestOverrides
    ): Promise<HttpExecutionResult> {
        const startedAt = new Date().toISOString();
        const executionId = input.executionId || `${input.referenceId}-${Date.now()}`;
        
        // Check for cancellation before starting
        if (context.isCancelled()) {
            return this.createCancelledResult(executionId, input.referenceId, startedAt);
        }
        
        // Find the request in collections
        const found = findRequestById(input.referenceId, context.collections);
        if (!found || !found.item.request) {
            return this.createErrorResult(
                executionId,
                input.referenceId,
                `Request not found: ${input.referenceId}`,
                startedAt
            );
        }
        
        const { item: collectionItem } = found;
        const request = collectionItem.request!;
        
        // Build the request configuration
        const buildResult = await this.buildRequestConfig(
            executionId,
            collectionItem.name,
            request,
            context,
            overrides,
            input.validation
        );
        
        if (buildResult.error || !buildResult.config) {
            return this.createErrorResult(
                executionId,
                input.referenceId,
                buildResult.error || 'Failed to build request',
                startedAt
            );
        }
        
        // Check for cancellation before execution
        if (context.isCancelled()) {
            return this.createCancelledResult(executionId, input.referenceId, startedAt);
        }
        
        // Execute the request
        try {
            const result = await context.httpAdapter.executeRequest(buildResult.config);
            
            // Check for cancellation after execution
            if (context.isCancelled()) {
                return this.createCancelledResult(executionId, input.referenceId, startedAt);
            }
            
            if (result.isOk) {
                return this.createSuccessResult(executionId, input.referenceId, result.value, startedAt);
            } else {
                return this.createErrorResult(executionId, input.referenceId, result.error, startedAt);
            }
        } catch (err) {
            return this.createErrorResult(
                executionId,
                input.referenceId,
                extractErrorMessage(err),
                startedAt
            );
        }
    }
    
    /**
     * Executes a flow node (request with flow context for variable resolution)
     * 
     * @param node - Flow node to execute
     * @param flow - Parent flow (for upstream dependency analysis)
     * @param context - Execution context (must include flowContext)
     */
    async executeFlowNode(
        node: FlowNode,
        flow: Flow,
        context: ExecutionContext
    ): Promise<HttpExecutionResult> {
        const startedAt = new Date().toISOString();
        const executionId = `${node.id}-${Date.now()}`;
        
        // Check for cancellation
        if (context.isCancelled()) {
            return this.createCancelledResult(executionId, node.requestId, startedAt);
        }
        
        // Find the request
        const found = findRequestById(node.requestId, context.collections);
        if (!found || !found.item.request) {
            return this.createErrorResult(
                executionId,
                node.requestId,
                `Request not found: ${node.requestId}`,
                startedAt
            );
        }
        
        const { item: collectionItem } = found;
        const request = collectionItem.request!;
        
        // Get dynamic env vars from flow context
        let dynamicEnvVars: Record<string, string> = {};
        
        // First, apply initial variables from test case (lower priority)
        if (context.initialVariables) {
            dynamicEnvVars = { ...context.initialVariables };
        }
        
        // Then, apply flow context variables (higher priority - overrides initial variables)
        if (context.flowContext) {
            const upstreamNodeIds = getUpstreamNodeIds(flow, node.id);
            const nodeIdToAliasMap = new Map(flow.nodes.map(n => [n.id, n.alias]));
            const flowContextVars = flowContextToDynamicEnvVars(
                context.flowContext,
                upstreamNodeIds,
                nodeIdToAliasMap,
                request
            );
            dynamicEnvVars = { ...dynamicEnvVars, ...flowContextVars };
        }
        
        // Build request with flow context variables
        const buildResult = await this.buildRequestConfig(
            executionId,
            collectionItem.name,
            request,
            context,
            { variables: dynamicEnvVars },
            request.validation,
            flow.defaultAuthId
        );
        
        if (buildResult.error || !buildResult.config) {
            return this.createErrorResult(
                executionId,
                node.requestId,
                buildResult.error || 'Failed to build request',
                startedAt
            );
        }
        
        // Check for cancellation
        if (context.isCancelled()) {
            return this.createCancelledResult(executionId, node.requestId, startedAt);
        }
        
        // Execute
        try {
            const result = await context.httpAdapter.executeRequest(buildResult.config);
            
            if (context.isCancelled()) {
                return this.createCancelledResult(executionId, node.requestId, startedAt);
            }
            
            if (result.isOk) {
                return this.createSuccessResult(executionId, node.requestId, result.value, startedAt);
            } else {
                return this.createErrorResult(executionId, node.requestId, result.error, startedAt);
            }
        } catch (err) {
            return this.createErrorResult(
                executionId,
                node.requestId,
                extractErrorMessage(err),
                startedAt
            );
        }
    }
    
    // ========================================================================
    // Private Helpers
    // ========================================================================
    
    /**
     * Builds the HTTP request configuration with overrides applied
     */
    private async buildRequestConfig(
        executionId: string,
        name: string,
        request: CollectionRequest,
        context: ExecutionContext,
        overrides?: RequestOverrides,
        itemValidation?: import('../../types/validation').RequestValidation,
        flowDefaultAuthId?: string
    ): Promise<{ config?: HttpRequestConfig; error?: string }> {
        const { urlString, queryParams } = extractUrlParts(request.url);
        
        // Apply overrides to headers and params
        const finalHeaders = mergeHeadersWithOverrides(request.header || [], overrides?.headers);
        const finalParams = mergeParamsWithOverrides(queryParams, overrides?.params);
        const finalAuthId = overrides?.authId || request.authId;
        const dynamicVars = overrides?.variables || {};
        
        // Build a CollectionRequest with all overrides applied
        const requestWithOverrides: CollectionRequest = {
            ...request,
            id: executionId,
            name,
            url: urlString,
            header: finalHeaders,
            query: finalParams,
            authId: finalAuthId,
        };
        
        // Apply body override if provided
        if (overrides?.body !== undefined) {
            requestWithOverrides.body = overrides.body;
        }
        
        // Build the prepared request
        const buildResult = await buildHttpRequest(
            requestWithOverrides,
            context.environmentId,
            context.environments,
            context.auths,
            context.defaultAuthId || flowDefaultAuthId || null,
            dynamicVars
        );
        
        if (buildResult.error || !buildResult.request) {
            return { error: buildResult.error || 'Failed to build request' };
        }
        
        // Merge environment variables with override variables
        const finalEnvVars = mergeEnvVarsWithOverrides(
            buildResult.request.envVars || {},
            overrides?.variables
        );
        
        // Determine validation rules: override > item > request > DEFAULT
        const validation = overrides?.validation || itemValidation || request.validation || DEFAULT_VALIDATION;
        
        // Build the final HTTP config
        const config: HttpRequestConfig = {
            id: buildResult.request.id,
            method: buildResult.request.method,
            url: buildResult.request.url,
            headers: buildResult.request.headers || [],
            params: buildResult.request.params || [],
            body: buildResult.request.body,
            auth: buildResult.request.auth,
            envVars: finalEnvVars,
            validation,
        };
        
        return { config };
    }
    
    /**
     * Creates a successful execution result
     */
    private createSuccessResult(
        id: string,
        referenceId: string,
        response: HttpResponseResult,
        startedAt: string
    ): HttpExecutionResult {
        return {
            id,
            referenceId,
            status: determineExecutionStatus(response),
            validationStatus: determineValidationStatus(response.validationResult),
            validationResult: response.validationResult,
            response,
            startedAt,
            completedAt: new Date().toISOString(),
        };
    }
    
    /**
     * Creates an error execution result
     */
    private createErrorResult(
        id: string,
        referenceId: string,
        error: string,
        startedAt: string
    ): HttpExecutionResult {
        return {
            id,
            referenceId,
            status: 'failed',
            validationStatus: 'idle',
            error,
            startedAt,
            completedAt: new Date().toISOString(),
        };
    }
    
    /**
     * Creates a cancelled execution result
     */
    private createCancelledResult(
        id: string,
        referenceId: string,
        startedAt: string
    ): HttpExecutionResult {
        return {
            id,
            referenceId,
            status: 'cancelled',
            validationStatus: 'idle',
            error: 'Cancelled',
            startedAt,
            completedAt: new Date().toISOString(),
        };
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Shared instance of the HTTP request executor
 */
export const httpRequestExecutor = new HttpRequestExecutor();
