/**
 * Conventional Commits policy for Ryte PR titles and commit messages:
 *
 *   type(scope): description      work in one part of Ryte
 *   type(scope, scope): ...       work spanning several parts
 *   type(scope)!: description     a breaking change (pre-1.0 SemVer: bump the minor version)
 *   type: description             accepted; a scope is clearer
 *
 * Modelled on the design repo's .github/scripts/pr-title.mjs, without its Jira segment.
 * PRs are squash-merged with the PR title as the commit on main, so the title is what lands
 * in history; individual commits follow the same header rules.
 *
 * Plain JS with no dependencies: the commit-msg hook runs it directly and
 * .github/workflows/conventional-commits.yml imports it without an install step.
 * docs/branch-workflow.md documents the same rules; its test keeps the two in sync.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const COMMIT_TYPES = [
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "build",
  "chore",
  "ci",
  "docs",
  "style",
  "test",
];

// Add a scope here (and to docs/branch-workflow.md) when a slice introduces a new area.
export const COMMIT_SCOPES = [
  "app",
  "main",
  "renderer",
  "preload",
  "stencil",
  "search",
  "indexer",
  "site",
  "release",
  "agents",
  "deps",
  "repo",
];

export const MAX_HEADER_LENGTH = 100;

export const EXAMPLES = [
  "feat(search): add citation landing",
  "fix(main, renderer): keep the watcher alive after sleep",
  "feat(preload)!: replace the settings ipc contract",
  "chore(repo): adopt conventional commits",
];

const HEADER_RE = /^([A-Za-z]+)(?:\(([^)]*)\))?(!)?:(.*)$/s;
// Messages git or GitHub write themselves; they are not held to the header rules.
const GENERATED_RE = /^(?:Merge |Revert "|(?:fixup|squash|amend)! )/;
const SCISSORS_RE = /^# -+ >8 -+$/;

/**
 * @param {string} header
 * @returns {{ valid: boolean, errors: string[], suggestion: string | null }}
 */
export function validateHeader(header) {
  const errors = collectErrors(header);
  if (errors.length === 0) return { valid: true, errors, suggestion: null };
  return { valid: false, errors, suggestion: suggestHeader(header) };
}

/**
 * Validates a full commit message: git comment lines are ignored, generated messages
 * (merges, reverts, fixup!/squash!) are exempt, and a body needs a blank line before it.
 *
 * @param {string} message
 * @returns {{ valid: boolean, errors: string[], suggestion: string | null }}
 */
export function validateCommitMessage(message) {
  const lines = messageLines(message);
  if (lines.length === 0) {
    return {
      valid: false,
      errors: ["Write a commit message."],
      suggestion: null,
    };
  }

  const [header, second] = lines;
  if (GENERATED_RE.test(header))
    return { valid: true, errors: [], suggestion: null };

  const result = validateHeader(header);
  const errors = [...result.errors];
  if (second !== undefined && second.trim() !== "") {
    errors.push("Leave a blank line between the header and the body.");
  }
  return { valid: errors.length === 0, errors, suggestion: result.suggestion };
}

/** The header (first line) of a commit message, after git's comment handling. */
export function commitHeader(message) {
  return messageLines(message)[0] ?? "";
}

/** Markdown for the terminal, the commit-msg hook, and the CI job summary. */
export function buildFailureMessage(
  header,
  { errors, suggestion },
  label = "Commit message",
) {
  const lines = [
    `❌ **${label} doesn't follow Conventional Commits**`,
    "",
    `**Current:** ${codeSpan(header)}`,
    "",
    "**Problems:**",
    ...errors.map((error) => `- ${error}`),
  ];
  if (suggestion) lines.push("", `**Suggested:** ${codeSpan(suggestion)}`);
  lines.push(
    "",
    "**Format:** `type(scope): description`, with `!` before the colon for a breaking change",
    "",
    `- Types: ${COMMIT_TYPES.map((type) => `\`${type}\``).join(", ")}`,
    `- Scopes (optional, comma-separated): ${COMMIT_SCOPES.map((scope) => `\`${scope}\``).join(", ")}`,
    `- The description starts lowercase and doesn't end with a period; the header is at most ${MAX_HEADER_LENGTH} characters`,
    "",
    "**Examples:**",
    ...EXAMPLES.map((example) => `- \`${example}\``),
    "",
    "See docs/branch-workflow.md.",
  );
  return lines.join("\n");
}

// Markdown code span that survives backticks in untrusted text: the delimiter is one
// backtick longer than the longest run inside, padded with spaces when needed.
function codeSpan(text) {
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length),
  );
  if (longest === 0) return `\`${text}\``;
  const fence = "`".repeat(longest + 1);
  return `${fence} ${text} ${fence}`;
}

function collectErrors(header) {
  const match = HEADER_RE.exec(header);
  if (!match) {
    return [
      "Write the header as `type(scope): description` or `type: description`.",
    ];
  }

  const [, type, scope, , rest] = match;
  const errors = [];

  if (header.length > MAX_HEADER_LENGTH) {
    errors.push(
      `Keep the header to ${MAX_HEADER_LENGTH} characters or fewer (currently ${header.length}).`,
    );
  }

  if (type === "bug") {
    errors.push("Use `fix`, not `bug`.");
  } else if (!COMMIT_TYPES.includes(type)) {
    errors.push(
      `Unknown type \`${type}\`. Use one of: ${COMMIT_TYPES.map((t) => `\`${t}\``).join(", ")}.`,
    );
  }

  if (scope !== undefined) errors.push(...scopeErrors(scope));

  if (!rest.startsWith(" ") || rest.startsWith("  ")) {
    errors.push("Put exactly one space after the colon.");
  }

  const description = rest.trim();
  if (description === "") {
    errors.push("Add a description after the colon.");
  } else {
    if (!/^[a-z]/.test(description))
      errors.push("Start the description with a lowercase letter.");
    if (description.endsWith("."))
      errors.push("Don't end the header with a period.");
  }

  return errors;
}

function scopeErrors(scope) {
  const parts = scope.split(",").map((part) => part.trim());
  if (parts.some((part) => part === "")) {
    return ["Write a scope between the parentheses, or leave them out."];
  }
  const unknown = parts.filter((part) => !COMMIT_SCOPES.includes(part));
  if (unknown.length > 0) {
    const noun = unknown.length === 1 ? "scope" : "scopes";
    return [
      `Unknown ${noun} ${unknown.map((part) => `\`${part}\``).join(", ")}. Use ${COMMIT_SCOPES.map((s) => `\`${s}\``).join(", ")}, or add the new scope to scripts/conventional-commits.mjs and docs/branch-workflow.md.`,
    ];
  }
  if (new Set(parts).size !== parts.length) return ["List each scope once."];
  return [];
}

// Repairs mechanical mistakes (bug type, spacing, capitalized first word, trailing period)
// and offers the result only when it passes.
function suggestHeader(header) {
  const match = HEADER_RE.exec(header.trim());
  if (!match) return null;

  let [, type, scope, bang, rest] = match;
  if (type === "bug") type = "fix";
  let description = rest.trim().replace(/\.+$/, "");
  if (/^[A-Z][a-z]/.test(description)) {
    description = description[0].toLowerCase() + description.slice(1);
  }

  const suggestion = `${type}${scope !== undefined ? `(${scope})` : ""}${bang ?? ""}: ${description}`;
  return suggestion !== header && collectErrors(suggestion).length === 0
    ? suggestion
    : null;
}

function messageLines(message) {
  const lines = [];
  for (const line of message.split(/\r?\n/)) {
    if (SCISSORS_RE.test(line)) break;
    if (!line.startsWith("#")) lines.push(line);
  }
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines;
}

function report(header, result, label) {
  if (result.valid) return 0;
  console.error(buildFailureMessage(header, result, label));
  return 1;
}

export function main(argv) {
  const [mode, value] = argv;
  if (mode === "--title" && value !== undefined) {
    return report(value, validateHeader(value), "PR title");
  }
  if (mode === "--commit-msg-file" && value) {
    const message = readFileSync(value, "utf8");
    return report(
      commitHeader(message),
      validateCommitMessage(message),
      "Commit message",
    );
  }
  console.error(
    "Usage: node scripts/conventional-commits.mjs --title <title> | --commit-msg-file <path>",
  );
  return 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv.slice(2));
}
