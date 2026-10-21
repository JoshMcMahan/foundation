import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CSSProperties, ReactNode } from 'react'
import { type BadgeVariant, StatusBadge, StatusDot, statusTextClass } from './StatusBadge'

const meta: Meta = {
  title: 'UI/Status/Lamps',
}
export default meta

// The legacy status light a host drew on its own, copied here to compare against.
const LEGACY_CSS = `
.legacy-led { display: inline-block; border-radius: 5px; width: 10px; height: 10px; flex: none;
  box-shadow: inset 0 0 0 1.5px var(--theme-border-strong); }
.legacy-led.red { background: linear-gradient(#fb131b 0%, #edad99 100%); }
.legacy-led.orange { background: linear-gradient(#f9a004 0%, #ead698 100%); }
.legacy-led.green { background: linear-gradient(#13fb04 0%, #aded99 100%); }
.legacy-led.blue { background: linear-gradient(#045ef9 0%, #036efb 100%); }
.legacy-led:is(.red, .orange, .green, .blue) { box-shadow: 0 0 3px rgb(0 0 0 / 0.5); }
.legacy-led.off { background: none; box-shadow: inset 0 0 0 1.5px var(--theme-border-strong); }
`

type Look = 'legacy' | 'halo' | 'lamp'

interface Row {
  name: string
  status: string
  variant: BadgeVariant | 'off'
  legacy: string
  state: 'rest' | 'hover' | 'selected'
  pulse?: boolean
}

const ROWS: Row[] = [
  { name: 'genomics', status: 'on', variant: 'success', legacy: 'green', state: 'rest' },
  { name: 'climate-model', status: 'error', variant: 'error', legacy: 'red', state: 'rest' },
  {
    name: 'render-farm',
    status: 'starting',
    variant: 'warning',
    legacy: 'orange',
    state: 'selected',
  },
  {
    name: 'cfd-sweep',
    status: 'provisioning',
    variant: 'info',
    legacy: 'blue',
    state: 'rest',
    pulse: true,
  },
  { name: 'ml-train-a100', status: 'off', variant: 'off', legacy: 'off', state: 'rest' },
]

// The halo dot this lamp replaces: the tone with a soft ring of it at 22%.
function HaloDot({ variant, size }: { variant: BadgeVariant | 'off'; size: number }) {
  const tone =
    variant === 'off'
      ? 'var(--theme-border-strong)'
      : `var(--theme-${variant === 'muted' ? 'muted-text-color' : variant})`
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        flex: 'none',
        background: variant === 'off' ? 'none' : tone,
        boxShadow:
          variant === 'off'
            ? 'inset 0 0 0 1.5px var(--theme-border-strong)'
            : `0 0 0 2px color-mix(in srgb, ${tone} 22%, transparent)`,
      }}
    />
  )
}

function Light({ look, row, size }: { look: Look; row: Row; size: number }) {
  if (look === 'legacy') {
    return (
      <span
        aria-hidden="true"
        className={`legacy-led ${row.legacy}`}
        style={size === 10 ? undefined : { width: size, height: size }}
      />
    )
  }
  if (look === 'halo') {
    return <HaloDot variant={row.variant} size={size === 10 ? 7 : 6} />
  }
  return row.variant === 'off' ? (
    <StatusDot off size={size} />
  ) : (
    <StatusDot variant={row.variant} pulse={row.pulse} size={size} />
  )
}

const TITLES: Record<Look, string> = {
  legacy: 'Before: the legacy light',
  halo: 'Halo dot',
  lamp: 'Lamp',
}

function Panel({ look, children }: { look: Look; children?: ReactNode }) {
  const caption: CSSProperties = { fontSize: 11, fontWeight: 600, padding: '10px 12px 6px' }
  return (
    <div
      className="border border-(--theme-border) bg-(--theme-panel-bg) text-(--theme-app)"
      style={{ borderRadius: 12, overflow: 'hidden', minWidth: 0 }}
    >
      <div className="text-(--theme-muted-text-color)" style={caption}>
        {TITLES[look]}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {ROWS.map((row) => (
            <tr
              key={row.name}
              data-row={row.name}
              className={
                row.state === 'selected' ? 'bg-(--theme-accent-subtle)/60' : 'hover:theme-hover'
              }
              style={{ borderTop: '1px solid var(--theme-border)' }}
            >
              <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                {row.name}
                {row.state === 'selected' && (
                  <span className="text-(--theme-muted-text-color)" style={{ fontSize: 11 }}>
                    {' '}
                    · selected
                  </span>
                )}
              </td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Light look={look} row={row} size={10} />
                  <span
                    className={
                      row.variant === 'off'
                        ? 'text-(--theme-muted-text-color)'
                        : statusTextClass(row.variant)
                    }
                  >
                    {row.status}
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: '10px 12px 12px',
          borderTop: '1px solid var(--theme-border)',
        }}
      >
        {ROWS.map((row) => {
          const variant = row.variant === 'off' ? 'muted' : row.variant
          return look === 'lamp' ? (
            <StatusBadge
              key={row.name}
              variant={variant}
              dot={!row.pulse}
              pulse={row.pulse}
              off={row.variant === 'off'}
            >
              {row.status}
            </StatusBadge>
          ) : (
            <StatusBadge key={row.name} variant={variant}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Light look={look} row={row} size={6} />
                {row.status}
              </span>
            </StatusBadge>
          )
        })}
        {look === 'lamp' && (
          <StatusBadge variant="error" emphasis="solid" dot>
            down
          </StatusBadge>
        )}
      </div>
      {children}
    </div>
  )
}

/** The legacy status light, the halo dot it was first replaced with, and the lamp, which is
 *  the legacy light itself from the `--lamp-*` tokens: in a list of clusters with a selected
 *  row, and in badges, where the lamp is smaller so a badge keeps its height. */
export const Compare: StoryObj = {
  render: () => (
    <div style={{ padding: 16 }}>
      <style>{LEGACY_CSS}</style>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 12,
          maxWidth: 1040,
        }}
      >
        <Panel look="legacy" />
        <Panel look="halo" />
        <Panel look="lamp" />
      </div>
    </div>
  ),
}

/** The lamp in every tone, lit at 10px beside words and 7px in a badge, and unlit. */
export const EveryTone: StoryObj = {
  render: () => (
    <div style={{ padding: 16 }}>
      <div
        className="border border-(--theme-border) bg-(--theme-panel-bg) text-(--theme-app)"
        style={{ borderRadius: 12, padding: 12, display: 'grid', gap: 10, maxWidth: 520 }}
      >
        {(['success', 'warning', 'error', 'info', 'muted', 'accent', 'default'] as const).map(
          (variant) => (
            <div key={variant} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, width: 110 }}>
                <StatusDot variant={variant} />
                <span className={statusTextClass(variant)} style={{ fontSize: 13 }}>
                  {variant}
                </span>
              </span>
              <StatusBadge variant={variant} dot>
                {variant}
              </StatusBadge>
              <StatusBadge variant={variant} size="md" pulse>
                {variant}
              </StatusBadge>
            </div>
          ),
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <StatusDot off />
          <span className="text-(--theme-muted-text-color)" style={{ fontSize: 13 }}>
            off
          </span>
        </div>
      </div>
    </div>
  ),
}
