import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import Markdown from './Markdown'

const meta: Meta = {
  title: 'UI/Markdown',
}
export default meta

interface MarkdownArgs {
  children: string
  isStreaming: boolean
}

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
