import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  COMMIT_SCOPES,
  COMMIT_TYPES,
  MAX_HEADER_LENGTH,
  buildFailureMessage,
  validateCommitMessage,
  validateHeader,
} from "./conventional-commits.mjs";

const scriptPath = fileURLToPath(
  new URL("./conventional-commits.mjs", import.meta.url),
);
const repositoryRoot = resolve(dirname(scriptPath), "..");

describe("validateHeader", () => {
  for (const header of [
    "feat(search): add citation landing",
    "fix: stop the indexer from skipping renamed files",
    "chore(repo): adopt conventional commits",
    "feat(main, renderer)!: replace the settings ipc contract",
    "ci(repo): pin workflow actions to commit SHAs",
    "docs(site): explain the unsigned first launch",
    "feat(search): add MCP search_notes tool",
    "feat(stencil): add the dialog primitive",
    "refactor(stencil, renderer): move the preferences shell onto StDialog",
  ]) {
    it(`accepts ${JSON.stringify(header)}`, () => {
      assert.deepEqual(validateHeader(header), {
        valid: true,
        errors: [],
        suggestion: null,
      });
    });
  }

  it("rejects a header without a type", () => {
    const result = validateHeader(
      "Add the 0.5.0 download and homepage release notes",
    );
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /type\(scope\): description/);
  });

  it("rejects the old [codex] title style", () => {
    assert.equal(
      validateHeader("[codex] Phase 2 local search UX").valid,
      false,
    );
  });

  it("rejects an unknown type and lists the allowed ones", () => {
    const result = validateHeader("feature: add board view");
    assert.equal(result.valid, false);
    assert.match(result.errors[0], /Unknown type `feature`/);
    assert.match(result.errors[0], /`feat`/);
  });

  it("rejects bug and suggests fix", () => {
    const result = validateHeader("bug(indexer): stop skipping renamed files");
    assert.equal(result.valid, false);
    assert.equal(
      result.suggestion,
      "fix(indexer): stop skipping renamed files",
    );
  });

  it("rejects an unknown scope", () => {
    const result = validateHeader("feat(board): add columns");
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /Unknown scope `board`/);
  });

  it("rejects an empty or duplicated scope", () => {
    assert.equal(validateHeader("feat(): add columns").valid, false);
    assert.equal(
      validateHeader("feat(search, search): add filters").valid,
      false,
    );
  });

  it("requires exactly one space after the colon", () => {
    assert.equal(validateHeader("feat:add filters").valid, false);
    assert.equal(validateHeader("feat:  add filters").valid, false);
  });

  it("requires a lowercase description without a trailing period", () => {
    const upper = validateHeader("feat(search): Add filters");
    assert.equal(upper.valid, false);
    assert.equal(upper.suggestion, "feat(search): add filters");

    const period = validateHeader("feat(search): add filters.");
    assert.equal(period.valid, false);
    assert.equal(period.suggestion, "feat(search): add filters");
  });

  it("rejects an empty description", () => {
    assert.equal(validateHeader("feat(search): ").valid, false);
  });

  it(`limits the header to ${MAX_HEADER_LENGTH} characters`, () => {
    const header = `feat(search): ${"a".repeat(MAX_HEADER_LENGTH)}`;
    const result = validateHeader(header);
    assert.equal(result.valid, false);
    assert.match(
      result.errors.join("\n"),
      new RegExp(`${MAX_HEADER_LENGTH} characters`),
    );
  });
});

describe("validateCommitMessage", () => {
  it("accepts a header with a body separated by a blank line", () => {
    const message =
      "feat(search): add filters\n\nScope results by workstream and date.\n";
    assert.equal(validateCommitMessage(message).valid, true);
  });

  it("requires a blank line between the header and the body", () => {
    const result = validateCommitMessage(
      "feat(search): add filters\nScope results.\n",
    );
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /blank line/);
  });

  it("ignores git comment lines", () => {
    const message =
      "fix(main): close the watcher\n# Please enter the commit message\n";
    assert.equal(validateCommitMessage(message).valid, true);
  });

  for (const message of [
    "Merge branch 'main' into feat/board",
    'Revert "feat(search): add filters"',
    "fixup! feat(search): add filters",
    "squash! feat(search): add filters",
  ]) {
    it(`exempts the generated message ${JSON.stringify(message)}`, () => {
      assert.equal(validateCommitMessage(message).valid, true);
    });
  }

  it("rejects an empty message", () => {
    assert.equal(validateCommitMessage("# only a comment\n\n").valid, false);
  });

  it("validates the header with the same rules as PR titles", () => {
    assert.equal(validateCommitMessage("Update stuff").valid, false);
  });
});

describe("buildFailureMessage", () => {
  it("names the problems, the suggestion, and the allowed types and scopes", () => {
    const header = "bug(indexer): stop skipping renamed files";
    const message = buildFailureMessage(
      header,
      validateHeader(header),
      "PR title",
    );
    assert.match(message, /PR title/);
    assert.match(message, /fix\(indexer\): stop skipping renamed files/);
    for (const type of COMMIT_TYPES) assert.ok(message.includes(`\`${type}\``));
    for (const scope of COMMIT_SCOPES)
      assert.ok(message.includes(`\`${scope}\``));
  });

  it("keeps a header that contains backticks intact in its code span", () => {
    const header = "update `renderer.ts` and ``x``";
    const message = buildFailureMessage(
      header,
      validateHeader(header),
      "Commit message",
    );
    assert.ok(message.includes(`\`\`\` ${header} \`\`\``));
  });
});

describe("command line", () => {
  const run = (...args) =>
    spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });

  it("exits 0 for a valid title and 1 for an invalid one", () => {
    assert.equal(
      run("--title", "chore(repo): adopt conventional commits").status,
      0,
    );
    const failed = run("--title", "Adopt conventional commits");
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /type\(scope\): description/);
  });

  it("validates a commit message file, as the commit-msg hook does", () => {
    const directory = mkdtempSync(join(tmpdir(), "ryte-commit-msg-"));
    const good = join(directory, "good");
    const bad = join(directory, "bad");
    writeFileSync(good, "fix(main): close the watcher\n");
    writeFileSync(bad, "close the watcher\n");
    assert.equal(run("--commit-msg-file", good).status, 0);
    assert.equal(run("--commit-msg-file", bad).status, 1);
  });

  it("exits 2 when called without a mode", () => {
    assert.equal(run().status, 2);
  });
});

describe("documentation", () => {
  it("lists every type and scope the validator accepts", () => {
    const doc = readFileSync(
      join(repositoryRoot, "docs/branch-workflow.md"),
      "utf8",
    );
    for (const type of COMMIT_TYPES)
      assert.ok(doc.includes(`\`${type}\``), `missing type ${type}`);
    for (const scope of COMMIT_SCOPES) {
      assert.ok(doc.includes(`\`${scope}\``), `missing scope ${scope}`);
    }
  });
});
