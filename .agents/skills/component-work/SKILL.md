---
name: component-work
description: Build or refine Ryte Vue/Electron components with the established renderer, accessibility, IPC, and installed-app contracts. Use when creating, restructuring, or reviewing a user-facing component or interaction.
---

# Ryte Component Work

Build a focused UI change without weakening Ryte's renderer/main-process boundary.

## Workflow

1. Resolve the component, owning store, typed preload calls, and adjacent interaction tests before changing markup or styling.
2. Use `stencil-usage` for any renderer UI: reuse Stencil components and tokens before creating an abstraction. Keep filesystem, provider, credential, and OS work in the main process.
3. Keep user-facing state in the renderer; cross process only through a narrow typed preload API. Route a new or changed channel through `electron-ipc-contract`.
4. Check keyboard operation, focus entry and return, Escape behavior for overlays, accessible names, loading/error/empty states, density, and reduced motion when relevant.
5. Test the cheapest observable behavior, then inspect the changed state in the running Electron app when practical. Do not validate against real notes without explicit approval.

## Output

Report the component boundary, interaction evidence, tests, visual verification, and any deferred product decision.
