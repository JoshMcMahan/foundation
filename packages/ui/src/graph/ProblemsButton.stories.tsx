import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent, within } from 'storybook/test'
import { ProblemsButton } from './ProblemsButton'

const meta: Meta<typeof ProblemsButton> = {
  title: 'UI/Workflow/ProblemsButton',
  component: ProblemsButton,
  argTypes: {
    problems: {
      control: 'object',
      description: 'What the toolbar counts; one with `pick` opens where it is when clicked.',
    },
  },
  decorators: [
    (Story) => (
      <div className="flex justify-end p-4">
        <Story />
      </div>
    ),
  ],
}
export default meta

const PROBLEMS = [
  { message: 'deploy reads needs.build, which it does not list.', line: 43, pick: () => {} },
  { message: 'inputs.taget is read, but there is no input called taget.', line: 31 },
]

export const SomeProblems: StoryObj<typeof ProblemsButton> = {
  args: { problems: PROBLEMS },
}

/** The list open, each problem a line to pick. */
export const SomeProblemsOpen: StoryObj<typeof ProblemsButton> = {
  args: { problems: PROBLEMS },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'))
    await expect(await screen.findByRole('dialog')).toBeVisible()
  },
}

/** Nothing to count: the button isn't drawn. */
export const NoProblems: StoryObj<typeof ProblemsButton> = {
  args: { problems: [] },
}
