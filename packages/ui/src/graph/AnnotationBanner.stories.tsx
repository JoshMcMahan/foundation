import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { AnnotationBanner } from './AnnotationBanner'
import type { WorkflowJob } from './types'

const meta: Meta<typeof AnnotationBanner> = {
  title: 'UI/Workflow/AnnotationBanner',
  component: AnnotationBanner,
}
export default meta

const jobs: Record<string, WorkflowJob> = {
  build: {
    status: 'completed',
    steps: [
      {
        name: 'compile',
        status: 'completed',
        annotations: [
          { type: 'warning', message: 'Deprecated flag --legacy-peer-deps', title: 'npm' },
          { type: 'notice', message: 'Cache restored from the last run' },
        ],
      },
    ],
  },
  test: {
    status: 'failed',
    steps: [
      {
        name: 'unit tests',
        status: 'failed',
        annotations: [{ type: 'error', message: '3 tests failed in api/handlers' }],
      },
    ],
  },
}

/** What a run's steps reported, counted by kind in the theme's status tones, and listed
 *  once opened. */
export const Annotations: StoryObj<typeof AnnotationBanner> = {
  args: { executedJobs: jobs },
  render: (args) => (
    <div className="max-w-2xl">
      <AnnotationBanner {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('button', { name: /Annotations/ })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByText('3 tests failed in api/handlers')).toBeVisible()
  },
}
