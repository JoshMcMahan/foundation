import { Toast as BaseToast } from '@base-ui/react/toast'
import { type ReactNode, useEffect, useId, useSyncExternalStore } from 'react'
import { cx } from '../cx'
import { CloseIcon, ErrorIcon, InfoIcon, SuccessIcon, WarningIcon } from '../icons'
import { AppLink, type LinkTarget } from './AppLink'
import { buttonClasses } from './buttonClasses'
import { Loader } from './Loader'
import { useStrings } from './Provider'
import { toneIcon } from './tone'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

/** Runs `onClick`, or with `href` is a link, such as to what the toast reports
 *  on; either way the toast then closes. */
export type ToastAction =
  | { label: ReactNode; onClick: () => void; href?: undefined }
  | ({ label: ReactNode; onClick?: undefined } & LinkTarget & { href: string })

export interface ToastOptions {
  /** Shows the toast in place of an open one with this id, rather than stacking another. */
  id?: string | undefined
  /** A bold first line, with the message under it. */
  title?: ReactNode
  /** A button that acts on what the toast reports, such as Undo. */
  action?: ToastAction | undefined
  /** Milliseconds it stays; false keeps it until it's dismissed or updated. It
   *  pauses while the pointer or focus is on the toasts. */
  timeout?: number | false | undefined
  /** False drops the close button, for a toast whose own content closes or settles it. */
  dismissible?: boolean | undefined
  /** False drops the tone's icon, for content that draws its own. */
  icon?: boolean | undefined
}

export interface ToastUpdate extends Omit<ToastOptions, 'id'> {
  message?: ReactNode
  /** Settles the toast into this tone, such as a loading toast into success. The
   *  update then replaces the toast's options rather than adding to them, so it
   *  takes that tone's timeout, close button and icon unless it names its own. */
  tone?: ToastTone | undefined
}

export interface Toaster {
  info: (message: ReactNode, options?: ToastOptions) => string
  success: (message: ReactNode, options?: ToastOptions) => string
  warning: (message: ReactNode, options?: ToastOptions) => string
  /** Announced at once, where the others wait for a pause. */
  error: (message: ReactNode, options?: ToastOptions) => string
  /** A spinner that stays until an update settles it into a tone, or it's dismissed. */
  loading: (message: ReactNode, options?: ToastOptions) => string
  update: (id: string, update: ToastUpdate) => void
  /** Without an id, dismisses every toast. */
  dismiss: (id?: string) => void
  /** A loading toast that settles into success or error with the promise, which it returns. */
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: ReactNode
      success: ReactNode | ((value: T) => ReactNode)
      error: ReactNode | ((error: unknown) => ReactNode)
    },
  ) => Promise<T>
}

type Kind = ToastTone | 'loading'

interface ToastData {
  kind: Kind
  icon: boolean
  dismissible: boolean
  /** An action that navigates, which Base UI's action button can't render. */
  link?: ({ label: ReactNode } & LinkTarget) | undefined
}

// Base UI's toast action is a button, so an action with an href rides in the
// toast's data and renders as a link instead.
function actionFields(action: ToastAction) {
  if (action.href === undefined) {
    return { actionProps: { children: action.label, onClick: action.onClick }, link: undefined }
  }
  const { onClick: _, ...link } = action
  return { actionProps: undefined, link }
}

const manager = BaseToast.createToastManager<ToastData>()

const TIMEOUT: Record<Kind, number> = {
  info: 5000,
  success: 5000,
  warning: 8000,
  error: 8000,
  loading: 0,
}

/** Everything a toast shows, from its kind's defaults and the options that override them. */
function toastOptions(kind: Kind, message: ReactNode, options: Omit<ToastOptions, 'id'>) {
  const action = options.action && actionFields(options.action)
  return {
    type: kind,
    title: options.title,
    description: message,
    // Base UI keeps a toast for a timeout of 0.
    timeout: options.timeout === false ? 0 : (options.timeout ?? TIMEOUT[kind]),
    priority: kind === 'error' ? ('high' as const) : ('low' as const),
    actionProps: action?.actionProps,
    data: {
      kind,
      icon: options.icon ?? true,
      dismissible: options.dismissible ?? kind !== 'loading',
      link: action?.link,
    },
  }
}

function show(kind: Kind) {
  return (message: ReactNode, { id, ...options }: ToastOptions = {}) =>
    manager.add({ ...(id === undefined ? {} : { id }), ...toastOptions(kind, message, options) })
}

/** Shows toasts from anywhere, a component or not. They render in the
 *  `UIProvider`'s viewport, over dialogs and popups, and stay usable while a
 *  modal is open. */
export const toast: Toaster = {
  info: show('info'),
  success: show('success'),
  warning: show('warning'),
  error: show('error'),
  loading: show('loading'),
  update(id, { message, tone, ...options }) {
    manager.update(id, (previous) => {
      if (tone) {
        return toastOptions(tone, message ?? previous.description, options)
      }
      const data = previous.data ?? { kind: 'info', icon: true, dismissible: true }
      const action = options.action && actionFields(options.action)
      return {
        ...(message === undefined ? {} : { description: message }),
        ...('title' in options ? { title: options.title } : {}),
        ...(options.timeout === undefined
          ? {}
          : { timeout: options.timeout === false ? 0 : options.timeout }),
        ...(action ? { actionProps: action.actionProps } : {}),
        data: {
          kind: data.kind,
          icon: options.icon ?? data.icon,
          dismissible: options.dismissible ?? data.dismissible,
          link: action ? action.link : data.link,
        },
      }
    })
  },
  dismiss(id) {
    manager.close(id)
  },
  async promise(promise, messages) {
    const id = toast.loading(messages.loading)
    try {
      const value = await promise
      toast.update(id, {
        tone: 'success',
        message:
          typeof messages.success === 'function' ? messages.success(value) : messages.success,
      })
      return value
    } catch (error) {
      toast.update(id, {
        tone: 'error',
        message: typeof messages.error === 'function' ? messages.error(error) : messages.error,
      })
      throw error
    }
  },
}

/** Whether a dialog's close request came from a press on a toast, which the
 *  dialog ignores: a toast floats over it, so pressing one isn't leaving it. */
export function pressedToast(event: Event | undefined): boolean {
  const target = event?.target
  return target instanceof Element && target.closest('[data-toast-viewport]') !== null
}

// Every UIProvider mounts a viewport, but only the first one mounted shows the
// toasts, so a nested or sibling provider doesn't show them twice.
const viewports: string[] = []
const listeners = new Set<() => void>()
const changed = () => {
  for (const listener of listeners) {
    listener()
  }
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The viewport toasts render in, at the top of the window, where it clears a
 *  modal's panel (which opens lower) and the controls along a dialog's foot. */
export function Toaster() {
  const id = useId()
  useEffect(() => {
    viewports.push(id)
    changed()
    return () => {
      viewports.splice(viewports.indexOf(id), 1)
      changed()
    }
  }, [id])
  const shown = useSyncExternalStore(
    subscribe,
    () => viewports[0] === id,
    () => false,
  )
  if (!shown) {
    return null
  }
  return (
    <BaseToast.Provider toastManager={manager} limit={3}>
      <ToastViewport />
    </BaseToast.Provider>
  )
}

function ToastViewport() {
  const { common } = useStrings()
  return (
    <BaseToast.Portal>
      <BaseToast.Viewport
        data-toast-viewport=""
        aria-label={common.notifications}
        // Centered over the page beside the host's fixed sidebar and below its top bar, not over
        // the whole window, so a toast sits above the content it is about.
        className="fixed top-[calc(var(--app-inset-top,0px)+0.75rem)] right-0 left-(--app-inset-start,0px) z-(--layer-toast) mx-auto w-[calc(100vw-var(--app-inset-start,0px)-2rem)] outline-none sm:w-96"
      >
        <ToastList />
      </BaseToast.Viewport>
    </BaseToast.Portal>
  )
}

const ICONS: Record<ToastTone, typeof InfoIcon> = {
  info: InfoIcon,
  success: SuccessIcon,
  warning: WarningIcon,
  error: ErrorIcon,
}

function ToneIcon({ tone }: { tone: ToastTone }) {
  const Icon = ICONS[tone]
  return <Icon aria-hidden="true" className={cx('mt-0.5 size-4 shrink-0', toneIcon[tone])} />
}

const actionClasses = buttonClasses({ variant: 'outline', size: 'xs' })

function ToastList() {
  const { toasts } = BaseToast.useToastManager<ToastData>()
  const { common } = useStrings()
  return toasts.map((item) => {
    const { kind = 'info', icon = true, dismissible = true, link } = item.data ?? {}
    return (
      <BaseToast.Root
        key={item.id}
        toast={item}
        swipeDirection={['up', 'right']}
        className={cx(
          // Stacked toasts sit behind the newest, shrunk to its height and
          // peeking out beneath it; hovering or focusing them fans them out.
          '[--gap:0.5rem] [--peek:0.5rem] [--scale:calc(max(0,1-(var(--toast-index)*0.05)))] [--height:var(--toast-frontmost-height,var(--toast-height))]',
          '[--offset-y:calc(var(--toast-offset-y)+var(--toast-index)*var(--gap)+var(--toast-swipe-movement-y))]',
          'absolute inset-x-0 top-0 z-[calc(100-var(--toast-index))] h-(--height) origin-top select-none',
          '[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+var(--toast-index)*var(--peek)+(1-var(--scale))*var(--height)))_scale(var(--scale))]',
          'data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]',
          'data-starting-style:[transform:translateY(-150%)] data-ending-style:opacity-0 data-limited:opacity-0',
          '[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-150%)]',
          'data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]',
          'data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
          'rounded-lg border border-(--theme-border) bg-(--theme-app-bg) text-(--theme-app) shadow-(--theme-shadow-lg) outline-none focus-visible:outline-2 focus-visible:outline-(--theme-link)',
          '[transition:transform_0.4s_cubic-bezier(0.22,1,0.36,1),opacity_0.4s,height_0.15s] motion-reduce:transition-none',
          "after:absolute after:inset-x-0 after:top-full after:h-[calc(var(--gap)+1px)] after:content-['']",
        )}
      >
        <BaseToast.Content className="flex items-start gap-3 overflow-hidden p-3 transition-opacity duration-200 data-behind:opacity-0 data-expanded:opacity-100">
          {icon &&
            (kind === 'loading' ? (
              <span className="mt-0.5 text-(--theme-muted-text-color)">
                <Loader size="1rem" inline decorative />
              </span>
            ) : (
              <ToneIcon tone={kind} />
            ))}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
            {/* Divs, not a heading and a paragraph: a toast isn't part of the page's
                outline, and its message may hold a list. */}
            <BaseToast.Title render={<div />} className="font-semibold" />
            <BaseToast.Description render={<div />} className="break-words" />
          </div>
          {item.actionProps && (
            <BaseToast.Action onClick={() => manager.close(item.id)} className={actionClasses} />
          )}
          {link && (
            <AppLink
              href={link.href}
              reloadDocument={link.reloadDocument}
              target={link.target}
              onClick={() => manager.close(item.id)}
              className={actionClasses}
            >
              {link.label}
            </AppLink>
          )}
          {dismissible && (
            <BaseToast.Close
              aria-label={common.close}
              className="-m-1 shrink-0 cursor-pointer rounded-md p-1 text-(--theme-muted-text-color) transition-colors hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app)"
            >
              <CloseIcon className="size-4" />
            </BaseToast.Close>
          )}
        </BaseToast.Content>
      </BaseToast.Root>
    )
  })
}
