/** How a status reads: its colours come from the theme's tone tokens, so every
 *  theme, dark ones included, sets them once. */
export type Tone = 'default' | 'success' | 'warning' | 'error' | 'info' | 'muted'

/** Text in the tone, for a status line beside a dot or icon. */
export const toneText: Record<Tone, string> = {
  default: 'text-(--theme-app)',
  success: 'text-(--theme-success)',
  warning: 'text-(--theme-warning)',
  error: 'text-(--theme-error)',
  info: 'text-(--theme-info)',
  muted: 'text-(--theme-muted-text-color)',
}

/** A tinted surface with a border and text in the tone, for a badge or a callout. */
export const toneSurface: Record<Tone, string> = {
  default: 'bg-(--theme-muted-panel-bg) text-(--theme-app) border-(--theme-border)',
  success: 'bg-(--theme-success-muted) text-(--theme-success) border-(--theme-success)/25',
  warning: 'bg-(--theme-warning-muted) text-(--theme-warning) border-(--theme-warning)/25',
  error: 'bg-(--theme-error-muted) text-(--theme-error) border-(--theme-error)/25',
  info: 'bg-(--theme-info-muted) text-(--theme-info) border-(--theme-info)/25',
  muted: 'bg-(--theme-muted-panel-bg)/50 text-(--theme-muted-text-color) border-(--theme-border)',
}

/** A solid fill in the tone, for a dot. */
export const toneFill: Record<Tone, string> = {
  default: 'bg-(--theme-app)',
  success: 'bg-(--theme-success)',
  warning: 'bg-(--theme-warning)',
  error: 'bg-(--theme-error)',
  info: 'bg-(--theme-info)',
  muted: 'bg-(--theme-muted-text-color)',
}
