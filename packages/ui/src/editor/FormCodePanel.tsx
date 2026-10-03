import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from '@parallelworks/ui/icons'
import cx from 'classnames'
import { useId, useRef, useState } from 'react'
import { useNotify, useStrings, useWorkflowEngine } from '../components/Provider'
import SwitchToggleSmall from '../components/SwitchToggleSmall'
import type { WorkflowEngine } from '../engine'
import { flattenGroups, impureSetValueFromPath } from '../form/lib'
import Editor from './Editor'
import type { ISchemaError } from './Monaco'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const shouldIgnoreField = (
  engine: WorkflowEngine,
  fieldSchema: Record<string, unknown>,
  inputs: Record<string, unknown>,
  arrayIndex?: number,
): boolean => {
  if (!fieldSchema?.['ignore'] || !fieldSchema?.['hidden']) {
    return false
  }

  if (!engine.isReady()) {
    return false
  }

  const parsedField = engine.evaluate({
    inputs,
    obj: engine.convertInputs(fieldSchema),
    index: arrayIndex ?? -1,
  })

  return parsedField['hidden'] === true
}

interface FilteredField {
  key: string
  value: unknown
}

const filterFields = (
  engine: WorkflowEngine,
  formJSON: Record<string, unknown>,
  data: Record<string, unknown>,
  prefix?: string,
  rootData?: Record<string, unknown>,
  arrayIndex?: number,
) => {
  const filteredFields: FilteredField[] = []
  const filtered = Object.keys(data).reduce<Record<string, unknown>>((acc, key) => {
    const value = data[key]
    const fieldSchema = formJSON[key]
    if (value !== null && Array.isArray(value)) {
      const items: unknown[] = []
      acc[key] = items
      if (!fieldSchema) {
        return acc
      }
      const nestedSchema = isObject(fieldSchema) ? fieldSchema['options'] : undefined
      for (let i = 0; i < value.length; i++) {
        let filteredFieldsNested: FilteredField[] = []
        let filteredNested: unknown = {}
        const item: unknown = value[i]
        if (isObject(item)) {
          const result = filterFields(
            engine,
            isObject(nestedSchema) ? nestedSchema : {},
            item,
            `${key}[${i}].`,
            rootData || data,
            i,
          )
          filteredNested = result.filtered
          filteredFieldsNested = result.filteredFields
        } else {
          filteredNested = item
        }
        filteredFields.push(...filteredFieldsNested)
        items[i] = filteredNested
      }
      return acc
    }
    if (fieldSchema && isObject(value)) {
      const { filteredFields: filteredFieldsNested, filtered: filteredNested } = filterFields(
        engine,
        isObject(fieldSchema) ? fieldSchema : {},
        value,
        `${key}.`,
        rootData || data,
        arrayIndex,
      )
      filteredFields.push(...filteredFieldsNested)
      acc[key] = filteredNested
      return acc
    }
    if (isObject(fieldSchema) && fieldSchema['sensitive']) {
      const name = prefix ? prefix + key : key
      filteredFields.push({ key: name, value })
      return acc
    }
    // rootData is used here (not data) to support partition-level expression evaluation
    const contextData = rootData || data
    if (isObject(fieldSchema) && shouldIgnoreField(engine, fieldSchema, contextData, arrayIndex)) {
      return acc
    }
    acc[key] = value
    return acc
  }, {})
  return { filteredFields, filtered }
}

const populateFiltered = (filteredFields: FilteredField[], data: Record<string, unknown>) => {
  filteredFields.forEach((element) => {
    impureSetValueFromPath(data, element.key, element.value)
  })
  return data
}

function FormCodePanel({
  formJSON,
  data,
  mutate,
  height = '600px',
  disabled = false,
}: {
  formJSON: Record<string, unknown>
  data: Record<string, unknown>
  mutate: (values: Record<string, unknown>) => void
  height?: string
  disabled?: boolean
}) {
  const engine = useWorkflowEngine()
  const notify = useNotify()
  const { common: t } = useStrings()
  const uid = useId()
  const [jsonHasErrors, setJsonHasErrors] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const isValidJson = (errors: ISchemaError[]) => {
    setJsonHasErrors(errors.length > 0)
  }
  const formJSONFlat = flattenGroups(formJSON)

  const { filteredFields, filtered } = filterFields(engine, formJSONFlat, data || {})
  const hasHiddenFields = filteredFields.length > 0
  const displayObj =
    showHidden && hasHiddenFields
      ? populateFiltered(filteredFields, structuredClone(filtered))
      : filtered

  const showHiddenRef = useRef(showHidden)
  showHiddenRef.current = showHidden
  const filteredFieldsRef = useRef(filteredFields)
  filteredFieldsRef.current = filteredFields

  const json = JSON.stringify(displayObj, null, 2)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      clearTimeout(copyResetRef.current)
      copyResetRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      notify.error(t.copyFailed)
    }
  }

  return (
    <div style={{ height }} className="flex w-full flex-col gap-2">
      <div
        className={cx(
          'flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border',
          jsonHasErrors ? 'border-red-500' : 'border-(--theme-border)',
        )}
      >
        <div className="bg-(--theme-muted-panel-bg) text-(--theme-muted-panel-color) flex shrink-0 items-center gap-3 border-b border-(--theme-border) px-3 py-2">
          {hasHiddenFields && (
            <label
              htmlFor={`${uid}-show-hidden`}
              title={t.showHiddenFieldsHint}
              className="flex cursor-pointer select-none items-center gap-2 text-sm text-(--theme-app)"
            >
              <SwitchToggleSmall
                id={`${uid}-show-hidden`}
                value={showHidden}
                aria-label={t.showHiddenFields}
                onClick={() => setShowHidden((prev) => !prev)}
              />
              <span className="flex items-center gap-1.5">
                {showHidden ? <EyeIcon /> : <EyeOffIcon />}
                {t.showHiddenFields}
              </span>
            </label>
          )}
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? t.copied : t.copy}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md border border-(--theme-border) px-2.5 py-1.5 text-sm text-(--theme-app) transition-colors duration-150 hover:bg-(--theme-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--theme-link)"
          >
            {copied ? (
              <CheckIcon className="text-green-500" />
            ) : (
              <CopyIcon className="text-(--theme-muted-text-color)" />
            )}
            {copied ? t.copied : t.copy}
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <Editor
            height="100%"
            value={json}
            onValidate={isValidJson}
            className="!rounded-none !border-0"
            minimap={{ enabled: false }}
            scrollBeyondLastLine={false}
            overviewRulerLanes={0}
            overviewRulerBorder={false}
            lineNumbersMinChars={3}
            lineDecorationsWidth={8}
            renderLineHighlight="none"
            padding={{ top: 12, bottom: 12 }}
            fontSize={13}
            scrollbar={{
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            }}
            onChange={(e) => {
              try {
                const parsed: unknown = JSON.parse(e)
                if (!isObject(parsed)) {
                  return
                }
                const objToSave = showHiddenRef.current
                  ? parsed
                  : populateFiltered(filteredFieldsRef.current, parsed)
                mutate(objToSave)
              } catch {
                console.log('JSON.parse error in form code editor')
              }
            }}
            language="json"
            disabled={disabled}
          />
        </div>
      </div>
      {jsonHasErrors && <p className="shrink-0 text-sm text-red-500">{t.jsonHasErrors}</p>}
    </div>
  )
}

export default FormCodePanel
