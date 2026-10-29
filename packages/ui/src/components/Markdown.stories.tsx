import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Button } from './Button'
import Markdown from './Markdown'

const meta: Meta<typeof Markdown> = {
  title: 'UI/Markdown',
  component: Markdown,
  argTypes: {
    httpsImagesOnly: { control: 'boolean' },
    compact: { control: 'boolean' },
    controls: { control: 'object' },
  },
}
export default meta

interface MarkdownArgs {
  children: string
  isStreaming: boolean
}

const REPORT = [
  '## Tests',
  '',
  '| Suite | Passed | Failed |',
  '| --- | --- | --- |',
  '| unit | 120 | 3 |',
  '| integration | 42 | 0 |',
  '',
  '- [x] Build',
  '- [ ] Deploy',
  '',
  '<details><summary>3 failures</summary>',
  '',
  '```python',
  'assert residual < 1e-6',
  '```',
  '',
  '</details>',
].join('\n')

const DIAGRAM = ['```mermaid', 'graph LR', '  build --> test --> deploy', '```'].join('\n')

const IMAGES = [
  '![Residuals over https](https://example.com/residuals.png)',
  '![Residuals over http](http://example.com/residuals.png)',
  '![Residuals by relative path](residuals.png)',
].join('\n\n')

// A single dollar stays text, so a price in an answer is never read as math:
// inline math takes $$ inside a sentence, display math $$ on lines of its own.
const MATH = [
  'The energy of a mass at rest is $$E = mc^2$$, and a sample of $$n$$ values has the mean $$\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i$$. A job that costs $5 an hour stays plain text.',
  '',
  'The normal distribution:',
  '',
  '$$',
  'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{1}{2}\\left(\\frac{x - \\mu}{\\sigma}\\right)^2}',
  '$$',
  '',
  'A system in matrix form:',
  '',
  '$$',
  '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}',
  '\\begin{bmatrix} x \\\\ y \\end{bmatrix} =',
  '\\begin{bmatrix} ax + by \\\\ cx + dy \\end{bmatrix}',
  '$$',
].join('\n')

const render = (args: MarkdownArgs) => (
  <div className="max-w-2xl p-6">
    <Markdown isStreaming={args.isStreaming}>{args.children}</Markdown>
  </div>
)

// KaTeX writes each formula twice, as MathML for assistive technology and as
// HTML for the eye; only its stylesheet hides the MathML copy.
const playMath: StoryObj<MarkdownArgs>['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await waitFor(() => expect(canvasElement.querySelector('.katex-display')).not.toBeNull())
  const mathml = canvasElement.querySelector('.katex-mathml')
  await waitFor(() => expect(mathml && getComputedStyle(mathml).position).toBe('absolute'))
  await expect(canvas.getByText(/costs \$5 an hour/)).toBeVisible()
}

export const Report: StoryObj<typeof Markdown> = {
  args: { children: REPORT },
}

export const MermaidDiagram: StoryObj<typeof Markdown> = {
  args: { children: DIAGRAM },
}

export const HttpsImagesOnly: StoryObj<typeof Markdown> = {
  args: { children: IMAGES, httpsImagesOnly: true },
}

const LONG_CODE = [
  '```javascript',
  ...Array.from({ length: 48 }, (_, index) => `const step${index + 1} = ${index + 1}`),
  '```',
].join('\n')

function CodeBlockStateExample() {
  const [controls, setControls] = useState(true)
  const [diagram, setDiagram] = useState(false)
  return (
    <div className="max-w-2xl p-6">
      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setControls((value) => !value)}>
          {controls ? 'Hide code controls' : 'Show code controls'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setDiagram((value) => !value)}>
          {diagram ? 'Remove diagram' : 'Add diagram'}
        </Button>
      </div>
      <Markdown controls={controls}>{`${LONG_CODE}${diagram ? `\n\n${DIAGRAM}` : ''}`}</Markdown>
    </div>
  )
}

/** Changing controls or adding a diagram preserves the reader's place in existing code. */
export const CodeBlockState: StoryObj = {
  render: () => <CodeBlockStateExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvasElement.querySelector('[data-code-block]')).not.toBeNull())
    const block = canvasElement.querySelector('[data-code-block]')
    const scroll = block?.querySelector('pre')?.parentElement
    if (!block || !scroll) {
      throw new Error('The code block did not render')
    }
    scroll.scrollTop = 140
    scroll.dispatchEvent(new Event('scroll'))
    await userEvent.click(canvas.getByRole('button', { name: 'Hide code controls' }))
    await expect(canvasElement.querySelector('[data-code-block]')).toBe(block)
    await expect(scroll.scrollTop).toBe(140)
    await userEvent.click(canvas.getByRole('button', { name: 'Add diagram' }))
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-streamdown="mermaid-block"]')).not.toBeNull(),
    )
    await expect(canvasElement.querySelector('[data-code-block]')).toBe(block)
    await expect(scroll.scrollTop).toBe(140)
  },
}

/** Inline and display math in light mode. */
export const MathLight: StoryObj<MarkdownArgs> = {
  name: 'Math (light)',
  args: { children: MATH, isStreaming: false },
  globals: { mode: 'light' },
  render,
  play: playMath,
}

/** Inline and display math in dark mode, where formulas take the answer's ink. */
export const MathDark: StoryObj<MarkdownArgs> = {
  name: 'Math (dark)',
  args: { children: MATH, isStreaming: false },
  globals: { mode: 'dark' },
  render,
  play: playMath,
}
