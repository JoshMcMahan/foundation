import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { type ProblemMessage, UIProvider } from '../components/Provider'
import { ProblemsButton } from './ProblemsButton'

const meta: Meta<typeof ProblemsButton> = {
  title: 'UI/Workflow/ProblemsButton',
  component: ProblemsButton,
  argTypes: {
    problems: {
      control: 'object',
      description:
        'What the toolbar counts; one with `pick` opens where it is when clicked. One with a problem `code` and `params` reads as the host’s `useProblemMessage` words it, given its `type` too, and one with a `type` links to its page.',
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
    const list = await screen.findByRole('dialog', { name: '2 problems' })
    await waitFor(() => expect(list).toBeVisible())
  },
}

// A host's catalog in Spanish, with a message for one code.
const spanishMessage: ProblemMessage = (code, params) =>
  code === 'job_not_needed'
    ? `${params?.['job']} lee needs.${params?.['needed']}, pero no lo incluye en needs.`
    : undefined
const useSpanishMessage = () => spanishMessage
const withSpanishCatalog: Decorator = (Story) => (
  <UIProvider data={{ useProblemMessage: useSpanishMessage }}>
    <Story />
  </UIProvider>
)

const CODED = [
  {
    message: 'deploy reads needs.build, which it does not list.',
    line: 43,
    pick: () => {},
    code: 'job_not_needed',
    params: { job: 'deploy', needed: 'build' },
    type: '/problems/workflow/job_not_needed',
  },
  {
    message: 'inputs.taget is read, but there is no input called taget.',
    line: 31,
    code: 'undefined_input',
    type: 'about:blank',
  },
]

/** Coded problems, open: the first reads in the host's language and links to its page; the second
 *  has no message in the host's catalog and no page, so it keeps its own text. */
export const CodedProblemsOpen: StoryObj<typeof ProblemsButton> = {
  decorators: [withSpanishCatalog],
  args: { problems: CODED },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'))
    const list = await screen.findByRole('dialog', { name: '2 problems' })
    await waitFor(() => expect(list).toBeVisible())
    await expect(within(list).getByText(/deploy lee needs\.build/)).toBeInTheDocument()
    await expect(within(list).getAllByRole('link', { name: /About this problem/ })).toHaveLength(1)
  },
}

/** Nothing to count: the button isn't drawn. */
export const NoProblems: StoryObj<typeof ProblemsButton> = {
  args: { problems: [] },
}
