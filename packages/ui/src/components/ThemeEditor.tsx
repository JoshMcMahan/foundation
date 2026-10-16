import { type CSSProperties, useId, useMemo, useState } from 'react'
import { cx } from '../cx'
import {
  CODE_STYLES,
  type CodeStyle,
  type ColorPreference,
  DEFAULT_CONTRAST,
  DEFAULT_THEME,
  deriveTheme,
  generateTheme,
  type Mode,
  modeOf,
  parseColor,
  parseTheme,
  prefersWideGamut,
  type Scheme,
  schemeFor,
  serializeTheme,
  THEME_PRESETS,
  type Theme,
  toHex,
} from '../theme/index'
import { Button } from './Button'
import { ColorInput } from './ColorInput'
import { Disclosure } from './Disclosure'
import { Field } from './Field'
import { fieldBox } from './fieldBox'
import { Textarea } from './Input'
import { useStrings } from './Provider'
import { SegmentedControl } from './SegmentedControl'
import { Select } from './Select'
import { Slider } from './Slider'
import { Switch } from './Switch'
import { useCopy } from './useCopy'

export interface ThemeEditorProps {
  /** The theme being edited, as a host stores it. */
  value: Theme
  onChange: (theme: Theme) => void
  /** Which mode's colors the controls edit. Leave it out to let the editor keep its own. */
  mode?: Mode | undefined
  onModeChange?: ((mode: Mode) => void) | undefined
  /** The person's light, dark or system choice; the Appearance control shows when this and its handler are given. */
  preference?: ColorPreference | undefined
  onPreferenceChange?: ((preference: ColorPreference) => void) | undefined
  /** What Reset returns to; the default theme when left out. */
  defaultValue?: Theme | undefined
  /** False drops the preview beside the controls, for a host that applies the theme app-wide as it changes (`useApplyTheme`). */
  preview?: boolean | undefined
  className?: string | undefined
}

/**
 * Edits a theme: a background, an accent and a contrast for light and for
 * dark, an optional sidebar of its own and a code style. Everything else is
 * generated, so any choice reads. It previews the result beside the controls,
 * copies the theme as JSON, imports one pasted back, and resets.
 */
export function ThemeEditor({
  value,
  onChange,
  mode,
  onModeChange,
  preference,
  onPreferenceChange,
  defaultValue = DEFAULT_THEME,
  preview = true,
  className,
}: ThemeEditorProps) {
  const { theme: t } = useStrings()
  const [ownMode, setOwnMode] = useState<Mode>(mode ?? 'light')
  const editing = mode ?? ownMode
  const setEditing = (next: Mode) => {
    setOwnMode(next)
    onModeChange?.(next)
  }
  // A mode the theme has no scheme for is derived from the other one, as a new object each time;
  // kept, the contrast solving below runs only when the theme or the mode changes.
  const scheme = useMemo(() => schemeFor(value, editing), [value, editing])
  const serialized = useMemo(() => serializeTheme(value), [value])
  const seed = scheme.interface
  const update = (next: Scheme) => onChange({ ...value, [editing]: next })
  const setSeed = (patch: Partial<Scheme['interface']>) =>
    update({ ...scheme, interface: { ...seed, ...patch } })
  const derived = useMemo(() => deriveTheme(scheme), [scheme])
  const { copy } = useCopy()

  return (
    <div
      className={cx(
        'grid gap-6',
        preview && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-5">
        {preference !== undefined && onPreferenceChange && (
          <Field label={t.appearance} group>
            <SegmentedControl
              options={(['light', 'dark', 'system'] as const).map((p) => ({
                value: p,
                label: t[p],
              }))}
              value={preference}
              onValueChange={onPreferenceChange}
            />
          </Field>
        )}
        <Field label={t.presets} group>
          <div className="flex flex-wrap gap-2">
            {THEME_PRESETS.map((preset) => {
              // A preset made for one mode shows, and opens on, that mode rather than one derived from it.
              const native: Mode = preset.theme[editing]
                ? editing
                : preset.theme.light
                  ? 'light'
                  : 'dark'
              const own = schemeFor(preset.theme, native).interface
              const current = presetKey(preset.theme) === serialized
              return (
                <Button
                  key={preset.name}
                  size="sm"
                  variant={current ? 'primary' : 'secondary'}
                  aria-pressed={current}
                  onClick={() => {
                    onChange(preset.theme)
                    if (native !== editing) {
                      setEditing(native)
                    }
                  }}
                >
                  <Swatch colors={[own.base, own.accent]} />
                  {preset.label}
                </Button>
              )
            })}
          </div>
        </Field>
        <Field label={t.editing} group>
          <SegmentedControl
            options={(['light', 'dark'] as const).map((m) => ({ value: m, label: t[m] }))}
            value={editing}
            onValueChange={setEditing}
          />
        </Field>
        <ColorInput label={t.base} value={seed.base} onValueChange={(base) => setSeed({ base })} />
        <ColorInput
          label={t.accent}
          value={seed.accent}
          onValueChange={(accent) => setSeed({ accent })}
        />
        <Field
          label={t.contrast}
          hint={
            <span className="tabular-nums text-(--theme-muted-text-color)">
              {seed.contrast ?? DEFAULT_CONTRAST}
            </span>
          }
          description={t.contrastHelp}
        >
          <Slider
            aria-label={t.contrast}
            value={seed.contrast ?? DEFAULT_CONTRAST}
            onValueChange={(contrast) => setSeed({ contrast })}
            min={0}
            max={100}
          />
        </Field>
        <label className="flex items-center justify-between gap-3 text-sm font-medium text-(--theme-app)">
          {t.customSidebar}
          <Switch
            checked={!!scheme.sidebar}
            onCheckedChange={(on) => {
              const { sidebar: _, ...rest } = scheme
              update(on ? { ...rest, sidebar: { base: derived['--theme-sidebar-bg'] } } : rest)
            }}
          />
        </label>
        {scheme.sidebar && (
          <div className="flex flex-col gap-5 border-l-2 border-(--theme-border) pl-4">
            <ColorInput
              label={t.sidebarBase}
              value={scheme.sidebar.base ?? derived['--theme-sidebar-bg']}
              onValueChange={(base) => update({ ...scheme, sidebar: { ...scheme.sidebar, base } })}
            />
            <ColorInput
              label={t.sidebarAccent}
              value={scheme.sidebar.accent ?? seed.accent}
              onValueChange={(accent) =>
                update({ ...scheme, sidebar: { ...scheme.sidebar, accent } })
              }
            />
          </div>
        )}
        <Field label={t.code}>
          {(control) => (
            <Select<CodeStyle>
              id={control.id}
              aria-label={t.code}
              items={CODE_STYLES.map((style) => ({ value: style, label: t.codeStyle(style) }))}
              value={value.code ?? 'balanced'}
              onValueChange={(code) => code && onChange({ ...value, code })}
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => copy(serializeTheme(value), { label: t.copied })}>
            {t.copy}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onChange(defaultValue)}>
            {t.reset}
          </Button>
        </div>
        <ImportTheme onImport={onChange} />
      </div>
      {preview && <ThemePreview theme={value} mode={editing} />}
    </div>
  )
}

const presetKeys = new WeakMap<Theme, string>()
const presetKey = (theme: Theme) => {
  let key = presetKeys.get(theme)
  if (key === undefined) {
    key = serializeTheme(theme)
    presetKeys.set(theme, key)
  }
  return key
}

function Swatch({ colors }: { colors: string[] }) {
  return (
    <span aria-hidden="true" className="flex -space-x-1">
      {colors.map((c, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed pair of swatches
          key={i}
          className="size-3 rounded-full border border-(--theme-border-strong)"
          style={{ backgroundColor: toHex(parseColor(c) ?? { l: 0, c: 0, h: 0 }) }}
        />
      ))}
    </span>
  )
}

function ImportTheme({ onImport }: { onImport: (theme: Theme) => void }) {
  const { theme: t } = useStrings()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  return (
    <Disclosure summary={t.import} open={open} onOpenChange={setOpen} panelClassName="pt-2">
      <div className="flex flex-col gap-2">
        <Textarea
          id={id}
          label={t.importLabel}
          placeholder={t.importPlaceholder}
          rows={4}
          mono
          value={text}
          error={error ?? undefined}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
        />
        <div>
          <Button
            size="sm"
            variant="primary"
            disabled={!text.trim()}
            onClick={() => {
              const result = parseTheme(text)
              if (!result.ok) {
                setError(t.importError(result.error.code, result.error.path))
                return
              }
              onImport(result.theme)
              setText('')
              setOpen(false)
            }}
          >
            {t.apply}
          </Button>
        </div>
      </div>
    </Disclosure>
  )
}

// A few lines of configuration, colored as the code theme colors them.
const CODE_SAMPLE: [string, string][][] = [
  [['# Runs every night', 'comment']],
  [
    ['name', 'property'],
    [': ', 'text'],
    ['nightly-build', 'string'],
  ],
  [
    ['retries', 'property'],
    [': ', 'text'],
    ['3', 'number'],
  ],
  [
    ['enabled', 'property'],
    [': ', 'text'],
    ['true', 'keyword'],
  ],
]

/** The theme on a small page: a sidebar, a panel of text, a control, statuses and code. */
export function ThemePreview({ theme, mode }: { theme: Theme; mode: Mode }) {
  const { theme: t } = useStrings()
  const scheme = useMemo(() => schemeFor(theme, mode), [theme, mode])
  const style = useMemo(() => {
    const generated = generateTheme(scheme, theme.code ? { code: theme.code } : {})
    return {
      ...generated.srgb,
      ...(prefersWideGamut() ? generated.p3 : {}),
      colorScheme: modeOf(scheme),
    } as CSSProperties
  }, [scheme, theme.code])
  return (
    <section
      aria-label={t.preview}
      data-testid="theme-preview"
      style={style}
      className="flex min-h-80 overflow-hidden rounded-xl border border-(--theme-border) bg-(--theme-app-bg) text-sm text-(--theme-app) shadow-(--theme-shadow)"
    >
      {/* A picture of a sidebar, not one: no landmark or heading of the preview joins the page's. */}
      <div className="flex w-32 shrink-0 flex-col gap-0.5 bg-(--theme-sidebar-bg) p-2">
        {t.previewNav.map((item, i) => (
          <span
            key={item}
            className={cx(
              'rounded-md px-2 py-1.5',
              i === 1
                ? 'bg-(--theme-sidebar-active-bg) font-medium text-(--theme-sidebar-active-text)'
                : 'text-(--theme-sidebar-text)',
            )}
          >
            {item}
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-2 rounded-lg border border-(--theme-border) bg-(--theme-panel-bg) p-3 shadow-(--theme-shadow-sm)">
          <p className="font-semibold">{t.previewHeading}</p>
          <p>{t.previewBody}</p>
          <p className="text-xs text-(--theme-muted-text-color)">{t.previewMuted}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-(--theme-success-muted) px-2 py-0.5 text-xs text-(--theme-success-text)">
              <span className="size-1.5 rounded-full bg-(--theme-success)" />
              {t.previewPassed}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-(--theme-error-muted) px-2 py-0.5 text-xs text-(--theme-error-text)">
              <span className="size-1.5 rounded-full bg-(--theme-error)" />
              {t.previewFailed}
            </span>
            <span className="text-(--theme-link) underline underline-offset-2">
              {t.previewLink}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cx(
              fieldBox({ size: 'sm' }),
              'flex flex-1 cursor-default items-center text-(--theme-placeholder)',
            )}
          >
            {t.previewSearch}
          </span>
          <span className="rounded-md bg-(--theme-accent) px-3 py-1.5 text-xs font-medium text-(--theme-accent-text)">
            {t.previewButton}
          </span>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-(--theme-code-bg) p-3 font-mono text-xs leading-5 text-(--theme-code-text)">
          {CODE_SAMPLE.map((line) => (
            <div key={line.map(([text]) => text).join('')}>
              {line.map(([text, token]) => (
                <span
                  key={`${token}-${text}`}
                  style={{ color: `var(--theme-code-${token})` }}
                  className={token === 'comment' ? 'italic' : undefined}
                >
                  {text}
                </span>
              ))}
            </div>
          ))}
        </pre>
      </div>
    </section>
  )
}
