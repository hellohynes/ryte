// Writes src/renderer/src/stencil/manifest.json: every Stencil component's props, emits, slots, and
// keyboard contracts, read from the code. Agents look the API up here instead of guessing it.
// Usage: pnpm stencil:manifest           write the file
//        pnpm stencil:manifest --check   exit 1 when the committed file is out of date
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const stencilDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/renderer/src/stencil')
const manifestPath = resolve(stencilDir, 'manifest.json')
const rel = (path: string): string => relative(stencilDir, path)

interface PropInfo {
  name: string
  type: string
  required: boolean
  default?: string
  description?: string
}

const read = (path: string): string => readFileSync(path, 'utf8')

function scriptOf(source: string): string {
  return source.match(/<script setup lang="ts">\n([\s\S]*?)<\/script>/)?.[1] ?? ''
}

function sourceFile(path: string, text: string): ts.SourceFile {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function docOf(node: ts.Node): string | undefined {
  const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc)
  const text = docs
    .map((doc) => (typeof doc.comment === 'string' ? doc.comment : ''))
    .join(' ')
    .trim()
  return text || undefined
}

/** Finds an interface or type alias by name in a file, following relative imports one level. */
function findDeclaration(
  name: string,
  file: ts.SourceFile,
  path: string
): {
  node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration
  file: ts.SourceFile
  path: string
} | null {
  for (const statement of file.statements) {
    if (
      (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
      statement.name.text === name
    ) {
      return { node: statement, file, path }
    }
  }
  for (const statement of file.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith('.') &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(
        (el) => (el.propertyName ?? el.name).text === name
      )
    ) {
      const target = resolve(dirname(path), `${statement.moduleSpecifier.text}.ts`)
      return findDeclaration(name, sourceFile(target, read(target)), target)
    }
  }
  return null
}

/** Expands `(typeof LIST)[number]` and local aliases into the literal values. */
async function expandType(text: string, file: ts.SourceFile, path: string): Promise<string> {
  const listed = text.match(/^\(typeof (\w+)\)\[number\]$/)
  if (listed) {
    const module = (await import(pathToFileURL(path).href)) as Record<string, unknown>
    const values = module[listed[1]!]
    if (Array.isArray(values)) return values.map((value) => `'${String(value)}'`).join(' | ')
    if (values && typeof values === 'object') {
      return Object.keys(values)
        .map((value) => `'${value}'`)
        .join(' | ')
    }
  }
  const alias = text.match(/^[A-Z]\w+$/)
  if (alias) {
    const declaration = findDeclaration(text, file, path)
    if (declaration && ts.isTypeAliasDeclaration(declaration.node)) {
      return expandType(
        declaration.node.type.getText(declaration.file),
        declaration.file,
        declaration.path
      )
    }
  }
  return text.replace(/\s+/g, ' ')
}

async function membersOf(
  type: ts.TypeNode,
  file: ts.SourceFile,
  path: string
): Promise<PropInfo[]> {
  if (ts.isParenthesizedTypeNode(type)) return membersOf(type.type, file, path)
  if (ts.isIntersectionTypeNode(type)) {
    return (await Promise.all(type.types.map((part) => membersOf(part, file, path)))).flat()
  }
  if (ts.isTypeReferenceNode(type)) {
    const declaration = findDeclaration(type.typeName.getText(file), file, path)
    if (!declaration) return []
    if (ts.isInterfaceDeclaration(declaration.node)) {
      return membersFromElements(declaration.node.members, declaration.file, declaration.path)
    }
    return membersOf(declaration.node.type, declaration.file, declaration.path)
  }
  if (ts.isTypeLiteralNode(type)) return membersFromElements(type.members, file, path)
  return []
}

async function membersFromElements(
  elements: ts.NodeArray<ts.TypeElement>,
  file: ts.SourceFile,
  path: string
): Promise<PropInfo[]> {
  const out: PropInfo[] = []
  for (const element of elements) {
    if (!ts.isPropertySignature(element) || !element.type) continue
    out.push({
      name: element.name.getText(file).replace(/^['"]|['"]$/g, ''),
      type: await expandType(element.type.getText(file), file, path),
      required: !element.questionToken,
      description: docOf(element)
    })
  }
  return out
}

function callNamed(file: ts.SourceFile, name: string): ts.CallExpression | undefined {
  let found: ts.CallExpression | undefined
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(node) && node.expression.getText(file) === name) found = node
    else ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

function defaultsOf(file: ts.SourceFile): Record<string, string> {
  const call = callNamed(file, 'withDefaults')
  const object = call?.arguments[1]
  const out: Record<string, string> = {}
  if (object && ts.isObjectLiteralExpression(object)) {
    for (const property of object.properties) {
      if (ts.isPropertyAssignment(property))
        out[property.name.getText(file)] = property.initializer.getText(file)
    }
  }
  return out
}

interface ComponentInfo {
  name: string
  file: string
  description: string
  props: PropInfo[]
  emits: string[]
  slots: string[]
  exposes?: string[]
  keyboard: string[]
  example?: string
}

async function describeComponent(
  path: string,
  scenarios: Array<{ name: string; covers?: string[] }>
): Promise<ComponentInfo> {
  const source = read(path)
  const name = path.match(/(\w+)\.vue$/)![1]!
  const script = scriptOf(source)
  const file = sourceFile(path.replace(/\.vue$/, '.ts'), script)
  const description =
    script.match(/^\/\*\* ([\s\S]*?) \*\//)?.[1]?.replace(/\s+/g, ' ') ??
    source.match(/^<!-- ([\s\S]*?) -->/)?.[1]?.replace(/\s+/g, ' ') ??
    ''

  const defineProps = callNamed(file, 'defineProps')
  const defaults = defaultsOf(file)
  const props = defineProps?.typeArguments?.[0]
    ? await membersOf(defineProps.typeArguments[0], file, path.replace(/\.vue$/, '.ts'))
    : []
  for (const prop of props) if (prop.name in defaults) prop.default = defaults[prop.name]

  const emits: string[] = []
  const defineEmits = callNamed(file, 'defineEmits')?.typeArguments?.[0]
  if (defineEmits && ts.isTypeLiteralNode(defineEmits)) {
    for (const member of defineEmits.members) {
      emits.push(
        `${member.name?.getText(file).replace(/^['"]|['"]$/g, '')}: ${
          ts.isPropertySignature(member) && member.type
            ? member.type.getText(file).replace(/\s+/g, ' ')
            : ''
        }`
      )
    }
  }

  const slots = new Set<string>()
  for (const match of source.matchAll(/<slot(?:\s+name="([\w-]+)")?[\s/>]/g))
    slots.add(match[1] ?? 'default')
  const exposed = callNamed(file, 'defineExpose')?.arguments[0]
  const expose =
    exposed && ts.isObjectLiteralExpression(exposed)
      ? exposed.properties.map((property) => property.name?.getText(file) ?? '').filter(Boolean)
      : []

  const keyboard = scenarios
    .filter((scenario) => scenario.covers?.includes(name))
    .map((s) => s.name)
  const example = findExample(name)
  return {
    name,
    file: rel(path),
    description,
    props: props.map(({ description: doc, ...rest }) => ({
      ...rest,
      ...(doc ? { description: doc } : {})
    })),
    emits,
    slots: [...slots].sort(),
    ...(expose.length > 0 ? { exposes: expose.sort() } : {}),
    keyboard,
    ...(example ? { example } : {})
  }
}

/** The first use of a component in the gallery, as a ready-to-copy example. */
function findExample(name: string): string | undefined {
  for (const section of ['ComponentsSection.vue', 'OverlaysSection.vue']) {
    const text = read(resolve(stencilDir, 'gallery/sections', section))
    const open = text.indexOf(`<${name}`)
    if (open === -1) continue
    const selfClosing = text.slice(open).match(new RegExp(`^<${name}\\b[^>]*?/>`))
    const closing = text.indexOf(`</${name}>`, open)
    const end = selfClosing
      ? open + selfClosing[0].length
      : closing === -1
        ? -1
        : closing + name.length + 3
    if (end === -1) continue
    const lines = text.slice(open, end).split('\n')
    const indent = Math.min(
      ...lines
        .slice(1)
        .filter((l) => l.trim())
        .map((l) => l.match(/^ */)![0].length),
      Infinity
    )
    return lines
      .map((line, i) =>
        i === 0 ? line : line.slice(Number.isFinite(indent) ? Math.max(indent - 2, 0) : 0)
      )
      .join('\n')
  }
  return undefined
}

function describeBehavior(path: string): {
  name: string
  file: string
  summary: string
  exports: string[]
} {
  const text = read(path)
  const file = sourceFile(path, text)
  const exports: string[] = []
  for (const statement of file.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined
    if (!modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue
    if (ts.isFunctionDeclaration(statement) && statement.name) exports.push(statement.name.text)
    else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations)
        exports.push(declaration.name.getText(file))
    }
  }
  const summary =
    text
      .match(/\/\*\*\n([\s\S]*?)\n \*\//)?.[1]
      ?.replace(/^ \* ?/gm, '')
      .split('\n\n')[0]
      ?.replace(/\s+/g, ' ')
      .trim() ?? ''
  return {
    name: rel(path)
      .replace(/^behaviors\//, '')
      .replace(/\.ts$/, ''),
    file: rel(path),
    summary,
    exports: exports.sort()
  }
}

async function build(): Promise<string> {
  const scenarioModule = (await import(
    pathToFileURL(resolve(stencilDir, '../../../../scripts/stencil-test/scenarios.mjs')).href
  )) as { scenarios: Array<{ name: string; covers?: string[] }> }

  const componentFiles = [
    ...readdirSync(resolve(stencilDir, 'components'))
      .filter((file) => /^St\w+\.vue$/.test(file))
      .map((file) => resolve(stencilDir, 'components', file)),
    resolve(stencilDir, 'icons/StIcon.vue')
  ].sort((a, b) => a.localeCompare(b))
  const components: ComponentInfo[] = []
  for (const file of componentFiles)
    components.push(await describeComponent(file, scenarioModule.scenarios))

  const behaviors = readdirSync(resolve(stencilDir, 'behaviors'))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .sort()
    .map((file) => describeBehavior(resolve(stencilDir, 'behaviors', file)))

  const icons = Object.keys(
    (await import(pathToFileURL(resolve(stencilDir, 'icons/icons.generated.ts')).href)).ICON_PATHS
  ).sort()

  return `${JSON.stringify(
    {
      note: 'GENERATED by `pnpm stencil:manifest` from the Stencil source. Do not edit by hand.',
      components,
      behaviors,
      toasts: {
        module: 'toast-store.ts',
        api: ['toast(input)', 'dismissToast(id)'],
        render: 'StToaster, once near the root'
      },
      icons
    },
    null,
    2
  )}\n`
}

async function main(): Promise<void> {
  const next = await build()
  if (process.argv.includes('--check')) {
    if (read(manifestPath) !== next) {
      console.error('stencil/manifest.json is out of date. Run `pnpm stencil:manifest`.')
      process.exitCode = 1
    } else {
      console.log('stencil/manifest.json is up to date.')
    }
  } else {
    writeFileSync(manifestPath, next)
    console.log(`Wrote ${manifestPath.replace(process.cwd() + '/', '')}`)
  }
}

void main()
