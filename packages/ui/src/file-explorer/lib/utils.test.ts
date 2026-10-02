import type { TreeNode, TStorage, TStorageObject } from './types'
import type { TTreeOptions } from './utils'
import {
  attachmentDisposition,
  collectObjectKeysToDelete,
  createTreeBuilder,
  getDirectoryNameError,
  getDirectoryObjectPath,
  getDirectoryPrefixFromNode,
  getNodeChildren,
  getUriScheme,
  pruneNodesInsideSelectedDirectories,
} from './utils'

const rootNode: TreeNode = {
  name: 'storage',
  path: 'user/storage/',
  relativePath: '',
  type: 'directory',
  root: true,
}

describe('getDirectoryObjectPath', () => {
  it('creates a directory marker at the storage root', () => {
    expect(getDirectoryObjectPath(rootNode, 'results')).toBe('results/')
  })

  it('creates a directory marker below the selected directory', () => {
    expect(
      getDirectoryObjectPath(
        {
          ...rootNode,
          name: 'runs',
          path: 'user/storage/projects/runs/',
          relativePath: '/projects/runs/',
          root: false,
        },
        'results',
      ),
    ).toBe('projects/runs/results/')
  })
})

describe('getDirectoryNameError', () => {
  const siblings: TreeNode[] = [
    {
      ...rootNode,
      name: 'results',
      path: 'user/storage/results/',
      relativePath: 'results/',
      root: false,
    },
  ]

  it('rejects reserved path segments', () => {
    expect(getDirectoryNameError('.', siblings)).toBe('reserved')
    expect(getDirectoryNameError('..', siblings)).toBe('reserved')
  })

  it('rejects names containing path separators', () => {
    expect(getDirectoryNameError('runs/2026', siblings)).toBe('separator')
    expect(getDirectoryNameError('runs\\2026', siblings)).toBe('separator')
  })

  it('rejects the name of an existing item', () => {
    expect(getDirectoryNameError('results', siblings)).toBe('exists')
  })

  it('accepts a new directory name', () => {
    expect(getDirectoryNameError('inputs', siblings)).toBeNull()
  })
})

const directoryNode = (relativePath: string, path?: string): TreeNode => ({
  name: 'dir',
  path: path ?? `user/storage/${relativePath}`,
  relativePath,
  type: 'directory',
})

const fileNode = (relativePath: string, path?: string): TreeNode => ({
  name: 'file',
  path: path ?? `user/storage/${relativePath}`,
  relativePath,
  type: 'file',
})

describe('getDirectoryPrefixFromNode', () => {
  it('keeps a prefix that already ends in a slash', () => {
    expect(getDirectoryPrefixFromNode(directoryNode('logs/'))).toBe('logs/')
  })

  it('appends the slash a bare key is missing', () => {
    expect(getDirectoryPrefixFromNode(directoryNode('logs'))).toBe('logs/')
  })

  it('refuses a node with no resolvable key', () => {
    expect(() => getDirectoryPrefixFromNode({ ...directoryNode(''), path: 'storage/' })).toThrow()
  })
})

describe('pruneNodesInsideSelectedDirectories', () => {
  it('drops a file selected inside a selected directory', () => {
    const folder = directoryNode('logs/')
    const nested = fileNode('logs/a.txt')

    expect(pruneNodesInsideSelectedDirectories([folder, nested])).toEqual([folder])
  })

  it('drops a directory nested inside another selected directory', () => {
    const outer = directoryNode('logs/')
    const inner = directoryNode('logs/2026/')

    expect(pruneNodesInsideSelectedDirectories([outer, inner])).toEqual([outer])
  })

  it('keeps a sibling whose path only shares a prefix', () => {
    const folder = directoryNode('logs/')
    const sibling = fileNode('logs-archive/b.txt')

    expect(pruneNodesInsideSelectedDirectories([folder, sibling])).toEqual([folder, sibling])
  })

  it('keeps unrelated selections', () => {
    const nodes = [fileNode('a.txt'), fileNode('b.txt')]

    expect(pruneNodesInsideSelectedDirectories(nodes)).toEqual(nodes)
  })
})

describe('collectObjectKeysToDelete', () => {
  it('enumerates a directory under a slash-terminated prefix', async () => {
    const listKeys = vi.fn(async () => ['logs/a.txt'])

    const keys = await collectObjectKeysToDelete([directoryNode('logs')], listKeys)

    expect(listKeys).toHaveBeenCalledWith('logs/')
    expect(keys).toEqual(['logs/a.txt'])
  })

  it('discards enumerated keys outside the requested prefix', async () => {
    const listKeys = vi.fn(async () => ['logs/a.txt', 'logs-archive/b.txt'])

    const keys = await collectObjectKeysToDelete([directoryNode('logs/')], listKeys)

    expect(keys).toEqual(['logs/a.txt'])
  })

  it('keeps the directory marker so the folder leaves the tree', async () => {
    const listKeys = vi.fn(async () => ['logs/', 'logs/a.txt'])

    const keys = await collectObjectKeysToDelete([directoryNode('logs/')], listKeys)

    expect(keys).toEqual(['logs/', 'logs/a.txt'])
  })

  it('takes a file key without enumerating', async () => {
    const listKeys = vi.fn(async () => [])

    const keys = await collectObjectKeysToDelete([fileNode('a.txt')], listKeys)

    expect(listKeys).not.toHaveBeenCalled()
    expect(keys).toEqual(['a.txt'])
  })

  it('sends a key once when a folder and a file inside it are both selected', async () => {
    const listKeys = vi.fn(async () => ['logs/a.txt'])

    const keys = await collectObjectKeysToDelete(
      [directoryNode('logs/'), fileNode('logs/a.txt')],
      listKeys,
    )

    expect(keys).toEqual(['logs/a.txt'])
  })
})

const file = (path: string): TStorageObject => ({ path, type: 'file' })
const dir = (path: string): TStorageObject => ({ path, type: 'directory' })
const listings = (entries: Record<string, TStorageObject[]>) =>
  new Map(Object.entries(entries).map(([path, e]) => [path, { entries: e }]))
const buildTree = (storages: TStorage[], options: TTreeOptions) =>
  createTreeBuilder()(storages, options)

describe('createTreeBuilder ordering', () => {
  const storage: TStorage = { id: 's1', name: 'storage', user: 'user' }

  const childNames = (objects: TStorageObject[], unsortedParents?: ReadonlySet<string>) =>
    buildTree([storage], {
      listings: listings({ 'user/storage/': objects }),
      ...(unsortedParents ? { unsortedParents } : {}),
    }).parentToChildrenMap['user/storage/']?.map((node) => node.path)

  it('sorts a complete directory folders-first then by name', () => {
    expect(childNames([file('c.txt'), file('a.txt'), dir('b/')])).toEqual([
      'user/storage/b/',
      'user/storage/a.txt',
      'user/storage/c.txt',
    ])
  })

  it('keeps arrival order for a directory that is still paging', () => {
    expect(
      childNames([file('c.txt'), file('a.txt'), file('b.txt')], new Set(['user/storage/'])),
    ).toEqual(['user/storage/c.txt', 'user/storage/a.txt', 'user/storage/b.txt'])
  })

  it('still shows folders before files while paging', () => {
    // The dirs/files split happens before the tree is built, so skipping the
    // sort defers alphabetical order only — it never lets a file outrank a folder.
    expect(childNames([file('a.txt'), dir('z/')], new Set(['user/storage/']))).toEqual([
      'user/storage/z/',
      'user/storage/a.txt',
    ])
  })

  it('sorts a sibling directory that is complete', () => {
    const { parentToChildrenMap } = buildTree([storage], {
      listings: listings({
        'user/storage/': [dir('logs/')],
        'user/storage/logs/': [file('logs/b.txt'), file('logs/a.txt')],
      }),
      unsortedParents: new Set(['user/storage/']),
    })

    expect(parentToChildrenMap['user/storage/logs/']?.map((n) => n.name)).toEqual([
      'a.txt',
      'b.txt',
    ])
  })

  it('skips the folder marker a bucket lists alongside the children', () => {
    const { treeMap, parentToChildrenMap } = buildTree([storage], {
      listings: listings({
        'user/storage/': [dir('logs/')],
        'user/storage/logs/': [
          { path: 'logs/', type: 'directory', key: 'logs/' },
          file('logs/a.txt'),
        ],
      }),
    })

    expect(parentToChildrenMap['user/storage/logs/']?.map((n) => n.path)).toEqual([
      'user/storage/logs/a.txt',
    ])
    expect(treeMap['user/storage/logs/']?.relativePath).toBe('logs/')
  })
})

describe('createTreeBuilder with no listing yet', () => {
  // A storage arrives before its first listing lands. Dropping the root left the
  // tree empty, so there was nothing to expand and no listing was ever requested.
  it('renders the storage root before anything is listed', () => {
    const { treeMap, parentToChildrenMap, rootNodes } = buildTree(
      [{ id: 's1', name: 'bucket', user: 'user', type: 'bucket', csp: 'aws' }],
      { listings: new Map() },
    )

    expect(treeMap['user/bucket/']).toMatchObject({
      name: 'bucket',
      root: true,
    })
    expect(rootNodes.map((n) => n.path)).toEqual(['user/bucket/'])
    expect(getNodeChildren(parentToChildrenMap, 'user/bucket/')).toEqual([])
  })
})

describe('createTreeBuilder grouping', () => {
  const bucket = (id: string, name: string, user: string): TStorage => ({
    id,
    name,
    user,
  })

  it('groups every storage under its owner, users in arrival order', () => {
    const { treeMap, parentToChildrenMap, rootNodes } = buildTree(
      [bucket('a', 'bkt1', 'nat'), bucket('b', 'bkt2', 'nat'), bucket('c', 'bkt3', 'bob')],
      { listings: new Map() },
    )

    expect(Object.keys(treeMap).sort()).toEqual([
      'bob/',
      'bob/bkt3/',
      'nat/',
      'nat/bkt1/',
      'nat/bkt2/',
    ])
    expect(rootNodes.map((n) => n.path)).toEqual(['nat/', 'bob/'])
    expect(parentToChildrenMap['nat/']?.map((node) => node.path)).toEqual([
      'nat/bkt1/',
      'nat/bkt2/',
    ])
    expect(parentToChildrenMap['bob/']?.map((node) => node.path)).toEqual(['bob/bkt3/'])
  })

  it('keeps a lone storage under its owner when the hierarchy is forced', () => {
    const { treeMap } = buildTree([bucket('a', 'bkt1', 'nat')], {
      listings: new Map(),
      forceUserHierarchy: true,
    })

    expect(Object.keys(treeMap).sort()).toEqual(['nat/', 'nat/bkt1/'])
  })

  it("files each directory's entries under the storage whose root prefixes it", () => {
    const { parentToChildrenMap } = buildTree(
      [bucket('a', 'bkt', 'nat'), bucket('b', 'bkt2', 'nat')],
      {
        listings: listings({
          'nat/bkt/': [file('a.txt')],
          'nat/bkt2/': [dir('logs/'), file('b.txt')],
          'nat/bkt2/logs/': [file('logs/c.txt')],
        }),
      },
    )

    expect(parentToChildrenMap['nat/bkt/']?.map((n) => n.path)).toEqual(['nat/bkt/a.txt'])
    expect(parentToChildrenMap['nat/bkt2/']?.map((n) => n.path)).toEqual([
      'nat/bkt2/logs/',
      'nat/bkt2/b.txt',
    ])
    expect(parentToChildrenMap['nat/bkt2/logs/']?.map((n) => n.path)).toEqual([
      'nat/bkt2/logs/c.txt',
    ])
  })
})

describe('createTreeBuilder reuse across rebuilds', () => {
  const storage: TStorage = { id: 's1', name: 'storage', user: 'user' }

  it('hands back the same tree when no entries changed', () => {
    const build = createTreeBuilder()
    const storages = [storage]
    const entries = [file('a.txt')]
    const first = build(storages, {
      listings: new Map([['user/storage/', { entries, cursor: 't1' }]]),
    })
    const second = build(storages, {
      listings: new Map([['user/storage/', { entries, loadingMore: true }]]),
    })

    expect(second).toBe(first)
  })

  it('still reuses the tree when a listing belongs to no current storage', () => {
    const build = createTreeBuilder()
    const storages = [storage]
    const entries = [file('a.txt')]
    const orphaned = listings({
      'user/storage/': entries,
      'user/gone/': [file('gone/b.txt')],
    })
    const first = build(storages, { listings: orphaned })
    const second = build(storages, { listings: orphaned })

    expect(second).toBe(first)
  })

  it('hands back the same children array for a folder whose entries did not change', () => {
    const build = createTreeBuilder()
    const logs = [file('logs/a.txt'), file('logs/b.txt')]
    const first = build([storage], {
      listings: listings({
        'user/storage/': [dir('logs/')],
        'user/storage/logs/': logs,
      }),
    })
    const second = build([storage], {
      listings: listings({
        'user/storage/': [dir('logs/'), dir('data/')],
        'user/storage/logs/': logs,
      }),
    })

    expect(second.parentToChildrenMap['user/storage/logs/']).toBe(
      first.parentToChildrenMap['user/storage/logs/'],
    )
  })

  it('keeps the nodes of earlier pages when a page is appended', () => {
    const build = createTreeBuilder()
    const pageOne = [file('b.txt'), file('a.txt')]
    const first = build([storage], {
      listings: listings({ 'user/storage/': pageOne }),
      unsortedParents: new Set(['user/storage/']),
    })
    const second = build([storage], {
      listings: listings({
        'user/storage/': [...pageOne, file('c.txt')],
      }),
      unsortedParents: new Set(['user/storage/']),
    })

    expect(second.treeMap['user/storage/a.txt']).toBe(first.treeMap['user/storage/a.txt'])
    expect(second.parentToChildrenMap['user/storage/']?.map((n) => n.name)).toEqual([
      'b.txt',
      'a.txt',
      'c.txt',
    ])
  })

  it('starts over when the folder was listed afresh', () => {
    const build = createTreeBuilder()
    build([storage], {
      listings: listings({ 'user/storage/': [file('a.txt')] }),
    })
    const second = build([storage], {
      listings: listings({ 'user/storage/': [file('b.txt')] }),
    })

    expect(second.parentToChildrenMap['user/storage/']?.map((n) => n.name)).toEqual(['b.txt'])
  })

  it('rebuilds nodes once the csp bucket name is known', () => {
    const build = createTreeBuilder()
    const entries = listings({ 'user/storage/': [file('a.txt')] })
    const before = build([storage], { listings: entries })
    const after = build([{ ...storage, bucketName: 'real-bucket' }], {
      listings: entries,
    })

    expect(before.treeMap['user/storage/a.txt']?.storageName).toBe('storage')
    expect(after.treeMap['user/storage/a.txt']?.storageName).toBe('real-bucket')
  })

  it('re-sorts a folder once it stops paging', () => {
    const build = createTreeBuilder()
    const entries = listings({
      'user/storage/': [file('b.txt'), file('a.txt')],
    })
    const paging = build([storage], {
      listings: entries,
      unsortedParents: new Set(['user/storage/']),
    })
    const complete = build([storage], { listings: entries })

    expect(paging.parentToChildrenMap['user/storage/']?.map((n) => n.name)).toEqual([
      'b.txt',
      'a.txt',
    ])
    expect(complete.parentToChildrenMap['user/storage/']?.map((n) => n.name)).toEqual([
      'a.txt',
      'b.txt',
    ])
  })
})

describe('attachmentDisposition', () => {
  it('asks for a download under the given name', () => {
    expect(attachmentDisposition('report.csv')).toBe(
      `attachment; filename="report.csv"; filename*=UTF-8''report.csv`,
    )
  })

  it('keeps a quote or backslash out of the quoted-string, which would end it early', () => {
    const header = attachmentDisposition('we"ird\\name.txt')
    expect(header).toContain('filename="we_ird_name.txt"')
    expect(header).toContain(`filename*=UTF-8''we%22ird%5Cname.txt`)
  })

  it('carries non-ASCII in filename* and an ASCII-safe fallback in filename', () => {
    const header = attachmentDisposition('café.txt')
    expect(header).toContain('filename="caf_.txt"')
    expect(header).toContain(`filename*=UTF-8''caf%C3%A9.txt`)
  })

  it('encodes a space so the parameter cannot be split', () => {
    expect(attachmentDisposition('my report.csv')).toContain(`filename*=UTF-8''my%20report.csv`)
  })

  it('encodes an apostrophe, which would otherwise be a third ext-value delimiter', () => {
    const header = attachmentDisposition("José's café.pdf")
    const extValue = header.slice(header.indexOf('filename*=') + 10)
    expect(extValue).toBe(`UTF-8''Jos%C3%A9%27s%20caf%C3%A9.pdf`)
    expect(extValue.split("'")).toHaveLength(3)
  })

  it('encodes the parens and star that encodeURIComponent leaves as-is', () => {
    expect(attachmentDisposition('report (v2)*.csv')).toContain(
      `filename*=UTF-8''report%20%28v2%29%2A.csv`,
    )
  })
})

describe('getUriScheme', () => {
  it('reads the scheme of a URI', () => {
    expect(getUriScheme('gs://bucket/a/b.txt')).toBe('gs')
  })

  it('has nothing to name without a scheme', () => {
    expect(getUriScheme('bucket/a/b.txt')).toBe('')
  })
})
