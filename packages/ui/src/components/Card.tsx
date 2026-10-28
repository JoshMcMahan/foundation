import { useRender } from '@base-ui/react/use-render'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { cx } from '../cx'
import { AppLink, type LinkTarget } from './AppLink'

// A standalone card's width; `fill` is an in-page panel, as wide as its column.
const widthClasses = {
  sm: 'max-w-[400px]',
  md: 'max-w-[520px]',
  lg: 'max-w-[560px]',
  fill: '',
}

const paddingClasses = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

// Each standalone size keeps the padding it has always had.
const sizePadding: Record<CardSize, string> = {
  sm: 'p-6',
  md: 'p-6 sm:p-10',
  lg: 'p-6 sm:p-8',
  fill: paddingClasses.md,
}

const toneColors = {
  accent: 'var(--theme-accent)',
  success: 'var(--theme-success)',
  warning: 'var(--theme-warning)',
  error: 'var(--theme-error)',
  info: 'var(--theme-info)',
} as const

/** A status's tone, or any CSS color a host picks, such as `var(--agent-color)`. */
export type CardTone = keyof typeof toneColors | (string & {})

export type CardSize = keyof typeof widthClasses
export type CardPadding = keyof typeof paddingClasses

export interface CardProps extends LinkTarget {
  children: ReactNode
  /** Its width and padding: `sm` for a short form, `lg` for a wide one. `fill` is a
   *  flat panel among the page's content, as wide as its column, with no shadow. */
  size?: CardSize | undefined
  /** The room inside, over the size's own: `none` for content ruled to the card's
   *  edges, such as a table or a list; `sm` for dense content. */
  padding?: CardPadding | undefined
  /** Rules each child off from the next, for a list of rows. */
  divided?: boolean | undefined
  /** A stronger shadow, for a card standing alone on a page, such as sign-in. */
  elevated?: boolean | undefined
  /** Tints the border in the accent, setting the card apart from its siblings,
   *  such as a thread shared with the reader. */
  highlight?: boolean | undefined
  /** Tints the border while a field inside has focus, for a card that frames an
   *  input, such as a composer. */
  focusWithin?: boolean | undefined
  /** Tints the border in a color, setting the card apart by what it is, such as the work of
   *  one kind of author: a status's tone, or any CSS color, such as `var(--agent-color)`.
   *  It is `--card-tone` inside the card, for its own content to use. `highlight` deepens it. */
  tone?: CardTone | undefined
  /** With `tone`, a faint fill of it too, for a card that should stand out at a glance. */
  tinted?: boolean | undefined
  /** Renders the card as this element, such as a button, a list or a section. */
  render?: ReactElement | undefined
  /** The whole card presses: it lifts on hover and shows focus. On by default for
   *  a card with `href` or `render`; false for a `render` that isn't a control,
   *  such as `<ul />`. */
  interactive?: boolean | undefined
  className?: string | undefined
}

/** A surface holding one task, such as a sign-in form or a choice among a few
 *  options, raised over the page; or, with `size="fill"`, a flat panel among the
 *  page's content. */
export function Card({
  children,
  size = 'md',
  padding,
  divided = false,
  elevated = false,
  highlight = false,
  focusWithin = false,
  tone,
  tinted = false,
  render: renderProp,
  interactive,
  href,
  reloadDocument,
  target,
  className,
}: CardProps) {
  const render =
    href === undefined ? (
      renderProp
    ) : (
      <AppLink href={href} reloadDocument={reloadDocument} target={target} />
    )
  const fill = size === 'fill'
  const pressable = interactive ?? render !== undefined
  const toned = tone !== undefined
  const toneColor = toned ? (toneColors[tone as keyof typeof toneColors] ?? tone) : undefined
  const fillTint = toned && tinted
  return useRender({
    render: render ?? <div />,
    props: {
      style: toneColor ? ({ '--card-tone': toneColor } as CSSProperties) : undefined,
      className: cx(
        'block w-full rounded-xl border',
        fillTint
          ? 'bg-[color-mix(in_oklab,var(--card-tone)_7%,var(--theme-panel-bg))]'
          : 'bg-(--theme-panel-bg)',
        toned
          ? highlight
            ? 'border-(--card-tone)/80'
            : 'border-(--card-tone)/45'
          : highlight
            ? 'border-(--theme-accent)/30'
            : 'border-(--theme-border)',
        focusWithin && 'focus-within:border-(--theme-focus)/60',
        // A raised card floats over the page; one in the page's flow sits flat in it.
        !fill && 'backdrop-blur-xl',
        !fill && (elevated ? 'shadow-(--theme-shadow-xl)' : 'shadow-(--theme-shadow)'),
        widthClasses[size],
        padding === undefined ? sizePadding[size] : paddingClasses[padding],
        divided && 'divide-y divide-(--theme-border)',
        pressable &&
          'cursor-pointer text-left text-inherit no-underline transition-[background-color,box-shadow,border-color] duration-150 hover:shadow-(--theme-shadow-lg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus) motion-reduce:transition-none',
        pressable &&
          (fillTint
            ? 'hover:bg-[color-mix(in_oklab,var(--card-tone)_11%,var(--theme-panel-hover))]'
            : 'hover:bg-(--theme-panel-hover)'),
        pressable && toned && 'hover:border-(--card-tone)/70',
        !pressable &&
          focusWithin &&
          'transition-[border-color] duration-150 motion-reduce:transition-none',
        className,
      ),
      children,
    },
  })
}

export interface CardHeaderProps {
  badge?: ReactNode
  title: string
  description?: ReactNode
  className?: string
  /** `left` starts the title on the same edge as the labels and fields under it; `center`
   *  suits a card whose content is centred too. */
  align?: 'center' | 'left'
  /** The title's level in the page's outline: 1 for a card that is the page, such
   *  as sign-in; 2 or 3 for a card among others under the page's own title. */
  headingLevel?: 1 | 2 | 3 | undefined
}

export function CardHeader({
  badge,
  title,
  description,
  className = '',
  align = 'left',
  headingLevel = 1,
}: CardHeaderProps) {
  const Heading = `h${headingLevel}` as const
  return (
    <div className={cx(align === 'center' ? 'text-center' : 'text-left', 'mb-6', className)}>
      {badge && (
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-(--theme-border) bg-(--theme-muted-panel-bg) px-3 py-1.5 text-xs font-medium text-(--theme-muted-text-color)">
          {badge}
        </div>
      )}
      <Heading className="text-2xl font-bold tracking-tight text-(--theme-app)">{title}</Heading>
      {description && (
        <p className="mt-2 text-sm leading-relaxed text-(--theme-muted-text-color)">
          {description}
        </p>
      )}
    </div>
  )
}
