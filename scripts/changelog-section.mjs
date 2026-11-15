// Prints the CHANGELOG section for one version: the lines under `## <version>` up to the
// next `## ` heading, without the heading itself. Only the exact heading matches, so
// `## 0.3.0 (earlier numbering)` is not the section for 0.3.0.
//
// With `--link-base <url>`, repo-relative links are rewritten to absolute ones. A release page
// resolves them under /releases/tag/, where they 404.
//
// Usage: node scripts/changelog-section.mjs <version> [path-to-changelog] [--link-base <url>]
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

// Only the target of an inline link `[text](target)` changes; a URL scheme, `#anchor` or
// root-relative `/path` target, and everything outside link targets, stays as written.
export function absoluteLinks(markdown, base) {
  return markdown.replace(/\]\(([^)\s]+)/g, (match, target) =>
    /^([a-z][a-z0-9+.-]*:|#|\/)/i.test(target) ? match : `](${base}${target}`
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const flag = args.indexOf('--link-base')
  const linkBase = flag === -1 ? null : (args.splice(flag, 2)[1] ?? '')
  const [version, changelogPath = fileURLToPath(new URL('../CHANGELOG.md', import.meta.url))] = args
  if (!version || linkBase === '') {
    console.error(
      'Usage: node scripts/changelog-section.mjs <version> [path-to-changelog] [--link-base <url>]'
    )
    process.exit(2)
  }
  const section = changelogSection(readFileSync(changelogPath, 'utf8'), version)
  if (!section) {
    console.error(`CHANGELOG has no section "## ${version}", or it is empty.`)
    process.exit(1)
  }
  console.log(linkBase ? absoluteLinks(section, linkBase) : section)
}
