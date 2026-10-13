import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import type { AvatarSize } from '../components/Avatar'
import { Avatar } from '../components/Avatar'
import { HoverCard } from '../components/HoverCard'
import { CalendarIcon, ClockIcon, LicenseIcon, MailIcon, UsersIcon } from '../icons'
import { HoverCardRow, UserHoverCard } from './UserHoverCard'

const meta: Meta = {
  title: 'UI/List/User hover card',
}
export default meta

const PHOTO = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='#06354f'/><circle cx='20' cy='15' r='7' fill='#8b5cf6'/><rect x='8' y='25' width='24' height='14' rx='7' fill='#06b6d4'/></svg>",
)}`

const SIZES: AvatarSize[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl']

export const Avatars: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {SIZES.map((size) => (
          <Avatar key={size} src={PHOTO} name="Ada Lovelace" size={size} />
        ))}
      </div>
      <div className="flex items-center gap-3">
        {SIZES.map((size) => (
          <Avatar key={size} name="Ada Lovelace" size={size} status="online" />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Avatar src="/missing-avatar.png" name="grace.hopper" />
        <Avatar status="offline" />
        <Avatar name="Alan" status="busy" />
        <Avatar name="Katherine Johnson" status="away" />
      </div>
    </div>
  ),
}

function Rows() {
  return (
    <>
      <HoverCardRow icon={<span className="h-2 w-2 rounded-full bg-emerald-500" />}>
        Online
      </HoverCardRow>
      <HoverCardRow icon={<LicenseIcon className="text-emerald-500" />}>Licensed</HoverCardRow>
      <HoverCardRow icon={<MailIcon />} title="Copy email" truncate onClick={() => {}}>
        ada.lovelace@example.com
      </HoverCardRow>
      <HoverCardRow icon={<UsersIcon />} align="start">
        analytical-engine, mathematics, research-computing
      </HoverCardRow>
      <HoverCardRow icon={<ClockIcon />} title="Europe/London">
        9:41 AM local time
      </HoverCardRow>
      <HoverCardRow icon={<CalendarIcon />}>Joined Dec 10, 2015</HoverCardRow>
    </>
  )
}

/** A card already open below its anchor, as a hover leaves it. */
function Opened({ anchor, card }: { anchor: string; card: ReactNode }) {
  return (
    <HoverCard defaultOpen card={card}>
      <a href={`/users/${anchor}`} className="text-sm">
        {anchor}
      </a>
    </HoverCard>
  )
}

export const Open: StoryObj = {
  render: () => (
    <Opened
      anchor="alovelace"
      card={
        <UserHoverCard
          username="alovelace"
          name="Ada Lovelace"
          avatarSrc={PHOTO}
          badge="Admin"
          href="/users/alovelace"
        >
          <Rows />
        </UserHoverCard>
      }
    />
  ),
  play: async () => {
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeVisible())
    await expect(screen.getByRole('link', { name: /Ada Lovelace/ })).toHaveAttribute(
      'href',
      '/users/alovelace',
    )
  },
}

export const Loading: StoryObj = {
  render: () => (
    <Opened
      anchor="alovelace"
      card={<UserHoverCard username="alovelace" href="/users/alovelace" loading />}
    />
  ),
}

export const OnHover: StoryObj = {
  render: () => (
    <HoverCard
      card={
        <UserHoverCard username="ghopper" name="Grace Hopper" href="/users/ghopper">
          <Rows />
        </UserHoverCard>
      }
    >
      <a href="/users/ghopper" className="inline-flex items-center gap-2 text-sm">
        <Avatar name="Grace Hopper" size="sm" />
        ghopper
      </a>
    </HoverCard>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByText('ghopper'))
    await waitFor(() => expect(screen.getByText('Grace Hopper')).toBeVisible())
    await userEvent.unhover(canvas.getByText('ghopper'))
    await waitFor(() => expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument())
  },
}

const UNBROKEN_NAME = 'Bartholomewaloysiuswetheringtonfairweather'

/** Names wrap instead of truncating: the badge drops below a name it no longer
 * fits beside, and an unbroken name breaks mid-word. The username stays one
 * truncated line. */
export const LongNames: StoryObj = {
  render: () => (
    <div className="flex" style={{ gap: 288 }}>
      <Opened
        anchor="kjohnson"
        card={
          <UserHoverCard
            username="kjohnson"
            name="Katherine Johnson"
            badge="Member"
            href="/users/kjohnson"
          >
            <Rows />
          </UserHoverCard>
        }
      />
      <Opened
        anchor="bwetherington"
        card={
          <UserHoverCard
            username="bartholomew.aloysius.wetherington.fairweather"
            name={UNBROKEN_NAME}
            avatarSrc={PHOTO}
            badge="Admin"
            href="/users/bwetherington"
          >
            <Rows />
          </UserHoverCard>
        }
      />
    </div>
  ),
  play: async () => {
    for (const name of ['Katherine Johnson', UNBROKEN_NAME]) {
      const el = await screen.findByText(name)
      await waitFor(() => expect(el).toBeVisible())
      await expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth)
    }
  },
}

/** The card offers to copy its username, named "email" when it is one. The
 * button appears while the username is hovered, without moving anything. */
export const CopyEmail: StoryObj = {
  render: () => (
    <Opened
      anchor="alovelace"
      card={
        <UserHoverCard
          username="ada.lovelace@example.com"
          name="Ada Lovelace"
          avatarSrc={PHOTO}
          badge="Admin"
          href="/users/alovelace"
        >
          <HoverCardRow icon={<ClockIcon />}>9:41 AM local time</HoverCardRow>
        </UserHoverCard>
      }
    />
  ),
  play: async () => {
    const button = await screen.findByRole('button', { name: 'Copy email' })
    await userEvent.hover(screen.getByText('ada.lovelace@example.com'))
    await expect(button).toBeInTheDocument()
  },
}
