import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { DisplayIcon, FilterIcon, KeyboardIcon, MoreIcon } from '../icons'
import { ActionMenu } from './ActionMenu'
import { Button } from './Button'
import { Drawer, type DrawerProps } from './Drawer'
import { IconButton } from './IconButton'
import { Modal } from './Modal'
import { Popover, type PopoverProps, useClosePopover } from './Popover'
import { Select } from './Select'
import { Switch } from './Switch'
import { toast } from './Toast'

const meta: Meta = {
  title: 'UI/Overlays',
}
export default meta

type DrawerArgs = Pick<
  DrawerProps,
  'side' | 'resizable' | 'modal' | 'dismissible' | 'closeButton' | 'width'
> & { footer: boolean }

function DrawerDemo({ footer, ...props }: DrawerArgs) {
  const [open, setOpen] = useState(false)
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
  },
  argTypes: {
    side: { control: 'inline-radio', options: ['left', 'right'] },
    width: { control: 'text', description: 'Pixels, or a CSS length such as 100%.' },
    modal: { control: 'inline-radio', options: [true, 'trap-focus', false] },
    dismissible: { control: 'boolean', description: 'False ignores Escape and the backdrop.' },
  },
  render: (args) => <DrawerDemo {...args} />,
  play: async ({ canvasElement }) => {
    await openDrawer(canvasElement)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
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

/** Inside an embedded panel: it covers the panel, not the window. */
export const DrawerContained: StoryObj = {
  name: 'Drawer, contained',
  render: () => {
    const Panel = () => {
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
    return <Panel />
  },
}

type PopoverArgs = Pick<PopoverProps, 'side' | 'align' | 'openOnHover'>

/** A panel of controls under the button that opens it, named by its title. */
export const PopoverStory: StoryObj<PopoverArgs> = {
  name: 'Popover',
  args: { side: 'bottom', align: 'start', openOnHover: false },
  argTypes: {
    side: { control: 'inline-radio', options: ['top', 'bottom', 'left', 'right'] },
    align: { control: 'inline-radio', options: ['start', 'center', 'end'] },
    openOnHover: {
      control: 'boolean',
      description: 'Also opens on hover; a press still opens it.',
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

/** Whether the element drawn at an element's center is that element or inside it, so nothing covers it. */
const onTop = (el: Element) => {
  const box = el.getBoundingClientRect()
  const drawn = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  return drawn !== null && el.contains(drawn)
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
 *  however deep, and a toast stays above them all. */
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
    toast.info('Over the open select')
    const region = screen.getByRole('region', { name: 'Notifications' })
    const shown = await within(region).findByText('Over the open select')
    await waitFor(() => expect(onTop(shown)).toBe(true))
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
