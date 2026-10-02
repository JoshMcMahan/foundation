import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent, within } from 'storybook/test'
import type { AvatarSize } from '../components/Avatar'
import { Avatar } from '../components/Avatar'
import { AccessIcon, CalendarIcon, ClockIcon, LicenseIcon, MailIcon } from '../icons'
import {
  type HoverCardPlacement,
  HoverCardRow,
  HoverCardTrigger,
  UserHoverCard,
} from './UserHoverCard'

const meta: Meta = {
  title: 'UI/List/User hover card',
}
export default meta

const PHOTO = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='#06354f'/><circle cx='20' cy='15' r='7' fill='#8b5cf6'/><rect x='8' y='25' width='24' height='14' rx='7' fill='#06b6d4'/></svg>",
)}`

const SIZES: AvatarSize[] = ['sm', 'md', 'lg', 'xl', '2xl']

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
      <HoverCardRow icon={<AccessIcon />} align="start">
        analytical-engine, mathematics, research-computing
      </HoverCardRow>
      <HoverCardRow icon={<ClockIcon />} title="Europe/London">
        9:41 AM local time
      </HoverCardRow>
      <HoverCardRow icon={<CalendarIcon />}>Joined Dec 10, 2015</HoverCardRow>
    </>
  )
}

const PLACEMENT: HoverCardPlacement = {
  x: 24,
  y: 24,
  onKeepOpen: () => {},
  onLeave: () => {},
}

export const Open: StoryObj = {
  render: () => (
    <UserHoverCard
      {...PLACEMENT}
      username="alovelace"
      name="Ada Lovelace"
      avatarSrc={PHOTO}
      badge="Admin"
      href="/users/alovelace"
    >
      <Rows />
    </UserHoverCard>
  ),
  play: async () => {
    await expect(await screen.findByText('Ada Lovelace')).toBeVisible()
    await expect(screen.getByRole('link')).toHaveAttribute('href', '/users/alovelace')
  },
}

export const Loading: StoryObj = {
  render: () => (
    <UserHoverCard {...PLACEMENT} username="alovelace" href="/users/alovelace" loading />
  ),
}

export const OnHover: StoryObj = {
  render: () => (
    <HoverCardTrigger
      className="inline-flex"
      card={(placement) => (
        <UserHoverCard {...placement} username="ghopper" name="Grace Hopper" href="/users/ghopper">
          <Rows />
        </UserHoverCard>
      )}
    >
      <span className="inline-flex items-center gap-2 text-sm">
        <Avatar name="Grace Hopper" size="sm" />
        ghopper
      </span>
    </HoverCardTrigger>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByText('ghopper'))
    await expect(await screen.findByText('Grace Hopper')).toBeVisible()
  },
}
