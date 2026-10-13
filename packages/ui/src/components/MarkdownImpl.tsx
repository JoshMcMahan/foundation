import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import { useEffect, useState } from 'react'
import { defaultRehypePlugins, type PluginConfig, Streamdown } from 'streamdown'
import { cx } from '../cx'
import { CODE_THEMES } from './codeTheme'
import { ExternalLink } from './ExternalLink'
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

export default function MarkdownImpl({
  children,
  isStreaming,
  controls,
  components,
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
  return (
    <div className="markdown whitespace-normal text-start w-full">
      <Streamdown
        mode={isStreaming ? 'streaming' : 'static'}
        isAnimating={isStreaming ?? false}
        {...(isStreaming ? ({ caret: 'block', className: 'markdown-streaming' } as const) : {})}
        {...(controls ? { controls } : {})}
        plugins={plugins}
        rehypePlugins={rehypePlugins}
        shikiTheme={CODE_THEMES}
        components={{
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
