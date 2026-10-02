import { defaultChatStrings } from '../strings'
import { resolveChatConfig } from './config'

describe('resolveChatConfig strings', () => {
  it('deep-merges every group over defaults', () => {
    const resolved = resolveChatConfig({
      strings: {
        emptyState: { noProvidersTitle: 'Model credential needed' },
        input: { placeholder: 'Type here' },
        thinking: { label: 'Reasoning' },
        thread: { viewOnly: 'Read only' },
        sidebar: { newChat: 'Start over' },
        attachmentUpload: { remove: 'Trash' },
        attachmentManager: { title: 'Files' },
        branch: { previous: 'Back' },
      },
    })
    // overridden keys
    expect(resolved.strings.emptyState.noProvidersTitle).toBe('Model credential needed')
    expect(resolved.strings.input.placeholder).toBe('Type here')
    expect(resolved.strings.thinking.label).toBe('Reasoning')
    expect(resolved.strings.thread.viewOnly).toBe('Read only')
    expect(resolved.strings.sidebar.newChat).toBe('Start over')
    expect(resolved.strings.attachmentUpload.remove).toBe('Trash')
    expect(resolved.strings.attachmentManager.title).toBe('Files')
    expect(resolved.strings.branch.previous).toBe('Back')
    // sibling keys keep their defaults
    expect(resolved.strings.emptyState.addProvider).toBe(defaultChatStrings.emptyState.addProvider)
    expect(resolved.strings.input.sendMessage).toBe(defaultChatStrings.input.sendMessage)
    expect(resolved.strings.sidebar.deleteTitle).toBe(defaultChatStrings.sidebar.deleteTitle)
    // untouched legacy groups still resolve
    expect(resolved.strings.modal.cancel).toBe(defaultChatStrings.modal.cancel)
  })

  it('parameterized defaults interpolate', () => {
    const resolved = resolveChatConfig()
    expect(resolved.strings.input.filesAttached(1)).toBe('1 file attached')
    expect(resolved.strings.input.filesAttached(3)).toBe('3 files attached')
    expect(resolved.strings.thinking.thoughtFor('4s')).toBe('Thought for 4s')
    expect(resolved.strings.attachmentUpload.maxFilesAllowed(10)).toBe('Maximum 10 files allowed')
  })

  it('passes markdownComponents through and defaults to absent', () => {
    expect(resolveChatConfig().markdownComponents).toBeUndefined()
    const img = () => null
    expect(resolveChatConfig({ markdownComponents: { img } }).markdownComponents).toEqual({ img })
  })
})
