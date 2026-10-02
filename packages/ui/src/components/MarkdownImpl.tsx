import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import cx from 'classnames'
import { type BundledTheme, type PluginConfig, Streamdown } from 'streamdown'
import type { MarkdownProps } from './Markdown'

const plugins: PluginConfig = {
  code,
  math: math as NonNullable<PluginConfig['math']>,
}
const shikiTheme: [BundledTheme, BundledTheme] = ['github-light', 'github-dark']

export default function Markdown({ children, isStreaming, controls }: MarkdownProps) {
  return (
    <div className="markdown whitespace-normal text-start w-full">
      <Streamdown
        mode={isStreaming ? 'streaming' : 'static'}
        isAnimating={isStreaming ?? false}
        {...(isStreaming ? { caret: 'block' as const } : {})}
        {...(controls ? { controls } : {})}
        plugins={plugins}
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
        }}
      >
        {children || ''}
      </Streamdown>
    </div>
  )
}
