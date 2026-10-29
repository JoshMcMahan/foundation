// Stories render against the COMPILED package stylesheet (dist css), not a
// live Tailwind build, so the workshop exercises exactly what consumers
// receive — utility gaps here are shipping bugs. The storybook scripts run
// build:css first.
import '../dist/styles/fonts.css'
import '../dist/styles.css'
import '../dist/app-frame/app-frame.css'
import '../dist/logviewer/logviewer.css'
import * as parser from '@parallelworks/workflow-parser'
import type { Decorator, Preview } from '@storybook/react-vite'
import { type UILinkComponent, UIProvider } from '../src/components/Provider'
import { TEST_ACTIONS } from '../src/test/actions'
import {
  applyTheme,
  DEFAULT_PRESET,
  generateTheme,
  type Mode,
  modeOf,
  schemeFor,
  THEME_PRESETS,
} from '../src/theme/index'

// The parser's functions double as the editor's, the way a host passes them.
const engine = { ...parser.createWorkflowEngine(), editing: parser }
const storyData = { workflowActions: TEST_ACTIONS }

// Links render as anchors but never navigate away from the story.
const StoryLink: UILinkComponent = ({ href, onClick, children, ...rest }) => (
  <a
    href={href}
    {...rest}
    onClick={(e) => {
      e.preventDefault()
      onClick?.(e)
    }}
  >
    {children}
  </a>
)
const storySlots = { link: StoryLink }

const withTheme: Decorator = (Story, context) => {
  const preset = THEME_PRESETS.find((p) => p.name === context.globals.theme) ?? DEFAULT_PRESET
  // Without a mode picked, a preset shows the mode it was made for.
  const picked = context.globals.mode as Mode | 'preset'
  const scheme = schemeFor(
    preset.theme,
    picked === 'preset' ? (preset.theme.light ? 'light' : 'dark') : picked,
  )
  const root = document.documentElement
  applyTheme(root, generateTheme(scheme, preset.theme.code ? { code: preset.theme.code } : {}))
  // Drives light-dark() CSS, useCssIsDark and the dark: variant, the way a
  // host sets them.
  const dark = modeOf(scheme) === 'dark'
  root.style.colorScheme = dark ? 'dark' : 'light'
  root.classList.toggle('dark', dark)
  return (
    <UIProvider engine={engine} slots={storySlots} data={storyData}>
      <Story />
    </UIProvider>
  )
}

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Derived theme seed',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: THEME_PRESETS.map((p) => ({ value: p.name, title: p.label })),
        dynamicTitle: true,
      },
    },
    mode: {
      description: 'Light or dark scheme of the theme',
      toolbar: {
        title: 'Mode',
        icon: 'mirror',
        items: [
          { value: 'preset', title: "Preset's own" },
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: DEFAULT_PRESET.name,
    mode: 'preset',
  },
  parameters: {
    docs: { codePanel: true },
    controls: { expanded: true },
    options: { storySort: { order: ['Introduction', 'UI', 'Chat'] } },
  },
}

export default preview
