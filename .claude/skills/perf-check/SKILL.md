---
name: perf-check
description: Measure and diagnose Ryte performance across Electron startup, IPC, indexing, SQLite, file watching, Vue rendering, memory, and packaged builds. Use for slow, memory, re-render, startup, or large-library concerns.
---

# Ryte Performance Check

Measure an observed bottleneck before proposing optimization.

## Workflow

1. Define the user-visible latency, target scenario, corpus size, machine state, and production or development build used for evidence.
2. Trace only relevant categories: main-process startup, first paint, IPC count or payload, SQLite/indexer work, watcher lifecycle, Vue reactivity, retained resources, hidden windows, or bundle/package size. For distribution concerns, test the installed or unpacked app rather than assuming development behavior is representative.
3. Add bounded timing marks, Electron process/resource sampling, or Vue render evidence only when static evidence cannot distinguish the bottleneck. Do not log note content.
4. Separate measured findings from hypotheses. Prefer deleting, deferring, or narrowing work over speculative caching, workers, or virtualization.
5. Re-measure the same scenario after a change and report the exact remaining uncertainty.

## Output

Report scenario, measurements, execution path, findings by severity, correction direction, and before/after evidence when available.
