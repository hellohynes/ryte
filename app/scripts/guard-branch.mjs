import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const BLOCKED_BRANCHES = new Set(['main', 'master'])

export function assertAllowedBranch(branch) {
  const normalized = branch.trim()
  if (!normalized) {
    throw new Error('Unable to determine current git branch. Refusing to continue.')
  }
  if (BLOCKED_BRANCHES.has(normalized)) {
    throw new Error(
      `Refusing to run on ${normalized}. Create a feature branch before editing or committing.`
    )
  }
}

export function currentBranch() {
  return execFileSync('git', ['branch', '--show-current'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

function main() {
  try {
    const branch = currentBranch()
    assertAllowedBranch(branch)
    console.log(`Branch guard passed on ${branch}.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
