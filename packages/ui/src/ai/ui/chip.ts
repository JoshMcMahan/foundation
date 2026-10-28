// The composer's pickers read as plain text until hovered, so a row of them
// looks like a sentence describing the turn rather than a form.
const chipBase =
  'inline-flex min-w-0 items-center cursor-pointer outline-none transition-colors theme-muted-text hover:theme-text focus-visible:ring-1 focus-visible:ring-(--theme-focus) disabled:cursor-not-allowed disabled:opacity-50'

/** A picker under the composer, beside send. */
export const chipClassName = `${chipBase} h-8 max-w-[280px] gap-1.5 rounded-full px-2.5 text-[13px] hover:chat-tint`

/** A smaller picker for secondary settings, such as the agent's permissions. */
export const smallChipClassName = `${chipBase} gap-1 rounded-md px-1.5 py-0.5 text-[11px] hover:theme-muted-panel`
