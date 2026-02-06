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

```typescript
import { createLearnAgent, createDiscoverAgent } from '@wave-client/arena';

// Create agents with provider config
const learnAgent = createLearnAgent({
  provider: 'gemini',
  apiKey: process.env.GOOGLE_API_KEY,
});

const discoverAgent = createDiscoverAgent({
  provider: 'gemini',
  apiKey: process.env.GOOGLE_API_KEY,
  mcpTools: mcpServerTools,
});

// Stream chat response
for await (const chunk of learnAgent.chat(sessionId, message)) {
  console.log(chunk.content);
}
```

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Run tests
pnpm test
```
