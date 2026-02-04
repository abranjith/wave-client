import { beforeEach, describe, expect, it, vi } from "vitest";
import { listTestSuitesHandler, runTestSuiteHandler } from "../tools/testSuites";
import {
    testSuiteService,
    environmentService,
    collectionService,
    flowService,
    storeService,
} from "@wave-client/shared";

const { mockHttpExecute, mockFlowExecute } = vi.hoisted(() => ({
    mockHttpExecute: vi.fn(),
    mockFlowExecute: vi.fn(),
}));

vi.mock("@wave-client/shared", () => ({
    testSuiteService: {
        loadAll: vi.fn(),
        getById: vi.fn(),
    },
    environmentService: { loadAll: vi.fn() },
    collectionService: { loadAll: vi.fn() },
    flowService: { loadAll: vi.fn() },
    storeService: { loadAuths: vi.fn() },
}));

vi.mock("@wave-client/core", async () => {
    const actual = await vi.importActual<typeof import("@wave-client/core")>("@wave-client/core");

    class MockHttpRequestExecutor {
        execute = mockHttpExecute;
    }

    class MockFlowExecutor {
        execute = mockFlowExecute;
    }

    return {
        ...actual,
        HttpRequestExecutor: MockHttpRequestExecutor,
        FlowExecutor: MockFlowExecutor,
    };
});

describe("Test Suite Tools", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("list_test_suites", () => {
        it("returns all suites with metadata", async () => {
            const mockSuites = [
                {
                    id: "suite-1",
                    name: "Suite 1",
                    description: "First suite",
                    items: [{ enabled: true }, { enabled: false }],
                    updatedAt: "2026-02-01T12:00:00.000Z",
                },
                {
                    id: "suite-2",
                    name: "Suite 2",
                    items: [],
                    updatedAt: "2026-02-02T12:00:00.000Z",
                },
            ];

            vi.mocked(testSuiteService.loadAll).mockResolvedValue(mockSuites as any);

            const result = await listTestSuitesHandler({});
            const content = JSON.parse(result.content[0].text);

            expect(content).toHaveLength(2);
            expect(content[0]).toEqual({
                id: "suite-1",
                name: "Suite 1",
                description: "First suite",
                itemCount: 2,
                enabledItemCount: 1,
                updatedAt: "2026-02-01T12:00:00.000Z",
            });
        });

        it("returns empty list when no suites exist", async () => {
            vi.mocked(testSuiteService.loadAll).mockResolvedValue([] as any);

            const result = await listTestSuitesHandler({});
            const content = JSON.parse(result.content[0].text);

            expect(content).toEqual([]);
        });

        it("applies limit parameter", async () => {
            const mockSuites = Array.from({ length: 5 }, (_, index) => ({
                id: `suite-${index}`,
                name: `Suite ${index}`,
                items: [],
                updatedAt: "2026-02-01T12:00:00.000Z",
            }));

            vi.mocked(testSuiteService.loadAll).mockResolvedValue(mockSuites as any);

            const result = await listTestSuitesHandler({ limit: 2 });
            const content = JSON.parse(result.content[0].text);

            expect(content).toHaveLength(2);
        });

        it("applies offset parameter", async () => {
            const mockSuites = Array.from({ length: 5 }, (_, index) => ({
                id: `suite-${index}`,
                name: `Suite ${index}`,
                items: [],
                updatedAt: "2026-02-01T12:00:00.000Z",
            }));

            vi.mocked(testSuiteService.loadAll).mockResolvedValue(mockSuites as any);

            const result = await listTestSuitesHandler({ limit: 2, offset: 2 });
            const content = JSON.parse(result.content[0].text);

            expect(content[0].id).toBe("suite-2");
            expect(content[1].id).toBe("suite-3");
        });

        it("handles pagination edge cases", async () => {
            const mockSuites = Array.from({ length: 2 }, (_, index) => ({
                id: `suite-${index}`,
                name: `Suite ${index}`,
                items: [],
                updatedAt: "2026-02-01T12:00:00.000Z",
            }));

            vi.mocked(testSuiteService.loadAll).mockResolvedValue(mockSuites as any);

            const offsetResult = await listTestSuitesHandler({ offset: 10 });
            const offsetContent = JSON.parse(offsetResult.content[0].text);
            expect(offsetContent).toEqual([]);

            const limitResult = await listTestSuitesHandler({ limit: 0 });
            const limitContent = JSON.parse(limitResult.content[0].text);
            expect(limitContent).toEqual([]);
        });

        it("filters by name query", async () => {
            const mockSuites = [
                { id: "suite-1", name: "Auth Tests", items: [], updatedAt: "2026-02-01T12:00:00.000Z" },
                { id: "suite-2", name: "User Tests", items: [], updatedAt: "2026-02-01T12:00:00.000Z" },
            ];

            vi.mocked(testSuiteService.loadAll).mockResolvedValue(mockSuites as any);

            const result = await listTestSuitesHandler({ searchQuery: "auth" });
            const content = JSON.parse(result.content[0].text);

            expect(content).toHaveLength(1);
            expect(content[0].id).toBe("suite-1");
        });

        it("filters by description query", async () => {
            const mockSuites = [
                { id: "suite-1", name: "Suite 1", description: "Authentication tests", items: [], updatedAt: "2026-02-01T12:00:00.000Z" },
                { id: "suite-2", name: "Suite 2", description: "User management", items: [], updatedAt: "2026-02-01T12:00:00.000Z" },
            ];

            vi.mocked(testSuiteService.loadAll).mockResolvedValue(mockSuites as any);

            const result = await listTestSuitesHandler({ searchQuery: "authentication" });
            const content = JSON.parse(result.content[0].text);

            expect(content).toHaveLength(1);
            expect(content[0].id).toBe("suite-1");
        });

        it("returns empty list when no matches", async () => {
            const mockSuites = [
                { id: "suite-1", name: "Auth Tests", description: "Authentication tests", items: [], updatedAt: "2026-02-01T12:00:00.000Z" },
            ];

            vi.mocked(testSuiteService.loadAll).mockResolvedValue(mockSuites as any);

            const result = await listTestSuitesHandler({ searchQuery: "billing" });
            const content = JSON.parse(result.content[0].text);

            expect(content).toEqual([]);
        });

        it("requires all tokens to match", async () => {
            const mockSuites = [
                { id: "suite-1", name: "Auth Tests", description: "User authentication", items: [], updatedAt: "2026-02-01T12:00:00.000Z" },
                { id: "suite-2", name: "User Tests", description: "General user tests", items: [], updatedAt: "2026-02-01T12:00:00.000Z" },
                { id: "suite-3", name: "Auth Service", description: "Service layer tests", items: [], updatedAt: "2026-02-01T12:00:00.000Z" },
            ];

            vi.mocked(testSuiteService.loadAll).mockResolvedValue(mockSuites as any);

            const result = await listTestSuitesHandler({ searchQuery: "auth user" });
            const content = JSON.parse(result.content[0].text);

            expect(content).toHaveLength(1);
            expect(content[0].id).toBe("suite-1");
        });

        it("sorts by relevance score (name matches ranked higher)", async () => {
            const mockSuites = [
                { id: "suite-1", name: "General Tests", description: "API authentication tests", items: [], updatedAt: "2026-02-01T12:00:00.000Z" },
                { id: "suite-2", name: "API Tests", description: "General tests", items: [], updatedAt: "2026-02-01T12:00:00.000Z" },
            ];

            vi.mocked(testSuiteService.loadAll).mockResolvedValue(mockSuites as any);

            const result = await listTestSuitesHandler({ searchQuery: "api" });
            const content = JSON.parse(result.content[0].text);

            expect(content).toHaveLength(2);
            expect(content[0].id).toBe("suite-2"); // Name match should rank higher
            expect(content[1].id).toBe("suite-1"); // Description match should rank lower
        });
    });

    describe("run_test_suite", () => {
        const baseSuite = {
            id: "suite-1",
            name: "Suite 1",
            items: [
                {
                    id: "item-1",
                    type: "request",
                    referenceId: "req-1",
                    enabled: true,
                    order: 1,
                },
            ],
            settings: {
                concurrentCalls: 1,
                delayBetweenCalls: 0,
                stopOnFailure: false,
            },
        };

        beforeEach(() => {
            vi.mocked(environmentService.loadAll).mockResolvedValue([] as any);
            vi.mocked(collectionService.loadAll).mockResolvedValue([] as any);
            vi.mocked(flowService.loadAll).mockResolvedValue([] as any);
            vi.mocked(storeService.loadAuths).mockResolvedValue([] as any);
        });

        it("executes suite and returns run result", async () => {
            vi.mocked(testSuiteService.getById).mockResolvedValue(baseSuite as any);
            mockHttpExecute.mockResolvedValue({
                id: "exec-1",
                referenceId: "req-1",
                status: "success",
                validationStatus: "pass",
                response: {
                    status: 200,
                    headers: {},
                    body: "ok",
                    isEncoded: false,
                    elapsedTime: 10,
                    size: 2,
                },
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
            });

            const result = await runTestSuiteHandler({ suiteId: "suite-1" });
            const content = JSON.parse(result.content[0].text);

            expect(content.suiteId).toBe("suite-1");
            expect(content.itemResults).toHaveLength(1);
            expect(content.status).toBe("success");
        });

        it("throws for invalid suite id", async () => {
            vi.mocked(testSuiteService.getById).mockResolvedValue(null);

            await expect(runTestSuiteHandler({ suiteId: "missing" }))
                .rejects.toThrow("Test suite not found: missing");
        });

        it("applies environment override", async () => {
            vi.mocked(testSuiteService.getById).mockResolvedValue(baseSuite as any);
            mockHttpExecute.mockResolvedValue({
                id: "exec-1",
                referenceId: "req-1",
                status: "success",
                validationStatus: "pass",
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
            });

            await runTestSuiteHandler({ suiteId: "suite-1", environmentId: "env-1" });

            const [, context] = mockHttpExecute.mock.calls[0];
            expect(context.environmentId).toBe("env-1");
        });

        it("applies auth override", async () => {
            vi.mocked(testSuiteService.getById).mockResolvedValue(baseSuite as any);
            mockHttpExecute.mockResolvedValue({
                id: "exec-1",
                referenceId: "req-1",
                status: "success",
                validationStatus: "pass",
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
            });

            await runTestSuiteHandler({ suiteId: "suite-1", authId: "auth-1" });

            const [, context] = mockHttpExecute.mock.calls[0];
            expect(context.defaultAuthId).toBe("auth-1");
        });

        it("applies variable overrides", async () => {
            vi.mocked(testSuiteService.getById).mockResolvedValue(baseSuite as any);
            mockHttpExecute.mockResolvedValue({
                id: "exec-1",
                referenceId: "req-1",
                status: "success",
                validationStatus: "pass",
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
            });

            await runTestSuiteHandler({
                suiteId: "suite-1",
                variables: { token: "abc" },
            });

            const [, context] = mockHttpExecute.mock.calls[0];
            expect(context.initialVariables).toEqual({ token: "abc" });
        });

        it("respects stopOnFailure", async () => {
            vi.mocked(testSuiteService.getById).mockResolvedValue({
                ...baseSuite,
                items: [
                    { id: "item-1", type: "request", referenceId: "req-1", enabled: true, order: 1 },
                    { id: "item-2", type: "request", referenceId: "req-2", enabled: true, order: 2 },
                ],
                settings: {
                    ...baseSuite.settings,
                    stopOnFailure: true,
                },
            } as any);

            mockHttpExecute
                .mockResolvedValueOnce({
                    id: "exec-1",
                    referenceId: "req-1",
                    status: "failed",
                    validationStatus: "fail",
                    error: "boom",
                    startedAt: new Date().toISOString(),
                    completedAt: new Date().toISOString(),
                })
                .mockResolvedValueOnce({
                    id: "exec-2",
                    referenceId: "req-2",
                    status: "success",
                    validationStatus: "pass",
                    startedAt: new Date().toISOString(),
                    completedAt: new Date().toISOString(),
                });

            const result = await runTestSuiteHandler({ suiteId: "suite-1" });
            const content = JSON.parse(result.content[0].text);

            expect(mockHttpExecute).toHaveBeenCalledTimes(1);
            const secondItem = content.itemResults.find((item: any) => item.itemId === "item-2");
            expect(secondItem.status).toBe("skipped");
        });

        it("respects delayBetweenCalls", async () => {
            vi.useFakeTimers();
            vi.mocked(testSuiteService.getById).mockResolvedValue({
                ...baseSuite,
                items: [
                    { id: "item-1", type: "request", referenceId: "req-1", enabled: true, order: 1 },
                    { id: "item-2", type: "request", referenceId: "req-2", enabled: true, order: 2 },
                ],
                settings: {
                    ...baseSuite.settings,
                    delayBetweenCalls: 500,
                },
            } as any);

            mockHttpExecute.mockResolvedValue({
                id: "exec-1",
                referenceId: "req-1",
                status: "success",
                validationStatus: "pass",
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
            });

            const runPromise = runTestSuiteHandler({ suiteId: "suite-1" });
            await Promise.resolve();
            expect(mockHttpExecute).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(500);
            await runPromise;
            expect(mockHttpExecute).toHaveBeenCalledTimes(2);

            vi.useRealTimers();
        });

        it("handles request test cases", async () => {
            vi.mocked(testSuiteService.getById).mockResolvedValue({
                ...baseSuite,
                items: [
                    {
                        id: "item-1",
                        type: "request",
                        referenceId: "req-1",
                        enabled: true,
                        order: 1,
                        testCases: [
                            { id: "case-1", name: "Case 1", enabled: true, order: 1, data: { variables: { a: "1" } } },
                            { id: "case-2", name: "Case 2", enabled: false, order: 2, data: { variables: { a: "2" } } },
                        ],
                    },
                ],
            } as any);

            mockHttpExecute.mockResolvedValue({
                id: "exec-1",
                referenceId: "req-1",
                status: "success",
                validationStatus: "pass",
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
            });

            const result = await runTestSuiteHandler({ suiteId: "suite-1" });
            const content = JSON.parse(result.content[0].text);

            expect(mockHttpExecute).toHaveBeenCalledTimes(1);
            expect(content.itemResults[0].testCaseResults).toHaveLength(1);
        });

        it("handles flow test items", async () => {
            vi.mocked(testSuiteService.getById).mockResolvedValue({
                ...baseSuite,
                items: [
                    { id: "item-1", type: "flow", referenceId: "flow-1", enabled: true, order: 1 },
                ],
            } as any);

            mockFlowExecute.mockResolvedValue({
                id: "flow-exec-1",
                flowId: "flow-1",
                status: "success",
                validationStatus: "pass",
                flowRunResult: {
                    flowId: "flow-1",
                    status: "success",
                    nodeResults: new Map(),
                    activeConnectorIds: [],
                    skippedConnectorIds: [],
                    startedAt: new Date().toISOString(),
                    progress: { total: 0, completed: 0, succeeded: 0, failed: 0, skipped: 0 },
                },
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
            });

            const result = await runTestSuiteHandler({ suiteId: "suite-1" });
            const content = JSON.parse(result.content[0].text);

            expect(mockFlowExecute).toHaveBeenCalledTimes(1);
            expect(content.itemResults[0].type).toBe("flow");
        });

        it("handles flow test cases", async () => {
            vi.mocked(testSuiteService.getById).mockResolvedValue({
                ...baseSuite,
                items: [
                    {
                        id: "item-1",
                        type: "flow",
                        referenceId: "flow-1",
                        enabled: true,
                        order: 1,
                        testCases: [
                            { id: "case-1", name: "Case 1", enabled: true, order: 1, data: { variables: { a: "1" } } },
                            { id: "case-2", name: "Case 2", enabled: true, order: 2, data: { variables: { a: "2" } } },
                        ],
                    },
                ],
            } as any);

            mockFlowExecute.mockResolvedValue({
                id: "flow-exec-1",
                flowId: "flow-1",
                status: "success",
                validationStatus: "pass",
                flowRunResult: {
                    flowId: "flow-1",
                    status: "success",
                    nodeResults: new Map(),
                    activeConnectorIds: [],
                    skippedConnectorIds: [],
                    startedAt: new Date().toISOString(),
                    progress: { total: 0, completed: 0, succeeded: 0, failed: 0, skipped: 0 },
                },
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
            });

            const result = await runTestSuiteHandler({ suiteId: "suite-1" });
            const content = JSON.parse(result.content[0].text);

            expect(mockFlowExecute).toHaveBeenCalledTimes(2);
            expect(content.itemResults[0].testCaseResults).toHaveLength(2);
        });
    });
});
