import type { FileCatalogEntry } from '../../../shared/files'
import type { WorkspaceFolderSortMode } from '../../../shared/workspace'

export interface SidebarTreeNode {
  name: string
  relPath: string
  isFolder: boolean
  depth: number
  children: SidebarTreeNode[]
}

type FolderSortModes = Record<string, WorkspaceFolderSortMode>

function compareByNameAsc(left: SidebarTreeNode, right: SidebarTreeNode): number {
  if (left.isFolder !== right.isFolder) return left.isFolder ? -1 : 1
  return left.name.localeCompare(right.name)
}

function compareByNameDesc(left: SidebarTreeNode, right: SidebarTreeNode): number {
  if (left.isFolder !== right.isFolder) return left.isFolder ? -1 : 1
  return right.name.localeCompare(left.name)
}

function modifiedAtMsForNode(
  node: SidebarTreeNode,
  modifiedAtMsBySourcePath: ReadonlyMap<string, number>
): number {
  if (!node.isFolder) return modifiedAtMsBySourcePath.get(node.relPath) ?? 0
  return Math.max(
    0,
    ...node.children.map((child) => modifiedAtMsForNode(child, modifiedAtMsBySourcePath))
  )
}

function compareByRecency(
  left: SidebarTreeNode,
  right: SidebarTreeNode,
  modifiedAtMsBySourcePath: ReadonlyMap<string, number>
): number {
  if (left.isFolder !== right.isFolder) return left.isFolder ? -1 : 1
  const modifiedDiff =
    modifiedAtMsForNode(right, modifiedAtMsBySourcePath) -
    modifiedAtMsForNode(left, modifiedAtMsBySourcePath)
  return modifiedDiff || compareByNameAsc(left, right)
}

function sortChildren(
  node: SidebarTreeNode,
  folderSortModes: FolderSortModes,
  modifiedAtMsBySourcePath: ReadonlyMap<string, number>
): void {
  const mode = node.depth === 0 ? (folderSortModes[node.relPath] ?? 'az') : 'az'
  node.children.sort((left, right) => {
    if (mode === 'za') return compareByNameDesc(left, right)
    if (mode === 'recency') return compareByRecency(left, right, modifiedAtMsBySourcePath)
    return compareByNameAsc(left, right)
  })

  for (const child of node.children) {
    if (child.isFolder) sortChildren(child, folderSortModes, modifiedAtMsBySourcePath)
  }
}

export function modifiedAtMsBySourcePath(
  files: readonly FileCatalogEntry[]
): ReadonlyMap<string, number> {
  return new Map(files.map((file) => [file.sourcePath, file.modifiedAtMs]))
}

export function buildSidebarTree(
  paths: readonly string[],
  folderSortModes: FolderSortModes = {},
  modifiedAtMsByPath: ReadonlyMap<string, number> = new Map()
): SidebarTreeNode[] {
  const root: SidebarTreeNode = {
    name: '',
    relPath: '',
    isFolder: true,
    depth: -1,
    children: []
  }

  for (const relPath of paths) {
    const parts = relPath.split('/')
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1
      const segment = parts[i]
      const childRel = parts.slice(0, i + 1).join('/')
      let next = current.children.find((child) => child.name === segment)
      if (!next) {
        next = {
          name: segment,
          relPath: childRel,
          isFolder: !isLast,
          depth: i,
          children: []
        }
        current.children.push(next)
      }
      current = next
    }
  }

  root.children.sort(compareByNameAsc)
  for (const child of root.children) {
    if (child.isFolder) sortChildren(child, folderSortModes, modifiedAtMsByPath)
  }

  return root.children
}
