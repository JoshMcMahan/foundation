import { type ReactNode, useId, useRef, useState } from 'react'
import { Button } from '../components/Button'
import { Callout } from '../components/Callout'
import { Combobox, type ComboboxItem } from '../components/Combobox'
import { StatusBadge } from '../components/StatusBadge'
import {
  type DescribeGroup,
  type DetailsCache,
  GroupPicker,
  type SearchGroups,
} from './GroupPicker'
import { type AccessModel, covers, grantPlan, overlapOf } from './model'
import type { AccessStrings } from './strings'
import type { AccessChange, AccessGroup, AccessRole } from './types'

export interface GrantSelection {
  groupIds: string[]
  roleIds: string[]
}

/** The grant form's body and footer, which the drawer lays out in its own body and footer. */
export function useGrantView({
  model,
  selection,
  onSelectionChange,
  resourceName,
  describeGroup,
  searchGroups,
  groupCount,
  recentGroupIds,
  cache,
  seen,
  saving,
  failure,
  onGrant,
  onCancel,
  focusLater,
  boundary,
  t,
}: {
  model: AccessModel
  selection: GrantSelection
  onSelectionChange: (next: GrantSelection) => void
  resourceName: string
  describeGroup?: DescribeGroup | undefined
  searchGroups?: SearchGroups | undefined
  groupCount?: number | undefined
  recentGroupIds?: readonly string[] | undefined
  cache: DetailsCache
  seen: Map<string, AccessGroup>
  saving: boolean
  /** The failed grant's callout, which stays in the form so the choices can be retried. */
  failure: ReactNode
  onGrant: (change: AccessChange) => void
  onCancel: () => void
  /** Sends focus somewhere once the change it goes with has rendered. */
  focusLater: (find: () => HTMLElement | null | undefined) => void
  /** The drawer's body, above its footer, which the open group list fills. */
  boundary: Element | null
  t: AccessStrings
}): { body: ReactNode; footer: ReactNode } {
  const uid = useId()
  const [confirming, setConfirming] = useState(false)
  const keepButton = useRef<HTMLButtonElement>(null)
  const grantId = `${uid}grant`
  const { groupIds, roleIds } = selection
  const roles = roleIds
    .map((id) => model.roleById.get(id))
    .filter((role): role is AccessRole => role !== undefined)
  const roleNames = roles.map((role) => role.name)
  const groupName = (id: string) => {
    const group = seen.get(id)
    return group?.kind === 'everyone' ? t.everyone : (group?.name ?? id)
  }
  const plan = grantPlan(model, groupIds, roleIds)
  const everyone = model.everyone
  const toEveryone = everyone !== undefined && groupIds.includes(everyone.id)
  const people = everyone?.memberCount

  // A handful of roles, worked out afresh as the choices change.
  const roleItems = model.roles.map((role): ComboboxItem<string> => {
    const chosen = roleIds
      .filter((id) => id !== role.id)
      .map((id) => model.roleById.get(id))
      .filter((other): other is AccessRole => other !== undefined)
    const holders = groupIds.filter((id) =>
      (model.held.get(id) ?? []).some((held) => held.id === role.id),
    )
    const coveredBy = chosen.filter((other) => covers(other, role)).map((r) => r.name)
    const everyoneHas =
      everyone !== undefined &&
      !groupIds.includes(everyone.id) &&
      (overlapOf(model, everyone.id, role).coveredBy.length > 0 ||
        (model.held.get(everyone.id) ?? []).some((held) => held.id === role.id))
    const hints = [
      holders.length > 0 && t.alreadyHave(holders.map(groupName)),
      coveredBy.length > 0 && t.alreadyCovered(coveredBy),
      everyoneHas && t.everyoneHasIt,
    ].filter((hint): hint is string => typeof hint === 'string')
    return {
      value: role.id,
      label: role.name,
      description: [role.description, ...hints].filter(Boolean).join(' '),
      badge: role.highImpact ? <StatusBadge variant="warning">{t.highImpact}</StatusBadge> : null,
    }
  })

  const getting = [...new Set(plan.grant.map((grant) => grant.groupId))].map(groupName)
  const status: { text: ReactNode; ready: boolean } =
    groupIds.length === 0 && roleIds.length === 0
      ? { text: t.pickGroupsAndRoles, ready: false }
      : groupIds.length === 0
        ? { text: t.pickGroups, ready: false }
        : roleIds.length === 0
          ? { text: t.pickRoles, ready: false }
          : plan.grant.length === 0
            ? { text: t.nothingToGrant(groupIds.map(groupName), roleNames), ready: false }
            : {
                text: t.grantSummary(
                  getting,
                  [...new Set(plan.grant.map((grant) => grant.roleId))].map(
                    (id) => model.roleById.get(id)?.name ?? id,
                  ),
                ),
                ready: true,
              }

  const grant = () => {
    setConfirming(false)
    onGrant({ grant: plan.grant, revoke: [] })
  }
  const statusId = `${uid}status`

  const body = (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <label htmlFor={`${uid}groups`} className="mb-1.5 block text-sm font-medium">
          {t.groupsLabel}
        </label>
        <GroupPicker
          id={`${uid}groups`}
          describedBy={`${uid}groupsHint`}
          model={model}
          value={groupIds}
          onValueChange={(next) => onSelectionChange({ groupIds: next, roleIds })}
          granting={roles}
          resourceName={resourceName}
          describeGroup={describeGroup}
          searchGroups={searchGroups}
          groupCount={groupCount}
          recentGroupIds={recentGroupIds}
          cache={cache}
          seen={seen}
          boundary={boundary}
          t={t}
        />
      </div>
      <div>
        <label htmlFor={`${uid}roles`} className="mb-1.5 block text-sm font-medium">
          {t.rolesLabel}
        </label>
        <Combobox<string>
          multiple
          id={`${uid}roles`}
          items={roleItems}
          value={roleIds}
          onValueChange={(next) => onSelectionChange({ groupIds, roleIds: next })}
          placeholder={t.searchRoles}
        />
      </div>
      {toEveryone && roles.length > 0 && (
        <Callout tone="warning" title={t.everyoneWarningTitle(roleNames, people)}>
          {t.everyoneWarning(resourceName)}
        </Callout>
      )}
      {failure}
    </div>
  )

  const stopConfirming = () => {
    setConfirming(false)
    focusLater(() => document.getElementById(grantId))
  }
  const footer = confirming ? (
    // Asked in place, as a removal is, rather than in a dialog stacked on the drawer.
    <fieldset
      aria-labelledby={statusId}
      className="m-0 flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-0 p-0"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          // Takes back the question, not the form.
          e.stopPropagation()
          stopConfirming()
        }
      }}
    >
      <p id={statusId} className="m-0 min-w-0 flex-1 basis-48 text-sm font-medium">
        {t.confirmEveryoneTitle(roleNames, people)}
      </p>
      <div className="ms-auto flex shrink-0 gap-2">
        <Button ref={keepButton} variant="secondary" onClick={stopConfirming} disabled={saving}>
          {t.common.cancel}
        </Button>
        <Button
          variant={roles.some((role) => role.highImpact) ? 'danger' : 'primary'}
          loading={saving}
          onClick={grant}
        >
          {t.grantToEveryone}
        </Button>
      </div>
    </fieldset>
  ) : (
    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
      {/* Not live: it changes with every pick, and the Grant button it describes reads it. */}
      <p
        id={statusId}
        className="m-0 min-w-0 flex-1 basis-48 text-sm text-(--theme-muted-text-color)"
      >
        {status.text}
      </p>
      <div className="ms-auto flex shrink-0 gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button
          id={grantId}
          variant="primary"
          // Focusable while it can't be pressed, so the reason beside it is read with it.
          focusableWhenDisabled
          disabled={!status.ready}
          aria-describedby={statusId}
          loading={saving}
          onClick={() => {
            if (toEveryone) {
              setConfirming(true)
              // Focus waits on Cancel, so a second Enter doesn't confirm by reflex.
              focusLater(() => keepButton.current)
            } else {
              grant()
            }
          }}
        >
          {toEveryone ? t.grantToEveryone : t.grant(roleNames)}
        </Button>
      </div>
    </div>
  )
  return { body, footer }
}
