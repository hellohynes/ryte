---
name: data-trace
description: Trace Ryte data and invalidation across renderer state, preload, IPC, main services, settings, SQLite, indexing, and file watching. Use for persistence, stale state, ownership, cache, schema, or synchronization changes.
---

# Ryte Data Trace

Map a feature's source of truth and lifecycle without inspecting private note content.

## Workflow

1. Classify the target as renderer state, IPC, settings, workspace persistence, SQLite/vector index, file event, provider state, or derived display value.
2. Trace the real path from entry event through typed preload/IPC, ownership, persistence, invalidation, and rendered consumer. Track request IDs, cancellation, and window ownership when a flow is asynchronous.
3. Identify the source of truth, derived values, write authority, update fan-out, recovery behavior, and the lifecycle that ends listeners, observers, or active work.
4. Check for renderer ownership bypasses, persisted derived state, stale reads, duplicate notifications, cross-window leakage, stale async completions, and incomplete schema or migration coverage.
5. Validate the narrow contract with focused tests and synthetic cross-process reproduction where relevant. Treat private note content, query text, credentials, and model output as off-limits diagnostic payloads.

## Output

Report the data map, file evidence, source of truth, invalidation path, findings, and open questions.
