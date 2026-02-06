# [ADD PACKAGE NAME]

[Add a one liner about the package. Keep it high level and concise, focused on business value.]

## Overview

[Add Project overview and purpose. Explain what the package does, its main features, and why it exists.]

## Architecture

### High-Level Architecture Diagram

[Below is a sample architecture diagram. Replace it with the actual package name and adjust components as necessary.]

```
┌─────────────────────────────────────────────────────────────┐
│                    samplePackage                            │
│                   (Platform-Agnostic)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐    ┌──────────────────────────────┐   │
│  │   Components     │    │    Custom Hooks & Utilities  │   │
│  │                  │    │                              │   │
│  │ • Component      │    │ • Custom validators/parsers  │   │
│  │ • .......        │    │ • Custom validators/parsers  │   │
│  └────────┬─────────┘    └──────────────┬───────────────┘   │
│           │                             │                   │
│           └─────────────────┬───────────┘                   │
│                             │                               │
│                    ┌────────▼────────┐                      │
│                    │  useAdapter()   │                      │
│                    │    Context      │                      │
│                    └────────┬────────┘                      │
│                             │                               │
│                  ┌──────────▼──────────┐                    │
│                  │ IPlatformAdapter    │                    │
│                  │     (Interface)     │                    │
│                  └──────────┬──────────┘                    │
│                             │                               │
└─────────────────────────────┼───────────────────────────────┘
                              │
                              │ Implemented by
                              │
                ┌─────────────┴──────────────┐
                │                            │
        ┌───────▼────────┐          ┌────────▼────────┐
        │ VS Code Impl   │          │   Web Impl      │
        │ (vscode pkg)   │          │  (web pkg)      │
        │                │          │                 │
        └────────────────┘          └─────────────────┘

```
### Package Structure

[Below is a sample directory structure. Adjust as necessary for the actual package.]

```
packages/core/
├── src/
│   ├── components/common/   # React UI components
│   │   ├── RequestBody.tsx
│   │   └── ...
│   ├── hooks/               # Custom React hooks
│   │   ├── useAdapter.tsx   # Access platform adapter
│   │   ├── store/useAppStateStore.ts
│   │   └── ...
│   ├── types/               # TypeScript type definitions
│   │   ├── adapters.ts      # IPlatformAdapter interface
│   │   └── ...
│   ├── utils/               # Utility functions
│   │   ├── encoding.ts
│   │   └── ...
│   ├── test/                # Test utilities & mocks
│   │   ├── mocks/
│   │   └── ...
│   └── index.ts             # Main entry point
├── vite.config.ts
└── package.json
```

## Key Features

### [Add Feature Name]

[Add an overview of the feature, its purpose. Add examples to help understand better.]

**Benefits:**
[List all the benefits of this feature.]

## Usage Examples

[Add various usage examples demonstrating how to use the package's features. Note that this is at package level. If there are multiple features, add examples for each feature separately under it's own section.]


## Developer Guide

### Prerequisites

[Add any prerequisites needed for development, e.g., Node.js version, pnpm installation, etc]

### Installation

[Add instructions on how to install dependencies and set up the development environment.]

### Development

[Add instructions on how to run the development server, build the project, run in watch mode etc.]

### Testing

#### Run Tests Once

[Add instructions on how to run tests once, both from workspace root and from the package directory, in watch mode, libraries used etc.]


#### Generate Coverage Report

[Add instructions on how to generate coverage report, both from workspace root and from the package directory and where is the report generated and how to view.]

### Code Quality

[Add instructions on how to run linting and formatting checks, both from workspace root and from the package directory and if it is automatic on commit or push etc.]

### Project Scripts Reference

[Add a table listing all the important scripts available for the package along with their descriptions. See example below.]

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies |
| `pnpm watch` | Watch and rebuild (background) |
| `pnpm build` | Build for production |
| `pnpm test` | Run tests once |
| `pnpm watch:test` | Watch and re-run tests |
| `pnpm coverage` | Generate coverage report |
| `pnpm lint` | Check code quality |
| `pnpm format` | Format code with Prettier |

### Best Practices

[Add best practices and coding standards to be followed while developing the package. Include code snippets where necessary, error handling patterns, testing guidelines etc.]

## Dependencies

[Add a list of major dependencies used in the package along with their purpose.List them as core and dev dependencies separately.]

## License

See [LICENSE](../../LICENSE) in the project root.
