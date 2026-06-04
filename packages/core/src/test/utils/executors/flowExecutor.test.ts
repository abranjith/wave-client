import { describe, it, expect, vi } from 'vitest';
import { FlowExecutor } from '../../../utils/executors/flowExecutor';
import type { HttpRequestExecutor } from '../../../utils/executors/httpRequestExecutor';
import type { ExecutionContext, HttpExecutionResult } from '../../../utils/executors/types';
import type { Flow, FlowNode, FlowConnector } from '../../../types/flow';
import type { ConnectorCondition } from '../../../types/flow';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, alias: string): FlowNode {
    return { id, requestId: `req-${id}`, alias, name: alias, method: 'GET', position: { x: 0, y: 0 } };
}

function makeConnector(
    id: string,
    sourceNodeId: string,
    targetNodeId: string,
    condition: ConnectorCondition
): FlowConnector {
    return { id, sourceNodeId, targetNodeId, condition };
}

function makeFlow(nodes: FlowNode[], connectors: FlowConnector[]): Flow {
    return {
        id: 'flow-1',
        name: 'Test Flow',
        nodes,
        connectors,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function makeHttpResult(status: 'success' | 'failed'): HttpExecutionResult {
    return {
        id: 'exec-1',
        referenceId: 'req-1',
        status,
        validationStatus: 'idle',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
    };
}

function makeExecutionContext(): ExecutionContext {
    return {
        httpAdapter: {} as ExecutionContext['httpAdapter'],
        environments: [],
        auths: [],
        collections: [],
        environmentId: null,
        defaultAuthId: null,
        isCancelled: () => false,
        flows: [],
    };
}

function makeMockHttpExecutor(nodeResultMap: Record<string, 'success' | 'failed'>): HttpRequestExecutor {
    return {
        executeFlowNode: vi.fn().mockImplementation((node: FlowNode) => {
            const status = nodeResultMap[node.id] ?? 'success';
            return Promise.resolve(makeHttpResult(status));
        }),
        execute: vi.fn(),
    } as unknown as HttpRequestExecutor;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlowExecutor — sequential execution', () => {
    it('continues executing downstream nodes with failure condition when a node fails', async () => {
        const nodeA = makeNode('node-a', 'stepA');
        const nodeB = makeNode('node-b', 'stepB'); // should run: condition = failure

        const flow = makeFlow(
            [nodeA, nodeB],
            [makeConnector('conn-1', 'node-a', 'node-b', 'failure')]
        );

        const mockHttp = makeMockHttpExecutor({ 'node-a': 'failed', 'node-b': 'success' });
        const executor = new FlowExecutor(mockHttp);
        const context = { ...makeExecutionContext(), flows: [flow] };

        const result = await executor.execute({ flowId: 'flow-1' }, context, { parallel: false });

        expect(result.flowRunResult?.nodeResults.get('node-a')?.status).toBe('failed');
        expect(result.flowRunResult?.nodeResults.get('node-b')?.status).toBe('success');
        // Flow overall status is failed because node-a failed
        expect(result.status).toBe('failed');
    });

    it('skips downstream success-only node when parent fails', async () => {
        const nodeA = makeNode('node-a', 'stepA');
        const nodeB = makeNode('node-b', 'stepB'); // should be skipped: condition = success

        const flow = makeFlow(
            [nodeA, nodeB],
            [makeConnector('conn-1', 'node-a', 'node-b', 'success')]
        );

        const mockHttp = makeMockHttpExecutor({ 'node-a': 'failed' });
        const executor = new FlowExecutor(mockHttp);
        const context = { ...makeExecutionContext(), flows: [flow] };

        const result = await executor.execute({ flowId: 'flow-1' }, context, { parallel: false });

        expect(result.flowRunResult?.nodeResults.get('node-a')?.status).toBe('failed');
        expect(result.flowRunResult?.nodeResults.get('node-b')?.status).toBe('skipped');
        // node-b was never executed
        expect(mockHttp.executeFlowNode).toHaveBeenCalledTimes(1);
    });

    it('runs any-condition downstream node regardless of whether parent succeeded or failed', async () => {
        const nodeA = makeNode('node-a', 'stepA');
        const nodeB = makeNode('node-b', 'stepB'); // condition = any

        const flow = makeFlow(
            [nodeA, nodeB],
            [makeConnector('conn-1', 'node-a', 'node-b', 'any')]
        );

        const mockHttp = makeMockHttpExecutor({ 'node-a': 'failed', 'node-b': 'success' });
        const executor = new FlowExecutor(mockHttp);
        const context = { ...makeExecutionContext(), flows: [flow] };

        const result = await executor.execute({ flowId: 'flow-1' }, context, { parallel: false });

        expect(result.flowRunResult?.nodeResults.get('node-a')?.status).toBe('failed');
        expect(result.flowRunResult?.nodeResults.get('node-b')?.status).toBe('success');
        expect(mockHttp.executeFlowNode).toHaveBeenCalledTimes(2);
    });

    it('correctly routes branching: failure handler runs, success handler is skipped', async () => {
        const nodeA = makeNode('node-a', 'stepA');
        const nodeB = makeNode('node-b', 'stepB-on-success');
        const nodeC = makeNode('node-c', 'stepC-on-failure');

        const flow = makeFlow(
            [nodeA, nodeB, nodeC],
            [
                makeConnector('conn-success', 'node-a', 'node-b', 'success'),
                makeConnector('conn-failure', 'node-a', 'node-c', 'failure'),
            ]
        );

        const mockHttp = makeMockHttpExecutor({ 'node-a': 'failed', 'node-c': 'success' });
        const executor = new FlowExecutor(mockHttp);
        const context = { ...makeExecutionContext(), flows: [flow] };

        const result = await executor.execute({ flowId: 'flow-1' }, context, { parallel: false });

        expect(result.flowRunResult?.nodeResults.get('node-a')?.status).toBe('failed');
        expect(result.flowRunResult?.nodeResults.get('node-b')?.status).toBe('skipped');
        expect(result.flowRunResult?.nodeResults.get('node-c')?.status).toBe('success');
    });

    it('continues executing independent nodes after a chain stops due to failure', async () => {
        // A → B (success), but A fails → B skipped; C is a root node, should always run
        const nodeA = makeNode('node-a', 'stepA');
        const nodeB = makeNode('node-b', 'stepB');
        const nodeC = makeNode('node-c', 'stepC'); // no incoming connectors

        const flow = makeFlow(
            [nodeA, nodeB, nodeC],
            [makeConnector('conn-1', 'node-a', 'node-b', 'success')]
        );

        const mockHttp = makeMockHttpExecutor({ 'node-a': 'failed', 'node-c': 'success' });
        const executor = new FlowExecutor(mockHttp);
        const context = { ...makeExecutionContext(), flows: [flow] };

        const result = await executor.execute({ flowId: 'flow-1' }, context, { parallel: false });

        expect(result.flowRunResult?.nodeResults.get('node-c')?.status).toBe('success');
        expect(result.flowRunResult?.nodeResults.get('node-b')?.status).toBe('skipped');
    });
});

describe('FlowExecutor — parallel execution', () => {
    it('continues executing downstream nodes with failure condition when a node fails', async () => {
        const nodeA = makeNode('node-a', 'stepA');
        const nodeB = makeNode('node-b', 'stepB');

        const flow = makeFlow(
            [nodeA, nodeB],
            [makeConnector('conn-1', 'node-a', 'node-b', 'failure')]
        );

        const mockHttp = makeMockHttpExecutor({ 'node-a': 'failed', 'node-b': 'success' });
        const executor = new FlowExecutor(mockHttp);
        const context = { ...makeExecutionContext(), flows: [flow] };

        const result = await executor.execute({ flowId: 'flow-1' }, context, { parallel: true });

        expect(result.flowRunResult?.nodeResults.get('node-a')?.status).toBe('failed');
        expect(result.flowRunResult?.nodeResults.get('node-b')?.status).toBe('success');
        expect(result.status).toBe('failed');
    });

    it('skips downstream success-only node when parent fails (parallel)', async () => {
        const nodeA = makeNode('node-a', 'stepA');
        const nodeB = makeNode('node-b', 'stepB');

        const flow = makeFlow(
            [nodeA, nodeB],
            [makeConnector('conn-1', 'node-a', 'node-b', 'success')]
        );

        const mockHttp = makeMockHttpExecutor({ 'node-a': 'failed' });
        const executor = new FlowExecutor(mockHttp);
        const context = { ...makeExecutionContext(), flows: [flow] };

        const result = await executor.execute({ flowId: 'flow-1' }, context, { parallel: true });

        expect(result.flowRunResult?.nodeResults.get('node-a')?.status).toBe('failed');
        expect(result.flowRunResult?.nodeResults.get('node-b')?.status).toBe('skipped');
        expect(mockHttp.executeFlowNode).toHaveBeenCalledTimes(1);
    });

    it('runs any-condition node regardless of failure (parallel)', async () => {
        const nodeA = makeNode('node-a', 'stepA');
        const nodeB = makeNode('node-b', 'stepB');

        const flow = makeFlow(
            [nodeA, nodeB],
            [makeConnector('conn-1', 'node-a', 'node-b', 'any')]
        );

        const mockHttp = makeMockHttpExecutor({ 'node-a': 'failed', 'node-b': 'success' });
        const executor = new FlowExecutor(mockHttp);
        const context = { ...makeExecutionContext(), flows: [flow] };

        const result = await executor.execute({ flowId: 'flow-1' }, context, { parallel: true });

        expect(result.flowRunResult?.nodeResults.get('node-b')?.status).toBe('success');
        expect(mockHttp.executeFlowNode).toHaveBeenCalledTimes(2);
    });

    it('routes branching correctly in parallel mode: failure handler runs, success handler skipped', async () => {
        const nodeA = makeNode('node-a', 'stepA');
        const nodeB = makeNode('node-b', 'stepB-on-success');
        const nodeC = makeNode('node-c', 'stepC-on-failure');

        const flow = makeFlow(
            [nodeA, nodeB, nodeC],
            [
                makeConnector('conn-success', 'node-a', 'node-b', 'success'),
                makeConnector('conn-failure', 'node-a', 'node-c', 'failure'),
            ]
        );

        const mockHttp = makeMockHttpExecutor({ 'node-a': 'failed', 'node-c': 'success' });
        const executor = new FlowExecutor(mockHttp);
        const context = { ...makeExecutionContext(), flows: [flow] };

        const result = await executor.execute({ flowId: 'flow-1' }, context, { parallel: true });

        expect(result.flowRunResult?.nodeResults.get('node-a')?.status).toBe('failed');
        expect(result.flowRunResult?.nodeResults.get('node-b')?.status).toBe('skipped');
        expect(result.flowRunResult?.nodeResults.get('node-c')?.status).toBe('success');
    });
});
