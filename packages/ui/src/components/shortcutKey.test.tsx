// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render } from '@testing-library/react'
import { IconButton } from './IconButton'
import { UIProvider } from './Provider'
import { useShortcutKey } from './shortcutKey'

function Page({ onPress, children }: { onPress: () => void; children?: React.ReactNode }) {
  useShortcutKey('f', onPress)
  return <>{children}</>
}

describe('useShortcutKey', () => {
  it('presses on its key from the page', () => {
    const onPress = vi.fn()
    render(<Page onPress={onPress} />)
    fireEvent.keyDown(document.body, { key: 'F' })
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a text field', <input key="i" data-testid="target" />],
    ['a select', <select key="s" data-testid="target" />],
    [
      'a menu, whose typeahead takes letters',
      <div key="m" role="menu">
        <div role="menuitem" tabIndex={-1} data-testid="target">
          File
        </div>
      </div>,
    ],
    [
      'a tree',
      <div key="t" role="tree">
        <div role="treeitem" aria-selected tabIndex={0} data-testid="target">
          folder
        </div>
      </div>,
    ],
  ])('leaves the key to %s', (_, target) => {
    const onPress = vi.fn()
    const { getByTestId } = render(<Page onPress={onPress}>{target}</Page>)
    fireEvent.keyDown(getByTestId('target'), { key: 'f' })
    expect(onPress).not.toHaveBeenCalled()
  })

  it('ignores a key another handler took, a held key and a modified one', () => {
    const onPress = vi.fn()
    const { getByTestId } = render(
      <Page onPress={onPress}>
        <button type="button" data-testid="target" onKeyDown={(e) => e.preventDefault()} />
      </Page>,
    )
    fireEvent.keyDown(getByTestId('target'), { key: 'f' })
    fireEvent.keyDown(document.body, { key: 'f', repeat: true })
    fireEvent.keyDown(document.body, { key: 'f', metaKey: true })
    expect(onPress).not.toHaveBeenCalled()
  })

  it('stays quiet while UIProvider turns single-key shortcuts off', () => {
    const onPress = vi.fn()
    render(
      <UIProvider characterKeyShortcuts={false}>
        <Page onPress={onPress} />
        <IconButton icon={null} label="Filter" shortcut="f" />
      </UIProvider>,
    )
    fireEvent.keyDown(document.body, { key: 'f' })
    expect(onPress).not.toHaveBeenCalled()
    expect(document.querySelector('[aria-label="Filter"]')).not.toHaveAttribute('aria-keyshortcuts')
  })
})
