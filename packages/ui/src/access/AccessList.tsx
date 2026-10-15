import { Collapsible } from '@base-ui/react/collapsible'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { Button } from '../components/Button'
import { Callout } from '../components/Callout'
import { collapsePanelClassName } from '../components/Disclosure'
import { IconButton } from '../components/IconButton'
import { Loader } from '../components/Loader'
import { StatusBadge } from '../components/StatusBadge'
import { cx } from '../cx'
import { AddIcon, ChevronRightIcon, OrganizationIcon, TrashIcon } from '../icons'
import { GroupTile } from './GroupPicker'
import { type AccessModel, inheritedRoles, key, overlapOf, removalOf } from './model'
import type { AccessStrings } from './strings'
import type { AccessGroup, AccessRole } from './types'

/** A removal waiting on the reader: one role, or every role the group holds. */
export interface PendingRemoval {
  groupId: string
  roleIds: string[]
  /** Every role the group holds, from its "Remove all access". */
  all: boolean
}

export interface ListActions {
  readOnly: boolean
  /** The grants being saved, by `key()`. */
  saving: ReadonlySet<string>
  removal: PendingRemoval | undefined
  onAskRemove: (removal: PendingRemoval) => void
  onCancelRemove: () => void
  onRemove: (removal: PendingRemoval) => void
  onGrantMore: (groupId: string) => void
  /** The failed save's callout, and where it belongs: under the role or group it was about. */
  failure: { node: ReactNode; roleId?: string | undefined; groupId: string } | undefined
}

const groupLabel = (group: AccessGroup, t: AccessStrings) =>
  group.kind === 'everyone' ? t.everyoneInOrganization : group.name

const sizeOf = (group: AccessGroup, t: AccessStrings) =>
  group.memberCount === undefined
    ? undefined
    : group.kind === 'everyone'
      ? t.people(group.memberCount)
      : t.members(group.memberCount)

export function HighImpact({ t }: { t: AccessStrings }) {
  return <StatusBadge variant="warning">{t.highImpact}</StatusBadge>
}

/** A role or group whose rows fold under it. */
function Section({
  id,
  open,
  onOpenChange,
  disabled,
  lead,
  title,
  description,
  aside,
  narrowAside,
  notice,
  children,
}: {
  id: string
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled?: boolean
  lead?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** At the row's end: a count, or the roles a group holds. */
  aside?: ReactNode
  /** In place of the description where the drawer is narrow, as the aside has no room. */
  narrowAside?: ReactNode
  /** Under the section whether it is open or not, such as a failed save about it. */
  notice?: ReactNode
  children: ReactNode
}) {
  return (
    <Collapsible.Root
      open={open && !disabled}
      onOpenChange={onOpenChange}
      disabled={disabled}
      className="border-b border-(--theme-border)"
    >
      <Collapsible.Trigger
        id={id}
        className={cx(
          'group/section flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--theme-focus)',
          disabled ? 'cursor-default' : 'cursor-pointer hover:bg-(--theme-hover)',
        )}
      >
        <ChevronRightIcon
          aria-hidden="true"
          className={cx(
            'size-4 shrink-0 text-(--theme-muted-text-color) transition-transform group-data-panel-open/section:rotate-90 motion-reduce:transition-none',
            disabled && 'invisible',
          )}
        />
        {lead}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium wrap-break-word">{title}</span>
          </span>
          {description && (
            <span className="hidden text-sm text-(--theme-muted-text-color) @min-[30rem]/access:block">
              {description}
            </span>
          )}
          {narrowAside && (
            <span className="text-sm text-(--theme-muted-text-color) @min-[30rem]/access:hidden">
              {narrowAside}
            </span>
          )}
        </span>
        {aside && (
          <span className="hidden shrink-0 items-center gap-1 text-sm text-(--theme-muted-text-color) @min-[30rem]/access:flex">
            {aside}
          </span>
        )}
      </Collapsible.Trigger>
      <Collapsible.Panel className={collapsePanelClassName}>
        <div className="pb-3">{children}</div>
      </Collapsible.Panel>
      {notice && <div className="px-4 pb-3">{notice}</div>}
    </Collapsible.Root>
  )
}

/** A line under a section: a group under a role, or a role under a group. */
function Row({
  lead,
  title,
  meta,
  action,
  muted,
}: {
  lead?: ReactNode
  title: ReactNode
  meta?: ReactNode
  action?: ReactNode
  muted?: boolean
}) {
  return (
    <div className="flex items-center gap-3 py-1.5 ps-11 pe-4 @min-[30rem]/access:ps-11">
      {lead}
      <div className={cx('min-w-0 flex-1', muted && 'text-(--theme-muted-text-color)')}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2">{title}</div>
        {meta && <div className="text-sm text-(--theme-muted-text-color)">{meta}</div>}
      </div>
      {action}
    </div>
  )
}

function RemoveButton({
  label,
  saving,
  removal,
  onAsk,
}: {
  label: string
  saving: boolean
  removal: PendingRemoval
  onAsk: (removal: PendingRemoval) => void
}) {
  return saving ? (
    <span className="flex size-7 items-center justify-center">
      <Loader inline size="1em" label={label} />
    </span>
  ) : (
    <IconButton
      icon={<TrashIcon />}
      label={label}
      data-remove={removeKey(removal)}
      onClick={() => onAsk(removal)}
    />
  )
}

/** Asks before a group loses roles, saying exactly what it loses and what it keeps. */
export function RemoveConfirm({
  model,
  removal,
  saving,
  onCancel,
  onConfirm,
  t,
}: {
  model: AccessModel
  removal: PendingRemoval
  saving: boolean
  onCancel: () => void
  onConfirm: () => void
  t: AccessStrings
}) {
  const titleId = useId()
  const cancel = useRef<HTMLButtonElement>(null)
  // Focus lands on Cancel, so a stray Enter keeps the access rather than taking it.
  useEffect(() => cancel.current?.focus(), [])
  const group = model.groupById.get(removal.groupId)
  if (!group) {
    return null
  }
  const everyone = group.kind === 'everyone'
  const roleNames = removal.roleIds.map((id) => model.roleById.get(id)?.name ?? id)
  const impact = removalOf(model, removal.groupId, removal.roleIds)
  const own = impact.keep.map((role) => role.name)
  const throughEveryone = impact.keepThroughEveryone.map((role) => role.name)
  return (
    <fieldset
      aria-labelledby={titleId}
      className="m-0 min-w-0 border-0 px-4 py-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          // Escape takes back the question, not the whole drawer.
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <Callout tone="error" icon={false}>
        <p id={titleId} className="m-0 font-semibold text-(--theme-app)">
          {removal.all
            ? t.removeAllTitle(groupLabel(group, t))
            : t.removeTitle(groupLabel(group, t), roleNames)}
        </p>
        <div className="mt-1 text-(--theme-app)">
          {impact.lost.length > 0 ? (
            <>
              <p className="m-0 text-(--theme-muted-text-color)">
                {t.losesIntro(group.memberCount, everyone)}
              </p>
              <ul className="my-2 grid list-disc gap-x-6 gap-y-1 ps-5 @min-[30rem]/access:grid-cols-2">
                {impact.lost.map((permission) => (
                  <li key={permission}>{model.permissionLabel(permission)}</li>
                ))}
              </ul>
              <p className="m-0 text-(--theme-muted-text-color)">{t.keeps(own, throughEveryone)}</p>
            </>
          ) : (
            <p className="m-0 text-(--theme-muted-text-color)">
              {t.losesNothing(own, throughEveryone)}
            </p>
          )}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button ref={cancel} variant="ghost" onClick={onCancel} disabled={saving}>
            {t.common.cancel}
          </Button>
          <Button variant="danger" loading={saving} onClick={onConfirm}>
            {removal.all ? t.removeAllAccess : t.confirmRemove(roleNames)}
          </Button>
        </div>
      </Callout>
    </fieldset>
  )
}

/** Marks the button that asked for a removal, so focus can go back to it. */
export const removeKey = (removal: PendingRemoval) =>
  `${removal.groupId}\u0000${removal.all ? '*' : removal.roleIds.join(',')}`

const sameRemoval = (a: PendingRemoval | undefined, groupId: string, roleId?: string) =>
  a !== undefined &&
  a.groupId === groupId &&
  (roleId === undefined ? a.all : !a.all && a.roleIds.includes(roleId))

interface ViewProps {
  model: AccessModel
  /** What the filter left: each role's groups, or each group's roles. */
  shown: ReadonlyMap<string, readonly string[]>
  /** The rows in view, in order. */
  order: readonly string[]
  expanded: ReadonlySet<string>
  onExpandedChange: (id: string, open: boolean) => void
  filtering: boolean
  actions: ListActions
  t: AccessStrings
  sectionId: (id: string) => string
}

/** Who has each role, role by role. */
export function ByRole({
  model,
  shown,
  order,
  expanded,
  onExpandedChange,
  filtering,
  actions,
  t,
  sectionId,
}: ViewProps) {
  return order.map((roleId) => {
    const role = model.roleById.get(roleId)
    if (!role) {
      return null
    }
    const holders = model.holders.get(roleId) ?? []
    const groupIds = shown.get(roleId) ?? []
    const everyone = holders.some((group) => group.kind === 'everyone')
    const others = holders.filter((group) => group.kind !== 'everyone').length
    const count =
      filtering && groupIds.length !== holders.length
        ? t.groupsShown(groupIds.length, holders.length)
        : others > 0 || !everyone
          ? t.groups(everyone ? others : holders.length)
          : undefined
    const everyoneTag = everyone && (
      <StatusBadge variant="info" size="md">
        <OrganizationIcon aria-hidden="true" className="size-3" />
        {t.everyone}
      </StatusBadge>
    )
    const failure = actions.failure?.roleId === roleId ? actions.failure.node : undefined
    return (
      <Section
        key={roleId}
        id={sectionId(roleId)}
        open={expanded.has(roleId)}
        onOpenChange={(open) => onExpandedChange(roleId, open)}
        disabled={holders.length === 0}
        notice={failure}
        title={
          <>
            {role.name}
            {role.highImpact && (
              <>
                {' '}
                <HighImpact t={t} />
              </>
            )}
          </>
        }
        description={role.description}
        aside={
          <>
            {everyoneTag}
            {count}
          </>
        }
        narrowAside={
          everyoneTag && !count ? <span className="mt-1 inline-flex">{everyoneTag}</span> : count
        }
      >
        {groupIds.map((groupId) => {
          const group = model.groupById.get(groupId)
          if (!group) {
            return null
          }
          if (sameRemoval(actions.removal, groupId, roleId) && actions.removal) {
            return (
              <RemoveConfirm
                key={groupId}
                model={model}
                removal={actions.removal}
                saving={actions.saving.size > 0}
                onCancel={actions.onCancelRemove}
                onConfirm={() => actions.removal && actions.onRemove(actions.removal)}
                t={t}
              />
            )
          }
          const overlap = overlapOf(model, groupId, role)
          const hint =
            overlap.coveredBy.length > 0
              ? t.coveredBy(overlap.coveredBy.map((other) => other.name))
              : overlap.everyone
                ? t.everyoneHasThisToo
                : undefined
          const label = t.removeRole(groupLabel(group, t), role.name)
          return (
            <Row
              key={groupId}
              lead={
                <GroupTile
                  everyone={group.kind === 'everyone'}
                  className="hidden @min-[30rem]/access:flex"
                />
              }
              title={groupLabel(group, t)}
              meta={[sizeOf(group, t), hint].filter(Boolean).join(' · ')}
              action={
                !actions.readOnly && (
                  <RemoveButton
                    label={label}
                    saving={actions.saving.has(key({ groupId, roleId }))}
                    removal={{ groupId, roleIds: [roleId], all: false }}
                    onAsk={actions.onAskRemove}
                  />
                )
              }
            />
          )
        })}
      </Section>
    )
  })
}

/** Which roles each group has, group by group. */
export function ByGroup({
  model,
  shown,
  order,
  expanded,
  onExpandedChange,
  actions,
  t,
  sectionId,
}: ViewProps) {
  return order.map((groupId) => {
    const group = model.groupById.get(groupId)
    if (!group) {
      return null
    }
    const held = model.held.get(groupId) ?? []
    const roleIds = new Set(shown.get(groupId) ?? held.map((role) => role.id))
    const roles = held.filter((role) => roleIds.has(role.id))
    const inherited = inheritedRoles(model, groupId).filter(
      (role) => !held.some((own) => own.id === role.id),
    )
    const everyone = group.kind === 'everyone'
    const failure = actions.failure?.groupId === groupId ? actions.failure.node : undefined
    // Two badges fit beside the name; past that, the first and how many more.
    const badges = held.length <= 2 ? held : held.slice(0, 1)
    const hidden = held.slice(badges.length)
    const roleBadges = (
      <>
        {badges.map((role) => (
          <StatusBadge key={role.id} size="md" variant={role.highImpact ? 'warning' : 'default'}>
            {role.name}
          </StatusBadge>
        ))}
        {hidden.length > 0 && (
          <StatusBadge size="md">
            <span aria-hidden="true">{t.moreRoles(hidden.length)}</span>
            <span className="sr-only">{t.moreRolesLabel(hidden.map((role) => role.name))}</span>
          </StatusBadge>
        )}
      </>
    )
    return (
      <Section
        key={groupId}
        id={sectionId(groupId)}
        open={expanded.has(groupId)}
        onOpenChange={(open) => onExpandedChange(groupId, open)}
        lead={<GroupTile everyone={everyone} className="hidden @min-[30rem]/access:flex" />}
        notice={failure}
        title={groupLabel(group, t)}
        description={everyone ? t.everyoneJoinLater : sizeOf(group, t)}
        aside={roleBadges}
        narrowAside={<span className="mt-1 flex flex-wrap gap-1">{roleBadges}</span>}
      >
        {sameRemoval(actions.removal, groupId) && actions.removal ? (
          <RemoveConfirm
            model={model}
            removal={actions.removal}
            saving={actions.saving.size > 0}
            onCancel={actions.onCancelRemove}
            onConfirm={() => actions.removal && actions.onRemove(actions.removal)}
            t={t}
          />
        ) : (
          <>
            {roles.map((role) =>
              sameRemoval(actions.removal, groupId, role.id) && actions.removal ? (
                <RemoveConfirm
                  key={role.id}
                  model={model}
                  removal={actions.removal}
                  saving={actions.saving.size > 0}
                  onCancel={actions.onCancelRemove}
                  onConfirm={() => actions.removal && actions.onRemove(actions.removal)}
                  t={t}
                />
              ) : (
                <RoleRow
                  key={role.id}
                  model={model}
                  group={group}
                  role={role}
                  actions={actions}
                  t={t}
                />
              ),
            )}
            {inherited.map((role) => (
              <Row key={role.id} muted title={role.name} meta={t.throughEveryone} />
            ))}
            {!actions.readOnly && (
              <div className="flex flex-wrap items-center gap-2 ps-11 pe-4 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<AddIcon />}
                  onClick={() => actions.onGrantMore(groupId)}
                >
                  {t.grantMoreRoles}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  data-remove={removeKey({ groupId, roleIds: [], all: true })}
                  className="text-(--theme-error-text)"
                  onClick={() =>
                    actions.onAskRemove({
                      groupId,
                      roleIds: held.map((role) => role.id),
                      all: true,
                    })
                  }
                >
                  {t.removeAllAccess}
                </Button>
              </div>
            )}
          </>
        )}
      </Section>
    )
  })
}

function RoleRow({
  model,
  group,
  role,
  actions,
  t,
}: {
  model: AccessModel
  group: AccessGroup
  role: AccessRole
  actions: ListActions
  t: AccessStrings
}) {
  const overlap = overlapOf(model, group.id, role)
  const meta =
    overlap.coveredBy.length > 0
      ? t.redundant(overlap.coveredBy.map((other) => other.name))
      : role.description
  return (
    <Row
      title={
        <>
          <span className="font-medium">{role.name}</span>
          {role.highImpact && <HighImpact t={t} />}
        </>
      }
      meta={meta}
      action={
        !actions.readOnly && (
          <RemoveButton
            label={t.removeRole(groupLabel(group, t), role.name)}
            saving={actions.saving.has(key({ groupId: group.id, roleId: role.id }))}
            removal={{ groupId: group.id, roleIds: [role.id], all: false }}
            onAsk={actions.onAskRemove}
          />
        )
      }
    />
  )
}
