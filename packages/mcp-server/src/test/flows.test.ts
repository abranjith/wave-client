
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listFlowsHandler, runFlowHandler } from '../tools/flows';
import { flowService, environmentService, collectionService, storeService } from '@wave-client/shared';

// Mock shared services
vi.mock('@wave-client/shared', () => ({
    flowService: {
        loadAll: vi.fn(),
        getById: vi.fn(),
    },
    environmentService: { loadAll: vi.fn() },
    collectionService: { loadAll: vi.fn() },
    storeService: { loadAuths: vi.fn() },
}));

// Mock core FlowExecutor
const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

vi.mock('@wave-client/core', async () => {
    const actual = await vi.importActual<typeof import('@wave-client/core')>('@wave-client/core');
    class MockFlowExecutor {
        execute = mockExecute;
    }
    return {
        ...actual,
        // Also mock other exports if needed to support the file imports
        createEmptyFlowContext: vi.fn(),
        FlowExecutor: MockFlowExecutor,
    };
});

describe('Flow Tools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('list_flows', () => {
        it('should return simplified list of flows', async () => {
            const mockFlows = [
                { id: '1', name: 'Flow 1', description: 'Desc 1', nodes: [{}, {}], updatedAt: '2023-01-01' },
                { id: '2', name: 'Flow 2', nodes: [], updatedAt: '2023-01-02' }
            ];

            vi.mocked(flowService.loadAll).mockResolvedValue(mockFlows as any);

            const result = await listFlowsHandler({});
            const content = JSON.parse(result.content[0].text);

            expect(content).toHaveLength(2);
            expect(content[0]).toEqual({
                id: '1',
                name: 'Flow 1',
                description: 'Desc 1',
                nodeCount: 2,
                updatedAt: '2023-01-01'
            });
        });

        it('should support pagination', async () => {
            const mockFlows = Array.from({ length: 10 }, (_, i) => ({
                id: `${i}`, name: `Flow ${i}`, nodes: [], updatedAt: ''
            }));

            vi.mocked(flowService.loadAll).mockResolvedValue(mockFlows as any);

            const result = await listFlowsHandler({ limit: 2, offset: 5 });
            const content = JSON.parse(result.content[0].text);

            expect(content).toHaveLength(2);
            expect(content[0].id).toBe('5');
            expect(content[1].id).toBe('6');
        });
    });

    describe('run_flow', () => {
        it('should execute flow successfully', async () => {
            const mockFlow = { id: 'Flow-1', name: 'Test Flow', nodes: [] };
            vi.mocked(flowService.getById).mockResolvedValue(mockFlow as any);
            vi.mocked(environmentService.loadAll).mockResolvedValue([]);
            vi.mocked(storeService.loadAuths).mockResolvedValue([]);
            vi.mocked(collectionService.loadAll).mockResolvedValue([]);
            vi.mocked(flowService.loadAll).mockResolvedValue([mockFlow] as any);

            mockExecute.mockResolvedValue({
                id: 'exec-1',
                flowId: 'Flow-1',
                status: 'success',
                validationStatus: 'passed',
                flowRunResult: {
                    flowId: 'Flow-1',
                    status: 'success',
                    nodeResults: new Map(),
                    activeConnectorIds: [],
                    skippedConnectorIds: [],
                    startedAt: new Date().toISOString(),
                    progress: { total: 0, completed: 0 }
                },
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString()
            });

            const result = await runFlowHandler({ flowId: 'Flow-1' });

            expect(flowService.getById).toHaveBeenCalledWith('Flow-1');
            expect(mockExecute).toHaveBeenCalled();

            const content = JSON.parse(result.content[0].text);
            expect(content.status).toBe('success');
        });

        it('should properly serialize nodeResults Map to Object', async () => {
            const mockFlow = { id: 'Flow-1', name: 'Test Flow', nodes: [] };
            vi.mocked(flowService.getById).mockResolvedValue(mockFlow as any);
            vi.mocked(environmentService.loadAll).mockResolvedValue([]);
            vi.mocked(storeService.loadAuths).mockResolvedValue([]);
            vi.mocked(collectionService.loadAll).mockResolvedValue([]);
            vi.mocked(flowService.loadAll).mockResolvedValue([mockFlow] as any);

            const nodeResultsMap = new Map();
            nodeResultsMap.set('node-1', {
                nodeId: 'node-1',
                requestId: 'req-1',
                alias: 'test-node',
                status: 'success',
                output: 'test-data'
            });

            mockExecute.mockResolvedValue({
                id: 'exec-1',
                flowId: 'Flow-1',
                status: 'success',
                validationStatus: 'passed',
                flowRunResult: {
                    flowId: 'Flow-1',
                    status: 'success',
                    nodeResults: nodeResultsMap,
                    activeConnectorIds: [],
                    skippedConnectorIds: [],
                    startedAt: new Date().toISOString(),
                    progress: { total: 1, completed: 1 }
                },
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString()
            });

            const result = await runFlowHandler({ flowId: 'Flow-1' });

            const content = JSON.parse(result.content[0].text);
            expect(content.nodeResults).toBeDefined();
            expect(Array.isArray(content.nodeResults)).toBe(true);
            expect(content.nodeResults.length).toBe(1);
            expect(content.nodeResults[0].nodeId).toBe('node-1');
            expect(content.nodeResults[0].status).toBe('success');
        });

        it('should throw if flow not found', async () => {
            vi.mocked(flowService.getById).mockResolvedValue(null);

            await expect(runFlowHandler({ flowId: 'unknown' }))
                .rejects.toThrow('Flow not found: unknown');
        });
    });
});
