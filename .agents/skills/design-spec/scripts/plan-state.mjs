#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STATUSES = ["draft", "approved", "implemented", "verified"];

const REQUIRED_FIELDS = [
  "design_spec",
  "status",
  "created",
  "updated",
  "revision",
  "plan_hash",
  "reviewed_hash",
  "approved_hash",
  "approval",
  "repository",
  "branch",
];
const REQUIRED_SECTIONS = [
  "Intent and sources",
  "Goal truths",
  "Constraints and non-goals",
  "Current-system evidence",
  "Risks and decisions",
  "Vertical slices",
  "Plan review ledger",
  "Slice evidence ledger",
  "Goal verification",
  "Handoff",
];
const BOOKKEEPING_SECTIONS = new Set([
  "plan review ledger",
  "slice evidence ledger",
  "goal verification",
  "handoff",
]);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/i;

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { values: {}, body: markdown, found: false };

  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (field) values[field[1].toLowerCase()] = field[2].trim();
  }
  return { values, body: markdown.slice(match[0].length), found: true };
}

export function normalizedPlanMeaning(markdown) {
  const body = parseFrontmatter(markdown).body.replace(/\r\n/g, "\n");
  const kept = [];
  let omit = false;
  let inSlice = false;
  for (const line of body.split("\n")) {
    const section = line
      .match(/^##\s+(.+?)\s*#*\s*$/)?.[1]
      ?.trim()
      .toLowerCase();
    if (section) {
      omit = BOOKKEEPING_SECTIONS.has(section);
      inSlice = section === "vertical slices";
    } else if (/^###\s+\S/u.test(line)) {
      inSlice = true;
    }
    if (!omit && !(inSlice && /^- Status:\s*/u.test(line))) kept.push(line);
  }
  return `${kept
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .trimEnd()}\n`;
}

export function planHash(markdown, identity = {}) {
  const values = parseFrontmatter(markdown).values;
  const repository = identity.repository ?? values.repository;
  const branch = identity.branch ?? values.branch;
  if (!repository || !branch)
    throw new Error("Plan repository and branch identity are required");
  const meaning = `repository:${repository}\nbranch:${branch}\n\n${normalizedPlanMeaning(markdown)}`;
  return `sha256:${createHash("sha256").update(meaning).digest("hex")}`;
}

function sectionExists(body, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^##\\s+${escaped}[ \\t]*$`, "im").test(body);
}

function slices(body) {
  const section =
    body.match(
      /^##\s+Vertical slices\s*$([\s\S]*?)(?=^##\s+|$(?![\s\S]))/im,
    )?.[1] ?? "";
  return section
    .split(/^###\s+/m)
    .slice(1)
    .map((entry) => {
      const [heading, ...lines] = entry.split("\n");
      return {
        id: heading.match(/^(V\d+)\b/i)?.[1]?.toUpperCase() ?? "",
        body: lines.join("\n"),
      };
    });
}

export function validatePlanArtifact(markdown) {
  const errors = [];
  if (typeof markdown !== "string" || !markdown.trim())
    return { ok: false, errors: ["plan is empty"] };

  const { values, body, found } = parseFrontmatter(markdown);
  if (!found) errors.push("YAML frontmatter is required");
  for (const field of REQUIRED_FIELDS) {
    if (!(field in values))
      errors.push(`frontmatter field is missing: ${field}`);
  }
  if (values.design_spec !== "true") errors.push("design_spec must be true");
  if (!STATUSES.includes(values.status))
    errors.push("status must be a known lifecycle status");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.created ?? ""))
    errors.push("created must use YYYY-MM-DD");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.updated ?? ""))
    errors.push("updated must use YYYY-MM-DD");
  if (!/^[1-9]\d*$/.test(values.revision ?? ""))
    errors.push("revision must be a positive integer");
  if (!isAbsolute(values.repository ?? ""))
    errors.push("repository must be an absolute path");
  if (!values.branch) errors.push("branch is required");
  if (!HASH_PATTERN.test(values.plan_hash ?? ""))
    errors.push("plan_hash must be a full sha256 digest");
  for (const field of ["reviewed_hash", "approved_hash"]) {
    if (
      values[field] &&
      values[field] !== "null" &&
      !HASH_PATTERN.test(values[field])
    ) {
      errors.push(`${field} must be null or a full sha256 digest`);
    }
  }

  if (!/^#\s+\S.+$/m.test(body)) errors.push("plan title is required");
  for (const section of REQUIRED_SECTIONS) {
    if (!sectionExists(body, section))
      errors.push(`required section is missing: ${section}`);
  }
  if (!/^\d+\.\s+GT\d+\b/im.test(body))
    errors.push("Goal truths must include a numbered GT identifier");

  const verticalSlices = slices(body);
  if (verticalSlices.length === 0)
    errors.push("Vertical slices must include at least one V# heading");
  for (const slice of verticalSlices) {
    if (!slice.id) errors.push("Vertical slice headings must begin with V#");
    for (const field of [
      "Result",
      "Dependencies",
      "Paths",
      "Evidence contract",
    ]) {
      if (!new RegExp(`^- ${field}:`, "im").test(slice.body)) {
        errors.push(`${slice.id || "Vertical slice"} is missing ${field}`);
      }
    }
    if ((slice.body.match(/^- Status:/gm) ?? []).length !== 1) {
      errors.push(
        `${slice.id || "Vertical slice"} must have exactly one - Status field`,
      );
    }
  }

  if (
    HASH_PATTERN.test(values.plan_hash ?? "") &&
    values.repository &&
    values.branch
  ) {
    if (values.plan_hash !== planHash(markdown))
      errors.push("plan_hash does not match current plan meaning");
  }
  return { ok: errors.length === 0, errors };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, file] = process.argv.slice(2);
  if (!["hash", "validate"].includes(command) || !file) {
    process.stderr.write("Usage: plan-state.mjs <hash|validate> <plan.md>\n");
    process.exitCode = 1;
  } else {
    const markdown = readFileSync(file, "utf8");
    if (command === "hash") process.stdout.write(`${planHash(markdown)}\n`);
    else {
      const result = validatePlanArtifact(markdown);
      if (result.ok) process.stdout.write("valid\n");
      else {
        process.stderr.write(`${result.errors.join("\n")}\n`);
        process.exitCode = 1;
      }
    }
  }
}
