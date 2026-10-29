---
name: test-audit
description: Audit Ryte test value and coverage gaps without editing code or tests. Use when deciding whether cases are redundant, missing, too brittle, or placed at the wrong observable layer.
---

# Ryte Test Audit

Produce evidence-backed test posture findings without turning structural heuristics into cleanup work.

## Workflow

1. Resolve the selected feature, changed scope, or explicit suite; inspect configured Vitest entry points and existing test ownership.
2. Group tests by observable contract and material equivalence class across main, preload, renderer/store, and synthetic-indexer layers.
3. Classify a case as Keep, Improve, Consolidate candidate, or Remove candidate. A removal requires a named surviving test and a concrete counterfactual; uncertainty means retain it.
4. Identify missing contracts separately from desired test-count expansion. Prefer the cheapest stable layer and synthetic fixtures.
5. Return a report-only handoff. Route a focused new test to `test-create`; route broader changes to planning.

## Boundaries

Do not edit tests or source, create branches or commits, open PRs, or inspect real notes while auditing.

## Output

Report scope, contract inventory, decisions with evidence, coverage gaps, uncertainty, and the smallest next slice.
