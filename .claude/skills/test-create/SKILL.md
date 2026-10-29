---
name: test-create
description: Add or improve Ryte regression tests at the cheapest observable main, preload, renderer, store, or synthetic-indexer layer. Use for new feature contracts, reproduced defects, or explicit coverage requests.
---

# Ryte Test Create

Protect observable behavior without duplicating implementation details.

## Workflow

1. State the user-visible contract, material regression, credible recurrence, existing coverage, and independent oracle. Keep an existing test unless a named counterfactual shows that it is redundant or unstable.
2. Select one primary layer: main service, IPC validation, preload boundary, Pinia or renderer behavior, synthetic indexer smoke, or packaged launch.
3. Reuse the suite that already owns the contract when possible. Add a new file only when ownership is genuinely absent.
4. Add another case or layer only for a distinct material failure that the first signal cannot observe.
5. Run the focused command, then report coverage retained, adjacent gaps, and broader validation separately. Route broad suite pruning or coverage posture questions to `test-audit` rather than adding speculative cases.

## Rules

Use synthetic notes and isolated profiles. Do not encode real note text, credentials, or provider output in tests.
