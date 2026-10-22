import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CSSProperties, ReactNode } from 'react'
import { expect, within } from 'storybook/test'
import { StatusBadge } from './StatusBadge'
import { RunStatusLabel, StatusLabel } from './StatusLabel'
import { Tag } from './Tag'

const meta: Meta = {
  title: 'UI/Badges',
}
export default meta

const muted = 'var(--theme-muted-text-color)'
const hairline = '1px solid var(--theme-border)'

const card: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  borderRadius: 12,
  border: hairline,
  background: 'var(--theme-panel-bg)',
  minWidth: 0,
}
const kicker: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: muted,
}
const question: CSSProperties = { fontSize: 16, fontWeight: 600, margin: 0 }
const rule: CSSProperties = { fontSize: 13, lineHeight: 1.45, color: muted, margin: 0 }
const rows: CSSProperties = { border: hairline, borderRadius: 8, overflow: 'hidden' }
const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  padding: '8px 12px',
  minHeight: 44,
  fontSize: 13,
}
const name: CSSProperties = { fontWeight: 500 }
const mono: CSSProperties = { ...name, fontFamily: 'var(--font-mono, ui-monospace, monospace)' }
const sub: CSSProperties = { fontSize: 12, color: muted }

function Rows({ children }: { children: ReactNode[] }) {
  return (
    <div style={rows}>
      {children.map((child, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of example rows
        <div key={i} style={{ ...row, borderTop: i ? hairline : undefined }}>
          {child}
        </div>
      ))}
    </div>
  )
}

// A thing's name with what it is under it, taking the row's free width.
function Thing({ title, kind, code = false }: { title: string; kind?: string; code?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={code ? mono : name}>{title}</div>
      {kind && <div style={sub}>{kind}</div>}
    </div>
  )
}

function Role({
  number,
  title,
  ask,
  look,
  examples,
  uses,
  notFor,
}: {
  number: number
  title: string
  ask: string
  look: string
  examples: ReactNode
  uses: string[]
  notFor: string
}) {
  return (
    <section style={card} aria-labelledby={`role-${number}`}>
      <div style={kicker}>
        {number} · {title}
      </div>
      <h3 id={`role-${number}`} style={question}>
        {ask}
      </h3>
      <p style={rule}>{look}</p>
      {examples}
      <div style={{ borderTop: `1px dashed var(--theme-border)`, paddingTop: 10, fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Use it for</div>
        <ul
          style={{ margin: 0, paddingLeft: 18, color: muted, lineHeight: 1.5, listStyle: 'disc' }}
        >
          {uses.map((use) => (
            <li key={use}>{use}</li>
          ))}
        </ul>
        <p style={{ margin: '8px 0 0', lineHeight: 1.45 }}>
          <span style={{ fontWeight: 600, color: 'var(--theme-error-text)' }}>Not for </span>
          <span style={{ color: muted }}>{notFor}</span>
        </p>
      </div>
    </section>
  )
}

/** Which badge to use. Each kind of mark answers a different question, so each has one look and
 *  is used only for that:
 *
 *  1. **Status** (`StatusLabel`, `RunStatusLabel`): what state is it in? A lamp or icon and the
 *     state's name, in muted text with no fill.
 *  2. **Flag** (`StatusBadge`): what's notable about this one? A small soft pill right after a
 *     name: neutral by default, accent for something new to you, warning when it warns.
 *  3. **Tag** (`Tag`): what has someone labelled it? A neutral hairline pill with an optional
 *     color dot, which can link or have an ×.
 *
 *  The same state looks the same wherever it shows, on a run's row or a resource's. */
export const WhichOne: StoryObj = {
  name: 'Which one',
  render: () => (
    <div
      className="text-(--theme-app)"
      style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, maxWidth: 1120 }}
    >
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Three roles, one look each</h2>
        <p style={{ ...rule, fontSize: 14, marginTop: 4 }}>
          Each kind of mark answers a different question, so each gets one look and is used only for
          that.
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <Role
          number={1}
          title="Status · StatusLabel"
          ask="What state is it in?"
          look="A lamp or icon and the state's name, in muted text with no fill. It changes over time, and sits in a status column or under a title."
          examples={
            <Rows>
              {[
                <>
                  <Thing title="variant-calling-44" code />
                  <RunStatusLabel status="running" />
                </>,
                <>
                  <Thing title="model-training-9" code />
                  <RunStatusLabel status="failed" />
                </>,
                <>
                  <Thing title="gpu-cluster-a" kind="Cluster · us-east-1" />
                  <StatusLabel variant="success">Running</StatusLabel>
                </>,
                <>
                  <Thing title="scratch-disk-2" kind="Disk · us-east-1" />
                  <StatusLabel variant="warning">Starting</StatusLabel>
                </>,
                <>
                  <Thing title="agent-07" kind="Agent" />
                  <StatusLabel off>Offline</StatusLabel>
                </>,
              ]}
            </Rows>
          }
          uses={[
            'Runs, jobs and steps',
            'Resources: clusters, disks, sessions',
            'Agents, images and namespaces',
            'Allocation periods and license standing',
          ]}
          notFor="a status as a tinted pill, or a fact that never changes (that's a flag)."
        />
        <Role
          number={2}
          title="Flag · StatusBadge"
          ask="What's notable about this one?"
          look="A small soft pill right after a name, for a fixed fact worth noticing: short and rare, at most one or two on a row. Neutral by default, accent for something new to you, warning when it warns, and never success or error, which are statuses."
          examples={
            <Rows>
              {[
                <>
                  <span style={mono}>variant-calling-44</span>
                  <StatusBadge variant="muted">Inline</StatusBadge>
                </>,
                <>
                  <span style={name}>v2.14.0</span>
                  <StatusBadge variant="accent" emphasis="solid">
                    New
                  </StatusBadge>
                  <StatusBadge variant="muted">Your version</StatusBadge>
                </>,
                <>
                  <span style={name}>Cost reports</span>
                  <StatusBadge variant="accent">Preview</StatusBadge>
                </>,
                <>
                  <span style={name}>Q4 allocation</span>
                  <StatusBadge variant="warning">Ends soon</StatusBadge>
                </>,
                <>
                  <span style={mono}>/mnt/shared</span>
                  <StatusBadge variant="muted">Read only</StatusBadge>
                </>,
              ]}
            </Rows>
          }
          uses={[
            'Neutral: Inline, Latest, Your version, Read only, Orphaned, External',
            'Accent, new to you: New, Preview, Beta',
            'Warning: Ends soon',
          ]}
          notFor="a state that changes (that's a status), or a label someone gave it (that's a tag)."
        />
        <Role
          number={3}
          title="Tag · Tag"
          ask="What has someone labelled it?"
          look="A neutral hairline pill, with an optional color dot. People add, remove and filter by tags, so a tag can link or show an ×."
          examples={
            <Rows>
              {[
                <>
                  <Thing title="RNA-seq quantification" kind="Marketplace" />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flexBasis: '100%' }}>
                    <Tag href="#genomics">genomics</Tag>
                    <Tag href="#gpu">gpu</Tag>
                    <Tag href="#nextflow">nextflow</Tag>
                  </div>
                </>,
                <div key="labels" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <Tag color="#8b5cf6">research</Tag>
                  <Tag color="#f59e0b">billing</Tag>
                  <Tag mono onRemove={() => {}}>
                    env=prod
                  </Tag>
                </div>,
                <>
                  <span style={{ ...name, flex: 1 }}>Weekly spend</span>
                  <Tag>Weekly</Tag>
                  <Tag>PDF</Tag>
                </>,
              ]}
            </Rows>
          }
          uses={[
            'Marketplace tags and labels',
            'key=value pairs',
            "A report's schedule and format",
            'Import plan fields',
          ]}
          notFor="a flag: a tag is a label someone chose, never a fact worth noticing, and never tinted."
        />
      </div>
      <section style={card} aria-labelledby="same-state">
        <h3 id="same-state" style={question}>
          The same state, the same look
        </h3>
        <p style={rule}>
          A run shows its run status icon and a resource its lamp, but both name the state in muted
          text, with no fill, in the same column.
        </p>
        <Rows>
          {[
            <>
              <Thing title="variant-calling-44" kind="Run · RNA-seq quantification" code />
              <RunStatusLabel status="running" />
            </>,
            <>
              <Thing title="gpu-cluster-a" kind="Cluster · us-east-1" />
              <StatusLabel variant="success">Running</StatusLabel>
            </>,
            <>
              <Thing title="model-training-9" kind="Run · Train a model" code />
              <RunStatusLabel status="error" />
            </>,
            <>
              <Thing title="notebook-gpu" kind="Session · us-west-2" />
              <StatusLabel variant="error">Failed</StatusLabel>
            </>,
          ]}
        </Rows>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: "What's notable about this one?" }),
    ).toBeVisible()
    // A status's name is read once: the icons and lamps beside it are hidden.
    await expect(canvas.queryByRole('img')).toBeNull()
  },
}
