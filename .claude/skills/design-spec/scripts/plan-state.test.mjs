import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { planHash, validatePlanArtifact } from "./plan-state.mjs";

const identity = { repository: "/tmp/ryte", branch: "codex/design-spec-test" };

function plan() {
  const source = `---
design_spec: true
status: draft
created: 2026-10-22
updated: 2026-10-22
revision: 1
plan_hash: sha256:${"0".repeat(64)}
reviewed_hash: null
approved_hash: null
approval: null
repository: ${identity.repository}
branch: ${identity.branch}
---
# Search redesign

## Intent and sources

Improve local search.

## Goal truths

1. GT1 — Search has an observable local result.

## Constraints and non-goals

- Keep notes local.

## Current-system evidence

- Current search path inspected.

## Risks and decisions

- No open decisions.

## Vertical slices

### V1 — Search result

- Result: A visible local result.
- Dependencies: None.
- Paths: app/src/main/search.ts
- Status: planned
- Evidence contract: A synthetic search test rejects empty results.

## Plan review ledger

- Pending review.

## Slice evidence ledger

- Pending evidence.

## Goal verification

- Pending verification.

## Handoff

- Next action: review.
`;
  return source.replace(/^plan_hash: .*$/m, `plan_hash: ${planHash(source)}`);
}

describe("design-spec plan state", () => {
  test("hashes plan meaning while excluding lifecycle bookkeeping", () => {
    const original = plan();
    const updated = original
      .replace("status: draft", "status: approved")
      .replace("- Status: planned", "- Status: complete")
      .replace("- Pending evidence.", "- Result: pass.");
    assert.equal(planHash(original), planHash(updated));
  });

  test("binds the hash to repository and branch identity", () => {
    assert.notEqual(
      planHash(plan()),
      planHash(plan(), { ...identity, branch: "codex/other" }),
    );
  });

  test("validates a complete draft contract", () => {
    assert.deepEqual(validatePlanArtifact(plan()), { ok: true, errors: [] });
  });

  test("rejects stale meaning hashes and incomplete slice fields", () => {
    assert.match(
      validatePlanArtifact(
        plan().replace("Improve local search.", "Broaden local search."),
      ).errors.join(" "),
      /plan_hash/,
    );
    assert.match(
      validatePlanArtifact(
        plan().replace("- Evidence contract:", "- Check:"),
      ).errors.join(" "),
      /Evidence contract/,
    );
  });
});
