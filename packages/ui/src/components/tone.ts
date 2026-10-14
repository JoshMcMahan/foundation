/** How a status reads: its colors come from the theme's tone tokens, so every
 *  theme, dark ones included, sets them once. Words take a status's text shade,
 *  and icons and dots its vivid one, which only graphics' 3:1 holds. */
export type Tone = 'default' | 'success' | 'warning' | 'error' | 'info' | 'muted'

/** Text in the tone, for a status line beside a dot or icon. */
export const toneText: Record<Tone, string> = {
  default: 'text-(--theme-app)',
  success: 'text-(--theme-success-text)',
  warning: 'text-(--theme-warning-text)',
  error: 'text-(--theme-error-text)',
  info: 'text-(--theme-info-text)',
  muted: 'text-(--theme-muted-text-color)',
}

/** An icon in the tone, through `currentColor`. */
export const toneIcon: Record<Tone, string> = {
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
  success: 'bg-(--theme-success-muted) text-(--theme-success-text) border-(--theme-success)/25',
  warning: 'bg-(--theme-warning-muted) text-(--theme-warning-text) border-(--theme-warning)/25',
  error: 'bg-(--theme-error-muted) text-(--theme-error-text) border-(--theme-error)/25',
  info: 'bg-(--theme-info-muted) text-(--theme-info-text) border-(--theme-info)/25',
  muted: 'bg-(--theme-muted-panel-bg)/50 text-(--theme-muted-text-color) border-(--theme-border)',
}

/** A solid fill in the tone, for a dot or a bar. */
export const toneFill: Record<Tone, string> = {
  default: 'bg-(--theme-app)',
  success: 'bg-(--theme-success)',
  warning: 'bg-(--theme-warning)',
  error: 'bg-(--theme-error)',
  info: 'bg-(--theme-info)',
  muted: 'bg-(--theme-muted-text-color)',
}
