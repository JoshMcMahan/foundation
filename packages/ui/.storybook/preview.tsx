// Stories render against the COMPILED package stylesheet (dist css), not a
// live Tailwind build, so the workshop exercises exactly what consumers
// receive — utility gaps here are shipping bugs. The storybook scripts run
// build:css first.
import '../dist/styles/fonts.css'
import '../dist/styles.css'
import '../dist/logviewer/logviewer.css'
import * as parser from '@parallelworks/workflow-parser'
import type { Decorator, Preview } from '@storybook/react-vite'
import { type UILinkComponent, UIProvider } from '../src/components/Provider'
import { TEST_ACTIONS } from '../src/test/actions'
import {
  applyTheme,
  DEFAULT_PRESET,
  deriveTheme,
  isDarkColor,
  THEME_PRESETS,
} from '../src/theme/index'

// The parser's functions double as the editor's, the way a host passes them.
const engine = { ...parser.createWorkflowEngine(), editing: parser }
const storyData = { workflowActions: TEST_ACTIONS }

// Links render as anchors but never navigate away from the story.
const StoryLink: UILinkComponent = ({ to, onClick, children, ...rest }) => (
  <a
    href={to}
    {...rest}
    onClick={(e) => {
      e.preventDefault()
      onClick?.()
    }}
  >
    {children}
  </a>
)
const storySlots = { link: StoryLink }

const withTheme: Decorator = (Story, context) => {
  const preset = THEME_PRESETS.find((p) => p.name === context.globals.theme) ?? DEFAULT_PRESET
  const root = document.documentElement
  applyTheme(root, deriveTheme(preset.seed))
  // Drives light-dark() CSS, useCssIsDark and the dark: variant, the way a
  // host sets them.
  const dark = isDarkColor(preset.seed.interface.background)
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
  },
  initialGlobals: {
    theme: DEFAULT_PRESET.name,
  },
  parameters: {
    controls: { expanded: true },
    options: { storySort: { order: ['Introduction', 'UI', 'Chat'] } },
  },
}

export default preview
