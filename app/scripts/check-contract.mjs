// Conformance check for the API contract. A skill can be ignored; a failing check can't.
// Usage: pnpm check:contract
//
// Every operation and event crossing main <-> preload lives in src/contract/. This guardrail stops the
// old hand-written pattern from creeping back. It is not a security boundary (the renderer is sandboxed
// and reaches IPC only through window.ryte); it catches authoring mistakes.
//
// Rules, over non-test TypeScript files (tests, *.fixture.ts and src/contract/fixtures/** are skipped):
//   inventory    every channel-shaped string literal (area:name) in src/main, src/preload, src/shared and
//                src/contract is a contract channel or a legacy.json channel; a contract channel appears
//                only under src/contract/; legacy.json holds no stale or overlapping entry.
//   ipc-access   the identifiers ipcMain / ipcRenderer, and .send / .sendSync / .sendToFrame /
//                .postMessage (also as element access or a destructured binding), appear only in the
//                legacy files and the registrar and builder.
//   imports      nothing under src/contract/ imports electron, and the generated manifest imports nothing;
//                src/contract/ is value-imported only from src/main/ and, for the manifest alone, the
//                preload builder; the renderer references neither ipcRenderer nor electron.
//   preload-area a contract area with no channel left in legacy.json has no entry in the hand-written
//                LegacyRyteApi interface or legacyApi object of src/preload/index.ts. The contract method wins
//                the merge, so a leftover entry would otherwise sit there unnoticed.
//
// The check is a pure function over a map of file paths to source text, so every counterexample is a test
// (check-contract.test.mjs).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const CHANNEL = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const IPC_NAMES = new Set(['ipcMain', 'ipcRenderer'])
const SEND_NAMES = new Set(['send', 'sendSync', 'sendToFrame', 'postMessage'])
// Calls whose channel argument must be a well-formed `area:name`, on a receiver that is IPC.
const CHANNEL_METHODS = new Set([
  'handle',
  'handleOnce',
  'on',
  'once',
  'off',
  'invoke',
  'send',
  'sendSync',
  'sendToFrame',
  'removeListener',
  'removeAllListeners',
  'removeHandler'
])
const CONTENTS_PROPERTIES = new Set(['webContents', 'sender'])
const INVENTORY_ROOTS = ['src/main/', 'src/preload/', 'src/shared/', 'src/contract/']
const REGISTRAR = 'src/main/contract/register.ts'
const BUILDER = 'src/preload/contract-api.ts'
const MANIFEST = 'src/contract/manifest.generated.ts'
const PRELOAD = 'src/preload/index.ts'

const isSkipped = (path) =>
  /\.test\.[cm]?[jt]sx?$|\.fixture\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/.test(path) ||
  path.startsWith('src/contract/fixtures/')

const SCRIPT_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/

function parse(path, text, kind) {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
}

function visit(node, callback) {
  callback(node)
  ts.forEachChild(node, (child) => visit(child, callback))
}

const lineOf = (sourceFile, node) =>
  sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1

function isTypeOnlyImport(node) {
  const clause = node.importClause
  if (!clause) return false
  if (clause.isTypeOnly) return true
  if (clause.name) return false
  const bindings = clause.namedBindings
  return (
    !!bindings &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  )
}

/** Module specifiers a file loads at runtime or as types, with the line of each. */
function moduleReferences(sourceFile) {
  const references = []
  visit(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      references.push({
        specifier: node.moduleSpecifier.text,
        type: isTypeOnlyImport(node),
        line: lineOf(sourceFile, node)
      })
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const allTypes =
        node.isTypeOnly ||
        (!!node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.length > 0 &&
          node.exportClause.elements.every((element) => element.isTypeOnly))
      references.push({
        specifier: node.moduleSpecifier.text,
        type: allTypes,
        line: lineOf(sourceFile, node)
      })
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      references.push({
        specifier: node.moduleReference.expression.text,
        type: false,
        line: lineOf(sourceFile, node)
      })
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const callee = node.expression
      if (
        callee.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(callee) && callee.text === 'require')
      ) {
        references.push({
          specifier: node.arguments[0].text,
          type: false,
          line: lineOf(sourceFile, node)
        })
      }
    }
  })
  return references
}

/** String literals shaped like a channel, identifiers and calls that reach IPC, with their lines. */
function scan(sourceFile) {
  const channels = []
  const access = []
  visit(sourceFile, (node) => {
    if (ts.isStringLiteralLike(node) && CHANNEL.test(node.text) && !node.text.startsWith('node:')) {
      channels.push({ channel: node.text, line: lineOf(sourceFile, node) })
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      const target = node.expression.expression
      // ipcMain, ipcRenderer and `.ipc` carry channels on every method. `webContents` and `sender` only on
      // the send methods: `webContents.on('will-navigate')` is an Electron event, not a channel.
      const onIpc =
        (ts.isIdentifier(target) && IPC_NAMES.has(target.text)) ||
        (ts.isPropertyAccessExpression(target) && target.name.text === 'ipc')
      const onContents =
        ts.isPropertyAccessExpression(target) && CONTENTS_PROPERTIES.has(target.name.text)
      if (
        (onIpc && CHANNEL_METHODS.has(method)) ||
        (onContents && ['send', 'sendSync', 'sendToFrame'].includes(method))
      ) {
        const argument = node.arguments[method === 'sendToFrame' ? 1 : 0]
        if (argument && ts.isStringLiteralLike(argument) && !CHANNEL.test(argument.text)) {
          access.push({ kind: 'malformed', name: argument.text, line: lineOf(sourceFile, node) })
        }
      }
      if ((ts.isIdentifier(target) && IPC_NAMES.has(target.text)) || SEND_NAMES.has(method)) {
        const channelArguments = node.arguments.slice(0, method === 'sendToFrame' ? 2 : 1)
        if (
          channelArguments.some(
            (argument) => ts.isBinaryExpression(argument) || ts.isTemplateExpression(argument)
          )
        ) {
          access.push({ kind: 'dynamic', name: method, line: lineOf(sourceFile, node) })
        }
      }
    }
    if (ts.isIdentifier(node) && IPC_NAMES.has(node.text)) {
      access.push({ kind: 'ipc', name: node.text, line: lineOf(sourceFile, node) })
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'ipc') {
      access.push({ kind: 'ipc', name: 'ipc', line: lineOf(sourceFile, node) })
    }
    if (ts.isPropertyAccessExpression(node) && SEND_NAMES.has(node.name.text)) {
      access.push({ kind: 'send', name: node.name.text, line: lineOf(sourceFile, node) })
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
      const name = node.argumentExpression.text
      if (IPC_NAMES.has(name)) access.push({ kind: 'ipc', name, line: lineOf(sourceFile, node) })
      if (SEND_NAMES.has(name)) access.push({ kind: 'send', name, line: lineOf(sourceFile, node) })
    }
    if (ts.isBindingElement(node)) {
      const bound = node.propertyName ?? node.name
      if (ts.isIdentifier(bound) && SEND_NAMES.has(bound.text)) {
        access.push({ kind: 'send', name: bound.text, line: lineOf(sourceFile, node) })
      }
    }
  })
  return { channels, access }
}

/** A renderer .vue file: parse the contents of its script blocks as TypeScript. */
function vueScripts(path, text) {
  const blocks = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  return blocks.map((block, index) => parse(`${path}#script${index}`, block[1], ts.ScriptKind.TS))
}

function resolveSpecifier(from, specifier) {
  return specifier.startsWith('.')
    ? posix.normalize(posix.join(posix.dirname(from), specifier))
    : null
}

const stripExtension = (path) => path.replace(/\.(ts|mts|js|mjs)$/, '')
const inContract = (path) => path === 'src/contract' || path.startsWith('src/contract/')

const propertyName = (member) =>
  member.name && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
    ? member.name.text
    : null

/** The top-level keys of the `manifest` object in the generated manifest: one per contract area. */
function manifestAreas(manifestSource) {
  const areas = []
  visit(parse(MANIFEST, manifestSource), (node) => {
    if (!ts.isVariableDeclaration(node) || node.name.getText() !== 'manifest' || !node.initializer)
      return
    let value = node.initializer
    while (ts.isAsExpression(value) || ts.isSatisfiesExpression(value)) value = value.expression
    if (!ts.isObjectLiteralExpression(value)) return
    for (const property of value.properties) {
      const name = propertyName(property)
      if (name) areas.push(name)
    }
  })
  return areas
}

/** The area keys of the hand-written preload API, from its interface and its object, with their lines. */
function legacyPreloadAreas(path, text) {
  const sourceFile = parse(path, text)
  const found = { interface: false, object: false, entries: [] }
  visit(sourceFile, (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'LegacyRyteApi') {
      found.interface = true
      for (const member of node.members) {
        const name = propertyName(member)
        if (name)
          found.entries.push({ name, line: lineOf(sourceFile, member), where: 'LegacyRyteApi' })
      }
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === 'legacyApi' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      found.object = true
      for (const property of node.initializer.properties) {
        const name = propertyName(property)
        if (name)
          found.entries.push({ name, line: lineOf(sourceFile, property), where: 'legacyApi' })
      }
    }
  })
  return found
}

/**
 * @param {{ files: Record<string, string>, legacy: object, manifestSource: string }} input
 * @returns {Array<{ rule: string, file: string, line: number, message: string }>}
 */
export function checkContract({ files, legacy, manifestSource }) {
  const violations = []
  const fail = (rule, file, line, message) => violations.push({ rule, file, line, message })

  const contractChannels = new Set(
    [...manifestSource.matchAll(/'([a-z][a-z0-9-]*:[a-z][a-z0-9-]*)'/g)].map((match) => match[1])
  )
  const legacyChannels = new Set([
    ...(legacy.channels?.request ?? []),
    ...(legacy.channels?.event ?? [])
  ])
  const ignored = new Set((legacy.ignore ?? []).map((entry) => entry.channel))
  const legacyFiles = new Set(legacy.files ?? [])
  const sendAllowed = new Set((legacy.sendAllowed ?? []).map((entry) => entry.file))
  const ipcAllowed = new Set([...legacyFiles, REGISTRAR, BUILDER])

  for (const channel of legacyChannels) {
    if (contractChannels.has(channel)) {
      fail(
        'inventory',
        'scripts/legacy.json',
        0,
        `${channel} is a contract channel and a legacy channel; delete the legacy entry`
      )
    }
  }

  const seenChannels = new Set()
  const filesWithAccess = new Set()

  for (const [path, text] of Object.entries(files)) {
    const isTs = SCRIPT_FILE.test(path)
    const isVue = path.endsWith('.vue')
    if (isSkipped(path) || (!isTs && !isVue)) continue

    // The renderer: no IPC access of its own, no electron, no value import of the contract.
    if (path.startsWith('src/renderer/')) {
      const sources = isVue ? vueScripts(path, text) : [parse(path, text)]
      for (const sourceFile of sources) {
        for (const hit of scan(sourceFile).access) {
          if (hit.kind === 'ipc') {
            fail(
              'renderer',
              path,
              hit.line,
              `the renderer must not reference ${hit.name}; call window.ryte`
            )
          }
        }
        for (const reference of moduleReferences(sourceFile)) {
          if (reference.specifier === 'electron') {
            fail('renderer', path, reference.line, 'the renderer must not import electron')
          }
          const resolved = resolveSpecifier(path, reference.specifier)
          if (resolved && inContract(stripExtension(resolved)) && !reference.type) {
            fail(
              'imports',
              path,
              reference.line,
              `the renderer must not value-import ${reference.specifier}; use import type`
            )
          }
        }
      }
      continue
    }

    if (!isTs || !INVENTORY_ROOTS.some((root) => path.startsWith(root))) continue
    const sourceFile = parse(path, text)
    const { channels, access } = scan(sourceFile)
    const references = moduleReferences(sourceFile)

    // inventory
    for (const { channel, line } of channels) {
      if (ignored.has(channel)) continue
      seenChannels.add(channel)
      if (contractChannels.has(channel)) {
        if (!inContract(path)) {
          fail(
            'inventory',
            path,
            line,
            `${channel} belongs to the contract; use the operation from src/contract/ instead of the string`
          )
        }
      } else if (!legacyChannels.has(channel)) {
        fail(
          'inventory',
          path,
          line,
          inContract(path)
            ? `${channel} is defined in src/contract/ but missing from the generated manifest; run \`pnpm contract:generate\``
            : `${channel} is not in the contract or scripts/legacy.json; define it in src/contract/ (see docs/api-contract.md). If it is not a channel at all (a DOM event or a cache key), add it to "ignore" in scripts/legacy.json with a reason`
        )
      }
    }

    // direct IPC access
    for (const hit of access) {
      if (hit.kind === 'malformed') {
        fail(
          'inventory',
          path,
          hit.line,
          `'${hit.name}' is not a valid channel name; use area:name, lowercase and hyphenated (for example files:read-source)`
        )
        continue
      }
      if (hit.kind === 'dynamic') {
        fail(
          'ipc-access',
          path,
          hit.line,
          `${hit.name} builds its channel with concatenation or a template; use a string literal or a contract operation`
        )
        continue
      }
      const allowed =
        hit.kind === 'ipc' ? ipcAllowed.has(path) : ipcAllowed.has(path) || sendAllowed.has(path)
      if (allowed) {
        if (legacyFiles.has(path)) filesWithAccess.add(path)
        continue
      }
      fail(
        'ipc-access',
        path,
        hit.line,
        `${hit.name} reaches IPC outside the registrar and preload builder; add an operation to src/contract/ instead` +
          (hit.kind === 'send'
            ? ' (if it is not IPC, for example a worker or a WebSocket, list the file in "sendAllowed" in scripts/legacy.json with a reason)'
            : '')
      )
    }

    // imports
    for (const reference of references) {
      if (inContract(path) && reference.specifier === 'electron') {
        fail(
          'imports',
          path,
          reference.line,
          'src/contract/ must not import electron (it stays transport-neutral)'
        )
      }
      if (path === MANIFEST) {
        fail('imports', path, reference.line, 'the generated manifest must import nothing')
      }
      const resolved = resolveSpecifier(path, reference.specifier)
      if (!resolved || inContract(path)) continue
      const target = stripExtension(resolved)
      if (!inContract(target) || reference.type) continue
      const fromMain = path.startsWith('src/main/')
      const manifestFromBuilder = path === BUILDER && target === stripExtension(MANIFEST)
      if (!fromMain && !manifestFromBuilder) {
        fail(
          'imports',
          path,
          reference.line,
          `only src/main/ and the preload builder (manifest only) may value-import src/contract/; use import type`
        )
      }
    }
  }

  for (const channel of legacyChannels) {
    if (!seenChannels.has(channel)) {
      fail(
        'inventory',
        'scripts/legacy.json',
        0,
        `${channel} no longer appears in the code; delete the stale legacy entry`
      )
    }
  }
  for (const entry of ignored) {
    if (
      !seenChannels.has(entry) &&
      ![...Object.values(files)].some((text) => text.includes(entry))
    ) {
      fail(
        'inventory',
        'scripts/legacy.json',
        0,
        `ignored channel ${entry} no longer appears in the code; delete the entry`
      )
    }
  }
  for (const file of legacyFiles) {
    if (!(file in files)) {
      fail(
        'ipc-access',
        'scripts/legacy.json',
        0,
        `${file} is listed as a legacy file but does not exist`
      )
    } else if (!filesWithAccess.has(file)) {
      fail(
        'ipc-access',
        'scripts/legacy.json',
        0,
        `${file} no longer reaches IPC; delete it from the legacy files`
      )
    }
  }
  for (const entry of legacy.sendAllowed ?? []) {
    if (!entry.reason)
      fail(
        'ipc-access',
        'scripts/legacy.json',
        0,
        `sendAllowed entry for ${entry.file} needs a reason`
      )
  }

  // preload-area: a fully migrated area has no hand-written preload entry left.
  const areasWithLegacyChannels = new Set(
    [...legacyChannels].map((channel) => channel.split(':')[0])
  )
  const migratedAreas = manifestAreas(manifestSource).filter(
    (area) => !areasWithLegacyChannels.has(area)
  )
  if (migratedAreas.length > 0 && PRELOAD in files) {
    const legacyPreload = legacyPreloadAreas(PRELOAD, files[PRELOAD])
    if (!legacyPreload.interface || !legacyPreload.object) {
      fail(
        'preload-area',
        PRELOAD,
        0,
        'cannot find both `interface LegacyRyteApi` and `const legacyApi = { ... }`; if they were renamed, update scripts/check-contract.mjs so stale preload entries are still caught'
      )
    }
    for (const { name, line, where } of legacyPreload.entries) {
      if (!migratedAreas.includes(name)) continue
      fail(
        'preload-area',
        PRELOAD,
        line,
        `${name} is fully in the contract (no ${name}: channel is left in scripts/legacy.json), so its hand-written entry in ${where} is stale; the contract method wins the merge and the old one only hides a mistake. Delete it`
      )
    }
  }

  return violations
}

function readTree(root) {
  const files = {}
  const walk = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = resolve(directory, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (SCRIPT_FILE.test(name) || name.endsWith('.vue'))
        files[relative(root, path).split('\\').join('/')] = readFileSync(path, 'utf8')
    }
  }
  walk(resolve(root, 'src'))
  return files
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const files = readTree(app)
  const legacy = JSON.parse(readFileSync(resolve(app, 'scripts/legacy.json'), 'utf8'))
  const violations = checkContract({ files, legacy, manifestSource: files[MANIFEST] ?? '' })
  if (violations.length > 0) {
    for (const v of violations)
      console.error(`${v.file}${v.line ? `:${v.line}` : ''}: [${v.rule}] ${v.message}`)
    console.error(`\n${violations.length} contract violation(s). See docs/api-contract.md.`)
    process.exitCode = 1
  } else {
    const total = new Set(Object.values(legacy.channels).flat()).size
    console.log(
      `Contract check passed: ${total} legacy channels, ${Object.keys(files).length} files scanned.`
    )
  }
}
