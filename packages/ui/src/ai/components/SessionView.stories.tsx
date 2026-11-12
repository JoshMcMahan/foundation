import type { Meta, StoryObj } from '@storybook/react-vite'
import { within } from 'storybook/test'
import {
  makeAgentTurn,
  makeMessage,
  makeToolCallPart,
  StoryChat,
  StoryViewport,
} from '../stories/harness'
import type { ChatMessage } from '../types'
import SessionView from './SessionView'

const meta: Meta = {
  title: 'Chat/Session view',
  component: SessionView,
  parameters: { layout: 'fullscreen' },
}

export default meta

const REPORT = `Opened the PR: **fix(e2e): the sign-in form no longer waits on the hero image** (#412).

**What it does**

- The form renders as soon as the session request answers, instead of waiting for \`hero.webp\` to finish loading.
- The test waits for the session response rather than a fixed timeout, so a slow runner makes it slower rather than flaky.
- The wait is in \`waitForSession.ts\`, beside the other test helpers, and \`signIn.spec.ts\` uses it.

**Runs in the description**

- Before: \`runs/before/\`, 7 failures in 40 runs, all at the 5s timeout.
- After: \`runs/after/\`, 40 of 40 passed on the same runners.

**Things I set up or ran into**

- The local stack from the test runs is still up. Stop it with \`docker compose down\` from the repository root.
- For the before runs, I pinned the runner image to last week's (\`runner:2026-11-03\`) so the asset loaded as slowly as it does in CI.
- Shard 7 failed once on an unrelated timeout in \`billing.spec.ts\`. I left it alone and noted it in the PR.

**Checks**

- \`npm test -- e2e/signIn\`: 40 passed.
- \`npm run lint\` and \`npm run typecheck\`: clean.
- The sign-in spec ran 3 times with \`--repeat-each\`: all passed.

New files are \`waitForSession.ts\` and its test in \`e2e/helpers/\`; the form change is in \`SignInForm.tsx\`.`

const session: ChatMessage[] = [
  makeMessage({
    id: 'prompt-1',
    role: 'user',
    content: 'Why is shard 12 failing? It times out on the sign-in form about one run in five.',
  }),
  makeAgentTurn(),
  makeMessage({
    id: 'prompt-2',
    role: 'user',
    content:
      'yes open a pr, and put the before and after runs in its description\nleave the shard 7 flake out of it',
  }),
  makeMessage({
    role: 'assistant',
    content: null,
    parts: [
      makeToolCallPart({ command: 'git push -u origin fix/sign-in-wait', resultLines: 3 }),
      makeToolCallPart({ command: 'gh pr create --base main --fill', resultLines: 2 }),
      { kind: 'text', text: REPORT },
    ],
  }),
]

type PinnedPromptArgs = { pinPrompt: boolean }

function PinnedPromptExample({ pinPrompt }: PinnedPromptArgs) {
  return (
    <StoryChat>
      <StoryViewport>
        <SessionView
          key={String(pinPrompt)}
          sessionKey="story-pinned-prompt"
          messages={session}
          onSend={async () => true}
          flush
          foldEveryRun
          find
          pinPrompt={pinPrompt}
          workingIndicator={false}
        />
      </StoryViewport>
    </StoryChat>
  )
}

/** Once the prompt of the turn in view scrolls out of sight, its first line
 *  pins to the top of the transcript, as a terminal transcript pins it; a
 *  click goes back to it. */
export const PinnedPrompt: StoryObj<PinnedPromptArgs> = {
  args: { pinPrompt: true },
  argTypes: { pinPrompt: { control: 'boolean' } },
  render: (args) => <PinnedPromptExample {...args} />,
}

/** Scrolled back into the first turn, the pin shows that turn's prompt. */
export const PinnedPromptEarlierTurn: StoryObj<PinnedPromptArgs> = {
  ...PinnedPrompt,
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/Opened the PR/)
    const log = canvasElement.querySelector<HTMLElement>('[role="log"]')
    const second = canvasElement.querySelector<HTMLElement>('[data-prompt="prompt-2"]')
    if (log && second) {
      log.scrollTop +=
        second.getBoundingClientRect().top - log.getBoundingClientRect().top - log.clientHeight / 2
    }
  },
}
