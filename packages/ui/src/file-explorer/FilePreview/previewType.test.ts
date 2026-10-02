import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../lib/types'
import { canPreview, getMonacoLanguage, getPreviewKind } from './previewType'

function file(name: string, contentType?: string): TreeNode {
  return {
    name,
    path: `bucket/${name}`,
    type: 'file',
    ...(contentType !== undefined ? { contentType } : {}),
  }
}

describe('getPreviewKind', () => {
  it('classifies by content type first', () => {
    expect(getPreviewKind(file('data', 'image/png'))).toBe('image')
    expect(getPreviewKind(file('clip', 'video/mp4'))).toBe('video')
    expect(getPreviewKind(file('song', 'audio/mpeg'))).toBe('audio')
    expect(getPreviewKind(file('doc', 'application/pdf'))).toBe('pdf')
    expect(getPreviewKind(file('nb', 'application/x-ipynb+json'))).toBe('notebook')
    expect(getPreviewKind(file('table', 'text/csv'))).toBe('csv')
    expect(getPreviewKind(file('src', 'text/x-python'))).toBe('code')
  })

  it('falls back to the file extension when content type is absent', () => {
    expect(getPreviewKind(file('photo.JPG'))).toBe('image')
    expect(getPreviewKind(file('render.mov'))).toBe('video')
    expect(getPreviewKind(file('train.py'))).toBe('code')
    expect(getPreviewKind(file('model_analysis.ipynb'))).toBe('notebook')
    expect(getPreviewKind(file('metrics.csv'))).toBe('csv')
    expect(getPreviewKind(file('report.pdf'))).toBe('pdf')
  })

  it('marks archives and unknown types as not previewable', () => {
    expect(getPreviewKind(file('data.tar.gz'))).toBe('archive')
    expect(getPreviewKind(file('bundle.zip'))).toBe('archive')
    expect(canPreview(file('data.tar.gz'))).toBe(false)
    expect(getPreviewKind(file('mystery.bin'))).toBe('unsupported')
    expect(canPreview(file('mystery.bin'))).toBe(false)
    expect(canPreview(file('photo.png'))).toBe(true)
  })

  it('never previews directories', () => {
    expect(
      getPreviewKind({
        name: 'folder',
        path: 'bucket/folder',
        type: 'directory',
      }),
    ).toBe('unsupported')
  })
})

describe('getMonacoLanguage', () => {
  it('maps known extensions to Monaco language ids', () => {
    expect(getMonacoLanguage(file('train.py'))).toBe('python')
    expect(getMonacoLanguage(file('app.tsx'))).toBe('typescript')
    expect(getMonacoLanguage(file('Dockerfile'))).toBe('dockerfile')
  })

  it('falls back to plaintext for unrecognized files', () => {
    expect(getMonacoLanguage(file('notes'))).toBe('plaintext')
  })
})
