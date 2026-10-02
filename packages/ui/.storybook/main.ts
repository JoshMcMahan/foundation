import type { StorybookConfig } from '@storybook/react-vite'

// Stories stay colocated with their components.
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  core: { disableTelemetry: true },
  // shiki's textmate engine reads
  // `process.env.VSCODE_TEXTMATE_DEBUG` behind a `typeof process` guard, which
  // throws wherever `process` exists without `env`.
  viteFinal: (config) => ({
    ...config,
    define: { ...config.define, 'process.env': {} },
  }),
}

export default config
