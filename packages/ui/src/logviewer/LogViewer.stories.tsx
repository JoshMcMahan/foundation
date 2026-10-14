import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { LogViewer } from './LogViewer'

const meta: Meta<typeof LogViewer> = {
  title: 'UI/LogViewer',
  component: LogViewer,
}
export default meta

const ANSI_LOG = [
  'Provisioning cluster nodes...',
  '[32m✓[0m controller booted in 41s',
  '[33mwarning:[0m spot capacity is limited in us-east-1a',
  '[31merror:[0m node-3 failed preflight, retrying',
  '[36mnode-3[0m rejoining with [35mbackoff=2s[0m',
  'Done. [1m4/4 nodes ready[0m',
].join('\n')

const COMMAND_LOG = [
  '::group::Install dependencies',
  'pnpm install --frozen-lockfile',
  'Done in 12.4s',
  '::endgroup::',
  '::warning::lockfile is 3 days old',
  'Running test suite',
  '::error::2 tests failed in api/routes.test.ts',
  '::notice::coverage uploaded',
  '::debug::worker pool drained in 80ms',
].join('\n')

export const AnsiColors: StoryObj<typeof LogViewer> = {
  args: {
    log: ANSI_LOG,
    width: 720,
    height: 320,
  },
}

export const WorkflowCommands: StoryObj<typeof LogViewer> = {
  args: {
    log: COMMAND_LOG,
    width: 720,
    height: 320,
    enableWorkflowCommands: true,
  },
}

/** The time range filter: days from a calendar, times beside them. */
export const TimeRange: StoryObj<typeof LogViewer> = {
  args: {
    log: ANSI_LOG,
    width: 720,
    height: 320,
    enableTimeRangeFilter: true,
    initialTimeRangeFrom: '2026-03-14T09:00',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Time range/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'From' }))
    const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(
      new Date(2026, 2, 15),
    )
    await userEvent.click(
      within(await screen.findByRole('grid')).getByRole('button', { name: day }),
    )
    // Picking a day closes the calendar, not the range panel under it.
    await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument())
    await expect(screen.getByRole('button', { name: 'Apply' })).toBeVisible()
  },
}

export const Inline: StoryObj<typeof LogViewer> = {
  args: {
    log: ANSI_LOG,
    width: '100%',
    height: 'unset',
    inline: true,
    enableWorkflowCommands: false,
  },
}

const LONG_LOG = Array.from(
  { length: 20000 },
  (_, i) =>
    `[2026-03-14T09:${String(Math.floor(i / 600) % 60).padStart(2, '0')}] step ${i + 1}: ok`,
).join('\n')

/** A long log follows its tail, and renders only the lines in view. */
export const LongLog: StoryObj<typeof LogViewer> = {
  args: {
    log: LONG_LOG,
    width: 720,
    height: 320,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText(/step 20000: ok/)).toBeVisible())
    await expect(canvasElement.querySelectorAll('[data-line-number]').length).toBeLessThan(200)
  },
}

/** Selecting text offers to copy it where the selection ended. */
export const SelectionCopy: StoryObj<typeof LogViewer> = {
  args: {
    log: ANSI_LOG,
    width: 720,
    height: 320,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const line = canvas.getByText('Provisioning cluster nodes...')
    const range = document.createRange()
    range.selectNodeContents(line)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    const box = line.getBoundingClientRect()
    canvas
      .getByTestId('logviewer')
      .dispatchEvent(
        new MouseEvent('mouseup', { bubbles: true, clientX: box.right, clientY: box.bottom }),
      )
    await expect(await screen.findByRole('button', { name: 'Copy' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull())
  },
}

/** A filter keeps the matching lines and marks each match. */
export const Filtered: StoryObj<typeof LogViewer> = {
  args: {
    log: COMMAND_LOG,
    width: 720,
    height: 320,
    enableWorkflowCommands: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByPlaceholderText('Filter logs'), 'test')
    await expect(canvasElement.querySelectorAll('mark.search-highlight').length).toBeGreaterThan(0)
  },
}

/** Line numbers select lines for copying; Shift extends the range. */
export const SelectedLines: StoryObj<typeof LogViewer> = {
  args: {
    log: COMMAND_LOG,
    width: 720,
    height: 320,
    enableWorkflowCommands: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const user = userEvent.setup()
    await user.click(canvas.getByRole('button', { name: 'Select line 6' }))
    await user.keyboard('{Shift>}')
    await user.click(canvas.getByRole('button', { name: 'Select line 8' }))
    await user.keyboard('{/Shift}')
    await expect(canvas.getByRole('button', { name: 'Select line 7' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}
