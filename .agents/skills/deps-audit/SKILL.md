---
name: deps-audit
description: Audit Ryte dependency health with scoped security, update, native-module, and package-size evidence. Use before dependency upgrades, release readiness checks, or when investigating dependency risk.
---

# Ryte Dependency Audit

Check the requested dependency risk without converting a report into an upgrade project.

## Modes

- `security`: vulnerability evidence only.
- `updates`: available versions and migration risk only.
- `native`: Electron, ABI, packaging, and optional-platform dependency evidence.
- `size`: production bundle/package evidence.
- `all`: run the relevant combination and keep findings grouped by risk.

## Workflow

1. Resolve the requested scope and package manifest/lockfile ownership. Do not change lockfiles, install dependencies, or upgrade packages in report mode.
2. Use the package manager's scoped audit or outdated command only when network access and the requested scope warrant it. Treat unreachable registries as unverified, not clean.
3. For native scope, inspect Electron version, native module rebuild path, `asarUnpack`, platform optional dependencies, and the packaged artifact rather than relying on development imports.
4. For size scope, compare produced artifacts or measured bundle output. Do not claim a benefit without a baseline.
5. Separate actionable security/release blockers from deferred maintenance and recommend the smallest validation after any approved change.

## Output

Report scope, commands/evidence, direct dependencies affected, severity, compatibility or release risk, and a focused follow-up. Do not expose credentials or private note paths.
