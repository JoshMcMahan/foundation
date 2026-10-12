import { type ReactNode, useState } from 'react'
import { IconButton } from '../components/IconButton'
import { Input } from '../components/Input'
import { useWorkflowEditing } from '../components/Provider'
import type { GraphEdit } from '../editing'
import { SETTINGS_YAML_PATH } from '../editor/settingsYaml'
import { CloseIcon } from '../icons'
import {
  AddRowButton,
  asRecord,
  ChoiceButtons,
  DialogShell,
  type DialogShellProps,
  diffPatch,
  durationError,
  ENV_KEY,
  ExpressionToggle,
  expressionError,
  FieldError,
  FieldLabel,
  type Flag,
  flagError,
  flagOf,
  isEmptyPatch,
  type Json,
  KeyValueEditor,
  labelled,
  orUndefined,
  type Row,
  rowsError,
  rowsFrom,
  rowsTo,
  Section,
  StringListEditor,
  type Strings,
  ToggleField,
  text,
  withoutUndefined,
} from './editorFields'
import { useGraphEditorStrings, useInputsEditorStrings } from './editorStrings'
import { expressionRefs } from './expressionRefs'
import { type SettingsFormHooks, useSettingsViews } from './GraphEditorDialogs'
import { useNewInputs } from './InputDialog'
import { firstPageEdits, pagesBackEdits } from './inputPages'
import { FlagField, refSuggestions } from './inputRefs'
import type { SettingsView } from './settingsViews'

const LINK_NAME = /^[a-z0-9_-]*[a-z0-9]$/
const ORG_VARIABLE = /^[A-Z][A-Z0-9_]*$/
const USER_VARIABLE = /^[a-zA-Z0-9_-]+$/
const SESSION_FLAGS = ['redirect', 'useTLS', 'useCustomDomain', 'openAI', 'detach'] as const
const LINK_FLAGS = ['redirect', 'detach'] as const
const WIZARD_FLAGS = ['showSteps', 'allowJump', 'hideStepNumbers'] as const
/** What this dialog writes; the schema coverage test holds these to the workflow schema. */
export const WORKFLOW_FIELDS = [
  'env',
  'timeout',
  'permissions',
  'sessions',
  'links',
  'needs',
] as const
export const SESSION_FIELDS = [
  'type',
  'prompt-for-name',
  'prompt-for-name.default',
  ...SESSION_FLAGS,
]
export const LINK_FIELDS = ['endpoint', 'url', ...LINK_FLAGS]
export const NEEDS_FIELDS = ['organizationVariables', 'userVariables', 'userVariables.<*>.hint']
export const INPUT_FORM_FIELDS = [
  'labelPosition',
  'wizard',
  'wizard.mode',
  'wizard.navigation',
  ...WIZARD_FLAGS.map((flag) => `wizard.navigation.${flag}`),
  'wizard.submitLabel',
  'wizard.flatten',
]

// A card's key, so a removed card's field state doesn't pass to the one after it.
let cards = 0
const cardKey = () => `card-${++cards}`

interface SessionDraft {
  key: string
  name: string
  original: unknown
  type: 'tunnel' | 'link'
  prompt: boolean
  promptDefault: string
  flags: Record<(typeof SESSION_FLAGS)[number], Flag>
}

function sessionsFrom(value: unknown): SessionDraft[] {
  return Object.entries(asRecord(value)).map(([name, raw]) => {
    const session = asRecord(raw)
    const prompt = session['prompt-for-name']
    return {
      key: cardKey(),
      name,
      original: raw,
      type: session['type'] === 'link' ? 'link' : 'tunnel',
      prompt: Object.hasOwn(session, 'prompt-for-name'),
      promptDefault: text(asRecord(prompt)['default']),
      flags: Object.fromEntries(
        SESSION_FLAGS.map((flag) => [flag, flagOf(session[flag])]),
      ) as SessionDraft['flags'],
    }
  })
}

function sessionValue(draft: SessionDraft): unknown {
  const session: Json = {}
  const original = asRecord(draft.original)
  if (draft.type === 'link' || original['type'] === 'tunnel') {
    session['type'] = draft.type
  }
  if (draft.prompt) {
    session['prompt-for-name'] = draft.promptDefault.trim()
      ? { default: draft.promptDefault.trim() }
      : null
  }
  for (const flag of SESSION_FLAGS) {
    if (draft.flags[flag] !== undefined) {
      session[flag] = draft.flags[flag]
    }
  }
  return Object.keys(session).length === 0 && draft.original === null ? null : session
}

interface LinkDraft {
  key: string
  name: string
  original: unknown
  target: 'endpoint' | 'url'
  value: string
  flags: Record<(typeof LINK_FLAGS)[number], Flag>
}

function linksFrom(value: unknown): LinkDraft[] {
  return Object.entries(asRecord(value)).map(([name, raw]) => {
    const link = asRecord(raw)
    const target = link['url'] !== undefined ? 'url' : 'endpoint'
    return {
      key: cardKey(),
      name,
      original: raw,
      target,
      value: text(link[target]),
      flags: Object.fromEntries(
        LINK_FLAGS.map((flag) => [flag, flagOf(link[flag])]),
      ) as LinkDraft['flags'],
    }
  })
}

function linkValue(draft: LinkDraft): Json {
  const link: Json = { [draft.target]: draft.value.trim() }
  for (const flag of LINK_FLAGS) {
    if (draft.flags[flag] !== undefined) {
      link[flag] = draft.flags[flag]
    }
  }
  return link
}

interface UserVariablesDraft {
  expression: string | undefined
  asList: boolean
  rows: Row[]
}

function userVariablesFrom(value: unknown): UserVariablesDraft {
  if (typeof value === 'string') {
    return { expression: value, asList: false, rows: [] }
  }
  if (Array.isArray(value)) {
    return {
      expression: undefined,
      asList: true,
      rows: value.map((name) => ({ key: String(name), value: '' })),
    }
  }
  return {
    expression: undefined,
    asList: false,
    rows: Object.entries(asRecord(value)).map(([name, raw]) => ({
      key: name,
      value: text(asRecord(raw)['hint']),
    })),
  }
}

function userVariablesValue(draft: UserVariablesDraft): unknown {
  if (draft.expression !== undefined) {
    return orUndefined(draft.expression)
  }
  if (draft.rows.length === 0) {
    return undefined
  }
  if (draft.asList && draft.rows.every((row) => !row.value.trim())) {
    return draft.rows.map((row) => row.key.trim())
  }
  return Object.fromEntries(
    draft.rows.map((row) => [row.key.trim(), row.value.trim() ? { hint: row.value.trim() } : {}]),
  )
}

function namesError(
  names: string[],
  pattern: RegExp,
  message: string,
  t: Strings,
): string | undefined {
  const trimmed = names.map((name) => name.trim())
  for (const [i, name] of trimmed.entries()) {
    if (!pattern.test(name)) {
      return message
    }
    if (trimmed.indexOf(name) !== i) {
      return t.duplicateKey
    }
  }
  return undefined
}

function Card({
  onRemove,
  removeLabel,
  children,
}: {
  onRemove: () => void
  removeLabel: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex flex-1 flex-col gap-3 rounded-md border theme-border p-3">
        {children}
      </div>
      <IconButton
        icon={<CloseIcon className="h-4 w-4" />}
        label={removeLabel}
        variant="ghost"
        size="sm"
        onClick={onRemove}
      />
    </div>
  )
}

// Leaving page names in or out changes every page input's path: each moves out to the form while the
// wizard reads the old way, and back once it reads the new way, so references and saved inputs follow.
function reflattenEdits(inputs: Json, update: GraphEdit): GraphEdit[] {
  const names = Object.keys(inputs).filter((name) => !name.startsWith('$'))
  const pages = names
    .filter((name) => asRecord(inputs[name])['type'] === 'step')
    .map((page) => ({
      page,
      fields: Object.keys(asRecord(asRecord(inputs[page])['options'])).filter(
        (name) => !name.startsWith('$'),
      ),
    }))
    .filter(({ fields }) => fields.length > 0)
  if (pages.length === 0) {
    return [update]
  }
  return [
    {
      type: 'moveInputs',
      paths: pages.flatMap(({ page, fields }) => fields.map((name) => [page, name])),
      parent: [],
      index: names.length,
    },
    update,
    ...pages.map(
      ({ page, fields }): GraphEdit => ({
        type: 'moveInputs',
        paths: fields.map((name) => [name]),
        parent: [page],
        index: 0,
      }),
    ),
  ]
}

interface SettingsDialogProps {
  workflow: Json
  onEdit: (edit: GraphEdit) => void
  onClose: () => void
}

/** The workflow's own settings in a form, or as YAML; switching carries the edits across. */
export function WorkflowSettingsDialog(
  props: SettingsDialogProps & {
    source?: string | undefined
    view?: SettingsView | undefined
    onViewChange?: ((view: SettingsView) => void) | undefined
  },
) {
  const t = useGraphEditorStrings()
  const editing = useWorkflowEditing()
  const views = useSettingsViews({
    ...props,
    name: '',
    read: editing.settingsYaml,
    write: (_, yaml) => ({ type: 'setSettingsYaml', yaml }),
    scope: () => [],
    exclude: ['jobs', 'on'],
    optional: true,
  })
  if (views.start === undefined) {
    return <SettingsForm {...props} />
  }
  if (views.yaml !== null) {
    return views.yamlDialog(t.workflowSettings, SETTINGS_YAML_PATH, views.yaml)
  }
  return views.formDialog((host) => (
    <SettingsForm
      key={views.version}
      {...props}
      {...host}
      workflow={views.current ?? props.workflow}
    />
  ))
}

function SettingsForm({
  workflow,
  onEdit,
  onClose,
  renderShell,
  onDraft,
  pending = false,
}: SettingsDialogProps & SettingsFormHooks) {
  const t = useGraphEditorStrings()
  const inputStrings = useInputsEditorStrings()
  const [original] = useState(() => workflow)
  const editing = useWorkflowEditing()
  const newInputs = useNewInputs(editing.workflowInputsSchema(original))
  const source = { ...newInputs.source, extras: expressionRefs(editing, original) }
  const needs = asRecord(original['needs'])
  const [meta] = useState(() => asRecord(asRecord(editing.workflowInputsSchema(workflow))['$meta']))
  const wizard = asRecord(meta['wizard'])
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const touch = (section: string) =>
    setTouched((current) => (current.has(section) ? current : new Set(current).add(section)))

  const [env, setEnvRows] = useState(() => rowsFrom(original['env'], false))
  const [timeout, setTimeoutText] = useState(text(original['timeout']))
  const [permissions, setPermissionsList] = useState<string[]>(() =>
    Array.isArray(original['permissions']) ? original['permissions'].map(String) : [],
  )
  const [sessions, setSessionsList] = useState(() => sessionsFrom(original['sessions']))
  const [links, setLinksList] = useState(() => linksFrom(original['links']))
  const [orgVariables, setOrgVariablesList] = useState<string[]>(() =>
    Array.isArray(needs['organizationVariables']) ? needs['organizationVariables'].map(String) : [],
  )
  const [userVariables, setUserVariablesDraft] = useState(() =>
    userVariablesFrom(needs['userVariables']),
  )
  const [labelPosition, setLabelPositionValue] = useState<'left' | 'top'>(
    meta['labelPosition'] === 'top' ? 'top' : 'left',
  )
  const [wizardOn, setWizardOn] = useState(wizard['mode'] === 'wizard')
  const [wizardFlags, setWizardFlags] = useState(
    () =>
      Object.fromEntries(
        WIZARD_FLAGS.map((flag) => [flag, flagOf(asRecord(wizard['navigation'])[flag])]),
      ) as Record<(typeof WIZARD_FLAGS)[number], Flag>,
  )
  const [submitLabel, setSubmitLabel] = useState(text(wizard['submitLabel']))
  const [flatten, setFlatten] = useState(wizard['flatten'] !== false)

  const tracked =
    <T,>(section: string, set: (value: T) => void) =>
    (value: T) => {
      touch(section)
      set(value)
    }
  const setEnv = tracked('env', setEnvRows)
  const changeTimeout = tracked('timeout', setTimeoutText)
  const setPermissions = tracked('permissions', setPermissionsList)
  const setSessions = tracked('sessions', setSessionsList)
  const setLinks = tracked('links', setLinksList)
  const setOrgVariables = tracked('needs', setOrgVariablesList)
  const setUserVariables = tracked('needs', setUserVariablesDraft)
  const setLabelPosition = tracked('meta', setLabelPositionValue)
  const updateSession = (i: number, patch: Partial<SessionDraft>) =>
    setSessions(sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const updateLink = (i: number, patch: Partial<LinkDraft>) =>
    setLinks(links.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const redirects = [
    ...sessions.map((session) => session.flags.redirect),
    ...links.map((link) => link.flags.redirect),
  ].filter((value) => value === true).length
  const errors = {
    env: rowsError(env, ENV_KEY, t.invalidEnvKey, t),
    timeout: durationError(timeout, t),
    permissions: permissions.some((value) => !value.trim()) ? t.required : undefined,
    sessions:
      namesError(
        sessions.map((session) => session.name),
        /\S/,
        t.required,
        t,
      ) ??
      sessions
        .flatMap((session) => SESSION_FLAGS.map((flag) => session.flags[flag]))
        .map((value) => flagError(value, t))
        .find(Boolean),
    links:
      namesError(
        links.map((link) => link.name),
        LINK_NAME,
        t.invalidLinkName,
        t,
      ) ??
      (links.some((link) => !link.value.trim()) ? t.required : undefined) ??
      links
        .flatMap((link) => LINK_FLAGS.map((f) => link.flags[f]))
        .map((value) => flagError(value, t))
        .find(Boolean),
    redirect: redirects > 1 ? t.oneRedirect : undefined,
    orgVariables: namesError(orgVariables, ORG_VARIABLE, t.invalidOrganizationVariable, t),
    userVariables:
      userVariables.expression !== undefined
        ? expressionError(userVariables.expression, t)
        : rowsError(userVariables.rows, USER_VARIABLE, t.invalidKey, t),
    wizard: wizardOn
      ? WIZARD_FLAGS.map((flag) => flagError(wizardFlags[flag], t)).find(Boolean)
      : undefined,
  }

  const nextNeeds = (): unknown => {
    if (!touched.has('needs')) {
      return original['needs']
    }
    const next: Json = { ...needs }
    next['organizationVariables'] =
      orgVariables.length > 0 ? orgVariables.map((name) => name.trim()) : undefined
    next['userVariables'] = userVariablesValue(userVariables)
    const written = withoutUndefined(next)
    return Object.keys(written).length > 0 ? written : undefined
  }
  const pick = (section: string, value: () => unknown) =>
    touched.has(section) ? value() : original[section]

  const patch = diffPatch(original, {
    env: pick('env', () => rowsTo(env, (value) => value)),
    timeout: pick('timeout', () => orUndefined(timeout)),
    permissions: pick('permissions', () =>
      permissions.length > 0 ? permissions.map((value) => value.trim()) : undefined,
    ),
    sessions: pick('sessions', () =>
      sessions.length > 0
        ? Object.fromEntries(
            sessions.map((session) => [session.name.trim(), sessionValue(session)]),
          )
        : undefined,
    ),
    links: pick('links', () =>
      links.length > 0
        ? Object.fromEntries(links.map((link) => [link.name.trim(), linkValue(link)]))
        : undefined,
    ),
    needs: nextNeeds(),
  } satisfies Record<(typeof WORKFLOW_FIELDS)[number], unknown>)

  const nextWizard = (): unknown => {
    if (!wizardOn) {
      return undefined
    }
    const navigation: Json = {}
    for (const flag of WIZARD_FLAGS) {
      if (wizardFlags[flag] !== undefined) {
        navigation[flag] = wizardFlags[flag]
      }
    }
    const next: Json = { ...wizard, mode: 'wizard' }
    next['navigation'] = Object.keys(navigation).length > 0 ? navigation : undefined
    next['submitLabel'] = orUndefined(submitLabel)
    next['flatten'] = flatten ? (wizard['flatten'] === true ? true : undefined) : false
    return withoutUndefined(next)
  }
  const metaPatch = touched.has('meta')
    ? diffPatch(meta, {
        labelPosition:
          labelPosition === 'top' ? 'top' : meta['labelPosition'] === 'left' ? 'left' : undefined,
        wizard: nextWizard(),
      })
    : { set: {}, unset: [] }

  const dirty = !isEmptyPatch(patch) || !isEmptyPatch(metaPatch)
  const invalid = Object.values(errors).some(Boolean)
  const setWizard = <T,>(set: (value: T) => void) => tracked<T>('meta', set)

  const update: GraphEdit = { type: 'updateWorkflow', ...patch, inputsMeta: metaPatch }
  // A wizard draws only its pages, so splitting puts the inputs outside one in a first page, and
  // unsplitting puts every page's inputs back. Inputs this dialog made go along with the rest.
  // An input's path follows the wizard's settings when it moves, and what reads it follows the
  // move: the other settings go first, then the wizard's change is made on the side of the moves
  // that reads the inputs where they are.
  const inputs = newInputs.all
  const wasWizard = wizard['mode'] === 'wizard'
  const settings: GraphEdit[] = isEmptyPatch(patch) ? [] : [{ type: 'updateWorkflow', ...patch }]
  const wizardEdit: GraphEdit = { type: 'updateWorkflow', inputsMeta: metaPatch }
  const edits: GraphEdit[] =
    wizardOn && !wasWizard
      ? [...settings, wizardEdit, ...firstPageEdits(editing, inputs, inputStrings.stepTitle(1))]
      : !wizardOn && wasWizard
        ? [...settings, ...pagesBackEdits(inputs, []), wizardEdit]
        : wizardOn && flatten !== (wizard['flatten'] !== false)
          ? [...settings, ...reflattenEdits(inputs, wizardEdit)]
          : [update]
  const saveEdit = newInputs.save(dirty ? editing.batchOf(edits) : null)
  onDraft?.(saveEdit, invalid)
  const children = (
    <>
      {newInputs.dialog}
      <Section title={t.sectionGeneral} open>
        <FieldLabel label={t.fields.env} yamlKey="env" description={t.help.workflowEnv} />
        <KeyValueEditor
          rows={env}
          onChange={setEnv}
          error={errors.env}
          valueSuggestions={refSuggestions(source)}
        />
        <Input
          mono
          {...labelled(t.fields.timeout, 'timeout')}
          description={t.help.workflowTimeout}
          value={timeout}
          error={errors.timeout}
          onChange={(e) => changeTimeout(e.target.value)}
        />
      </Section>
      <Section
        title={t.sectionPermissions}
        description={t.help.permissions}
        open={permissions.length > 0}
        alert={!!errors.permissions}
      >
        <StringListEditor
          label={t.sectionPermissions}
          values={permissions}
          onChange={setPermissions}
          addLabel={t.addPermission}
          placeholder="*"
          error={errors.permissions}
        />
      </Section>
      <Section
        title={t.sectionSessions}
        description={t.help.sessions}
        open={sessions.length > 0}
        alert={!!(errors.sessions || errors.redirect)}
      >
        {sessions.map((session, i) => (
          <Card
            key={session.key}
            removeLabel={t.removeRow}
            onRemove={() => setSessions(sessions.filter((_, j) => j !== i))}
          >
            <Input
              mono
              label={t.fields.name}
              description={t.help.sessionName}
              value={session.name}
              onChange={(e) => updateSession(i, { name: e.target.value })}
            />
            <FieldLabel
              label={t.fields.sessionType}
              yamlKey="type"
              description={t.help.sessionType}
            />
            <ChoiceButtons
              options={[
                { value: 'tunnel', label: t.sessionTypeTunnel },
                { value: 'link', label: t.sessionTypeLink },
              ]}
              value={session.type}
              onChange={(type) => updateSession(i, { type })}
            />
            <FieldLabel
              label={t.fields.promptForName}
              yamlKey="prompt-for-name"
              description={t.help.promptForName}
            />
            <ChoiceButtons
              options={[
                { value: 'off', label: t.promptOff },
                { value: 'ask', label: t.promptAsk },
              ]}
              value={session.prompt ? 'ask' : 'off'}
              onChange={(mode) => updateSession(i, { prompt: mode === 'ask' })}
            />
            {session.prompt && (
              <Input
                {...labelled(t.fields.promptDefault, 'default')}
                description={t.help.promptDefault}
                value={session.promptDefault}
                onChange={(e) => updateSession(i, { promptDefault: e.target.value })}
              />
            )}
            {SESSION_FLAGS.map((flag) => (
              <FlagField
                key={flag}
                label={t.fields[flag]}
                yamlKey={flag}
                description={
                  flag === 'redirect'
                    ? t.help.sessionRedirect
                    : flag === 'detach'
                      ? t.help.sessionDetach
                      : t.help[flag]
                }
                value={session.flags[flag]}
                original={asRecord(session.original)[flag]}
                onChange={(value: Flag) =>
                  updateSession(i, {
                    flags: { ...session.flags, [flag]: value },
                  })
                }
                source={source}
              />
            ))}
          </Card>
        ))}
        <FieldError message={errors.sessions ?? errors.redirect} />
        <AddRowButton
          label={t.addSession}
          onClick={() =>
            setSessions([
              ...sessions,
              {
                key: cardKey(),
                name: '',
                original: null,
                type: 'tunnel',
                prompt: false,
                promptDefault: '',
                flags: {
                  redirect: undefined,
                  useTLS: undefined,
                  useCustomDomain: undefined,
                  openAI: undefined,
                  detach: undefined,
                },
              },
            ])
          }
        />
      </Section>
      <Section
        title={t.sectionLinks}
        description={t.help.links}
        open={links.length > 0}
        alert={!!(errors.links || errors.redirect)}
      >
        {links.map((link, i) => (
          <Card
            key={link.key}
            removeLabel={t.removeRow}
            onRemove={() => setLinks(links.filter((_, j) => j !== i))}
          >
            <Input
              mono
              label={t.fields.name}
              description={t.help.linkName}
              value={link.name}
              onChange={(e) => updateLink(i, { name: e.target.value })}
            />
            <FieldLabel label={t.fields.linkTarget} description={t.help.linkTarget} />
            <ChoiceButtons
              options={[
                { value: 'endpoint', label: t.linkToEndpoint },
                { value: 'url', label: t.linkToUrl },
              ]}
              value={link.target}
              onChange={(target) => updateLink(i, { target })}
            />
            <Input
              mono
              aria-label={link.target === 'url' ? t.linkToUrl : t.linkToEndpoint}
              description={link.target === 'url' ? t.help.linkUrl : t.help.linkEndpoint}
              value={link.value}
              placeholder={link.target === 'url' ? 'https://' : 'app'}
              onChange={(e) => updateLink(i, { value: e.target.value })}
            />
            {LINK_FLAGS.map((flag) => (
              <FlagField
                key={flag}
                label={t.fields[flag]}
                yamlKey={flag}
                description={flag === 'redirect' ? t.help.linkRedirect : t.help.linkDetach}
                value={link.flags[flag]}
                original={asRecord(link.original)[flag]}
                onChange={(value: Flag) =>
                  updateLink(i, { flags: { ...link.flags, [flag]: value } })
                }
                source={source}
              />
            ))}
          </Card>
        ))}
        <FieldError message={errors.links ?? errors.redirect} />
        <AddRowButton
          label={t.addLink}
          onClick={() =>
            setLinks([
              ...links,
              {
                key: cardKey(),
                name: '',
                original: undefined,
                target: 'endpoint',
                value: '',
                flags: { redirect: undefined, detach: undefined },
              },
            ])
          }
        />
      </Section>
      <Section
        title={t.sectionRequiredVariables}
        open={
          orgVariables.length > 0 ||
          userVariables.rows.length > 0 ||
          userVariables.expression !== undefined
        }
        alert={!!(errors.orgVariables || errors.userVariables)}
      >
        <FieldLabel
          label={t.fields.organizationVariables}
          yamlKey="needs.organizationVariables"
          description={t.help.organizationVariables}
        />
        <StringListEditor
          label={t.fields.organizationVariables}
          values={orgVariables}
          onChange={setOrgVariables}
          addLabel={t.addOrganizationVariable}
          placeholder="MY_VARIABLE"
          error={errors.orgVariables}
        />
        <FieldLabel
          label={t.fields.userVariables}
          yamlKey="needs.userVariables"
          description={t.help.userVariables}
          actions={
            <ExpressionToggle
              active={userVariables.expression !== undefined}
              onChange={(on) =>
                setUserVariables({
                  ...userVariables,
                  expression: on ? '' : undefined,
                })
              }
            />
          }
        />
        {userVariables.expression !== undefined ? (
          <Input
            mono
            aria-label={t.fields.userVariables}
            value={userVariables.expression}
            error={errors.userVariables}
            onChange={(e) => setUserVariables({ ...userVariables, expression: e.target.value })}
          />
        ) : (
          <KeyValueEditor
            rows={userVariables.rows}
            onChange={(rows) => setUserVariables({ ...userVariables, rows })}
            error={errors.userVariables}
            keyPlaceholder={t.key}
            valuePlaceholder={t.help.userVariableHint}
            addLabel={t.addUserVariable}
          />
        )}
      </Section>
      <Section title={t.sectionInputForm} open={wizardOn} alert={!!errors.wizard}>
        <FieldLabel
          label={t.fields.labelPosition}
          yamlKey="labelPosition"
          description={t.help.labelPosition}
        />
        <ChoiceButtons
          options={[
            { value: 'left', label: t.labelsBeside },
            { value: 'top', label: t.labelsAbove },
          ]}
          value={labelPosition}
          onChange={setLabelPosition}
        />
        <ToggleField
          label={t.fields.wizard}
          yamlKey="wizard"
          description={t.help.wizard}
          checked={wizardOn}
          onChange={setWizard((on: boolean) => {
            setWizardOn(on)
            // A form split here starts as the editor splits one: pages to jump between, and a Submit button.
            if (on && wizard['mode'] !== 'wizard') {
              setWizardFlags((current) => ({ ...current, allowJump: current.allowJump ?? true }))
              setSubmitLabel((current) => current || inputStrings.submitLabel)
            }
          })}
        />
        {wizardOn && (
          <>
            {WIZARD_FLAGS.map((flag) => (
              <FlagField
                key={flag}
                label={t.fields[flag]}
                yamlKey={flag}
                description={t.help[flag]}
                value={wizardFlags[flag]}
                original={asRecord(wizard['navigation'])[flag]}
                fallback={flag === 'showSteps'}
                onChange={setWizard((value: Flag) =>
                  setWizardFlags((current) => ({ ...current, [flag]: value })),
                )}
              />
            ))}
            <Input
              {...labelled(t.fields.submitLabel, 'submitLabel')}
              description={t.help.submitLabel}
              value={submitLabel}
              onChange={(e) => setWizard(setSubmitLabel)(e.target.value)}
            />
            <ToggleField
              label={t.fields.flatten}
              yamlKey="flatten"
              description={t.help.wizardFlatten}
              checked={flatten}
              onChange={setWizard(setFlatten)}
            />
          </>
        )}
      </Section>
    </>
  )
  const shellProps: DialogShellProps = {
    title: t.workflowSettings,
    onClose,
    dirty: dirty || newInputs.pending.length > 0 || pending,
    locked: newInputs.dialog !== null,
    saveDisabled: invalid,
    onSubmit: () => {
      if (saveEdit) {
        onEdit(saveEdit)
      }
      onClose()
    },
    children,
  }
  return renderShell ? renderShell(shellProps) : <DialogShell {...shellProps} />
}
