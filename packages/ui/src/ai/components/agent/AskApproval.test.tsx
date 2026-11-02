// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatConfigProvider, resolveChatConfig } from '../../core/config'
import type { ApprovalQuestion } from '../../types'
import { AskApproval } from './AskApproval'

vi.mock('../../ui/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}))

const database: ApprovalQuestion = {
  question: 'Which database?',
  header: 'Database',
  options: [{ label: 'Postgres', description: 'Relational' }, { label: 'Mongo' }],
}
const auth: ApprovalQuestion = {
  question: 'Which auth?',
  options: [{ label: 'OAuth' }, { label: 'SAML' }],
}
const checks: ApprovalQuestion = {
  question: 'Which checks?',
  header: 'Checks',
  multiSelect: true,
  options: [{ label: 'Lint' }, { label: 'Tests' }, { label: 'E2E' }],
}
const notes: ApprovalQuestion = { question: 'Anything else?', header: 'Notes' }

function renderAsk(questions: ApprovalQuestion[]) {
  const onAnswer = vi.fn()
  render(
    <ChatConfigProvider value={resolveChatConfig()}>
      <AskApproval
        part={{ kind: 'approval', id: 'q1', approvalKind: 'ask', questions }}
        onAnswer={onAnswer}
      />
    </ChatConfigProvider>,
  )
  return onAnswer
}

const tab = (name: string) => screen.getByRole('tab', { name })

// The question left behind stays until its exit ends, a frame after the switch.
const switched = () => waitFor(() => expect(screen.getAllByRole('tabpanel')).toHaveLength(1))

describe('AskApproval with several questions', () => {
  it('shows a tab per question, named by its header or its place', () => {
    renderAsk([database, auth])
    expect(screen.getByRole('tablist', { name: 'Questions' })).toBeInTheDocument()
    expect(tab('Database')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Q2')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('Which database?')).toBeVisible()
    expect(screen.getByText('0 of 2 answered')).toBeInTheDocument()
  })

  it('moves on to the next question with a pick, focusing its first choice', () => {
    renderAsk([database, auth, checks])
    fireEvent.click(screen.getByRole('button', { name: /Postgres/ }))
    expect(tab('Q2')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'OAuth' })).toHaveFocus()
    expect(screen.getByText('1 of 3 answered')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'SAML' }))
    expect(screen.getByRole('checkbox', { name: 'Lint' })).toHaveFocus()
  })

  it('sends one answer per question, a blank one included', () => {
    const onAnswer = renderAsk([database, auth])
    fireEvent.click(screen.getByRole('button', { name: /Postgres/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit answers' }))
    expect(onAnswer).toHaveBeenCalledWith('q1', {
      kind: 'ask',
      answers: [{ picked: ['Postgres'] }, {}],
    })
  })

  it('takes a typed answer in place of a pick, and a later pick in place of it', async () => {
    const onAnswer = renderAsk([database, auth])
    fireEvent.click(screen.getByRole('button', { name: /Postgres/ }))
    fireEvent.click(tab('Database'))
    await switched()
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), {
      target: { value: 'SQLite' },
    })
    expect(screen.getByRole('button', { name: /Postgres/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Submit answers' }))
    expect(onAnswer).toHaveBeenLastCalledWith('q1', {
      kind: 'ask',
      answers: [{ text: 'SQLite' }, {}],
    })
    fireEvent.click(screen.getByRole('button', { name: /Mongo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit answers' }))
    expect(onAnswer).toHaveBeenLastCalledWith('q1', {
      kind: 'ask',
      answers: [{ picked: ['Mongo'] }, {}],
    })
  })

  it('moves on from a typed answer with Enter, and keeps a blank one waiting', () => {
    renderAsk([notes, auth])
    const field = screen.getByRole('textbox', { name: 'Your answer' })
    fireEvent.submit(field)
    expect(tab('Notes')).toHaveAttribute('aria-selected', 'true')
    fireEvent.change(field, { target: { value: 'Keep the cache' } })
    fireEvent.submit(field)
    expect(tab('Q2')).toHaveAttribute('aria-selected', 'true')
  })

  it('focuses Submit once the last question has its answer', () => {
    renderAsk([database, auth])
    fireEvent.click(tab('Q2'))
    fireEvent.click(screen.getByRole('button', { name: 'SAML' }))
    expect(screen.getByRole('button', { name: 'Submit answers' })).toHaveFocus()
  })

  it('sends the answers so far to chat about them instead', () => {
    const onAnswer = renderAsk([database, auth])
    fireEvent.click(screen.getByRole('button', { name: /Mongo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Chat about this' }))
    expect(onAnswer).toHaveBeenCalledWith('q1', {
      kind: 'ask',
      answers: [{ picked: ['Mongo'] }, {}],
      chat: true,
    })
  })
})

describe('AskApproval with one question', () => {
  it('sends a pick at once', () => {
    const onAnswer = renderAsk([database])
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByText('Relational')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mongo/ }))
    expect(onAnswer).toHaveBeenCalledWith('q1', { kind: 'ask', answers: [{ picked: ['Mongo'] }] })
  })

  it('ticks multi-select options in option order, with the typed text while there is any', () => {
    const onAnswer = renderAsk([checks])
    fireEvent.click(screen.getByRole('checkbox', { name: 'E2E' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lint' }))
    const field = screen.getByRole('textbox', { name: 'Your answer' })
    expect(field).toHaveAttribute('placeholder', 'Write my own answer…')
    fireEvent.change(field, { target: { value: 'and the docs build' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onAnswer).toHaveBeenLastCalledWith('q1', {
      kind: 'ask',
      answers: [{ picked: ['Lint', 'E2E'], text: 'and the docs build' }],
    })
    fireEvent.change(field, { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onAnswer).toHaveBeenLastCalledWith('q1', {
      kind: 'ask',
      answers: [{ picked: ['Lint', 'E2E'] }],
    })
  })

  it('sends a typed answer, with Send shown once there is one', () => {
    const onAnswer = renderAsk([database])
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), {
      target: { value: 'SQLite' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onAnswer).toHaveBeenCalledWith('q1', { kind: 'ask', answers: [{ text: 'SQLite' }] })
  })

  it('takes typed text for a question without options, never taking focus as it arrives', () => {
    const onAnswer = renderAsk([notes])
    const field = screen.getByRole('textbox', { name: 'Your answer' })
    expect(field).not.toHaveFocus()
    expect(field).toHaveAttribute('placeholder', 'Type your answer…')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    fireEvent.change(field, { target: { value: 'Keep the cache' } })
    fireEvent.submit(field)
    expect(onAnswer).toHaveBeenCalledWith('q1', {
      kind: 'ask',
      answers: [{ text: 'Keep the cache' }],
    })
  })
})

describe('AskApproval it cannot answer', () => {
  it('says to answer in the terminal when it can read no questions', () => {
    renderAsk([])
    expect(screen.getByText('Waiting for an answer in the terminal')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('names who has to answer, listing the questions and their choices', () => {
    render(
      <ChatConfigProvider value={resolveChatConfig()}>
        <AskApproval
          part={{
            kind: 'approval',
            id: 'q1',
            approvalKind: 'ask',
            questions: [database, auth],
            waitingOn: 'Dana',
          }}
        />
      </ChatConfigProvider>,
    )
    expect(screen.getByText('Which auth?')).toBeInTheDocument()
    expect(screen.getByText(/OAuth · SAML/)).toBeInTheDocument()
    expect(screen.getByText('Waiting for Dana to answer')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

const layout: ApprovalQuestion = {
  question: 'Which layout?',
  header: 'Layout',
  options: [
    { label: 'Sidebar', preview: '| nav | body |\n|-----|------|\n| a   | b    |' },
    { label: 'Tabs', preview: '```ts\nconst tabs = ["Overview"]\n```' },
    { label: 'Single page' },
  ],
}

const pane = (label: string) => screen.getByRole('region', { name: `Preview: ${label}` })

describe('AskApproval with option previews', () => {
  it('shows a mockup as written, and a preview that fences its own code as markdown', () => {
    renderAsk([layout])
    expect(within(pane('Sidebar')).queryByTestId('markdown')).not.toBeInTheDocument()
    expect(pane('Sidebar').querySelector('pre')?.textContent).toBe(
      '| nav | body |\n|-----|------|\n| a   | b    |',
    )
    fireEvent.focus(screen.getByRole('button', { name: 'Tabs' }))
    expect(within(pane('Tabs')).getByTestId('markdown').textContent).toBe(
      '```ts\nconst tabs = ["Overview"]\n```',
    )
  })

  it('lays every preview in the pane, reaching only the shown one, so it is as tall as the tallest', () => {
    renderAsk([layout])
    expect(screen.getAllByRole('region')).toEqual([pane('Sidebar')])
    const tabs = screen.getByText(/const tabs = \["Overview"\]/).closest('section')
    expect(tabs).toHaveAttribute('aria-hidden', 'true')
    expect(tabs).toHaveAttribute('inert')
    fireEvent.focus(screen.getByRole('button', { name: 'Tabs' }))
    expect(screen.getAllByRole('region')).toEqual([pane('Tabs')])
    expect(pane('Tabs')).not.toHaveAttribute('inert')
  })

  it('says when the focused option or the own answer has no preview', () => {
    renderAsk([layout])
    fireEvent.focus(screen.getByRole('button', { name: 'Single page' }))
    expect(pane('Single page')).toHaveTextContent('No preview for this option')
    fireEvent.focus(screen.getByRole('textbox', { name: 'Your answer' }))
    expect(pane('Your answer')).toHaveTextContent('No preview for this option')
  })

  it('follows a pointer that rests on an option', () => {
    vi.useFakeTimers()
    try {
      renderAsk([layout])
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'Tabs' }))
      expect(pane('Sidebar')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(150))
      expect(pane('Tabs')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends the notes with the option picked after them', () => {
    const onAnswer = renderAsk([layout])
    fireEvent.change(screen.getByRole('textbox', { name: 'Notes' }), {
      target: { value: ' narrower ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Tabs' }))
    expect(onAnswer).toHaveBeenCalledWith('q1', {
      kind: 'ask',
      answers: [{ picked: ['Tabs'], notes: 'narrower' }],
    })
  })

  it('sends the notes alone on Enter, and keeps empty ones waiting', () => {
    const onAnswer = renderAsk([layout])
    const notes = screen.getByRole('textbox', { name: 'Notes' })
    fireEvent.submit(notes)
    expect(onAnswer).not.toHaveBeenCalled()
    fireEvent.change(notes, { target: { value: 'something in between' } })
    fireEvent.submit(notes)
    expect(onAnswer).toHaveBeenCalledWith('q1', {
      kind: 'ask',
      answers: [{ notes: 'something in between' }],
    })
  })

  it("leaves a multi-select question's previews and notes out", () => {
    renderAsk([{ ...layout, multiSelect: true }])
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Notes' })).not.toBeInTheDocument()
  })
})
