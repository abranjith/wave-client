# @wave-client/arena

The **AI engine** behind Wave Arena — a LangGraph‑based multi‑agent system.

## Purpose

This package powers Wave Client's in‑app AI assistant. It exists to keep the AI orchestration logic separate from the UI, so [`@wave-client/core`](../core/README.md) stays free of agent/LLM concerns.

## Responsibilities

- A **web‑expert agent** for questions about web standards and protocols, grounded in authoritative sources.
- A **workspace agent** that answers and acts on the user's Wave Client workspace via tools (backed by [`@wave-client/mcp-server`](../mcp-server/README.md)), with confirmation‑gated run actions.
- Provider/model integration (LangGraph + LangChain) and the canonical system prompts and command surface.

## Documentation

See the full documentation at [`docs/`](../../docs/README.md) — start with [AI & Wave Arena](../../docs/features/ai-arena.md).
