---
name: electron-ipc-contract
description: Define or change Ryte's typed Electron IPC contracts across main, preload, and renderer. Use for new channels, payload changes, events, subscriptions, cancellation, or IPC security fixes.
---

# Ryte Electron IPC Contract

Protect the main/preload/renderer trust boundary without adding generic IPC passthroughs.

## Contract

Before editing, record: channel, initiating renderer action, validated input, return or error shape,
window/event owner, cancellation or unsubscribe behavior, payload-size bound, and regression layer.

## Workflow

1. Trace the current path through shared types, IPC validation, main handler, preload API, and renderer caller.
2. Keep filesystem, SQLite, credentials, provider calls, and external links in main. Expose one narrow typed preload operation.
3. Validate untrusted renderer input at the main boundary. Return structured, actionable errors; do not leak paths, note content, or credentials.
4. For events or long-running work, identify the owning window, cleanup trigger, and cancellation path. Do not broadcast to unrelated windows.
5. Update the smallest focused test at the boundary that owns the contract, then exercise the renderer flow when practical.

## Output

Report the contract matrix, changed boundaries, validation, event lifecycle, and residual risk.
