import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Button, MethodButton } from './Button'
import { Card, CardHeader } from './Card'
import Filter from './Filter'
import { FilterPill } from './FilterPill'
import { IconButton } from './IconButton'
import { Input, Textarea } from './Input'
import { LetterBadge } from './LetterBadge'
import { Pagination } from './Pagination'
import { SettingModeOption } from './SettingModeOption'
import { SettingRow, SettingSection } from './SettingRow'
import SettingsCard from './SettingsCard'
import SettingsGroup from './SettingsGroup'
import Sort, { type TDirection } from './Sort'
import { Toggle } from './Toggle'

const meta: Meta = {
  title: 'UI/Controls',
}
export default meta

export const Buttons: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-3 max-w-sm">
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button loading>Saving</Button>
      <Button size="sm" fullWidth={false}>
        Small
      </Button>
      <MethodButton
        label="Single sign-on"
        description="Use your organization identity provider"
        href="/sso"
      />
    </div>
  ),
}

export const Inputs: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-3 max-w-sm">
      <Input label="Cluster name" placeholder="gpu-cluster" />
      <Input type="password" placeholder="Password" />
      <Input error="Name is already taken" defaultValue="gpu" />
      <Textarea placeholder="Description" rows={3} />
    </div>
  ),
}

export const Cards: StoryObj = {
  render: () => (
    <Card className="max-w-md p-6">
      <CardHeader title="Connect a cluster" description="Bring an existing SLURM cluster online" />
      <p className="text-sm text-(--theme-muted-text-color)">
        Body content sits on the card surface.
      </p>
    </Card>
  ),
}

function FilterSortDemo() {
  const [filter, setFilter] = useState('')
  const [pill, setPill] = useState(false)
  const [sorted, setSorted] = useState<'name' | ''>('name')
  const [direction, setDirection] = useState<TDirection>('ascending')
  return (
    <div className="flex items-center gap-3">
      <Filter filter={filter} setFilter={setFilter} />
      <FilterPill active={pill} onClick={() => setPill((a) => !a)}>
        Running
      </FilterPill>
      <span className="text-sm">
        Name
        <Sort
          currentlySorted={sorted || null}
          name="name"
          currentDirection={direction}
          setCurrentDirection={setDirection}
          setCurrentlySorted={setSorted}
        />
      </span>
    </div>
  )
}

export const FilterAndSort: StoryObj = {
  render: () => <FilterSortDemo />,
}

export const PaginationRow: StoryObj = {
  render: () => (
    <Pagination
      name="workflow runs"
      startingNumber={1}
      endingNumber={25}
      prevDisabled
      nextDisabled={false}
      prevCallback={() => {}}
      nextCallback={() => {}}
    />
  ),
}

function SettingsDemo() {
  const [enabled, setEnabled] = useState(true)
  const [mode, setMode] = useState('auto')
  return (
    <SettingsGroup>
      <SettingsCard title="Notifications" description="How we reach you">
        <SettingSection title="Email" isFirst />
        <SettingRow label="Run completion" helpText="Email when a workflow run finishes" isFirst>
          <Toggle checked={enabled} onChange={() => setEnabled((e) => !e)} />
        </SettingRow>
        <SettingRow label="Digest mode">
          <div className="flex gap-2">
            {['auto', 'daily', 'off'].map((m) => (
              <SettingModeOption
                key={m}
                name="digest-mode"
                label={m}
                description={`Use the ${m} digest cadence`}
                checked={mode === m}
                onSelect={() => setMode(m)}
              />
            ))}
          </div>
        </SettingRow>
      </SettingsCard>
    </SettingsGroup>
  )
}

export const Settings: StoryObj = {
  render: () => <SettingsDemo />,
}

export const BadgesAndIconButtons: StoryObj = {
  render: () => (
    <div className="flex items-center gap-3">
      <LetterBadge text="M" />
      <LetterBadge text="Q" />
      <IconButton label="Refresh" icon={<span>↻</span>} />
    </div>
  ),
}
