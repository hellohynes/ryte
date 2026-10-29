---
name: debug-trace
description: Diagnose a Ryte defect confined to one or two known functions with temporary, privacy-safe runtime instrumentation. Use when static tracing identifies a narrow suspect but runtime evidence is still needed.
---

# Ryte Debug Trace

Use short-lived diagnostics to decide between a small number of concrete runtime hypotheses.

## Workflow

1. Confirm the suspect functions and the expected versus actual behavior. Use `bug-hunt` for a broader or unknown execution path.
2. Add the smallest temporary diagnostic at the owning process boundary. Log phases, IDs, counts, durations, and error codes only—never note bodies, queries, credentials, paths outside synthetic fixtures, or provider output.
3. Reproduce with an isolated user-data directory or synthetic fixture. Ask the user to reproduce only when the defect cannot be safely simulated.
4. Remove diagnostics after the evidence distinguishes the hypothesis. Implement only the narrow correction requested, with focused regression coverage where practical.
5. Retest the original reproduction and report what the trace proved or left unknown.

## Output

Report the instrumented boundary, reproduction, evidence, correction or next observation, removed diagnostics, and validation.
