// Syntax tokens for diff rows via shiki — the same engine, themes, and
// per-language lazy-highlighter pattern @streamdown/code uses for markdown
// code blocks, so the two stay visually consistent and the consumer bundle
// dedupes to one shiki. Everything loads lazily on the first diff render.

export interface DiffToken {
  content: string
  color?: string
}

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  go: 'go',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  java: 'java',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  scala: 'scala',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  fish: 'fish',
  ps1: 'powershell',
  sql: 'sql',
  json: 'json',
  jsonc: 'jsonc',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  md: 'markdown',
  mdx: 'mdx',
  vue: 'vue',
  svelte: 'svelte',
  tf: 'terraform',
  hcl: 'hcl',
  proto: 'proto',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  lua: 'lua',
  r: 'r',
  pl: 'perl',
  ex: 'elixir',
  exs: 'elixir',
  zig: 'zig',
}

// Shiki language id for a file path, or null when unknown — null skips
// coloring rather than guessing.
export function languageForPath(path: string | undefined): string | null {
  if (!path) {
    return null
  }
  const base = path.split('/').pop() ?? ''
  if (base.toLowerCase() === 'dockerfile') {
    return 'dockerfile'
  }
  const dot = base.lastIndexOf('.')
  if (dot <= 0) {
    return null
  }
  const ext = base.slice(dot + 1).toLowerCase()
  return EXT_LANG[ext] ?? null
}

type Highlighter = {
  codeToTokensBase: (
    code: string,
    opts: { lang: string; theme: string },
  ) => Array<Array<{ content: string; color?: string }>>
}

const highlighters = new Map<string, Promise<Highlighter | null>>()

function getHighlighter(lang: string): Promise<Highlighter | null> {
  let p = highlighters.get(lang)
  if (!p) {
    p = (async () => {
      const [{ createHighlighter }, { createJavaScriptRegexEngine }] = await Promise.all([
        import('shiki'),
        import('shiki/engine/javascript'),
      ])
      return (await createHighlighter({
        langs: [lang],
        themes: ['github-light', 'github-dark'],
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      })) as unknown as Highlighter
    })().catch(() => null)
    highlighters.set(lang, p)
  }
  return p
}

// Tokenizes the diff's lines as one block so multi-line grammar (comments,
// template literals) survives, returning per-line tokens aligned to the
// input. Null means "render plain" — unknown language or a load failure.
export async function tokenizeDiffLines(
  lines: string[],
  lang: string,
  isDark: boolean,
): Promise<DiffToken[][] | null> {
  const highlighter = await getHighlighter(lang)
  if (!highlighter) {
    return null
  }
  try {
    const tokens = highlighter.codeToTokensBase(lines.join('\n'), {
      lang,
      theme: isDark ? 'github-dark' : 'github-light',
    })
    if (tokens.length !== lines.length) {
      return null
    }
    return tokens.map((line) =>
      line.map((t) => ({
        content: t.content,
        ...(t.color ? { color: t.color } : {}),
      })),
    )
  } catch {
    return null
  }
}
