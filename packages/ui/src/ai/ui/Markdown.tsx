import BaseMarkdown, { type MarkdownProps } from '../../components/Markdown'
import { useChatConfig } from '../core/config'

/** Markdown with the chat host's per-tag overrides. */
export default function Markdown(props: Omit<MarkdownProps, 'components'>) {
  const { markdownComponents } = useChatConfig()
  return (
    <BaseMarkdown {...props} {...(markdownComponents ? { components: markdownComponents } : {})} />
  )
}
