// Points this clone's git hooks at the tracked .githooks/ folder so the commit-msg hook
// checks Conventional Commits locally. Runs from `pnpm hooks:install` and app's `prepare`.
// Skips CI and never overrides a different core.hooksPath someone already configured.

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS_PATH = ".githooks";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function git(...args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function configuredHooksPath() {
  try {
    return git("config", "--local", "--get", "core.hooksPath");
  } catch {
    return ""; // unset: `git config --get` exits 1
  }
}

function main() {
  if (process.env.CI) {
    console.log("Skipping git hook install in CI.");
    return;
  }
  try {
    if (git("rev-parse", "--is-inside-work-tree") !== "true") return;
  } catch {
    console.log("Not a git work tree; skipping git hook install.");
    return;
  }

  const current = configuredHooksPath();
  if (current && current !== HOOKS_PATH) {
    console.warn(
      `core.hooksPath is already "${current}"; leaving it alone. Run the commit-msg check from ${HOOKS_PATH}/commit-msg there to enforce Conventional Commits.`,
    );
    return;
  }

  const hook = resolve(repositoryRoot, HOOKS_PATH, "commit-msg");
  if (existsSync(hook)) chmodSync(hook, 0o755);
  if (current !== HOOKS_PATH)
    git("config", "--local", "core.hooksPath", HOOKS_PATH);
  console.log(
    `Git hooks installed: core.hooksPath = ${HOOKS_PATH} (commit-msg checks Conventional Commits).`,
  );
}

main();
