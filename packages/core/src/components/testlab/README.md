# Test Lab Feature

The **Test Lab** provides a comprehensive environment for designing, configuring, and executing automated test suites within Wave Client. It allows users to group existing requests and flows into executable suites, configure execution parameters, and analyze detailed results.

## Key Features

- **Suite Management**: Create, rename, delete, and duplicate test suites.
- **Mixed Content**: Add both individual HTTP Requests (from Collections) and full Flows to the same suite.
- **Reference-Based**: Test items are linked by reference. Updates to the original request or flow are automatically reflected in the test suite.
- **Execution Control**:
    - **Concurrency**: Run items sequentially or in parallel (future support).
    - **Delays**: Configure delays between execution steps.
    - **Error Handling**: Option to stop the entire suite upon the first failure.
- **Environment Overrides**: Assign specific Environments and Auth profiles to a test suite, overriding global defaults during execution.
- **Results Analysis**: Real-time progress tracking and detailed post-run analysis, including latency, status codes, and validation failures.

## Architecture

The Test Lab is built using a modular component architecture and integrates deeply with the Wave Client core state and adapter system.

### Key Components

#### 1. `TestSuiteEditor`
The main orchestrator component for the Test Lab view.
- **Location**: `packages/core/src/components/testlab/TestSuiteEditor.tsx`
- **Responsibility**:
    - Manages the visual state of the active test suite.
    - Provides a toolbar for suite-level configuration (Name, Environment, Auth).
    - Render the list of test items with drag-and-drop reordering capabilities.
    - Handles the "Add Item" dialog to browse and select Requests/Flows.
    - Integrates the `TestResultsPanel` for split-view execution feedback.

#### 2. `TestLabPane`
The sidebar navigation component.
- **Location**: `packages/core/src/components/common/TestLabPane.tsx`
- **Responsibility**:
    - Lists all available test suites.
    - Provides CRUD actions (Create, Delete).
    - Handles selection to open the `TestSuiteEditor`.
    - implementation follows the pattern of `CollectionsPane` and `FlowsPane`.

#### 3. `TestResultsPanel`
The result visualization component.
- **Location**: `packages/core/src/components/testlab/TestResultsPanel.tsx`
- **Responsibility**:
    - Displays execution summary (Pass/Fail counts, total duration).
    - Renders detailed cards for each executed item.
    - For Flow items, it provides an expandable view to inspect individual node execution within the flow.

### State Management

Test Lab state is managed via Zustand in the core store, ensuring state is accessible across the application and effectively decoupled from UI components.

- **Slice**: `createTestSuitesSlice.tsx`
- **Store**: `useAppStateStore`
- **Key Actions**:
    - `loadTestSuites()`, `saveTestSuite()`, `updateTestSuiteItems()`
    - Transient run state (`isRunning`, `progress`) is managed to avoid unnecessary persistence overhead for temporary execution data.

### Execution Engine (`useTestSuiteRunner`)

The execution logic is encapsulated in the `useTestSuiteRunner` hook.
- **Location**: `packages/core/src/hooks/useTestSuiteRunner.ts`
- **Flow**:
    1.  **Preparation**: Resolves referenced requests/flows from the store.
    2.  **Iteration**: Iterates through items based on configuration (sequential/delay).
    3.  **Execution**: Delegates actual execution to `useFlowRunner` (for flows) or the HTTP Adapter (for requests).
    4.  **Result Aggregation**: Collects results and updates the transient run state.

### Persistence (Adapter Pattern)

Test Suites are persisted using the standardized `IStorageAdapter` interface, allowing platform-specific storage implementations:

- **VS Code**: Saved as JSON files in the workspace `.wave/test-suites/` directory.
- **Web**: Saved to the backend server via API or LocalStorage (depending on configuration).
- **Schema**: Defined in `packages/core/src/types/testSuite.ts`.

## Data Model

A `TestSuite` consists of:

```typescript
interface TestSuite {
  id: string;
  name: string;
  description?: string;
  items: TestItem[]; // Ordered list of items
  settings?: {
    envId?: string;
    authId?: string;
    stopOnFailure?: boolean;
    delayBetweenItems?: number; // ms
  };
}

// TestItem is a reference wrapper
type TestItem = 
  | { id: string; type: 'request'; referenceId: string; ... }
  | { id: string; type: 'flow'; referenceId: string; ... };
```

This reference-based approach ensures that test suites remain lightweight and always use the latest version of your API definitions.

## Data-Driven Testing

Test Lab supports **data-driven testing** where each request test item can be run multiple times with different data scenarios (test cases). This enables parameterized testing without duplicating requests.

### Test Case Structure

Each `RequestTestItem` can have multiple test cases:

```typescript
interface TestCase {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  order: number;
  data: TestCaseData;
  validation?: RequestValidation;  // Per-case validation override
}

interface TestCaseData {
  // Variable substitutions for {{variable}} syntax (overrides env vars)
  variables?: Record<string, string>;
  // Override headers (merged with base request)
  headers?: HeaderRow[];
  // Override params (merged with base request)
  params?: ParamRow[];
  // Override body content
  body?: string;
  // Override auth for this case
  authId?: string;
}
```

### Execution Behavior

- If a request item has test cases, the runner executes each enabled case sequentially
- If no test cases are defined, the item runs once with default/base request data
- Test case variables override environment variables with the same name
- Headers and params from test cases are merged with the base request
- Results are captured per test case with individual pass/fail status

### Variable Inheritance

Test case variables override environment variables with matching names:
1. Environment variables are resolved first
2. Test case `data.variables` override any matching env var names
3. Standard `{{variable}}` syntax works in all fields

---

## Future Enhancements (TODO)

The following features are planned for future iterations:

- [ ] **Flow Test Cases**: Add data-driven testing support for `FlowTestItem` (currently only `RequestTestItem` supports test cases)
- [ ] **Form-Based Test Case Editor**: Add UI toggle to switch between JSON editor and form-based editors for test case data (reuse `HeadersEditor`, `ParamsEditor`, `BodyModeSelector`)
- [ ] **File Upload Support**: Allow test cases to specify file attachments for multipart form or binary body types
- [ ] **Body Type Selection**: Support different body modes (raw, urlencoded, formdata, binary) per test case, not just string override
- [ ] **CSV/JSON Import**: Bulk import test cases from CSV or JSON files
- [ ] **Test Data Templates**: Create reusable test data templates that can be applied across multiple test items
- [ ] **Parameterized Validation**: Allow validation rules to use test case variables (e.g., `{{expectedStatus}}`)
- [ ] **Enhanced Reporting**: Exportable test reports (JSON, beautiful HTML)
- [ ] **Web App**: Implement Test Lab UI and functionality in the Wave Client Web application
- [ ] **Results** Make sure consistent display for response/ input/ validation across request and flow test items
- [ ] **Erro handling**: Improve error handling and reporting for various failure scenarios
