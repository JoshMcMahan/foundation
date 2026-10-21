import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CSSProperties } from 'react'
import { RunStatusIcon, type RunStatusIconStatus, runStatusTone } from './RunStatusIcon'
import { StatusBadge, StatusDot, statusTextClass } from './StatusBadge'
import { ErrorCheckmark, SuccessCheckmark } from './StatusIcons'

const meta: Meta = {
  title: 'UI/Status',
}
export default meta

const STATUSES: { status: RunStatusIconStatus; label: string }[] = [
  { status: 'completed', label: 'Completed' },
  { status: 'running', label: 'Running' },
  { status: 'failed', label: 'Failed' },
  { status: 'warning', label: 'With warnings' },
  { status: 'pending', label: 'Pending' },
  { status: 'canceled', label: 'Canceled' },
  { status: 'canceling', label: 'Canceling' },
  { status: 'faulted', label: 'Faulted' },
  { status: 'skipped', label: 'Skipped' },
  { status: '', label: 'Not run' },
]

const card: CSSProperties = {
  maxWidth: 560,
  padding: '12px 14px',
  borderRadius: 12,
  boxSizing: 'border-box',
}
const caption: CSSProperties = { fontSize: 11, fontWeight: 600, marginBottom: 8 }

/** Every status at 14, 16 and 20px. An ended status is a solid shape with its mark cut out;
 *  an open one is a ring, whose arc turns and whose dot breathes while it runs. */
export const EveryStatus: StoryObj = {
  render: () => (
    <div style={{ padding: 16 }}>
      <div className="border border-(--theme-border) bg-(--theme-panel-bg)" style={card}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
            gap: '14px 8px',
          }}
        >
          {STATUSES.map(({ status, label }) => (
            <div
              key={label}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {[14, 16, 20].map((size) => (
                  <span key={size} style={{ fontSize: size, display: 'inline-flex' }}>
                    <RunStatusIcon status={status} label={label} />
                  </span>
                ))}
              </div>
              <span className="text-(--theme-muted-text-color)" style={{ fontSize: 11 }}>
                {label}
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
              <SuccessCheckmark />
              <ErrorCheckmark />
            </div>
            <span className="text-(--theme-muted-text-color)" style={{ fontSize: 11 }}>
              Checkmarks
            </span>
          </div>
        </div>
      </div>
    </div>
  ),
}

const STEPS: { name: string; status: RunStatusIconStatus; took: string }[] = [
  { name: 'variant-calling-42', status: 'completed', took: '1h 12m' },
  { name: 'align-reads', status: 'running', took: '18m' },
  { name: 'cfd-sweep-07', status: 'failed', took: '4m 02s' },
  { name: 'qc-report', status: 'warning', took: '9m' },
  { name: 'rnaseq-align', status: 'pending', took: 'queued' },
  { name: 'ml-train-a100', status: 'canceled', took: '2h 03m' },
  { name: 'cleanup-scratch', status: 'skipped', took: '—' },
]

/** A run's steps, each with its status before its name. */
export const StepList: StoryObj = {
  render: () => (
    <div style={{ padding: 16 }}>
      <div className="border border-(--theme-border) bg-(--theme-panel-bg)" style={card}>
        <div className="text-(--theme-muted-text-color)" style={caption}>
          Steps
        </div>
        {STEPS.map((step, i) => (
          <div
            key={step.name}
            className={i > 0 ? 'border-t border-(--theme-border)' : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}
          >
            <span style={{ fontSize: 16, display: 'flex', alignItems: 'center', height: 16 }}>
              <RunStatusIcon status={step.status} />
            </span>
            <span className="font-mono text-(--theme-app)" style={{ flex: 1, fontSize: 12 }}>
              {step.name}
            </span>
            <span className="text-(--theme-muted-text-color) tabular-nums" style={{ fontSize: 12 }}>
              {step.took}
            </span>
          </div>
        ))}
      </div>
    </div>
  ),
}

const LINES = [
  { text: 'destroy failed', variant: 'error' },
  { text: 'destroying', variant: 'warning' },
  { text: 'running', variant: 'success' },
  { text: 'provisioning', variant: 'info', pulse: true },
] as const

/** Badges with a dot or a pulse at both sizes, a solid badge whose dot takes its text color,
 *  and bare status lines: a `StatusDot` beside the words, the same dot a badge draws. */
export const BadgesAndLines: StoryObj = {
  render: () => (
    <div style={{ padding: 16 }}>
      <div className="border border-(--theme-border) bg-(--theme-panel-bg)" style={card}>
        <div className="text-(--theme-muted-text-color)" style={caption}>
          Badges
        </div>
        {(['sm', 'md'] as const).map((size) => (
          <div key={size} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            <StatusBadge size={size} variant="info" pulse>
              Running
            </StatusBadge>
            <StatusBadge size={size} variant="success" dot>
              Completed
            </StatusBadge>
            <StatusBadge size={size} variant="error" dot>
              Failed
            </StatusBadge>
            <StatusBadge size={size} variant="warning" dot>
              Starting
            </StatusBadge>
            <StatusBadge size={size} variant="muted" dot>
              Stopped
            </StatusBadge>
            <StatusBadge size={size} variant="error" emphasis="solid" dot>
              Down
            </StatusBadge>
          </div>
        ))}
        <div className="text-(--theme-muted-text-color)" style={{ ...caption, marginTop: 8 }}>
          Status beside a name
        </div>
        {LINES.map((line) => (
          <div
            key={line.text}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '3px 0',
              fontSize: 13,
            }}
          >
            <StatusDot variant={line.variant} size={7} pulse={'pulse' in line && line.pulse} />
            <span className={statusTextClass(line.variant)}>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  ),
}

const ROWS: { name: string; status: RunStatusIconStatus; state: 'rest' | 'hover' | 'selected' }[] =
  [
    { name: 'genomics', status: 'completed', state: 'rest' },
    { name: 'climate-model', status: 'failed', state: 'hover' },
    { name: 'render-farm', status: 'warning', state: 'selected' },
    { name: 'cfd-sweep', status: 'canceled', state: 'rest' },
    { name: 'align-reads', status: 'running', state: 'rest' },
  ]

/** Statuses on a list's rows at rest, hovered and selected: a cut-out mark shows the row
 *  behind it, so it reads on every fill. */
export const OnRows: StoryObj = {
  render: () => (
    <div style={{ padding: 16 }}>
      <table
        className="bg-(--theme-panel-bg) text-(--theme-app)"
        style={{ width: '100%', maxWidth: 560, borderCollapse: 'collapse', fontSize: 13 }}
      >
        <tbody>
          {ROWS.map((row) => (
            <tr
              key={row.name}
              className={
                row.state === 'selected' ? 'bg-(--theme-accent-subtle)/60' : 'hover:theme-hover'
              }
              style={{ borderBottom: '1px solid var(--theme-border)' }}
            >
              <td style={{ padding: '9px 12px', width: 16 }}>
                <span style={{ fontSize: 16, display: 'flex', alignItems: 'center', height: 16 }}>
                  <RunStatusIcon status={row.status} />
                </span>
              </td>
              <td style={{ padding: '9px 0', whiteSpace: 'nowrap' }}>{row.name}</td>
              <td style={{ padding: '9px 12px', textAlign: 'end' }}>
                <StatusBadge variant={runStatusTone(row.status)} dot>
                  {row.status}
                </StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
}
