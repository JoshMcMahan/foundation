// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatConfigProvider, resolveChatConfig } from '../../core/config'
import type { ChatMessage, MessagePart } from '../../types'
import AgentMessageParts, { buildRenderItems } from './AgentMessageParts'

vi.mock('../../ui/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}))

vi.mock('../../../logviewer/index', () => ({
  LogViewer: ({ log }: { log: string }) => <div data-testid="logviewer">{log}</div>,
}))

function msg(parts: MessagePart[]): ChatMessage {
  return { id: 'm1', role: 'assistant', parts }
}

function renderParts(
  parts: MessagePart[],
  extra?: Parameters<typeof AgentMessageParts>[0] extends infer P ? Partial<P> : never,
  config?: Parameters<typeof resolveChatConfig>[0],
) {
  return render(
    <ChatConfigProvider value={resolveChatConfig(config)}>
      <AgentMessageParts message={msg(parts)} {...extra} />
    </ChatConfigProvider>,
  )
}

describe('AgentMessageParts dispatch', () => {
  it('renders each built-in part kind', () => {
    renderParts([
      { kind: 'text', text: 'hello world' },
      { kind: 'reasoning', text: 'thinking about it' },
      {
        kind: 'tool_call',
        id: 't1',
        name: 'ReadFile',
        args: JSON.stringify({ path: 'a.ts' }),
        status: 'ok',
        result: 'l1\nl2',
      },
      {
        kind: 'subagent',
        id: 's1',
        status: 'done',
        agentType: 'Explore',
        summary: 'found it',
      },
      { kind: 'notice', text: 'a notice' },
      {
        kind: 'todo_snapshot',
        todos: [
          { content: 'step one', status: 'completed' },
          {
            content: 'step two',
            status: 'in_progress',
            activeForm: 'Doing two',
          },
        ],
      },
    ])
    expect(screen.getByTestId('markdown')).toHaveTextContent('hello world')
    expect(screen.getByTestId('reasoning-part')).toBeInTheDocument()
    expect(screen.getByTestId('tool-call-part')).toBeInTheDocument()
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.getByText('Read 2 lines')).toBeInTheDocument()
    expect(screen.getByTestId('subagent-part')).toHaveTextContent('Explore')
    expect(screen.getByTestId('notice-part')).toHaveTextContent('a notice')
    expect(screen.getByTestId('todo-part')).toHaveTextContent('Doing two')
    expect(screen.getByText('✔')).toBeInTheDocument()
  })

  it('renders nothing for an unknown part kind', () => {
    const unknown = { kind: 'holo_deck', text: 'x' } as unknown as MessagePart
    renderParts([unknown])
    expect(screen.getByTestId('agent-parts')).toBeEmptyDOMElement()
  })

  it('lets slots.partRenderers override a kind', () => {
    renderParts(
      [{ kind: 'notice', text: 'ignored' }],
      {},
      {
        slots: {
          partRenderers: {
            notice: () => <div data-testid="custom-notice">override</div>,
          },
        },
      },
    )
    expect(screen.getByTestId('custom-notice')).toBeInTheDocument()
    expect(screen.queryByTestId('notice-part')).not.toBeInTheDocument()
  })

  it('renders bash results through the log viewer', () => {
    renderParts([
      {
        kind: 'tool_call',
        id: 't1',
        name: 'Bash',
        args: JSON.stringify({ command: 'ls' }),
        status: 'ok',
        result: 'file-a\nfile-b',
      },
    ])
    fireEvent.click(screen.getByText('Bash'))
    expect(screen.getByTestId('logviewer')).toHaveTextContent('file-a')
  })

  it('always shows a diff for edit tools, expanded or not', () => {
    renderParts([
      {
        kind: 'tool_call',
        id: 't1',
        name: 'EditFile',
        args: JSON.stringify({
          path: 'a.ts',
          old_string: 'old line\n',
          new_string: 'new line\n',
        }),
        status: 'ok',
        startLine: 5,
      },
    ])
    expect(screen.getByText('old line')).toBeInTheDocument()
    // The changed word renders in its own emphasis span, splitting the line.
    expect(
      screen.getByText(
        (_, el) =>
          el?.textContent === 'new line' && el.tagName === 'SPAN' && el.classList.contains('pr-3'),
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('new')).toHaveClass('bg-green-500/30')
    expect(screen.getByText('Added 1 line, removed 1 line')).toBeInTheDocument()
  })
})

describe('approval parts', () => {
  it('answers a confirm approval through the callback', () => {
    const onAnswer = vi.fn()
    renderParts(
      [
        {
          kind: 'approval',
          id: 'a1',
          approvalKind: 'confirm',
          toolName: 'Bash',
          command: 'rm -rf ./build',
        },
      ],
      { onApprovalAnswer: onAnswer },
    )
    expect(screen.getByText('rm -rf ./build')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Yes, allow this command'))
    expect(onAnswer).toHaveBeenCalledWith('a1', {
      kind: 'confirm',
      allowed: true,
    })
  })

  it('collects deny feedback before answering', () => {
    const onAnswer = vi.fn()
    renderParts(
      [
        {
          kind: 'approval',
          id: 'a2',
          approvalKind: 'confirm',
          command: 'x',
        },
      ],
      { onApprovalAnswer: onAnswer },
    )
    fireEvent.click(screen.getByText('No, and provide feedback to the agent'))
    fireEvent.change(screen.getByPlaceholderText('Tell the agent what to do instead…'), {
      target: { value: 'use pnpm' },
    })
    fireEvent.click(screen.getByText('Send'))
    expect(onAnswer).toHaveBeenCalledWith('a2', {
      kind: 'confirm',
      allowed: false,
      denyMessage: 'use pnpm',
    })
  })

  it('answers an ask approval with an option', () => {
    const onAnswer = vi.fn()
    renderParts(
      [
        {
          kind: 'approval',
          id: 'a3',
          approvalKind: 'ask',
          question: 'Which db?',
          options: [{ label: 'Postgres' }, { label: 'Mongo' }],
        },
      ],
      { onApprovalAnswer: onAnswer },
    )
    fireEvent.click(screen.getByText('Mongo'))
    expect(onAnswer).toHaveBeenCalledWith('a3', { kind: 'ask', text: 'Mongo' })
  })

  it('renders a resolved approval inert with its answer', () => {
    const onAnswer = vi.fn()
    renderParts(
      [
        {
          kind: 'approval',
          id: 'a4',
          approvalKind: 'confirm',
          resolved: true,
          answer: 'Allowed',
        },
      ],
      { onApprovalAnswer: onAnswer },
    )
    expect(screen.getByText('Answered: Allowed')).toBeInTheDocument()
    expect(screen.queryByText('Yes, allow this command')).not.toBeInTheDocument()
  })
})
function tc(id: string, name: string, status: 'ok' | 'running' | 'error' = 'ok'): MessagePart {
  return {
    kind: 'tool_call',
    id,
    name,
    args: JSON.stringify({ path: `${id}.ts`, pattern: 'x', command: 'ls' }),
    status,
    result: 'out',
  }
}

describe('rollup folding', () => {
  it('folds a run of finished groupable calls into one sentence row', () => {
    renderParts([tc('t1', 'GrepSearch'), tc('t2', 'GrepSearch'), tc('t3', 'ReadFile')])
    const rollup = screen.getByTestId('tool-rollup')
    expect(rollup).toHaveTextContent('Searched for 2 patterns, read 1 file')
    // Members render but stay hidden until expanded.
    expect(screen.getAllByTestId('tool-call-part')).toHaveLength(3)
  })

  it('expands to reveal the member blocks with their own state', () => {
    renderParts([tc('t1', 'ReadFile'), tc('t2', 'ReadFile')])
    const button = screen.getByText('Read 2 files')
    fireEvent.click(button)
    const members = screen.getAllByTestId('tool-call-part')
    expect(members).toHaveLength(2)
    // Expand a member, refold the group, expand again: member stays expanded.
    fireEvent.click(screen.getAllByText('Read')[0]!)
    fireEvent.click(button)
    fireEvent.click(button)
    expect(screen.getAllByText('out').length).toBeGreaterThan(0)
  })

  it('never folds failed or running members', () => {
    const items = buildRenderItems([
      tc('t1', 'ReadFile'),
      tc('t2', 'ReadFile', 'error'),
      tc('t3', 'ReadFile'),
    ])
    expect(items.map((i) => i.kind)).toEqual(['single', 'single', 'single'])
    const running = buildRenderItems([tc('t1', 'ReadFile'), tc('t2', 'ReadFile', 'running')])
    expect(running.map((i) => i.kind)).toEqual(['single', 'single'])
  })

  it('breaks runs on non-groupable tools and other part kinds', () => {
    const viaEdit = buildRenderItems([
      tc('t1', 'ReadFile'),
      tc('t2', 'EditFile'),
      tc('t3', 'ReadFile'),
    ])
    expect(viaEdit.map((i) => i.kind)).toEqual(['single', 'single', 'single'])
    const viaText = buildRenderItems([
      tc('t1', 'ReadFile'),
      tc('t2', 'GrepSearch'),
      { kind: 'text', text: 'hi' },
      tc('t3', 'ReadFile'),
      tc('t4', 'Bash'),
    ])
    expect(viaText.map((i) => i.kind)).toEqual(['rollup', 'single', 'rollup'])
  })

  it('folds a thought between calls into the run and keeps the ones around it', () => {
    const items = buildRenderItems([
      { kind: 'reasoning', text: '**Planning**' },
      { kind: 'reasoning', text: '**Verifying**' },
      tc('t1', 'GlobSearch'),
      { kind: 'reasoning', text: '**Reconciling**' },
      tc('t2', 'ReadFile'),
      { kind: 'reasoning', text: '**Summarizing**' },
      { kind: 'text', text: 'done' },
    ])
    expect(items.map((i) => i.kind)).toEqual(['reasoning', 'rollup', 'reasoning', 'single'])
    expect(items[0]).toMatchObject({
      parts: [{ text: '**Planning**' }, { text: '**Verifying**' }],
    })
    expect((items[1] as { members: unknown[] }).members).toHaveLength(3)
  })

  it('shows a thought while it streams and folds it to its heading when done', () => {
    const text = '**Planning the layout**\n\nMeasure the column.'
    const { rerender } = renderParts([{ kind: 'reasoning', text }], {
      isStreaming: true,
    })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByTestId('reasoning-body')).toHaveTextContent('Measure the column.')
    rerender(
      <ChatConfigProvider value={resolveChatConfig()}>
        <AgentMessageParts message={msg([{ kind: 'reasoning', text }])} />
      </ChatConfigProvider>,
    )
    const toggle = screen.getByRole('button', { name: 'Planning the layout' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('reasoning-body')).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByTestId('reasoning-body')).toHaveTextContent('Measure the column.')
  })

  it('labels a folded thought by its heading and merges adjacent ones', () => {
    renderParts([
      { kind: 'reasoning', text: '**Planning the inventory**\n\nList files.' },
      { kind: 'reasoning', text: 'then count them' },
    ])
    const toggle = screen.getByRole('button', {
      name: 'Planning the inventory',
    })
    expect(screen.getAllByTestId('reasoning-part')).toHaveLength(1)
    fireEvent.click(toggle)
    expect(screen.getByTestId('markdown')).toHaveTextContent('then count them')
  })

  it('leaves a lone groupable call unfolded', () => {
    const items = buildRenderItems([tc('t1', 'ReadFile')])
    expect(items.map((i) => i.kind)).toEqual(['single'])
  })
})

describe('plan approval parts', () => {
  it('shows the pending plan body read-only, with no answer buttons', () => {
    const onAnswer = vi.fn()
    renderParts(
      [
        {
          kind: 'approval',
          id: 'p1',
          approvalKind: 'plan',
          header: 'Plan ready',
          plan: '# Steps\n1. do it',
        },
      ],
      { onApprovalAnswer: onAnswer },
    )
    expect(screen.getByText('Plan ready')).toBeInTheDocument()
    expect(screen.getByTestId('markdown')).toHaveTextContent('# Steps')
    expect(screen.getByText('Plan awaiting approval in the terminal')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(onAnswer).not.toHaveBeenCalled()
  })
})

describe('approvals without an answer handler', () => {
  it('renders a confirm approval read-only instead of dead buttons', () => {
    renderParts([
      {
        kind: 'approval',
        id: 'ro1',
        approvalKind: 'confirm',
        toolName: 'Bash',
        command: 'rm -rf ./build',
        reason: 'Removes a directory outside the workspace',
      },
    ])
    expect(screen.getByText('rm -rf ./build')).toBeInTheDocument()
    expect(screen.getByText('Removes a directory outside the workspace')).toBeInTheDocument()
    expect(screen.getByText('Waiting for an answer in the terminal')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('renders an ask approval read-only, listing the offered choices as text', () => {
    renderParts([
      {
        kind: 'approval',
        id: 'ro2',
        approvalKind: 'ask',
        question: 'Which database?',
        options: [{ label: 'Postgres' }, { label: 'Mongo' }],
      },
    ])
    expect(screen.getByText('Which database?')).toBeInTheDocument()
    expect(screen.getByText(/Postgres · Mongo/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('still answers through the callback when a handler is supplied', () => {
    const onAnswer = vi.fn()
    renderParts([{ kind: 'approval', id: 'rw1', approvalKind: 'confirm', command: 'ls' }], {
      onApprovalAnswer: onAnswer,
    })
    fireEvent.click(screen.getByText('Yes, allow this command'))
    expect(onAnswer).toHaveBeenCalledWith('rw1', {
      kind: 'confirm',
      allowed: true,
    })
  })
})

describe('disclosure accessibility', () => {
  it('names the icon-only thinking toggle and reports its expanded state', () => {
    renderParts([{ kind: 'reasoning', text: 'weighing the options' }])
    const toggle = screen.getByRole('button', { name: 'Thinking' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('markdown')).toHaveTextContent('weighing the options')
  })

  it('reports expanded state on a tool call disclosure', () => {
    renderParts([
      {
        kind: 'tool_call',
        id: 't1',
        name: 'Bash',
        args: '{"command":"ls"}',
        status: 'ok',
        result: 'a b c',
      },
    ])
    const toggle = screen.getAllByRole('button')[0]
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle!)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})
