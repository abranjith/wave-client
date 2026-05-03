# @wave-client/arena

AI agent engine for Wave Client - a LangGraph-based multi-agent system.

## Overview

This package provides the AI chat experience for Wave Client, featuring:

- **Learn Agent**: Web technologies knowledge base (protocols, standards, RFCs)
- **Discover Agent**: Wave Client feature discovery via MCP tools

## Prompt Source of Truth

- `packages/arena/src/agents/waveClientAgent.ts` contains the canonical inline `WAVE_CLIENT_SYSTEM_PROMPT`.
- `packages/arena/src/agents/webExpertAgent.ts` contains the canonical inline `WEB_EXPERT_SYSTEM_PROMPT`.
- Runtime prompt behavior can be overridden per instance via each agent's `systemPrompt` config option.

## Wave Client Agent Command Behavior

Wave Client slash command surface:

- `/help`
- `/collections`
- `/requests`
- `/environments`
- `/flows`
- `/tests`
- `/run-flow`
- `/run-tests`

The Wave agent normalizes slash commands and free-form user intent into deterministic routing hints before model invocation.

Tool-orchestration guardrails:

- Workspace claims must be tool-backed.
- The agent must not fabricate collection/environment/flow/test data.
- Run actions (`run_flow`, `run_test_suite`) require explicit confirmation language.
- Ambiguous run targets must be resolved by listing candidates first.
- If tool output is unavailable, responses must explicitly state that verification is not possible without MCP/tool output.

Intent hinting behavior:

- List/detail/search intents are mapped to corresponding `list_*`, `get_*`, and `search_*` plans.
- Run intents are mapped to `list_* -> confirm -> run_*` plans.
- Hints steer the ReAct loop; tool calls are still executed through LangGraph `ToolNode`.

## Architecture

```
┌─────────────────────────────────────┐
│       @wave-client/arena            │
├─────────────────────────────────────┤
│ ┌─────────────┐  ┌───────────────┐  │
│ │ Learn Agent │  │ Discover Agent│  │
│ └──────┬──────┘  └───────┬───────┘  │
│        │                 │          │
│        ▼                 ▼          │
│ ┌─────────────┐  ┌───────────────┐  │
│ │ Web Fetcher │  │  MCP Bridge   │  │
│ │ Vector Store│  │               │  │
│ └─────────────┘  └───────────────┘  │
└─────────────────────────────────────┘
```

## Technology Stack

- **LangGraph.js** - Agent orchestration with graph-based workflows
- **LangChain.js** - LLM abstraction and tool integration
- **Google Gemini** - Initial LLM provider (MVP)
- **HNSWLib** - Local vector store for document embeddings

## Usage
#TODO: Add usage examples and API documentation here.

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Run tests
pnpm test
```
