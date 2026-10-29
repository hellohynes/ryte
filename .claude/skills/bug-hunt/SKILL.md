---
name: bug-hunt
description: Diagnose and fix Ryte defects through reproduction, execution-path tracing, privacy-safe diagnostics, and focused validation. Use for crashes, stale UI, indexing, search, watcher, native-module, or async failures.
---

# Ryte Bug Hunt

Find the smallest defensible root cause before changing behavior.

## Modes

- Triage: rank hypotheses from supplied evidence and identify the next safe observation.
- Trace: reproduce with an isolated user-data directory and synthetic notes when needed.
- Fix: make the narrow correction only when the user requested a fix.
- Review: verify a reported defect against current code and evidence.

## Workflow

1. Record expected behavior, actual behavior, environment, reproduction, and affected process boundary.
2. Trace main, preload, renderer, persistence, native-module, and watcher paths as applicable before editing.
3. Keep diagnostics temporary and privacy-safe: IDs, counts, phases, and error codes only—never note bodies, queries, credentials, or provider responses.
4. Reproduce against synthetic fixtures or an isolated profile; never point a diagnostic at the user's notes folder without explicit approval.
5. Add or reuse the smallest regression signal, retest the original reproduction, and remove temporary diagnostics.

## Output

Report reproduction, evidence, root cause or uncertainty, fix, validation, and residual risk.
