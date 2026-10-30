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
const INVENTORY_ROOTS = ['src/main/', 'src/preload/', 'src/shared/', 'src/contract/']
const REGISTRAR = 'src/main/contract/register.ts'
const BUILDER = 'src/preload/contract-api.ts'
const MANIFEST = 'src/contract/manifest.generated.ts'

const isSkipped = (path) =>
  /\.test\.ts$|\.fixture\.ts$|\.d\.ts$/.test(path) || path.startsWith('src/contract/fixtures/')

function parse(path, text) {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
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
    if (ts.isIdentifier(node) && IPC_NAMES.has(node.text)) {
      access.push({ kind: 'ipc', name: node.text, line: lineOf(sourceFile, node) })
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
  return blocks.map((block, index) => parse(`${path}#script${index}`, block[1]))
}

function resolveSpecifier(from, specifier) {
  return specifier.startsWith('.')
    ? posix.normalize(posix.join(posix.dirname(from), specifier))
    : null
}

const stripExtension = (path) => path.replace(/\.(ts|mts|js|mjs)$/, '')
const inContract = (path) => path === 'src/contract' || path.startsWith('src/contract/')

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
    const isTs = path.endsWith('.ts')
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
            : `${channel} is not in the contract or scripts/legacy.json; define it in src/contract/ (see docs/api-contract.md)`
        )
      }
    }

    // direct IPC access
    for (const hit of access) {
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
        `${hit.name} reaches IPC outside the registrar and preload builder; add an operation to src/contract/ instead`
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

  return violations
}

function readTree(root) {
  const files = {}
  const walk = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = resolve(directory, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(ts|vue)$/.test(name))
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
