const REQUIRED_MAJOR = 24

const major = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10)

if (major !== REQUIRED_MAJOR) {
  console.error(
    `Ryte requires Node ${REQUIRED_MAJOR}.x. Current version is ${process.version}. Switch Node versions and try again.`
  )
  process.exitCode = 1
} else {
  console.log(`Node version check passed: ${process.version}`)
}
