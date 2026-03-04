# @wave-client/arena

AI agent engine for Wave Client - a LangGraph-based multi-agent system.

## Overview

This package provides the AI chat experience for Wave Client, featuring:

- **Learn Agent**: Web technologies knowledge base (protocols, standards, RFCs)
- **Discover Agent**: Wave Client feature discovery via MCP tools

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
