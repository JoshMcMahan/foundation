// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { UIProvider, useNavigation, useRunFile, useStrings } from './Provider'

describe('UIProvider strings', () => {
  it('takes one string of a nested group and keeps the rest in English', () => {
    function Read() {
      const { fileExplorer } = useStrings()
      return (
        <p>
          {fileExplorer.preview.open} / {fileExplorer.preview.viewDetails}
        </p>
      )
    }
    render(
      <UIProvider strings={{ fileExplorer: { preview: { open: 'Öffnen' } } }}>
        <Read />
      </UIProvider>,
    )
    expect(screen.getByText('Öffnen / View details')).toBeInTheDocument()
  })
})

describe('English date presets', () => {
  it('names the last day and hour in words, and more of them with their count', () => {
    function Presets() {
      const { filters } = useStrings()
      return (
        <p>{['-1d', '-7d', '-365d', '-1h', '-24h', 'year'].map(filters.datePreset).join(' | ')}</p>
      )
    }
    render(<Presets />)
    expect(screen.getByRole('paragraph')).toHaveTextContent(
      'Last day | Last 7 days | Last 365 days | Last hour | Last 24 hours | This year',
    )
  })
})

describe('UIProvider re-renders', () => {
  it('re-renders no string reader when the host passes equal objects again', () => {
    const renders = vi.fn()
    function Read() {
      renders()
      return <p>{useStrings().common.save}</p>
    }
    // Inline objects, made anew on every render, as a host's root component writes them.
    // The reader comes from above the host, so only context can re-render it.
    const reader = <Read />
    function Host({ tick }: { tick: number }) {
      return (
        <UIProvider
          strings={{ common: { save: 'Speichern' } }}
          data={{ workflowActions: {} }}
          slots={{}}
          navigation={{ goTo: () => tick }}
        >
          {reader}
        </UIProvider>
      )
    }
    const { rerender } = render(<Host tick={0} />)
    rerender(<Host tick={1} />)
    expect(renders).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Speichern')).toBeInTheDocument()
  })

  it('re-renders no string reader when only the data changes', () => {
    const renders = vi.fn()
    const Read = () => {
      renders()
      return <p>{useStrings().common.save}</p>
    }
    // A component the provider's children prop keeps, so only context reaches it.
    const reader = <Read />
    const empty = () => ({ data: undefined, isLoading: false, error: undefined })
    const loading = () => ({ data: undefined, isLoading: true, error: undefined })
    const { rerender } = render(<UIProvider data={{ useRunFile: empty }}>{reader}</UIProvider>)
    rerender(<UIProvider data={{ useRunFile: loading }}>{reader}</UIProvider>)
    expect(renders).toHaveBeenCalledTimes(1)
  })

  it('keeps one navigation object that calls what the host passes now', () => {
    const seen = new Set<unknown>()
    let navigate: ((to: string) => void) | undefined
    function Read() {
      const navigation = useNavigation()
      seen.add(navigation)
      navigate = navigation.goTo
      return null
    }
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(
      <UIProvider navigation={{ goTo: first }}>
        <Read />
      </UIProvider>,
    )
    rerender(
      <UIProvider navigation={{ goTo: second }}>
        <Read />
      </UIProvider>,
    )
    navigate?.('/runs')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('/runs')
    expect(seen.size).toBe(1)
  })

  it('calls the host’s data hook', () => {
    function Read() {
      const [path] = useState('/log')
      return <p>{useRunFile('run', path).data}</p>
    }
    render(
      <UIProvider
        data={{
          useRunFile: (_slug, path) => ({ data: path ?? '', isLoading: false, error: null }),
        }}
      >
        <Read />
      </UIProvider>,
    )
    expect(screen.getByText('/log')).toBeInTheDocument()
  })
})

describe('UIProvider engine', () => {
  it('loads an inline loader once, however often the host renders', async () => {
    const engine = {} as never
    const load = vi.fn(async () => engine)
    function Host({ tick }: { tick: number }) {
      return <UIProvider engine={() => load()}>{tick}</UIProvider>
    }
    const { rerender } = render(<Host tick={0} />)
    rerender(<Host tick={1} />)
    rerender(<Host tick={2} />)
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(1)
  })
})
