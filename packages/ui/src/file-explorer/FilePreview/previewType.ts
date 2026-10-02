import type { TreeNode } from '../lib/types'
import { getFileExtension } from '../lib/utils'

export { getFileExtension }

export type PreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'code'
  | 'csv'
  | 'notebook'
  | 'archive'
  | 'unsupported'

/** Short-lived so the link doesn't linger; an hour covers a viewing session. */
export const PREVIEW_URL_EXPIRES_IN = 60 * 60

/** Cap text pulled into the tab; media streams through native elements uncapped. */
export const CODE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024
export const TABULAR_PREVIEW_MAX_BYTES = 20 * 1024 * 1024
export const CSV_PREVIEW_MAX_ROWS = 500

/** A line cap bounds what a text preview holds and renders; the byte cap above cuts
 * short whatever the line cap hasn't, and refuses outright only content with no line
 * break to cut on. Well under Monaco's 20MB and 300K-line thresholds, past which it
 * stops tokenizing and highlighting dies. */
export const CODE_PREVIEW_MAX_LINES = 5000

/** Fetched into a blob URL to render inline regardless of served content type; falls back to download above this. */
export const PDF_PREVIEW_MAX_BYTES = 50 * 1024 * 1024

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'svg'])
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'm4v', 'ogv'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac'])
const ARCHIVE_EXT = new Set(['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar'])

// Extension → Monaco language id; membership also marks a file as previewable
// code (see isCodeFile). Types Monaco has no grammar for map to the closest id.
const LANGUAGE_BY_EXT: Record<string, string> = {
  py: 'python',
  ipy: 'python',
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  scala: 'scala',
  r: 'r',
  jl: 'julia',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'powershell',
  sql: 'sql',
  json: 'json',
  jsonl: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  env: 'ini',
  xml: 'xml',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  md: 'markdown',
  markdown: 'markdown',
  tex: 'plaintext',
  txt: 'plaintext',
  log: 'plaintext',
  gitignore: 'plaintext',
}

// Extensionless filenames worth previewing as code.
const LANGUAGE_BY_FILENAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'plaintext',
}

export function getMonacoLanguage(node: TreeNode): string {
  const ext = getFileExtension(node.name)
  if (ext && LANGUAGE_BY_EXT[ext]) {
    return LANGUAGE_BY_EXT[ext]
  }
  return LANGUAGE_BY_FILENAME[node.name.toLowerCase()] ?? 'plaintext'
}

function isCodeFile(node: TreeNode): boolean {
  const ext = getFileExtension(node.name)
  return (ext !== null && ext in LANGUAGE_BY_EXT) || node.name.toLowerCase() in LANGUAGE_BY_FILENAME
}

function kindFromContentType(ct: string): PreviewKind | null {
  if (ct === 'application/pdf') {
    return 'pdf'
  }
  if (ct === 'application/x-ipynb+json') {
    return 'notebook'
  }
  if (ct === 'text/csv') {
    return 'csv'
  }
  if (ct.startsWith('image/')) {
    return 'image'
  }
  if (ct.startsWith('video/')) {
    return 'video'
  }
  if (ct.startsWith('audio/')) {
    return 'audio'
  }
  if (ct.startsWith('text/') || ct === 'application/json' || ct === 'application/xml') {
    return 'code'
  }
  return null
}

function kindFromExtension(ext: string): PreviewKind | null {
  if (ext === 'pdf') {
    return 'pdf'
  }
  if (ext === 'ipynb') {
    return 'notebook'
  }
  if (ext === 'csv' || ext === 'tsv') {
    return 'csv'
  }
  if (IMAGE_EXT.has(ext)) {
    return 'image'
  }
  if (VIDEO_EXT.has(ext)) {
    return 'video'
  }
  if (AUDIO_EXT.has(ext)) {
    return 'audio'
  }
  if (ARCHIVE_EXT.has(ext)) {
    return 'archive'
  }
  if (ext in LANGUAGE_BY_EXT) {
    return 'code'
  }
  return null
}

/** Content type wins when present; extension is the fallback. */
export function getPreviewKind(node: TreeNode): PreviewKind {
  if (node.type !== 'file') {
    return 'unsupported'
  }
  const ct = (node.contentType ?? '').split(';')[0]?.toLowerCase().trim() ?? ''
  const ext = getFileExtension(node.name)
  const ctKind = kindFromContentType(ct)
  const extKind = ext !== null ? kindFromExtension(ext) : null
  // A generic text/json/xml content type resolves to 'code'; when the extension
  // identifies a richer structured view (CSV table, notebook), prefer it.
  if (ctKind === 'code' && (extKind === 'csv' || extKind === 'notebook')) {
    return extKind
  }
  // Fall back to the code renderer for recognized extensionless files
  // (Dockerfile, Makefile) that neither content type nor extension classify.
  return ctKind ?? extKind ?? (isCodeFile(node) ? 'code' : 'unsupported')
}

export function canPreview(node: TreeNode): boolean {
  const kind = getPreviewKind(node)
  return kind !== 'unsupported' && kind !== 'archive'
}
