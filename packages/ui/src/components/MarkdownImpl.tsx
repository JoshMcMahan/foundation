import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
// KaTeX writes each formula twice, as MathML for assistive technology and as
// HTML for the eye, and only its stylesheet hides the MathML copy and lays
// out the HTML one. Importing it beside the renderer brings it into the same
// lazy chunk, so a host gets it without importing it and pays for it only
// once markdown renders. The build keeps this a bare import of the katex
// package, so the host's bundler resolves the fonts relative to that sheet.
import 'katex/dist/katex.min.css'
import { type ComponentType, type HTMLAttributes, useEffect, useMemo, useState } from 'react'
import {
  type ControlsConfig,
  defaultComponents,
  defaultRehypePlugins,
  type ExtraProps,
  type PluginConfig,
  Streamdown,
  useIsCodeFenceIncomplete,
} from 'streamdown'
import { cx } from '../cx'
import { CodeBlock } from './CodeBlock'
import { CODE_THEMES } from './codeTheme'
import { ExternalLink } from './ExternalLink'
import { rehypeHttpsImagesOnly } from './httpsImages'
import type { MarkdownProps } from './Markdown'
import { rehypeCodeBreaks } from './markdownCodeBreaks'
import { readIsDark } from './useCssIsDark'

const basePlugins: PluginConfig = {
  code,
  math: math as NonNullable<PluginConfig['math']>,
}

// @streamdown/mermaid statically imports mermaid (megabytes), so it loads on
// demand, only once some markdown holds a mermaid fence, and the plugin set
// upgrades in place once ready.
let pluginsWithMermaid: PluginConfig | undefined
let mermaidLoad: Promise<void> | undefined

function loadMermaid(): Promise<void> {
  mermaidLoad ??= import('@streamdown/mermaid').then(({ createMermaidPlugin }) => {
    const base = createMermaidPlugin()
    pluginsWithMermaid = {
      ...basePlugins,
      mermaid: {
        ...base,
        // Mermaid inlines resolved colors into its SVG, so it can't follow the
        // --theme-* tokens; it takes the host's scheme at its first diagram.
        getMermaid: (config?: Parameters<typeof base.getMermaid>[0]) =>
          base.getMermaid({ theme: readIsDark() ? 'dark' : 'neutral', ...config }),
      },
    }
  })
  return mermaidLoad
}

// Passing rehypePlugins replaces Streamdown's list rather than extending it,
// so its own plugins go first.
const rehypePlugins = [...Object.values(defaultRehypePlugins), rehypeCodeBreaks]

const httpsImagesRehypePlugins = [
  ...Object.entries(defaultRehypePlugins).flatMap(([name, plugin]) =>
    name === 'harden' ? [rehypeHttpsImagesOnly, plugin] : [plugin],
  ),
  rehypeCodeBreaks,
]

interface CodeControls {
  copy: boolean
  /** The file's name without its extension, or null for no download button. */
  download: string | null
}

// The renderer's own reading of `controls`: on unless turned off, as a whole,
// for code, or per button.
function codeControls(controls: ControlsConfig | undefined): CodeControls {
  if (controls === false) {
    return { copy: false, download: null }
  }
  const code = controls === undefined || controls === true ? true : controls.code
  if (code === false) {
    return { copy: false, download: null }
  }
  if (code === undefined || code === true) {
    return { copy: true, download: 'file' }
  }
  const { download } = code
  return {
    copy: code.copy !== false,
    download: download === false ? null : typeof download === 'object' ? download.filename : 'file',
  }
}

const EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  ruby: 'rb',
  rust: 'rs',
  golang: 'go',
  bash: 'sh',
  shell: 'sh',
  shellscript: 'sh',
  zsh: 'sh',
  console: 'sh',
  markdown: 'md',
  text: 'txt',
  plaintext: 'txt',
  csharp: 'cs',
  kotlin: 'kt',
  powershell: 'ps1',
  dockerfile: 'Dockerfile',
}

// The download's extension for a fence's language: its usual one where it has
// a name of its own, the language itself where that is one, such as yaml or go.
function extensionFor(language: string): string {
  const lang = language.toLowerCase()
  return EXTENSIONS[lang] ?? (/^[a-z0-9+]{1,10}$/.test(lang) ? lang : 'txt')
}

const LANGUAGE = /language-([^\s]+)/
const START_LINE = /startLine=(\d+)/
const NO_LINE_NUMBERS = /\bnoLineNumbers\b/

type CodeProps = HTMLAttributes<HTMLElement> & ExtraProps & { 'data-block'?: string }

const DefaultCode = defaultComponents.code as ComponentType<CodeProps>

function textOf(children: unknown): string {
  if (typeof children === 'string') {
    return children
  }
  if (Array.isArray(children)) {
    return children.map(textOf).join('')
  }
  if (children && typeof children === 'object' && 'props' in children) {
    return textOf((children as { props: { children?: unknown } }).props.children)
  }
  return ''
}

// A fenced block renders as the CodeBlock a page uses, so the two can't drift;
// inline code and diagrams stay the renderer's own. Until the diagram plugin
// has loaded, a diagram's fence shows as its code.
function makeCode(controls: CodeControls, diagrams: boolean) {
  return function MarkdownCode(props: CodeProps) {
    const incomplete = useIsCodeFenceIncomplete()
    const language = props.className?.match(LANGUAGE)?.[1] ?? ''
    if (!('data-block' in props) || (diagrams && language === 'mermaid')) {
      return <DefaultCode {...props} />
    }
    const meta = props.node?.properties?.['metastring']
    const metastring = typeof meta === 'string' ? meta : ''
    const start = Number.parseInt(metastring.match(START_LINE)?.[1] ?? '', 10)
    return (
      <CodeBlock
        className="my-3.5"
        code={textOf(props.children)}
        language={language}
        copy={controls.copy}
        filename={
          controls.download === null ? undefined : `${controls.download}.${extensionFor(language)}`
        }
        lineNumbers={NO_LINE_NUMBERS.test(metastring) ? false : undefined}
        startLine={start >= 1 ? start : 1}
        maxHeight={400}
        streaming={incomplete}
      />
    )
  }
}

export default function MarkdownImpl({
  children,
  isStreaming,
  controls,
  components,
  httpsImagesOnly,
  compact,
}: MarkdownProps) {
  const needsMermaid = !!children && children.includes('```mermaid')
  const [, setMermaidReady] = useState(() => !!pluginsWithMermaid)
  useEffect(() => {
    if (!needsMermaid || pluginsWithMermaid) {
      return
    }
    let live = true
    loadMermaid().then(() => {
      if (live) {
        setMermaidReady(true)
      }
    })
    return () => {
      live = false
    }
  }, [needsMermaid])
  const plugins = needsMermaid && pluginsWithMermaid ? pluginsWithMermaid : basePlugins
  // Built once per controls setting: the renderer re-renders every block when a
  // component changes identity.
  const { copy, download } = codeControls(controls)
  const diagrams = plugins === pluginsWithMermaid
  const code = useMemo(() => makeCode({ copy, download }, diagrams), [copy, download, diagrams])
  return (
    <div
      className={cx('markdown whitespace-normal text-start w-full', compact && 'markdown-compact')}
    >
      <Streamdown
        mode={isStreaming ? 'streaming' : 'static'}
        isAnimating={isStreaming ?? false}
        {...(isStreaming ? ({ caret: 'block', className: 'markdown-streaming' } as const) : {})}
        {...(controls ? { controls } : {})}
        plugins={plugins}
        rehypePlugins={httpsImagesOnly ? httpsImagesRehypePlugins : rehypePlugins}
        shikiTheme={CODE_THEMES}
        components={{
          code,
          a: ({ node, ...props }) => (
            <ExternalLink {...props} className={cx('link wrap-break-word', props.className)} />
          ),
          // The host's overrides win per tag, `a` included.
          ...components,
        }}
      >
        {children || ''}
      </Streamdown>
    </div>
  )
}
