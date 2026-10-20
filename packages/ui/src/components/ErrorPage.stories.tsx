import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Button } from './Button'
import { ErrorPage, type ErrorPageKind, type ErrorPageProps } from './ErrorPage'
import { UIProvider } from './Provider'

interface Args {
  status: number | undefined
  kind: ErrorPageKind | undefined
  layout: NonNullable<ErrorPageProps['layout']>
  title: string
  description: string
  canGoBack: boolean
}

const meta: Meta<Args> = {
  title: 'UI/ErrorPage',
  args: {
    status: 404,
    kind: undefined,
    layout: 'page',
    title: '',
    description: '',
    canGoBack: true,
  },
  argTypes: {
    status: { control: 'number', description: 'Shown large, and picks the default words.' },
    kind: {
      control: 'select',
      options: [
        undefined,
        'notFound',
        'forbidden',
        'unauthenticated',
        'unavailable',
        'server',
        'network',
      ],
      description: 'Picks the words when no status says what went wrong.',
    },
    layout: { control: 'inline-radio', options: ['page', 'card', 'inline'] },
    title: { description: 'Replaces the default title.' },
    description: { description: 'Replaces the default description.' },
    canGoBack: { description: 'Whether the host has history to go back through.' },
  },
}
export default meta

// The history the host's router reports, so both ways back can be seen.
function Frame({ canGoBack, children }: { canGoBack: boolean; children: React.ReactNode }) {
  return (
    <UIProvider navigation={{ canGoBack: () => canGoBack, goBack: () => {} }}>
      {children}
    </UIProvider>
  )
}

function render({ status, kind, layout, title, description, canGoBack }: Args) {
  const page = (
    <ErrorPage
      status={status}
      kind={kind}
      layout={layout}
      title={title || undefined}
      description={description || undefined}
    />
  )
  return (
    <Frame canGoBack={canGoBack}>
      {layout === 'page' ? (
        // A page's region of its own; inline, since stories aren't scanned.
        <div className="flex flex-col" style={{ height: '36rem' }}>
          {page}
        </div>
      ) : layout === 'card' ? (
        <div className="panel max-w-xl">{page}</div>
      ) : (
        <div className="max-w-xl">{page}</div>
      )}
    </Frame>
  )
}

/** A page that could not load: the status large in the theme's gradient over
 *  two slow glows, its words from the status, and the way back. */
export const NotFound: StoryObj<Args> = {
  render,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Could not find the requested page' }),
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Back' })).toBeVisible()
  },
}

/** A server error with no history to go back through: the way back is home. */
export const ServerError: StoryObj<Args> = {
  args: { status: 500, canGoBack: false },
  render,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'Back to home' })).toBeVisible()
  },
}

/** Signed out, with a way on before the way back. */
export const SignedOut: StoryObj<Args> = {
  args: { status: 401 },
  render: (args) => (
    <Frame canGoBack={args.canGoBack}>
      <div className="flex flex-col" style={{ height: '36rem' }}>
        <ErrorPage
          status={401}
          actions={
            <Button variant="primary" size="sm" href="/login">
              Sign in
            </Button>
          }
        />
      </div>
    </Frame>
  ),
}

/** In a card, the backdrop clipped to its corners and the title one level down. */
export const InACard: StoryObj<Args> = {
  args: { layout: 'card', status: 403 },
  render,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('heading', { level: 2 })).toBeVisible()
  },
}

/** In a section's flow, with no backdrop, and a way back of the host's own. */
export const Inline: StoryObj<Args> = {
  args: { layout: 'inline', status: undefined, kind: 'network' },
  render: (args) => (
    <Frame canGoBack={args.canGoBack}>
      <div className="max-w-xl">
        <ErrorPage
          layout="inline"
          kind="network"
          back={{ href: '/sessions', label: 'Back to sessions' }}
        />
      </div>
    </Frame>
  ),
}

/** A host's own message in place of the status's, wrapping at phone width,
 *  with the code sized down for the narrow screen. */
export const LongMessageOnAPhone: StoryObj<Args> = {
  args: { status: undefined },
  render: (args) => (
    <Frame canGoBack={args.canGoBack}>
      <div className="flex flex-col" style={{ height: '36rem', width: '320px' }}>
        <ErrorPage
          status={503}
          description="The scheduler for this cluster didn’t answer within thirty seconds, so the list of partitions couldn’t be read. It may be restarting after an upgrade."
        />
      </div>
    </Frame>
  ),
}
