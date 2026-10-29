import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalSkillsRoot = resolve(repositoryRoot, ".agents/skills");
const claudeSkillsRoot = resolve(repositoryRoot, ".claude/skills");
const manifestPath = resolve(claudeSkillsRoot, ".pilot-sync-manifest.json");

function frontmatterValue(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) throw new Error(`Missing ${key} frontmatter.`);
  return match[1].replace(/^['"]|['"]$/g, "");
}

async function listSkillNames() {
  const entries = await readdir(canonicalSkillsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
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

const skillNames = await listSkillNames();
for (const name of skillNames) {
  const canonicalSkillRoot = resolve(canonicalSkillsRoot, name);
  const canonicalPath = resolve(canonicalSkillRoot, "SKILL.md");
  const canonicalSource = await readFile(canonicalPath, "utf8");
  const declaredName = frontmatterValue(canonicalSource, "name");
  if (declaredName !== name)
    throw new Error(`${canonicalPath} declares ${declaredName}.`);

  const claudeSkillRoot = resolve(claudeSkillsRoot, name);
  await rm(claudeSkillRoot, { recursive: true, force: true });
  for (const sourcePath of await listFiles(canonicalSkillRoot)) {
    const targetPath = resolve(
      claudeSkillRoot,
      relative(canonicalSkillRoot, sourcePath),
    );
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, await readFile(sourcePath));
  }
}

const manifestFiles = (await listFiles(claudeSkillsRoot))
  .filter((path) => path !== manifestPath)
  .sort();
const files = {};
for (const path of manifestFiles) {
  const content = await readFile(path);
  files[relative(claudeSkillsRoot, path)] = {
    sha256: createHash("sha256").update(content).digest("hex"),
    executableMode: 0,
  };
}

await writeFile(
  manifestPath,
  `${JSON.stringify({ version: 1, files }, null, 2)}\n`,
);
