import { useMemo, useState } from 'react'
import { useWorkflowEditing } from '../../components/Provider'
import type { GraphEdit, GraphEditResult, GraphLayout } from '../../editing'
import type { DependencyGraphEditor } from '../editorApi'
import { asRecord, type Json } from '../editorFields'
import type { SettingsView } from '../settingsViews'

interface Snapshot {
  yml: string
  layout: GraphLayout | undefined
}

/**
 * A workflow edited in place with undo and redo, the way a host keeps one for the editor;
 * `editor` hands the graph or the input form its callbacks.
 */
export function useStoryWorkflow(initial: string, initialLayout?: GraphLayout) {
  const editing = useWorkflowEditing()
  const [state, setState] = useState<Snapshot>({ yml: initial, layout: initialLayout })
  const [past, setPast] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [view, setView] = useState<SettingsView>('form')
  const [openOnAdd, setOpenOnAdd] = useState(true)
  const workflow = useMemo<Json>(() => asRecord(editing.loadYaml(state.yml)), [editing, state.yml])
  const editor = (extra: Partial<DependencyGraphEditor> = {}): DependencyGraphEditor => ({
    onEdit: (edit: GraphEdit): GraphEditResult | undefined => {
      let result: GraphEditResult
      try {
        result = editing.applyGraphEdit(state, edit)
      } catch {
        // A refused edit leaves the workflow as it was, as a host's would.
        return undefined
      }
      setPast([...past, state])
      setFuture([])
      setState({ yml: result.yml, layout: result.layout })
      return result
    },
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    onUndo: () => {
      const previous = past.at(-1)
      if (previous) {
        setPast(past.slice(0, -1))
        setFuture([state, ...future])
        setState(previous)
      }
    },
    onRedo: () => {
      const [next, ...rest] = future
      if (next) {
        setPast([...past, state])
        setFuture(rest)
        setState(next)
      }
    },
    readSource: () => state.yml,
    settingsView: view,
    onSettingsViewChange: setView,
    openOnAdd,
    onOpenOnAddChange: setOpenOnAdd,
    ...extra,
  })
  return { workflow, layout: state.layout, yml: state.yml, editor }
}

/** A sample workflow with jobs, a matrix, an action step and inputs, as the editor stories draw it. */
export const SAMPLE_WORKFLOW = `on:
  execute:
    inputs:
      target:
        type: string
        label: Target
        default: linux
      shards:
        type: number
        label: Shards
        default: 2
      deploy:
        type: boolean
        label: Deploy when done
        default: true
jobs:
  checkout:
    steps:
      - name: get sources
        uses: example/checkout
        with:
          repo: https://github.com/example/app
          branch: main
  build:
    needs: [checkout]
    steps:
      - name: compile
        run: make build TARGET=\${{ inputs.target }}
      - name: test
        run: make test
  lint:
    needs: [checkout]
    steps:
      - run: make lint
  docs:
    needs: [checkout]
    steps:
      - run: make docs
  train:
    needs: [build]
    strategy:
      matrix:
        shard: [0, 1]
    steps:
      - name: train shard
        run: python train.py --shard \${{ matrix.shard }}
  deploy:
    needs: [train, lint, docs]
    if: \${{ inputs.deploy }}
    steps:
      - name: upload
        run: ./deploy.sh
`
