// Fills the site's version and download links at build time (RYT-60).
//
// site/*.html carry two placeholders where the current release shows up:
//   {{version}}       0.2.0
//   {{download-url}}  https://github.com/hellohynes/ryte/releases/download/v0.2.0/ryte-0.2.0-arm64.dmg
// The release entries (the homepage "New in" section, the releases page) stay hand-written.
//
// The version is the latest published GitHub release, not app/package.json: the release pull request bumps
// package.json before the tag exists, and the site must never link to a download that does not exist yet.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO = 'hellohynes/ryte'
export const PLACEHOLDERS = ['version', 'download-url']

const SEMVER = /^\d+\.\d+\.\d+$/

export const dmgName = (version) => `ryte-${version}-arm64.dmg`
export const downloadUrl = (version) => `https://github.com/${REPO}/releases/download/v${version}/${dmgName(version)}`

/** Replaces every placeholder, and fails if one is unknown or left over. */
export function fillRelease(html, version) {
  if (!SEMVER.test(version)) throw new Error(`"${version}" is not a plain x.y.z version.`)
  const values = { version, 'download-url': downloadUrl(version) }
  const filled = html.replace(/\{\{([a-z-]+)\}\}/g, (match, name) => {
    if (!(name in values)) throw new Error(`Unknown site placeholder ${match}.`)
    return values[name]
  })
  if (filled.includes('{{')) throw new Error('A site placeholder is malformed (found "{{" after filling).')
  return filled
}

/** The version in a GitHub "latest release" response, only if its DMG is attached. */
export function versionFromRelease(release) {
  const tag = String(release?.tag_name ?? '')
  const version = tag.replace(/^v/, '')
  if (!SEMVER.test(version)) throw new Error(`The latest release tag "${tag}" is not vX.Y.Z.`)
  if (release.draft || release.prerelease) throw new Error(`The latest release ${tag} is a draft or prerelease.`)
  const assets = (release.assets ?? []).map((asset) => asset.name)
  if (!assets.includes(dmgName(version))) {
    throw new Error(`The latest release ${tag} has no ${dmgName(version)} attached, so the site would link to nothing.`)
  }
  return version
}

/**
 * The version the site should show. RYTE_SITE_VERSION overrides the lookup (offline builds, tests); it
 * skips the check that the download exists, so use it only for a version you know is published.
 */
export async function siteVersion(env = process.env, fetchImpl = fetch) {
  if (env.RYTE_SITE_VERSION) {
    if (!SEMVER.test(env.RYTE_SITE_VERSION)) throw new Error('RYTE_SITE_VERSION must be a plain x.y.z version.')
    return env.RYTE_SITE_VERSION
  }
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'ryte-site-build' }
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`
  let reply
  try {
    reply = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers,
      signal: AbortSignal.timeout(15_000)
    })
  } catch (error) {
    throw new Error(`Could not reach GitHub for the latest release (${error.message}). Set RYTE_SITE_VERSION=x.y.z to build offline.`)
  }
  if (!reply.ok) {
    throw new Error(`GitHub answered ${reply.status} for the latest release. Set RYTE_SITE_VERSION=x.y.z to build offline.`)
  }
  return versionFromRelease(await reply.json())
}

/** The version in app/package.json, for the preview server only (it may not be published yet). */
export function packageVersion() {
  const file = resolve(dirname(fileURLToPath(import.meta.url)), '../app/package.json')
  return JSON.parse(readFileSync(file, 'utf8')).version
}
