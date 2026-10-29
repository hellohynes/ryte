import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalSkillsRoot = resolve(repositoryRoot, ".agents/skills");
const claudeSkillsRoot = resolve(repositoryRoot, ".claude/skills");
const manifestPath = resolve(claudeSkillsRoot, ".pilot-sync-manifest.json");
const failures = [];
const whenToUse =
  /\b(?:use|used|run|invoke|activate)s?\b[^.]*\b(?:when|whenever|for|before|after|during|while)\b/i;

function frontmatterValue(source, key) {
  return source
    .match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]
    ?.replace(/^['"]|['"]$/g, "");
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return files.flat();
}

const canonicalEntries = await readdir(canonicalSkillsRoot, {
  withFileTypes: true,
});
const canonicalNames = canonicalEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const claudeEntries = await readdir(claudeSkillsRoot, { withFileTypes: true });
const claudeNames = claudeEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
for (const name of claudeNames) {
  if (!canonicalNames.includes(name)) {
    failures.push(`.claude/skills/${name} has no canonical .agents skill.`);
  }
}
for (const name of canonicalNames) {
  const canonicalPath = resolve(canonicalSkillsRoot, name, "SKILL.md");
  const canonicalSource = await readFile(canonicalPath, "utf8");
  if (frontmatterValue(canonicalSource, "name") !== name) {
    failures.push(
      `${relative(repositoryRoot, canonicalPath)} must declare name: ${name}.`,
    );
  }
  const description = frontmatterValue(canonicalSource, "description");
  if (!description || !whenToUse.test(description)) {
    failures.push(
      `${relative(repositoryRoot, canonicalPath)} must describe when the skill should be used.`,
    );
  }

  const canonicalSkillRoot = resolve(canonicalSkillsRoot, name);
  const claudeSkillRoot = resolve(claudeSkillsRoot, name);
  const canonicalFiles = (await listFiles(canonicalSkillRoot))
    .map((path) => relative(canonicalSkillRoot, path))
    .sort();
  const claudeFiles = (await listFiles(claudeSkillRoot).catch(() => []))
    .map((path) => relative(claudeSkillRoot, path))
    .sort();
  if (JSON.stringify(claudeFiles) !== JSON.stringify(canonicalFiles)) {
    failures.push(
      `.claude/skills/${name} must mirror every canonical .agents/skills/${name} support file.`,
    );
  }
  for (const skillFile of canonicalFiles) {
    const canonicalFile = resolve(canonicalSkillRoot, skillFile);
    const claudeFile = resolve(claudeSkillRoot, skillFile);
    const [canonicalContent, claudeContent] = await Promise.all([
      readFile(canonicalFile),
      readFile(claudeFile).catch(() => null),
    ]);
    if (!claudeContent || !canonicalContent.equals(claudeContent)) {
      failures.push(
        `${relative(repositoryRoot, claudeFile)} must match the canonical skill support file.`,
      );
    }
  }

  const canonicalMetadataPath = resolve(
    canonicalSkillsRoot,
    name,
    "agents/openai.yaml",
  );
  const canonicalMetadata = await readFile(canonicalMetadataPath, "utf8").catch(
    () => null,
  );
  if (
    !canonicalMetadata?.includes("display_name:") ||
    !canonicalMetadata.includes(`$${name}`)
  ) {
    failures.push(
      `${relative(repositoryRoot, canonicalMetadataPath)} must define matching skill metadata.`,
    );
  }
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const manifestFiles = (await listFiles(claudeSkillsRoot))
  .filter((path) => path !== manifestPath)
  .sort();
const expectedPaths = manifestFiles.map((path) =>
  relative(claudeSkillsRoot, path),
);
const actualPaths = Object.keys(manifest.files ?? {}).sort();
if (JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)) {
  failures.push(
    ".claude skill manifest paths are stale. Run pnpm sync:claude-skills.",
  );
}
for (const path of manifestFiles) {
  const key = relative(claudeSkillsRoot, path);
  const actualHash = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  if (manifest.files?.[key]?.sha256 !== actualHash) {
    failures.push(`${key} hash is stale. Run pnpm sync:claude-skills.`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Skill contracts passed: ${canonicalNames.length} canonical skills and Claude adapters.`,
);
