import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef, useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import {
  DisplayIcon,
  FilterIcon,
  FolderIcon,
  GridIcon,
  HomeIcon,
  KeyboardIcon,
  MoreIcon,
  SettingsIcon,
} from '../icons'
import { onTop } from '../test/stacking'
import { ActionMenu } from './ActionMenu'
import { Button } from './Button'
import { DatePicker } from './DatePicker'
import { Drawer, type DrawerProps } from './Drawer'
import { HoverCard } from './HoverCard'
import { IconButton } from './IconButton'
import { Modal } from './Modal'
import { Popover, type PopoverProps, useClosePopover } from './Popover'
import { Select } from './Select'
import { Switch } from './Switch'
import { toast } from './Toast'
import { Tooltip } from './Tooltip'

const meta: Meta = {
  title: 'UI/Overlays',
}
export default meta

type DrawerArgs = Pick<
  DrawerProps,
  'side' | 'resizable' | 'modal' | 'dismissible' | 'closeButton' | 'width'
> & { footer: boolean; back?: boolean }

function DrawerDemo({ footer, back = false, ...props }: DrawerArgs) {
  const [open, setOpen] = useState(false)
  const [backs, setBacks] = useState(0)
  return (
    <div className="p-8">
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open drawer
      </Button>
      <Drawer
        {...props}
        open={open}
        onClose={() => setOpen(false)}
        title="Edit quota"
        description="Limits for every workload in the namespace."
        onBack={back ? () => setBacks((n) => n + 1) : undefined}
        footer={
          footer && (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setOpen(false)}>
                Save
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex items-center justify-between gap-3">
            Enforce limits
            <Switch defaultChecked />
          </label>
          <p className="text-(--theme-muted-text-color)">
            The body scrolls under the header and footer when its content runs long.
          </p>
          {backs > 0 && <p>Back pressed: {backs}</p>}
        </div>
      </Drawer>
    </div>
  )
}

const openDrawer = async (canvasElement: HTMLElement) => {
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'Open drawer' }))
  const dialog = await screen.findByRole('dialog', { name: 'Edit quota' })
  await waitFor(() => expect(dialog).toBeVisible())
  return dialog
}

/** A side panel over the page: Escape, the backdrop or a swipe toward its edge close it. */
export const DrawerStory: StoryObj<DrawerArgs> = {
  name: 'Drawer',
  args: {
    side: 'right',
    width: 480,
    resizable: false,
    modal: true,
    dismissible: true,
    closeButton: true,
    footer: true,
    back: false,
  },
  argTypes: {
    side: { control: 'inline-radio', options: ['left', 'right'] },
    width: { control: 'text', description: 'Pixels, or a CSS length such as 100%.' },
    modal: { control: 'inline-radio', options: [true, 'trap-focus', false] },
    dismissible: { control: 'boolean', description: 'False ignores Escape and the backdrop.' },
    back: { control: 'boolean', description: 'Passes `onBack`, for a view opened over the first.' },
  },
  render: (args) => <DrawerDemo {...args} />,
  play: async ({ canvasElement }) => {
    await openDrawer(canvasElement)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** A view the drawer opened over its first, such as a form: a back arrow leads the header. */
export const DrawerBack: StoryObj = {
  name: 'Drawer, with a back arrow',
  render: () => <DrawerDemo back footer />,
  play: async ({ canvasElement }) => {
    await openDrawer(canvasElement)
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await expect(await screen.findByText('Back pressed: 1')).toBeInTheDocument()
  },
}

/** A drag on the inner edge, or the arrow keys on it, set the width. */
export const DrawerResizable: StoryObj = {
  name: 'Drawer, resizable',
  render: () => <DrawerDemo resizable footer={false} />,
  play: async ({ canvasElement }) => {
    await openDrawer(canvasElement)
    const handle = screen.getByRole('separator', { name: 'Resize panel' })
    const before = Number(handle.getAttribute('aria-valuenow'))
    handle.focus()
    await userEvent.keyboard('{ArrowLeft}')
    await expect(Number(handle.getAttribute('aria-valuenow'))).toBe(before + 16)
  },
}

/** Unsaved input: Escape and the backdrop leave it open; its footer closes it. */
export const DrawerNotDismissible: StoryObj = {
  name: 'Drawer, not dismissible',
  render: () => <DrawerDemo dismissible={false} closeButton={false} footer />,
  play: async ({ canvasElement }) => {
    const dialog = await openDrawer(canvasElement)
    await userEvent.keyboard('{Escape}')
    await expect(dialog).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** Under a host's top bar: `--app-inset-top` keeps the bar uncovered, and
 *  `--app-inset-start` the sidebar beside a drawer at its widest. */
function HostChrome() {
  // Hosts set the insets on the document root, where the drawer's portal reads them.
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--app-inset-top', '56px')
    root.setProperty('--app-inset-start', '220px')
    return () => {
      root.removeProperty('--app-inset-top')
      root.removeProperty('--app-inset-start')
    }
  }, [])
  return (
    <div className="flex h-14 items-center border-b border-(--theme-border) px-4 text-sm font-semibold">
      Top bar
    </div>
  )
}

export const DrawerUnderTopBar: StoryObj = {
  name: 'Drawer, under a top bar',
  render: () => (
    <>
      <HostChrome />
      <DrawerDemo footer={false} />
    </>
  ),
  play: async ({ canvasElement }) => {
    const dialog = await openDrawer(canvasElement)
    await waitFor(() => expect(dialog.getBoundingClientRect().top).toBe(56))
  },
}

function DrawerContainedExample() {
  const [open, setOpen] = useState(true)
  return (
    <div
      style={{ position: 'relative', overflow: 'hidden', width: 390, height: 480 }}
      className="border border-(--theme-border)"
    >
      <div className="p-4">
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Open list
        </Button>
      </div>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Conversations"
        side="left"
        width="min(20rem, 85%)"
        modal="trap-focus"
        contained
      >
        <p className="text-sm">Covers only the panel it sits in.</p>
      </Drawer>
    </div>
  )
}

/** Inside an embedded panel: it covers the panel, not the window. */
export const DrawerContained: StoryObj = {
  name: 'Drawer, contained',
  render: () => <DrawerContainedExample />,
}

type PopoverArgs = Pick<
  PopoverProps,
  'side' | 'align' | 'openOnHover' | 'hoverDelay' | 'hoverCloseDelay' | 'keepSide' | 'sheet'
>

/** A panel of controls under the button that opens it, named by its title. At phone width it
 *  opens as a sheet along the bottom of the screen. */
export const PopoverStory: StoryObj<PopoverArgs> = {
  name: 'Popover',
  args: {
    side: 'bottom',
    align: 'start',
    openOnHover: false,
    hoverDelay: 300,
    hoverCloseDelay: 150,
    keepSide: false,
    sheet: true,
  },
  argTypes: {
    side: { control: 'inline-radio', options: ['top', 'bottom', 'left', 'right'] },
    align: { control: 'inline-radio', options: ['start', 'center', 'end'] },
    openOnHover: {
      control: 'boolean',
      description: 'Also opens on hover; a press still opens it.',
    },
    hoverDelay: {
      control: { type: 'number', min: 0, step: 50 },
      description: 'With openOnHover: milliseconds the pointer rests before it opens.',
    },
    hoverCloseDelay: {
      control: { type: 'number', min: 0, step: 50 },
      description: 'With openOnHover: milliseconds it stays open after the pointer leaves.',
    },
    keepSide: {
      control: 'boolean',
      description: 'Stays on `side` where it does not fit rather than flipping to the other.',
    },
    sheet: {
      control: 'boolean',
      description: 'At phone width, opens as a sheet along the bottom of the screen.',
    },
  },
  render: (args) => (
    <div className="p-8">
      <Popover
        {...args}
        title="Widget options"
        className="w-72"
        trigger={<Button variant="ghost">Options</Button>}
      >
        <label className="flex items-center justify-between gap-3 text-sm">
          Show legend
          <Switch defaultChecked />
        </label>
      </Popover>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Options' }))
    const dialog = await screen.findByRole('dialog', { name: 'Widget options' })
    await waitFor(() => expect(dialog).toBeVisible())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

function OrganizationLink({ name }: { name: string }) {
  const close = useClosePopover()
  return (
    <a
      href={`/organizations/${name.toLowerCase()}`}
      // As a router's link does: navigate in place, then close.
      onClick={(e) => {
        e.preventDefault()
        close()
      }}
      className="block rounded-md px-3 py-1.5 text-sm hover:bg-(--theme-hover)"
    >
      {name}
    </a>
  )
}

/** A list of links; following one closes the panel. */
export const PopoverOfLinks: StoryObj = {
  name: 'Popover of links',
  render: () => (
    <div className="p-8">
      <Popover
        aria-label="Organizations"
        className="w-64 p-1"
        trigger={<Button variant="ghost">Switch organization</Button>}
      >
        {['Research', 'Platform', 'Finance'].map((name) => (
          <OrganizationLink key={name} name={name} />
        ))}
      </Popover>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Switch organization' }),
    )
    await userEvent.click(await screen.findByRole('link', { name: 'Platform' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

function RailLink({ name }: { name: string }) {
  const close = useClosePopover()
  return (
    <a
      href={`#${name.toLowerCase()}`}
      onClick={(e) => {
        e.preventDefault()
        close()
      }}
      className="block rounded-md px-2 py-1.5 text-sm hover:bg-(--theme-hover)"
    >
      {name}
    </a>
  )
}

const railGroups = [
  { label: 'Home', icon: <HomeIcon />, links: ['Overview', 'Activity'] },
  { label: 'Projects', icon: <FolderIcon />, links: ['All projects', 'Archived', 'Templates'] },
  { label: 'Settings', icon: <SettingsIcon />, links: ['General', 'Members', 'Billing'] },
]

/** A collapsed rail: each group opens its links beside it at once on hover and stays a moment
 *  after the pointer leaves, so it can cross to them. A press, Enter or a tap opens it too, and
 *  focus moves in so the links are reachable from the keyboard. */
export const PopoverRailFlyout: StoryObj = {
  name: 'Popover, flyout on a collapsed rail',
  render: () => (
    <nav
      aria-label="Main"
      className="flex w-12 flex-col items-center gap-1 border-r border-(--theme-border) py-2"
      style={{ height: 240 }}
    >
      {railGroups.map((group) => (
        <Popover
          key={group.label}
          openOnHover
          hoverDelay={0}
          hoverCloseDelay={100}
          side="right"
          align="start"
          title={group.label}
          className="w-48"
          trigger={
            <button
              type="button"
              aria-label={group.label}
              className="flex size-8 items-center justify-center rounded-md theme-muted-text hover:bg-(--theme-hover) data-popup-open:bg-(--theme-hover) [&_svg]:size-4"
            >
              {group.icon}
            </button>
          }
        >
          <div className="-mx-2 -mb-1">
            {group.links.map((link) => (
              <RailLink key={link} name={link} />
            ))}
          </div>
        </Popover>
      ))}
    </nav>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Projects' }))
    const flyout = await screen.findByRole('dialog', { name: 'Projects' })
    await waitFor(() => expect(flyout).toBeVisible())
    await expect(within(flyout).getByRole('link', { name: 'Archived' })).toBeVisible()
  },
}

const launcherApps = [
  { name: 'Projects', color: '#2563eb' },
  { name: 'Notebooks', color: '#16a34a' },
  { name: 'Reports', color: '#d97706' },
]

function AppLauncher() {
  const [open, setOpen] = useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      sheet={false}
      aria-label="Apps"
      className="grid w-64 gap-1 p-2"
      // The library's stylesheet leaves out story-only utilities.
      style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
      trigger={
        // Its own name is the hint, so the tip stays shut while the grid is open.
        <Tooltip content="Apps" side="right" disabled={open}>
          <button
            type="button"
            aria-label="Apps"
            className="flex size-7 items-center justify-center rounded-md theme-muted-text hover:bg-(--theme-hover) data-popup-open:bg-(--theme-hover) [&_svg]:size-4"
          >
            <GridIcon />
          </button>
        </Tooltip>
      }
    >
      {launcherApps.map((app) => (
        <a
          key={app.name}
          href={`#${app.name.toLowerCase()}`}
          className="flex flex-col items-center gap-1.5 rounded-md p-2 text-center text-xs hover:bg-(--theme-hover)"
        >
          <span className="size-10 rounded-lg" style={{ background: app.color }} />
          {app.name}
        </a>
      ))}
    </Popover>
  )
}

/** A trigger with a hint: a Tooltip wraps the button, and the panel still opens beside it. */
export const PopoverTooltipTrigger: StoryObj = {
  name: 'Popover, trigger with a tooltip',
  render: () => (
    <div className="p-8">
      <div className="flex items-center justify-between" style={{ width: 240 }}>
        <span className="text-sm font-semibold">Workspace</span>
        <AppLauncher />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Apps' })
    await userEvent.click(trigger)
    const panel = await screen.findByRole('dialog', { name: 'Apps' })
    await waitFor(() => expect(panel).toBeVisible())
    // Placed from the trigger: below it and starting at its edge, not at the page's corner.
    const below = trigger.getBoundingClientRect()
    await waitFor(() => {
      const placed = panel.getBoundingClientRect()
      expect(placed.top).toBeGreaterThan(below.bottom)
      expect(Math.round(placed.left)).toBe(Math.round(below.left))
    })
  },
}

/** A preview after a short hover or on focus, such as a person behind their name. */
export const HoverCardStory: StoryObj<{ defaultOpen: boolean }> = {
  name: 'Hover card',
  args: { defaultOpen: true },
  render: ({ defaultOpen }) => (
    <p className="p-8 text-sm">
      Assigned to{' '}
      <HoverCard
        defaultOpen={defaultOpen}
        card={
          <div className="w-64 p-3 text-sm">
            <p className="m-0 font-semibold">Grace Hopper</p>
            <p className="m-0 mt-1 theme-muted-text">Platform team, on call this week</p>
          </div>
        }
      >
        <a href="#grace" className="font-medium underline">
          Grace Hopper
        </a>
      </HoverCard>
    </p>
  ),
}

const glossary: Record<string, { title: string; text: string }> = {
  quota: { title: 'Quota', text: 'The most a namespace can use of a resource at once.' },
  'node pool': { title: 'Node pool', text: 'Machines of one shape that scale together.' },
}

/** Terms in rendered text with no element of their own to wrap: one listener on the text opens
 *  the card at whichever term the pointer or focus is on, and keeps it open while the pointer
 *  is over the card. The host owns the delays; Escape and a press outside ask it to close. */
function WatchedTerms() {
  const [term, setTerm] = useState<HTMLElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const later = (next: HTMLElement | null, ms: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setTerm(next), ms)
  }
  const termAt = (target: EventTarget) =>
    target instanceof HTMLElement ? target.closest<HTMLElement>('[data-term]') : null
  return (
    <div className="p-8 text-sm">
      <p
        className="m-0 max-w-md leading-6"
        onPointerOver={(e) => {
          const at = termAt(e.target)
          if (at) {
            later(at, 300)
          }
        }}
        onPointerOut={(e) => {
          if (termAt(e.target)) {
            later(null, 200)
          }
        }}
        onFocus={(e) => setTerm(termAt(e.target))}
      >
        Each namespace has a{' '}
        <button
          type="button"
          data-term="quota"
          className="cursor-help underline underline-offset-2"
        >
          quota
        </button>{' '}
        on CPU and memory, and its jobs run on a{' '}
        <button
          type="button"
          data-term="node pool"
          className="cursor-help underline underline-offset-2"
        >
          node pool
        </button>{' '}
        picked when it was created.
      </p>
      <HoverCard
        at={term}
        open={term !== null}
        onOpenChange={(open) => {
          if (!open) {
            clearTimeout(timer.current)
            setTerm(null)
          }
        }}
        onPointerEnter={() => clearTimeout(timer.current)}
        onPointerLeave={() => later(null, 200)}
        card={
          <div className="w-64 p-3 text-sm">
            <p className="m-0 font-semibold">{glossary[term?.dataset['term'] ?? '']?.title}</p>
            <p className="m-0 mt-1 theme-muted-text">
              {glossary[term?.dataset['term'] ?? '']?.text}
            </p>
          </div>
        }
      />
    </div>
  )
}

export const HoverCardAtWatchedElement: StoryObj = {
  name: 'Hover card, opened at a watched element',
  render: () => <WatchedTerms />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByText('quota').focus()
    await expect(
      await screen.findByText('The most a namespace can use of a resource at once.'),
    ).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByText('The most a namespace can use of a resource at once.')).toBeNull(),
    )
  },
}

/** Outline icon buttons, as on a page header strip: one narrowing the page shows a
 *  dot, and a single-key shortcut presses it. Their tooltips hide while their popup is open. */
export const IconButtonTriggers: StoryObj<{ dot: boolean }> = {
  name: 'Icon button triggers',
  args: { dot: true },
  render: ({ dot }) => (
    <div className="flex items-center gap-2 p-8">
      <Popover
        title="Filter"
        align="end"
        className="w-56"
        trigger={
          <IconButton
            variant="outline"
            icon={<FilterIcon />}
            label="Filter"
            dot={dot}
            shortcut="f"
          />
        }
      >
        <p className="text-sm">Press F anywhere outside a text field to open this.</p>
      </Popover>
      <Popover
        aria-label="Display"
        align="end"
        className="w-56"
        trigger={<IconButton variant="outline" icon={<DisplayIcon />} label="Display" />}
      >
        <p className="text-sm">Display options</p>
      </Popover>
      <IconButton variant="ghost" size="sm" icon={<KeyboardIcon />} label="Shortcuts" />
    </div>
  ),
  play: async () => {
    await userEvent.keyboard('f')
    const dialog = await screen.findByRole('dialog', { name: 'Filter' })
    await waitFor(() => expect(dialog).toBeVisible())
  },
}

const sizes = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
]

function PopupsInDialogs() {
  const [modal, setModal] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const menu = [
    { label: 'Duplicate', onClick: () => {} },
    { label: 'Archive', onClick: () => {} },
  ]
  return (
    <div className="flex gap-2 p-8">
      <Button onClick={() => setModal(true)}>Open modal</Button>
      <Button onClick={() => setDrawer(true)}>Open drawer</Button>
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        aria-label="Resize"
        className="flex w-80 flex-col gap-3 p-4"
      >
        <Select items={sizes} defaultValue="medium" aria-label="Size" />
        <ActionMenu items={menu} label="Modal actions">
          <MoreIcon />
        </ActionMenu>
        <Button onClick={() => setModal(false)}>Done</Button>
      </Modal>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Details">
        <div className="flex gap-2">
          <ActionMenu items={menu} label="Drawer actions">
            <MoreIcon />
          </ActionMenu>
          <Popover title="Filter" trigger={<Button size="sm">Filter</Button>}>
            <Select items={sizes} defaultValue="small" aria-label="Filter size" />
          </Popover>
        </div>
      </Drawer>
    </div>
  )
}

/** Menus, selects and popovers open over the modal or drawer they belong to,
 *  however deep. A toast shows over the modal, and an open select stays open and
 *  uncovered. */
export const PopupsInDialogsStory: StoryObj = {
  name: 'Popups in dialogs',
  render: () => <PopupsInDialogs />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const shows = async (role: string, name: string) => {
      const el = await screen.findByRole(role, { name })
      await waitFor(() => expect(onTop(el), `${name} is covered`).toBe(true))
    }

    await userEvent.click(canvas.getByRole('button', { name: 'Open modal' }))
    const modal = await screen.findByRole('dialog', { name: 'Resize' })
    await userEvent.click(within(modal).getByRole('combobox', { name: 'Size' }))
    await shows('option', 'Large')
    toast.info('Over the modal')
    const region = screen.getByRole('region', { name: 'Notifications' })
    const shown = await within(region).findByText('Over the modal')
    await waitFor(() => expect(onTop(shown)).toBe(true))
    await shows('option', 'Large')
    toast.dismiss()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(within(modal).getByRole('button', { name: 'Modal actions' }))
    await shows('menuitem', 'Archive')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await userEvent.click(within(modal).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Resize' })).toBeNull())

    await userEvent.click(canvas.getByRole('button', { name: 'Open drawer' }))
    const drawer = await screen.findByRole('dialog', { name: 'Details' })
    await userEvent.click(within(drawer).getByRole('button', { name: 'Drawer actions' }))
    await shows('menuitem', 'Duplicate')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(within(drawer).getByRole('button', { name: 'Filter' }))
    const filter = await screen.findByRole('dialog', { name: 'Filter' })
    await userEvent.click(within(filter).getByRole('combobox', { name: 'Filter size' }))
    await shows('option', 'Medium')
  },
}

function PopupsInNativeDialog() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [due, setDue] = useState('2026-10-30')
  const menu = [
    { label: 'Duplicate', onClick: () => {} },
    { label: 'Archive', onClick: () => {} },
  ]
  return (
    <div className="p-8">
      <Button onClick={() => dialog.current?.showModal()}>Open native dialog</Button>
      <dialog
        ref={dialog}
        aria-label="New issue"
        // Stories are left out of the package's css build, so only its own classes apply.
        style={{ margin: 'auto', width: '24rem' }}
        className="rounded-xl border border-(--theme-border) bg-(--theme-app-bg) p-4 text-(--theme-app) shadow-(--theme-shadow-lg)"
      >
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm font-semibold">New issue</p>
          <Select items={sizes} defaultValue="medium" aria-label="Size" />
          <DatePicker aria-label="Due" value={due} onValueChange={setDue} />
          <div className="flex items-center gap-2">
            <ActionMenu items={menu} label="Issue actions">
              <MoreIcon />
            </ActionMenu>
            <Popover title="Labels" trigger={<Button size="sm">Labels</Button>}>
              <p className="m-0 text-sm">No labels yet</p>
            </Popover>
            <Button className="ml-auto" onClick={() => dialog.current?.close()}>
              Close
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  )
}

/** A host's own `<dialog>`, shown with showModal, sits in the browser's top layer.
 *  Menus, selects, pickers and popovers opened inside it open inside it too, over
 *  it and past its edges, and Escape closes the popup before the dialog. */
export const PopupsInNativeDialogStory: StoryObj = {
  name: 'Popups in a native dialog',
  render: () => <PopupsInNativeDialog />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const shows = async (role: string, name: string) => {
      const el = await screen.findByRole(role, { name })
      await waitFor(() => expect(onTop(el), `${name} is covered`).toBe(true))
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Open native dialog' }))
    const dialog = canvasElement.querySelector('dialog') as HTMLDialogElement
    await waitFor(() => expect(dialog.open).toBe(true))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Issue actions' }))
    await shows('menuitem', 'Archive')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(dialog.open).toBe(true)
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Size' }))
    await shows('option', 'Large')
  },
}
