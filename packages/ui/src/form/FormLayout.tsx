import type { CSSProperties, ReactNode } from 'react'
import { createContext, useContext, useId, useMemo } from 'react'
import { FieldRowContext } from '../components/Field'
import { cx } from '../cx'
import {
  type FormLayoutNode,
  type LayoutGap,
  type LayoutTracks,
  layoutBreakpoints,
  responsiveLayoutValues,
} from './layout'
import { resolveLayoutCSS } from './layoutCSS'

export const LayoutCSSContext = createContext(false)
const gaps: Record<LayoutGap, string> = { none: '0px', sm: '0.5rem', md: '1rem', lg: '1.5rem' }
const visible = '[&:not(:has([data-layout-field]:not(:empty)))]:hidden'
const sharedRowsClass =
  'grid grid-rows-(--layout-shared-base) row-(--layout-row-span-base) @min-[24rem]/layout:grid-rows-(--layout-shared-sm) @min-[24rem]/layout:row-(--layout-row-span-sm) @min-[40rem]/layout:grid-rows-(--layout-shared-md) @min-[40rem]/layout:row-(--layout-row-span-md) @min-[64rem]/layout:grid-rows-(--layout-shared-lg) @min-[64rem]/layout:row-(--layout-row-span-lg)'
const slotClass =
  'row-start-(--layout-slot-base) @min-[24rem]/layout:row-start-(--layout-slot-sm) @min-[40rem]/layout:row-start-(--layout-slot-md) @min-[64rem]/layout:row-start-(--layout-slot-lg)'
const trackCount = (tracks: LayoutTracks) => (Array.isArray(tracks) ? tracks.length : tracks)
const trackStyle = (tracks: LayoutTracks) =>
  Array.isArray(tracks)
    ? tracks.map((weight) => `minmax(0, ${weight}fr)`).join(' ')
    : `repeat(${tracks}, minmax(0, 1fr))`

type SharedRows = Record<(typeof layoutBreakpoints)[number], boolean>

export function FormLayout({
  layout,
  renderField,
}: {
  layout: FormLayoutNode
  renderField: (name: string) => ReactNode
}) {
  const allowCSS = useContext(LayoutCSSContext)
  return (
    <div
      data-layout-boundary
      className={cx('min-w-0 max-w-full', allowCSS && 'isolate [contain:paint] p-0.5')}
    >
      <LayoutNode node={layout} renderField={renderField} />
    </div>
  )
}

function LayoutNode({
  node,
  renderField,
  sharedRows,
  inRow = false,
}: {
  node: FormLayoutNode
  renderField: (name: string) => ReactNode
  sharedRows?: SharedRows | undefined
  /** Whether the field takes a row's label and control tracks, as its grid lines fields up. */
  inRow?: boolean
}) {
  const labelId = useId()
  const descriptionId = useId()
  const allowCSS = useContext(LayoutCSSContext)
  const customStyle = useMemo(
    () => (allowCSS ? resolveLayoutCSS(node.css).style : {}),
    [allowCSS, node.css],
  )
  if (node.type === 'field') {
    return (
      <div
        data-layout-field={node.field}
        className={cx(
          'min-w-0 max-w-full empty:hidden [&>div]:mb-0',
          inRow && 'contents [&>*]:row-span-2',
        )}
        style={customStyle}
      >
        <FieldRowContext value={inRow}>{renderField(node.field)}</FieldRowContext>
      </div>
    )
  }
  const columns = responsiveLayoutValues<LayoutTracks>(node.type === 'grid' ? node.columns : 1, 1)
  const alignRows = node.type === 'grid' && node.align === 'rows'
  // Fields side by side line up their controls: each takes a label track and a control track of
  // the grid, and everything else in the grid spans both, so it doesn't stretch a label track.
  const alignFields = node.type === 'grid' && !alignRows
  const childSharedRows = alignRows
    ? (Object.fromEntries(
        layoutBreakpoints.map((key) => [key, trackCount(columns[key]) > 1]),
      ) as SharedRows)
    : undefined
  const rowCount = alignRows
    ? Math.max(
        0,
        ...node.children.map((child) => (child.type === 'section' ? child.children.length : 0)),
      ) + 1
    : 1
  const children = node.children.map((child, index) => {
    const spans = responsiveLayoutValues(child.span, 1)
    const style = Object.fromEntries(
      layoutBreakpoints.flatMap((key) => [
        [`--layout-span-${key}`, Math.min(spans[key], trackCount(columns[key]))],
        [`--layout-slot-${key}`, sharedRows?.[key] ? index + 2 : 'auto'],
      ]),
    ) as CSSProperties
    return (
      <div
        key={child.type === 'field' ? `field:${child.field}` : `container:${index}`}
        data-layout-item
        className={cx(
          'min-w-0 text-sm',
          visible,
          sharedRows && slotClass,
          alignRows && sharedRowsClass,
          alignFields &&
            (child.type === 'field'
              ? 'row-span-2 grid grid-rows-subgrid gap-y-1.5'
              : 'row-span-2 self-start'),
          node.type === 'grid' &&
            'col-span-(--layout-span-base) @min-[24rem]/layout:col-span-(--layout-span-sm) @min-[40rem]/layout:col-span-(--layout-span-md) @min-[64rem]/layout:col-span-(--layout-span-lg)',
        )}
        style={style}
      >
        <LayoutNode
          node={child}
          renderField={renderField}
          sharedRows={childSharedRows}
          inRow={alignFields}
        />
      </div>
    )
  })
  const gap = { '--layout-gap': gaps[node.gap ?? 'md'] } as CSSProperties
  const headingStyle = {
    color: customStyle.color,
    fontSize: customStyle.fontSize,
    fontWeight: customStyle.fontWeight,
    lineHeight: customStyle.lineHeight,
  }
  if (node.type === 'grid') {
    const style = {
      ...gap,
      ...Object.fromEntries(
        layoutBreakpoints.flatMap((key) => [
          [`--layout-columns-${key}`, trackStyle(columns[key])],
          [`--layout-shared-${key}`, childSharedRows?.[key] ? 'subgrid' : 'none'],
          [`--layout-row-span-${key}`, childSharedRows?.[key] ? `span ${rowCount}` : 'auto'],
        ]),
      ),
      ...customStyle,
    } as CSSProperties
    return (
      <div data-layout-grid className={cx('@container/layout min-w-0 max-w-full', visible)}>
        <div
          className={cx(
            'grid gap-(--layout-gap) grid-cols-(--layout-columns-base) @min-[24rem]/layout:grid-cols-(--layout-columns-sm) @min-[40rem]/layout:grid-cols-(--layout-columns-md) @min-[64rem]/layout:grid-cols-(--layout-columns-lg)',
          )}
          style={style}
        >
          {children}
        </div>
      </div>
    )
  }
  if (node.type === 'section' && sharedRows) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: A fieldset's anonymous content box cannot share parent grid rows.
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={node.description ? descriptionId : undefined}
        data-layout-section
        className={cx('min-w-0 max-w-full text-sm gap-(--layout-gap)', sharedRowsClass, visible)}
        style={customStyle}
      >
        <div data-layout-header className="self-start">
          <div id={labelId} className="text-sm font-semibold theme-text" style={headingStyle}>
            {node.label}
          </div>
          {node.description && (
            <p id={descriptionId} className="mt-2 text-sm theme-muted-text">
              {node.description}
            </p>
          )}
        </div>
        {children}
      </div>
    )
  }
  const body = (
    <div
      className="flex min-w-0 flex-col text-sm gap-(--layout-gap)"
      style={{
        ...gap,
        ...(node.type === 'stack'
          ? customStyle
          : { gap: customStyle.gap, rowGap: customStyle.rowGap }),
      }}
    >
      {children}
    </div>
  )
  if (node.type === 'section') {
    return (
      <fieldset
        data-layout-section
        className={cx('min-w-0 max-w-full border-0 p-0', visible)}
        aria-describedby={node.description ? descriptionId : undefined}
        style={customStyle}
      >
        <legend
          className="float-left mb-2 w-full p-0 text-sm font-semibold theme-text"
          style={headingStyle}
        >
          {node.label}
        </legend>
        <div className="clear-both">
          {node.description && (
            <p id={descriptionId} className="mb-4 text-sm theme-muted-text">
              {node.description}
            </p>
          )}
          {body}
        </div>
      </fieldset>
    )
  }
  return (
    <div data-layout-stack className={cx('min-w-0 max-w-full', visible)}>
      {body}
    </div>
  )
}
