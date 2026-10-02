import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import cx from 'classnames'
import { useEffect, useState } from 'react'
import {
  type BundledTheme,
  type ControlsConfig,
  defaultRehypePlugins,
  type PluginConfig,
  Streamdown,
} from 'streamdown'
import { useChatConfig } from '../core/config'
import { rehypeCodeBreaks } from './codeBreaks'

// Mermaid inlines resolved colors into its SVG, so it cannot follow the
// --theme-* tokens; pick its theme from the host scheme at first diagram
// render (the same color-scheme signal light-dark() uses).
function schemeIsDark(): boolean {
  if (typeof document === 'undefined') {
    return false
  }
  const scheme = getComputedStyle(document.documentElement).colorScheme
  if (scheme.includes('dark') !== scheme.includes('light')) {
    return scheme.includes('dark')
  }
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

const basePlugins: PluginConfig = {
  code,
  math: math as NonNullable<PluginConfig['math']>,
}

// @streamdown/mermaid statically imports mermaid (megabytes), so it loads on
// demand — only when a message actually contains a mermaid fence — and the
// plugin set upgrades in place once ready.
let pluginsWithMermaid: PluginConfig | undefined
let mermaidLoad: Promise<void> | undefined

function loadMermaid(): Promise<void> {
  mermaidLoad ??= import('@streamdown/mermaid').then(({ createMermaidPlugin }) => {
    const base = createMermaidPlugin()
    pluginsWithMermaid = {
      ...basePlugins,
      mermaid: {
        ...base,
        getMermaid: (config?: Parameters<typeof base.getMermaid>[0]) =>
          base.getMermaid({
            theme: schemeIsDark() ? 'dark' : 'neutral',
            ...config,
          }),
      },
    }
  })
  return mermaidLoad
}

const shikiTheme: [BundledTheme, BundledTheme] = ['github-light', 'github-dark']

// Passing rehypePlugins replaces Streamdown's list rather than extending it,
// so its own plugins go first.
const rehypePlugins = [...Object.values(defaultRehypePlugins), rehypeCodeBreaks]

interface MarkdownProps {
  children: string
  isStreaming?: boolean
  controls?: ControlsConfig
}

export default function Markdown({ children, isStreaming, controls }: MarkdownProps) {
  const { markdownComponents } = useChatConfig()
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
  return (
    <div className="markdown whitespace-normal text-start w-full">
      <Streamdown
        mode={isStreaming ? 'streaming' : 'static'}
        {...(isStreaming === undefined ? {} : { isAnimating: isStreaming })}
        {...(isStreaming ? ({ caret: 'block' } as const) : {})}
        {...(controls === undefined ? {} : { controls })}
        plugins={plugins}
        rehypePlugins={rehypePlugins}
        shikiTheme={shikiTheme}
        components={{
          a: ({ node, ...props }) => (
            <a
              {...props}
              className={cx('link wrap-break-word', props.className)}
              target="_blank"
              rel="noopener noreferrer"
            />
          ),
          // Host overrides win per tag, including `a` when supplied.
          ...markdownComponents,
        }}
      >
        {children || ''}
      </Streamdown>
    </div>
  )
}
