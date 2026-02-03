import { z } from "zod";
import {
	testSuiteService,
	environmentService,
	collectionService,
	flowService,
	storeService
} from "@wave-client/shared";
import type {
	Auth,
	Collection,
	Environment,
	Flow,
	FlowRunResult,
	HttpResponseResult,
	RequestTestItem,
	FlowTestItem,
	TestCase,
	TestCaseResult,
	FlowTestCaseResult,
	TestItemResult,
	TestSuite,
	TestSuiteRunResult,
	ValidationResult
} from "@wave-client/core";
import {
	createEmptyFlowContext,
	FlowExecutor,
	HttpRequestExecutor,
	isRequestTestItem
} from "@wave-client/core";
import type {
	ExecutionContext,
	FlowExecutionConfig,
	FlowExecutionInput,
	HttpExecutionInput,
	HttpExecutionResult,
	RequestOverrides
} from "@wave-client/core";
import { McpHttpAdapter } from "../adapters/mcpAdapter.js";

type TestItemStatus = "idle" | "pending" | "running" | "success" | "failed" | "skipped";
type TestValidationStatus = "idle" | "pending" | "pass" | "fail";

export interface McpTextResponse {
	content: Array<{
		type: "text";
		text: string;
	}>;
}

const httpAdapter = new McpHttpAdapter();
const httpExecutor = new HttpRequestExecutor();
const flowExecutor = new FlowExecutor();
const runningSuites = new Set<string>();

function toTestItemStatus(execStatus: HttpExecutionResult["status"]): TestItemStatus {
	switch (execStatus) {
		case "success":
			return "success";
		case "failed":
			return "failed";
		case "cancelled":
		case "skipped":
			return "skipped";
		default:
			return "failed";
	}
}

function toTestValidationStatus(validationStatus: HttpExecutionResult["validationStatus"]): TestValidationStatus {
	switch (validationStatus) {
		case "pass":
			return "pass";
		case "fail":
			return "fail";
		case "pending":
			return "pending";
		default:
			return "idle";
	}
}

function testCaseToOverrides(testCase: TestCase): RequestOverrides {
	const data = testCase.data || {};
	return {
		headers: data.headers,
		params: data.params,
		body: data.body,
		variables: data.variables,
		authId: data.authId,
		validation: testCase.validation,
	};
}

function deriveFlowValidationStatus(flowResult: FlowRunResult): TestValidationStatus {
	const nodeValidationResults = Array.from(flowResult.nodeResults.values())
		.filter(result => result.response?.validationResult)
		.map(result => result.response!.validationResult!);

	if (nodeValidationResults.length === 0) {
		return "idle";
	}

	const allPassed = nodeValidationResults.every(result => result.allPassed);
	return allPassed ? "pass" : "fail";
}

function cleanValidationResult(validationResult?: ValidationResult) {
	if (!validationResult) {
		return undefined;
	}

	return {
		enabled: validationResult.enabled,
		totalRules: validationResult.totalRules,
		passedRules: validationResult.passedRules,
		failedRules: validationResult.failedRules,
		allPassed: validationResult.allPassed,
		executedAt: validationResult.executedAt,
		results: validationResult.results,
	};
}

function cleanResponse(response?: HttpResponseResult) {
	if (!response) {
		return undefined;
	}

	return {
		status: response.status,
		headers: response.headers,
		body: response.body,
		isEncoded: response.isEncoded,
		elapsedTime: response.elapsedTime,
		size: response.size,
		validationResult: cleanValidationResult(response.validationResult),
	};
}

function cleanFlowRunResult(flowRunResult?: FlowRunResult) {
	if (!flowRunResult) {
		return undefined;
	}

	const nodeResults = Array.from(flowRunResult.nodeResults.values()).map(nodeResult => ({
		nodeId: nodeResult.nodeId,
		requestId: nodeResult.requestId,
		alias: nodeResult.alias,
		status: nodeResult.status,
		response: cleanResponse(nodeResult.response),
		error: nodeResult.error,
		startedAt: nodeResult.startedAt,
		completedAt: nodeResult.completedAt,
	}));

	return {
		flowId: flowRunResult.flowId,
		status: flowRunResult.status,
		nodeResults,
		progress: flowRunResult.progress,
		startedAt: flowRunResult.startedAt,
		completedAt: flowRunResult.completedAt,
		error: flowRunResult.error,
	};
}

function cleanTestSuiteRunResult(result: TestSuiteRunResult) {
	const itemResults = Array.from(result.itemResults.values()).map(itemResult => {
		if (itemResult.type === "request") {
			return {
				...itemResult,
				response: cleanResponse(itemResult.response),
				testCaseResults: itemResult.testCaseResults
					? Array.from(itemResult.testCaseResults.values()).map(testCase => ({
						...testCase,
						response: cleanResponse(testCase.response),
					}))
					: undefined,
			};
		}

		const { flowResult, ...rest } = itemResult;
		return {
			...rest,
			flowRunResult: cleanFlowRunResult(flowResult),
			testCaseResults: itemResult.testCaseResults
				? Array.from(itemResult.testCaseResults.values()).map(testCase => ({
					...testCase,
					flowRunResult: cleanFlowRunResult(testCase.flowResult),
				}))
				: undefined,
		};
	});

	return {
		...result,
		itemResults,
	};
}

function createExecutionContext(
	environments: Environment[],
	auths: Auth[],
	collections: Collection[],
	flows: Flow[],
	environmentId: string | null,
	defaultAuthId: string | null,
	initialVariables?: Record<string, string>
): ExecutionContext {
	return {
		httpAdapter,
		environments,
		auths,
		collections,
		flows,
		environmentId,
		defaultAuthId,
		isCancelled: () => false,
		flowContext: createEmptyFlowContext(),
		initialVariables,
	};
}

/**
 * Zod schema for list_test_suites tool arguments.
 */
export const ListTestSuitesSchema = z.object({
	limit: z.number().int().positive().optional().describe("Maximum number of test suites to return (pagination)"),
	offset: z.number().int().min(0).optional().describe("Number of test suites to skip (pagination)"),
	nameQuery: z.string().trim().optional().describe("Filter test suites by name (case-insensitive partial match)"),
	tagQuery: z.string().trim().optional().describe("Filter test suites by tag (case-insensitive exact match)"),
});
export type ListTestSuitesArgs = z.infer<typeof ListTestSuitesSchema>;

export interface TestSuiteMetadata {
	id: string;
	name: string;
	description?: string;
	itemCount: number;
	enabledItemCount: number;
	updatedAt: string;
}

/**
 * MCP handler for listing test suites with optional filters and pagination.
 */
export async function listTestSuitesHandler(args: ListTestSuitesArgs): Promise<McpTextResponse> {
	try {
		const allSuites = await testSuiteService.loadAll();
		const nameQuery = args.nameQuery?.toLowerCase();
		const tagQuery = args.tagQuery?.toLowerCase();

		const filteredSuites = allSuites.filter(suite => {
			const matchesName = nameQuery
				? suite.name.toLowerCase().includes(nameQuery)
				: true;
			const tags = (suite as { tags?: string[] }).tags || [];
			const matchesTag = tagQuery
				? tags.some(tag => tag.toLowerCase() === tagQuery)
				: true;

			return matchesName && matchesTag;
		});

		let result: TestSuiteMetadata[] = filteredSuites.map(suite => ({
			id: suite.id,
			name: suite.name,
			description: suite.description,
			itemCount: suite.items.length,
			enabledItemCount: suite.items.filter(item => item.enabled).length,
			updatedAt: suite.updatedAt,
		}));

		if (args.offset !== undefined || args.limit !== undefined) {
			const offset = args.offset || 0;
			const limit = args.limit ?? result.length;
			result = result.slice(offset, offset + limit);
		}

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(result, null, 2)
				}
			]
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to load test suites: ${message}`);
	}
}
/**
 * Zod schema for run_test_suite tool arguments.
 */export const RunTestSuiteSchema = z.object({
	suiteId: z.string().min(1).describe("The ID of the test suite to execute"),
    environmentId: z.string().optional().describe("Environment ID for variable resolution (overrides suite.defaultEnvId)"),
    authId: z.string().optional().describe("Auth configuration ID for requests (overrides suite.defaultAuthId)"),
    variables: z.record(z.string()).optional().describe("Override variables for execution (merged with environment variables)"),
});
export type RunTestSuiteArgs = z.infer<typeof RunTestSuiteSchema>;

async function executeRequestItem(
    item: RequestTestItem,
    context: ExecutionContext
): Promise<TestItemResult> {
    const startedAt = new Date().toISOString();
    const enabledTestCases = (item.testCases || []).filter(testCase => testCase.enabled);

    if (enabledTestCases.length === 0) {
        const input: HttpExecutionInput = {
            referenceId: item.referenceId,
            executionId: `${item.id}-default-${Date.now()}`,
            validation: item.validation,
        };

        const execResult = await httpExecutor.execute(input, context);

        return {
            itemId: item.id,
            type: "request",
            status: toTestItemStatus(execResult.status),
            validationStatus: toTestValidationStatus(execResult.validationStatus),
            response: execResult.response,
            error: execResult.error,
            startedAt,
            completedAt: new Date().toISOString(),
        };
    }

    const testCaseResults = new Map<string, TestCaseResult>();
    let overallStatus: TestItemStatus = "success";
    let overallValidationStatus: TestValidationStatus = "pass";
    let lastResponse: HttpResponseResult | undefined;
    let lastError: string | undefined;

    for (const testCase of enabledTestCases.sort((a, b) => a.order - b.order)) {
        const caseStartedAt = new Date().toISOString();
        const overrides = testCaseToOverrides(testCase);
        const input: HttpExecutionInput = {
            referenceId: item.referenceId,
            executionId: `${item.id}-${testCase.id}-${Date.now()}`,
            validation: testCase.validation || item.validation,
        };

        const execResult = await httpExecutor.execute(input, context, overrides);
        const caseStatus = toTestItemStatus(execResult.status);
        const caseValidation = toTestValidationStatus(execResult.validationStatus);

        testCaseResults.set(testCase.id, {
            testCaseId: testCase.id,
            testCaseName: testCase.name,
            status: caseStatus,
            validationStatus: caseValidation,
            response: execResult.response,
            error: execResult.error,
            startedAt: caseStartedAt,
            completedAt: new Date().toISOString(),
        });

        if (execResult.response) {
            lastResponse = execResult.response;
        }
        if (execResult.error) {
            lastError = execResult.error;
        }

        if (caseStatus === "failed") {
            overallStatus = "failed";
        }
        if (caseValidation === "fail") {
            overallValidationStatus = "fail";
        }
    }

    return {
        itemId: item.id,
        type: "request",
        status: overallStatus,
        validationStatus: overallValidationStatus,
        response: lastResponse,
        error: lastError,
        startedAt,
        completedAt: new Date().toISOString(),
        testCaseResults,
    };
}

async function executeFlowItem(
    item: FlowTestItem,
    context: ExecutionContext
): Promise<TestItemResult> {
    const startedAt = new Date().toISOString();
    const enabledTestCases = (item.testCases || []).filter(testCase => testCase.enabled);

    if (enabledTestCases.length === 0) {
        const input: FlowExecutionInput = {
            flowId: item.referenceId,
            executionId: `${item.id}-default-${Date.now()}`,
        };
        const config: FlowExecutionConfig = {
            parallel: true,
            defaultAuthId: context.defaultAuthId || undefined,
        };

        const execResult = await flowExecutor.execute(input, context, config);
        const status = execResult.status === "success"
            ? "success"
            : execResult.status === "cancelled"
                ? "skipped"
                : "failed";

        return {
            itemId: item.id,
            type: "flow",
            status,
            validationStatus: toTestValidationStatus(execResult.validationStatus),
            flowResult: execResult.flowRunResult,
            error: execResult.error,
            startedAt,
            completedAt: new Date().toISOString(),
        };
    }

    const testCaseResults = new Map<string, FlowTestCaseResult>();
    let overallStatus: TestItemStatus = "success";
    let lastFlowResult: FlowRunResult | undefined;
    let lastError: string | undefined;

    for (const testCase of enabledTestCases.sort((a, b) => a.order - b.order)) {
        const caseStartedAt = new Date().toISOString();
        const input: FlowExecutionInput = {
            flowId: item.referenceId,
            executionId: `${item.id}-${testCase.id}-${Date.now()}`,
        };
        const config: FlowExecutionConfig = {
            parallel: true,
            defaultAuthId: context.defaultAuthId || undefined,
            initialVariables: testCase.data?.variables,
        };

        const execResult = await flowExecutor.execute(input, context, config);
        const caseStatus: TestItemStatus = execResult.status === "success"
            ? "success"
            : execResult.status === "cancelled"
                ? "skipped"
                : "failed";

        testCaseResults.set(testCase.id, {
            testCaseId: testCase.id,
            testCaseName: testCase.name,
            status: caseStatus,
            flowResult: execResult.flowRunResult,
            error: execResult.error,
            startedAt: caseStartedAt,
            completedAt: new Date().toISOString(),
        });

        if (execResult.flowRunResult) {
            lastFlowResult = execResult.flowRunResult;
        }
        if (execResult.error) {
            lastError = execResult.error;
        }

        if (caseStatus === "failed") {
            overallStatus = "failed";
        }
    }

    return {
        itemId: item.id,
        type: "flow",
        status: overallStatus,
        validationStatus: lastFlowResult ? deriveFlowValidationStatus(lastFlowResult) : "idle",
        flowResult: lastFlowResult,
        error: lastError,
        startedAt,
        completedAt: new Date().toISOString(),
        testCaseResults,
    };
}

function isItemPassed(result: TestItemResult): boolean {
    return result.status === "success" && result.validationStatus !== "fail";
}

async function executeTestSuite(
    suite: TestSuite,
    context: ExecutionContext
): Promise<TestSuiteRunResult> {
    const enabledItems = suite.items
        .filter(item => item.enabled)
        .sort((a, b) => a.order - b.order);

    if (enabledItems.length === 0) {
        return {
            suiteId: suite.id,
            status: "success",
            itemResults: new Map(),
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            progress: {
                total: 0,
                completed: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
            },
            averageTime: 0,
        };
    }

    const result: TestSuiteRunResult = {
        suiteId: suite.id,
        status: "running",
        itemResults: new Map(),
        startedAt: new Date().toISOString(),
        progress: {
            total: enabledItems.length,
            completed: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
        },
        averageTime: 0,
    };

    let hasFailure = false;
    const timings: number[] = [];

    for (let index = 0; index < enabledItems.length; index += 1) {
        const item = enabledItems[index];

        if (suite.settings.stopOnFailure && hasFailure) {
            const skippedResult: TestItemResult = {
                itemId: item.id,
                type: item.type,
                status: "skipped",
                validationStatus: "idle",
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
            } as TestItemResult;

            result.itemResults.set(item.id, skippedResult);
            result.progress.completed += 1;
            result.progress.skipped += 1;
            continue;
        }

        const itemResult = isRequestTestItem(item)
            ? await executeRequestItem(item, context)
            : await executeFlowItem(item as FlowTestItem, context);

        result.itemResults.set(item.id, itemResult);
        result.progress.completed += 1;
        result.progress.passed += isItemPassed(itemResult) ? 1 : 0;
        result.progress.failed += itemResult.status === "failed" ? 1 : 0;

        if (itemResult.status === "failed" || itemResult.validationStatus === "fail") {
            hasFailure = true;
        }

        if (itemResult.type === "request" && itemResult.response?.elapsedTime !== undefined) {
            timings.push(itemResult.response.elapsedTime);
        }

        if (suite.settings.delayBetweenCalls > 0 && index < enabledItems.length - 1) {
            await new Promise(resolve => setTimeout(resolve, suite.settings.delayBetweenCalls));
        }
    }

    result.status = hasFailure ? "failed" : "success";
    result.completedAt = new Date().toISOString();
    result.averageTime = timings.length > 0
        ? timings.reduce((sum, value) => sum + value, 0) / timings.length
        : 0;

    return result;
}

/**
 * MCP handler for running a test suite and returning execution results.
 */
export async function runTestSuiteHandler(args: RunTestSuiteArgs): Promise<McpTextResponse> {
    if (runningSuites.has(args.suiteId)) {
        throw new Error(`Test suite is already running: ${args.suiteId}`);
    }

    runningSuites.add(args.suiteId);

    try {
        const suite = await testSuiteService.getById(args.suiteId);
        if (!suite) {
            throw new Error(`Test suite not found: ${args.suiteId}`);
        }

        const [environments, auths, collections, flows] = await Promise.all([
            environmentService.loadAll(),
            storeService.loadAuths(),
            collectionService.loadAll(),
            flowService.loadAll(),
        ]);

        const context = createExecutionContext(
            environments,
            auths as Auth[],
            collections,
            flows as Flow[],
            args.environmentId || suite.defaultEnvId || null,
            args.authId || suite.defaultAuthId || null,
            args.variables
        );

        const runResult = await executeTestSuite(suite as TestSuite, context);
        const cleaned = cleanTestSuiteRunResult(runResult);
        const pending = Math.max(0, runResult.progress.total - runResult.progress.passed - runResult.progress.failed);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        ...cleaned,
                        progress: {
                            total: runResult.progress.total,
                            passed: runResult.progress.passed,
                            failed: runResult.progress.failed,
                            pending,
                        },
                    }, null, 2)
                }
            ]
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(message);
    } finally {
        runningSuites.delete(args.suiteId);
    }
