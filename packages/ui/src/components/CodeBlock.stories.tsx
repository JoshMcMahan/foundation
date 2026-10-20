import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ExpandIcon } from '../icons'
import { CodeBlock } from './CodeBlock'
import { IconButton } from './IconButton'
import Markdown from './Markdown'

const meta: Meta<typeof CodeBlock> = {
  title: 'UI/CodeBlock',
  component: CodeBlock,
  argTypes: {
    language: { control: 'text' },
    title: { control: 'text' },
    filename: { control: 'text' },
    copy: { control: 'boolean' },
    lineNumbers: { control: 'boolean' },
    startLine: { control: 'number' },
    wrap: { control: 'boolean' },
    fill: { control: 'boolean' },
    maxHeight: { control: 'text' },
    bleed: { control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof CodeBlock>

const WORKFLOW = `# Resolved from simulate.yaml at 9f3c2e1
on:
  execute:
    inputs:
      mesh:
        type: string
        label: Mesh file
        default: /data/meshes/wing-v4.msh
      steps:
        type: number
        label: Time steps
        default: 2000
      cluster:
        type: compute-clusters
        label: Cluster
        default: hpc-east

jobs:
  prepare:
    steps:
      - name: Fetch the mesh
        run: |
          mkdir -p work
          cp "\${{ inputs.mesh }}" work/mesh.msh
      - name: Partition
        run: decompose --parts 64 work/mesh.msh
  solve:
    needs: [prepare]
    ssh:
      remoteHost: \${{ inputs.cluster.ip }}
    steps:
      - name: Run the solver
        run: |
          srun -n 64 solver --mesh work/mesh.msh \\
            --steps \${{ inputs.steps }} --out work/results
      - name: Check convergence
        run: test "$(tail -1 work/results/residuals.csv | cut -d, -f2)" '<' 1e-6
  report:
    needs: [solve]
    steps:
      - name: Plot residuals
        run: plot-residuals work/results/residuals.csv > report.html
      - name: Upload
        run: upload report.html "runs/\${{ run.id }}/report.html"
`

const SNIPPET = 'pip install --upgrade simulation-tools'

const LONG_LINES = `export SOLVER_FLAGS="--mesh /data/meshes/wing-v4.msh --steps 2000 --tolerance 1e-6 --checkpoint-every 250 --out /scratch/runs/2026-10-20/wing-v4/results --log-level debug"
srun -n 64 --cpus-per-task 2 --mem-per-cpu 4G --time 04:00:00 --partition compute solver $SOLVER_FLAGS`

/** A run's resolved YAML as a tab's whole view: the block fills the pane and
 *  scrolls inside it, so the code runs to the pane's bottom edge. */
export const FillingATallContainer: Story = {
  args: {
    code: WORKFLOW,
    language: 'yaml',
    title: 'Resolved YAML',
    filename: 'simulate.resolved.yaml',
    fill: true,
  },
  render: (args) => (
    // Stories are outside the stylesheet's sources, so the pane's size is inline.
    <div className="flex flex-col p-6" style={{ height: 640, maxWidth: 768 }}>
      <CodeBlock {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Scrolling inside, it is a stop the keys can scroll.
    await waitFor(() => expect(canvas.getByRole('region', { name: 'Resolved YAML' })).toBeVisible())
  },
}

/** One line: no numbers, the language on the header. */
export const ShortSnippet: Story = {
  args: { code: SNIPPET, language: 'bash' },
  render: (args) => (
    <div className="max-w-xl p-6">
      <CodeBlock {...args} />
    </div>
  ),
}

/** A title of the host's own in place of the language, with a control of its own
 *  beside copy. */
export const WithTitle: Story = {
  args: {
    code: WORKFLOW.split('\n').slice(17, 29).join('\n'),
    language: 'yaml',
    startLine: 18,
  },
  render: (args) => (
    <div className="max-w-2xl p-6">
      <CodeBlock
        {...args}
        title={
          <span className="font-mono text-(--theme-app)">
            simulate.yaml <span className="text-(--theme-muted-text-color)">lines 18–29</span>
          </span>
        }
        label="simulate.yaml, lines 18 to 29"
        headerActions={<IconButton label="Open in editor" icon={<ExpandIcon />} />}
      />
    </div>
  ),
}

/** A host's `title` reads as the header's title, in the ink color and medium weight; the
 *  language alone, without one, stays a muted caption. */
export const TitleOrLanguage: Story = {
  args: { code: WORKFLOW.split('\n').slice(0, 8).join('\n'), language: 'yaml' },
  render: (args) => (
    <div className="flex max-w-2xl flex-col gap-4 p-6">
      <CodeBlock {...args} title="Resolved Workflow YAML" />
      <CodeBlock {...args} />
    </div>
  ),
}

/** With a `filename`, a download button saves the code under it. */
export const WithDownload: Story = {
  args: {
    code: WORKFLOW.split('\n').slice(0, 16).join('\n'),
    language: 'yaml',
    filename: 'inputs.yaml',
  },
  render: (args) => (
    <div className="max-w-2xl p-6">
      <CodeBlock {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    })
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Download' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Copy' }))
    await expect(await canvas.findByRole('button', { name: 'Copied' })).toBeVisible()
  },
}

/** Long lines scroll sideways by default; `wrap` breaks them, each number on its
 *  line's first row. */
export const LongLines: Story = {
  args: { code: LONG_LINES, language: 'bash' },
  render: (args) => (
    <div className="flex max-w-xl flex-col gap-4 p-6">
      <CodeBlock {...args} title="Scrolls" />
      <CodeBlock {...args} title="Wraps" wrap />
    </div>
  ),
}

/** Without `fill`, the block is as tall as its code up to `maxHeight`. */
export const MaxHeight: Story = {
  args: { code: WORKFLOW, language: 'yaml', maxHeight: 240 },
  render: (args) => (
    <div className="max-w-2xl p-6">
      <CodeBlock {...args} />
    </div>
  ),
}

/** In dark mode the code takes the theme's dark code colors. */
export const Dark: Story = {
  ...FillingATallContainer,
  globals: { mode: 'dark' },
}

/** At phone width the header keeps its buttons and long lines scroll inside. */
export const Phone: Story = {
  args: {
    code: WORKFLOW,
    language: 'yaml',
    title: 'Resolved YAML',
    filename: 'simulate.resolved.yaml',
    fill: true,
  },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: (args) => (
    <div className="flex flex-col p-4" style={{ height: 560 }}>
      <CodeBlock {...args} />
    </div>
  ),
}

/** With `bleed`, on a phone the block reaches past the page's `p-4` to the
 *  screen's edges, without corners, so long lines get the whole width; wider,
 *  it sits inside the padding as before. */
export const BleedOnAPhone: Story = {
  args: { code: LONG_LINES, language: 'bash', title: 'Submit', bleed: true },
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: (args) => (
    <div className="flex flex-col gap-4 p-4">
      <CodeBlock {...args} />
      <CodeBlock {...args} title="Inside the padding" bleed={false} />
    </div>
  ),
}

/** A fenced block in Markdown is the same CodeBlock, so the two read alike. */
export const InMarkdown: Story = {
  args: { code: '' },
  render: () => (
    <div className="max-w-2xl p-6">
      <Markdown>
        {[
          'The solver reads its flags from the job:',
          '',
          '```yaml',
          WORKFLOW.split('\n').slice(26, 35).join('\n'),
          '```',
          '',
          'and installs with `pip`:',
          '',
          '```bash',
          SNIPPET,
          '```',
        ].join('\n')}
      </Markdown>
    </div>
  ),
}
