// Prints the CHANGELOG section for one version: the lines under `## <version>` up to the
// next `## ` heading, without the heading itself. Only the exact heading matches, so
// `## 0.3.0 (earlier numbering)` is not the section for 0.3.0.
//
// Usage: node scripts/changelog-section.mjs <version> [path-to-changelog]
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function changelogSection(markdown, version) {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trimEnd() === `## ${version}`)
  if (start === -1) return null
  let end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  if (end === -1) end = lines.length
  return lines.slice(start + 1, end).join('\n').trim()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, changelogPath = fileURLToPath(new URL('../CHANGELOG.md', import.meta.url))] =
    process.argv.slice(2)
  if (!version) {
    console.error('Usage: node scripts/changelog-section.mjs <version> [path-to-changelog]')
    process.exit(2)
  }
  const section = changelogSection(readFileSync(changelogPath, 'utf8'), version)
  if (!section) {
    console.error(`CHANGELOG has no section "## ${version}", or it is empty.`)
    process.exit(1)
  }
  console.log(section)
}
