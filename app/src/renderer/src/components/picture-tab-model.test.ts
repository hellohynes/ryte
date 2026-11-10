import { describe, expect, it } from 'vitest'

import { buildSidebarTree } from './sidebar-tree-model'
import { folderPictureList } from './picture-tab-model'

const PATHS = [
  'readme.md',
  'img/b.png',
  'img/A.JPG',
  'img/notes.md',
  'img/c.svg',
  'img/sub/deep.png',
  'other/z.png'
]

describe('folderPictureList', () => {
  it('lists only the pictures in the same folder, in tree order, and where this one sits', () => {
    const tree = buildSidebarTree(PATHS)

    expect(folderPictureList(tree, 'img/b.png')).toEqual({
      paths: ['img/A.JPG', 'img/b.png', 'img/c.svg'],
      start: 1
    })
  })

  it('follows the folder sort order shown in the tree', () => {
    const tree = buildSidebarTree(PATHS, { img: 'za' })

    expect(folderPictureList(tree, 'img/b.png')).toEqual({
      paths: ['img/c.svg', 'img/b.png', 'img/A.JPG'],
      start: 1
    })
  })

  it('works for a picture in the notes folder itself, and for one that is not in the tree', () => {
    const tree = buildSidebarTree(['top.png', 'a.md', 'img/x.png'])

    expect(folderPictureList(tree, 'top.png')).toEqual({ paths: ['top.png'], start: 0 })
    expect(folderPictureList(tree, 'img/gone.png')).toBeNull()
  })
})
