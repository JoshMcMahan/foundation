import { Collapsible } from '@base-ui/react/collapsible'
import { type MouseEvent, type ReactNode, useEffect, useId, useRef } from 'react'
import { Avatar } from '../components/Avatar'
import { Button } from '../components/Button'
import { Callout } from '../components/Callout'
import type { OpenMenu } from '../components/ContextMenu'
import { collapsePanelClassName } from '../components/Disclosure'
import { IconButton } from '../components/IconButton'
import { Loader } from '../components/Loader'
import type { MenuEntry } from '../components/MenuEntries'
import { menuDivider } from '../components/MenuEntries'
import { Select } from '../components/Select'
import { StatusBadge } from '../components/StatusBadge'
import { cx } from '../cx'
import { AddIcon, ChevronRightIcon, KeyIcon, LockIcon, OrganizationIcon, TrashIcon } from '../icons'
import {
  type AccessModel,
  alsoHas,
  firstOfEach,
  type Holding,
  isOwner,
  key,
  type Overlap,
  overlapOf,
  removalOf,
} from './model'
import { PrincipalTile } from './PrincipalPicker'
import type { AccessStrings } from './strings'
import type { AccessPrincipal, AccessRole, AccessRule } from './types'

/** The id the owner's section has among the roles' sections. */
export const OWNER_SECTION = '__owner'

/** A removal waiting on the reader: one role, or every role a principal holds here. */
export interface PendingRemoval {
  principalId: string
  roleIds: string[]
  /** Every role it holds, from its "Remove all access". */
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
  onGrantMore: (principalId: string) => void
  /** Gives a principal this one role in place of the ones it holds, where each holds one. */
  onChangeRole: (principalId: string, roleId: string) => void
  /** Each principal holds one role here. */
  singleRole: boolean
  /** Opens a row's own menu on a right-click. */
  openMenu: OpenMenu
  /** The failed save's callout, and where it belongs: under the role or principal it was about. */
  failure: { node: ReactNode; roleId?: string | undefined; principalId: string } | undefined
}

export const principalLabel = (principal: AccessPrincipal, t: AccessStrings) =>
  principal.kind === 'everyone' ? t.everyoneInOrganization : principal.name

/** The line under a name: who a person is, or how many are in a group. */
const aboutOf = (principal: AccessPrincipal, t: AccessStrings) =>
  principal.kind === 'user'
    ? principal.detail
    : principal.memberCount === undefined
      ? undefined
      : principal.kind === 'everyone'
        ? t.people(principal.memberCount)
        : t.members(principal.memberCount)

/** Where a role someone has elsewhere comes from, as "through" reads it. */
const sourceOf = (holding: Holding) => holding.through?.name ?? holding.from ?? ''

/** Stands where a remove button would, on a row that can't be removed here. */
/** A role named where a row's role select would sit, so read-only rows line up with
 *  editable ones: the select's width, border and padding, without the box. */
function RoleText({ children }: { children: ReactNode }) {
  return (
    <span className="w-36 shrink-0 wrap-anywhere border border-transparent px-2 text-xs text-(--theme-muted-text-color)">
      {children}
    </span>
  )
}

/** Holds the remove button's place on a row that has none. */
function NoAction() {
  return <span aria-hidden="true" className="size-7 shrink-0" />
}

function Locked() {
  return (
    <span className="flex size-7 items-center justify-center text-(--theme-muted-text-color)">
      <LockIcon aria-hidden="true" className="size-4" />
    </span>
  )
}

/** A role or principal whose rows fold under it. */
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
  onContextMenu,
  children,
}: {
  onContextMenu?: ((e: MouseEvent) => void) | undefined
  id: string
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled?: boolean
  lead?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** At the row's end: a count, or the roles a principal holds. */
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
      onContextMenu={onContextMenu}
    >
      <Collapsible.Trigger
        id={id}
        className={cx(
          'group/section flex w-full items-center gap-3 px-4 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--theme-focus)',
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
            <span className="text-sm font-medium wrap-anywhere">{title}</span>
          </span>
          {description && (
            <span className="hidden text-xs wrap-anywhere text-(--theme-muted-text-color) @min-[30rem]/access:block">
              {description}
            </span>
          )}
          {narrowAside && (
            <span className="text-xs text-(--theme-muted-text-color) @min-[30rem]/access:hidden">
              {narrowAside}
            </span>
          )}
        </span>
        {aside && (
          <span className="hidden shrink-0 items-center gap-1 text-xs text-(--theme-muted-text-color) @min-[30rem]/access:flex">
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

/** A line under a section: a principal under a role, or a role under a principal. */
function Row({
  lead,
  title,
  meta,
  action,
  muted,
  onContextMenu,
}: {
  lead?: ReactNode
  title: ReactNode
  meta?: ReactNode
  action?: ReactNode
  muted?: boolean
  onContextMenu?: ((e: MouseEvent) => void) | undefined
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the row's menu repeats its buttons
    <div
      className="flex items-center gap-3 py-1.5 ps-11 pe-4 @min-[30rem]/access:ps-11"
      onContextMenu={onContextMenu}
    >
      {lead}
      <div className={cx('min-w-0 flex-1', muted && 'text-(--theme-muted-text-color)')}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm wrap-anywhere">
          {title}
        </div>
        {meta && (
          <div className="text-xs wrap-anywhere text-(--theme-muted-text-color)">{meta}</div>
        )}
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

/** What someone keeps elsewhere, by where it comes from, everyone's apart. */
function keptElsewhere(holdings: readonly Holding[]) {
  const throughEveryone: string[] = []
  const through = new Map<string, string[]>()
  for (const holding of holdings) {
    if (holding.through?.kind === 'everyone') {
      throughEveryone.push(holding.role.name)
    } else {
      const from = sourceOf(holding)
      through.set(from, [...(through.get(from) ?? []), holding.role.name])
    }
  }
  return { throughEveryone, through: [...through].map(([from, roles]) => ({ from, roles })) }
}

/** Asks before a principal loses roles, saying exactly what it loses and what it keeps. */
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
  const principal = model.principalById.get(removal.principalId)
  if (!principal) {
    return null
  }
  const roleNames = removal.roleIds.map((id) => model.roleById.get(id)?.name ?? id)
  const impact = removalOf(model, removal.principalId, removal.roleIds)
  const own = impact.keep.map((role) => role.name)
  const { throughEveryone, through } = keptElsewhere(impact.keepElsewhere)
  const kept = t.keeps(own, throughEveryone, through)
  return (
    <fieldset
      aria-labelledby={titleId}
      className="m-0 min-w-0 border-0 px-4 py-2 text-sm"
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
            ? t.removeAllTitle(principalLabel(principal, t))
            : t.removeTitle(principalLabel(principal, t), roleNames)}
        </p>
        <div className="mt-1 text-(--theme-app)">
          {impact.owner ? (
            <p className="m-0 text-(--theme-muted-text-color)">{t.ownerLosesNothing}</p>
          ) : impact.lost.length > 0 ? (
            <>
              <p className="m-0 text-(--theme-muted-text-color)">
                {t.losesIntro(principal.kind, principal.memberCount)}
              </p>
              <ul className="my-2 grid list-disc gap-x-6 gap-y-1 ps-5 @min-[30rem]/access:grid-cols-2">
                {impact.lost.map((permission) => (
                  <li key={permission}>{model.permissionLabel(permission)}</li>
                ))}
              </ul>
              {kept && <p className="m-0 text-(--theme-muted-text-color)">{kept}</p>}
            </>
          ) : (
            <p className="m-0 text-(--theme-muted-text-color)">
              {t.losesNothing([
                ...own,
                ...through.flatMap((source) => source.roles),
                ...throughEveryone,
              ])}
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
  `${removal.principalId}\u0000${removal.all ? '*' : removal.roleIds.join(',')}`

const sameRemoval = (a: PendingRemoval | undefined, principalId: string, roleId?: string) =>
  a !== undefined &&
  a.principalId === principalId &&
  (roleId === undefined ? a.all : !a.all && a.roleIds.includes(roleId))

/** The hint beside someone holding a role: what else already gives it to them. */
function overlapHint(overlap: Overlap, t: AccessStrings) {
  if (overlap.owner) {
    return t.ownerHasAll
  }
  if (overlap.coveredBy.length > 0) {
    return t.coveredBy(overlap.coveredBy.map((other) => other.name))
  }
  const from = [
    ...new Set(
      overlap.elsewhere
        .filter((holding) => holding.through?.kind !== 'everyone')
        .map((holding) => sourceOf(holding)),
    ),
  ]
  if (from.length > 0) {
    return t.throughToo(from)
  }
  return overlap.elsewhere.length > 0 ? t.everyoneHasThisToo : undefined
}

interface ViewProps {
  model: AccessModel
  /** What the filter left: each role's principals, or each principal's roles. */
  shown: ReadonlyMap<string, readonly string[]>
  /** The sections in view, in order. */
  order: readonly string[]
  expanded: ReadonlySet<string>
  onExpandedChange: (id: string, open: boolean) => void
  filtering: boolean
  actions: ListActions
  t: AccessStrings
  sectionId: (id: string) => string
}

/** Who has each role, role by role, after the owner. */
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
    if (roleId === OWNER_SECTION) {
      const owner = model.owner
      return (
        owner && (
          <Section
            key={roleId}
            id={sectionId(roleId)}
            open={expanded.has(roleId)}
            onOpenChange={(open) => onExpandedChange(roleId, open)}
            title={t.owner}
            description={t.ownerDescription}
            aside={principalLabel(owner, t)}
            narrowAside={principalLabel(owner, t)}
          >
            <Row
              lead={
                <PrincipalTile
                  principal={owner}
                  compact
                  className="hidden @min-[30rem]/access:flex"
                />
              }
              title={principalLabel(owner, t)}
              meta={aboutOf(owner, t)}
              action={<Locked />}
            />
          </Section>
        )
      )
    }
    const role = model.roleById.get(roleId)
    if (!role) {
      return null
    }
    const direct = model.holders.get(roleId) ?? []
    const inherited = model.inheritedHolders.get(roleId) ?? []
    const all = new Map(
      [...direct, ...inherited.map((holder) => holder.principal)].map((p) => [p.id, p]),
    )
    const principalIds = shown.get(roleId) ?? []
    const everyone = [...all.values()].some((principal) => principal.kind === 'everyone')
    const people = [...all.values()].filter((principal) => principal.kind === 'user').length
    const groups = [...all.values()].filter((principal) => principal.kind === 'group').length
    const count =
      filtering && principalIds.length !== all.size
        ? t.holdersShown(principalIds.length, all.size)
        : people + groups > 0
          ? t.holders(people, groups)
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
        disabled={all.size === 0}
        notice={failure}
        title={role.name}
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
        {principalIds.map((principalId) => {
          const principal = all.get(principalId)
          if (!principal) {
            return null
          }
          const lead = (
            <PrincipalTile
              principal={principal}
              compact
              className="hidden @min-[30rem]/access:flex"
            />
          )
          if (!direct.some((holder) => holder.id === principalId)) {
            const from = inherited.find((holder) => holder.principal.id === principalId)?.from
            return (
              <Row
                key={principalId}
                lead={lead}
                title={principalLabel(principal, t)}
                meta={[aboutOf(principal, t), from !== undefined && t.inheritedFrom(from)]
                  .filter(Boolean)
                  .join(' · ')}
                action={<Locked />}
              />
            )
          }
          if (sameRemoval(actions.removal, principalId, roleId) && actions.removal) {
            return (
              <RemoveConfirm
                key={principalId}
                model={model}
                removal={actions.removal}
                saving={actions.saving.size > 0}
                onCancel={actions.onCancelRemove}
                onConfirm={() => actions.removal && actions.onRemove(actions.removal)}
                t={t}
              />
            )
          }
          const hint = overlapHint(overlapOf(model, principalId, role), t)
          const label = t.removeRole(principalLabel(principal, t), role.name)
          return (
            <Row
              key={principalId}
              onContextMenu={rowMenu(actions, () =>
                rowEntries(model, principal, actions, t, {
                  principalId,
                  roleIds: [roleId],
                  all: false,
                }),
              )}
              lead={lead}
              title={principalLabel(principal, t)}
              meta={[aboutOf(principal, t), hint].filter(Boolean).join(' · ')}
              action={
                !actions.readOnly && (
                  <RemoveButton
                    label={label}
                    saving={actions.saving.has(key({ principalId, roleId }))}
                    removal={{ principalId, roleIds: [roleId], all: false }}
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

/** Which roles each person and group has, one by one. */
export function ByPrincipal({
  model,
  shown,
  order,
  expanded,
  onExpandedChange,
  actions,
  t,
  sectionId,
}: ViewProps) {
  return order.map((principalId) => {
    const principal = model.principalById.get(principalId)
    if (!principal) {
      return null
    }
    const owner = isOwner(model, principalId)
    const held = model.held.get(principalId) ?? []
    const ownInherited = model.inherited.get(principalId) ?? []
    const roleIds = new Set(
      shown.get(principalId) ?? [...held, ...ownInherited.map((h) => h.role)].map((r) => r.id),
    )
    const roles = held.filter((role) => roleIds.has(role.id))
    const inherited = ownInherited.filter(
      (holding) =>
        roleIds.has(holding.role.id) && !held.some((role) => role.id === holding.role.id),
    )
    // What its groups and everyone give it beyond its own, once each.
    const through = firstOfEach(alsoHas(model, principalId)).filter(
      (holding) =>
        holding.through !== undefined &&
        !held.some((role) => role.id === holding.role.id) &&
        !ownInherited.some((own) => own.role.id === holding.role.id),
    )
    const failure = actions.failure?.principalId === principalId ? actions.failure.node : undefined
    const everyone = principal.kind === 'everyone'
    const badgeRoles = [
      ...held,
      ...ownInherited.map((holding) => holding.role).filter((role) => !held.includes(role)),
    ]
    // Two badges fit beside the name; past that, the first and how many more.
    const room = owner ? 1 : 2
    const badges = badgeRoles.length <= room ? badgeRoles : badgeRoles.slice(0, room - 1)
    const hidden = badgeRoles.slice(badges.length)
    const roleBadges = (
      <>
        {owner && (
          <StatusBadge size="md" variant="info">
            {t.owner}
          </StatusBadge>
        )}
        {badges.map((role) => (
          <StatusBadge key={role.id} size="md">
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
        key={principalId}
        id={sectionId(principalId)}
        open={expanded.has(principalId)}
        onOpenChange={(open) => onExpandedChange(principalId, open)}
        lead={<PrincipalTile principal={principal} className="hidden @min-[30rem]/access:flex" />}
        onContextMenu={
          held.length > 0
            ? rowMenu(actions, () =>
                rowEntries(model, principal, actions, t, {
                  principalId,
                  roleIds: held.map((role) => role.id),
                  all: true,
                }),
              )
            : undefined
        }
        notice={failure}
        title={principalLabel(principal, t)}
        description={everyone ? t.everyoneJoinLater : aboutOf(principal, t)}
        aside={roleBadges}
        narrowAside={<span className="mt-1 flex flex-wrap gap-1">{roleBadges}</span>}
      >
        {sameRemoval(actions.removal, principalId) && actions.removal ? (
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
            {owner && (
              <Row
                title={<span className="font-medium">{t.owner}</span>}
                meta={t.ownerDescription}
                action={<Locked />}
              />
            )}
            {roles.map((role) =>
              sameRemoval(actions.removal, principalId, role.id) && actions.removal ? (
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
                  principal={principal}
                  role={role}
                  actions={actions}
                  t={t}
                />
              ),
            )}
            {inherited.map(({ role, from }) => (
              <Row
                key={role.id}
                title={<span className="font-medium">{role.name}</span>}
                meta={t.inheritedFrom(from)}
                action={<Locked />}
              />
            ))}
            {through.map((holding) => (
              <Row
                key={holding.role.id}
                muted
                title={holding.role.name}
                meta={
                  holding.through?.kind === 'everyone'
                    ? t.throughEveryone
                    : t.through(sourceOf(holding))
                }
              />
            ))}
            {!actions.readOnly && (!owner || held.length > 0) && (
              <div className="flex flex-wrap items-center gap-2 ps-11 pe-4 pt-2">
                {!owner && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<AddIcon />}
                    onClick={() => actions.onGrantMore(principalId)}
                  >
                    {t.grantMoreRoles}
                  </Button>
                )}
                {held.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    data-remove={removeKey({ principalId, roleIds: [], all: true })}
                    className="text-(--theme-error-text)"
                    onClick={() =>
                      actions.onAskRemove({
                        principalId,
                        roleIds: held.map((role) => role.id),
                        all: true,
                      })
                    }
                  >
                    {t.removeAllAccess}
                  </Button>
                )}
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
  principal,
  role,
  actions,
  t,
}: {
  model: AccessModel
  principal: AccessPrincipal
  role: AccessRole
  actions: ListActions
  t: AccessStrings
}) {
  const overlap = overlapOf(model, principal.id, role)
  const meta = overlap.owner
    ? t.redundantOwner
    : overlap.coveredBy.length > 0
      ? t.redundant(overlap.coveredBy.map((other) => other.name))
      : role.description
  return (
    <Row
      title={<span className="font-medium">{role.name}</span>}
      meta={meta}
      action={
        !actions.readOnly && (
          <RemoveButton
            label={t.removeRole(principalLabel(principal, t), role.name)}
            saving={actions.saving.has(key({ principalId: principal.id, roleId: role.id }))}
            removal={{ principalId: principal.id, roleIds: [role.id], all: false }}
            onAsk={actions.onAskRemove}
          />
        )
      }
    />
  )
}

/** A row's right-click menu, which repeats what its buttons do; none while read-only. */
function rowMenu(actions: ListActions, entries: () => MenuEntry[]) {
  if (actions.readOnly) {
    return undefined
  }
  return (e: MouseEvent) => {
    e.stopPropagation()
    actions.openMenu(e, entries())
  }
}

/** Who giving `principalId` a role one holds at a time takes it from, as the role's hint. */
function replacesHint(
  model: AccessModel,
  principalId: string,
  role: AccessRole,
  t: AccessStrings,
): string | undefined {
  const from = role.singleHolder
    ? (model.holders.get(role.id) ?? []).filter((holder) => holder.id !== principalId)
    : []
  return from.length > 0 ? t.replaces(from.map((holder) => holder.name)) : undefined
}

/** A principal's row menu: its role, where each holds one, more roles otherwise, then removal. */
function rowEntries(
  model: AccessModel,
  principal: AccessPrincipal,
  actions: ListActions,
  t: AccessStrings,
  removal: PendingRemoval,
): MenuEntry[] {
  const held = new Set((model.held.get(principal.id) ?? []).map((role) => role.id))
  const lead: MenuEntry[] = actions.singleRole
    ? [
        {
          label: t.roleMenu,
          icon: <KeyIcon />,
          items: model.grantable.map((role) => ({
            label: role.name,
            description:
              [role.description, replacesHint(model, principal.id, role, t)]
                .filter(Boolean)
                .join(' ') || undefined,
            checked: held.has(role.id),
            onClick: () => {
              if (!held.has(role.id) || held.size > 1) {
                actions.onChangeRole(principal.id, role.id)
              }
            },
          })),
        },
      ]
    : isOwner(model, principal.id)
      ? []
      : [
          {
            label: t.grantMoreRoles,
            icon: <AddIcon />,
            onClick: () => actions.onGrantMore(principal.id),
          },
        ]
  return [
    ...lead,
    ...(lead.length > 0 ? [menuDivider] : []),
    {
      label:
        removal.all || actions.singleRole
          ? t.removeAccess
          : t.confirmRemove(removal.roleIds.map((id) => model.roleById.get(id)?.name ?? id)),
      icon: <TrashIcon />,
      destructive: true,
      onClick: () => actions.onAskRemove(removal),
    },
  ]
}

/** A reason someone has access that no grant here changes, locked ahead of the grants. */
export function RuleRow({
  rule,
  roleName,
  lead,
  t,
}: {
  rule: AccessRule
  roleName: string | undefined
  /** Lines its title up with the rows below: in a chevron's column, in a tile's, or after both. */
  lead: 'chevron' | 'tile' | 'both'
  t: AccessStrings
}) {
  const people = rule.people ?? []
  const shown = people.slice(0, 4)
  const more = people.length - shown.length
  const icon = rule.icon ?? <LockIcon />
  return (
    <div className="flex items-center gap-3 border-b border-(--theme-border) px-4 py-2.5">
      {lead === 'chevron' ? (
        <span
          aria-hidden="true"
          className="flex size-4 shrink-0 items-center justify-center text-(--theme-muted-text-color) [&_svg]:size-4"
        >
          {icon}
        </span>
      ) : (
        <>
          {lead === 'both' && <span aria-hidden="true" className="size-4 shrink-0" />}
          <span
            aria-hidden="true"
            className="hidden size-8 shrink-0 items-center justify-center rounded-md bg-(--theme-muted-panel-bg) text-(--theme-muted-text-color) @min-[30rem]/access:flex [&_svg]:size-4"
          >
            {icon}
          </span>
        </>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium wrap-anywhere">{rule.title}</span>
        {rule.detail && (
          <span className="text-xs wrap-anywhere text-(--theme-muted-text-color)">
            {rule.detail}
          </span>
        )}
      </span>
      {shown.length > 0 && (
        <>
          <span className="sr-only">
            {t.ruleMembers(
              shown.map((person) => person.name),
              more,
            )}
          </span>
          <span
            aria-hidden="true"
            // Side by side rather than overlapping, which would cut off their initials.
            className="hidden shrink-0 items-center gap-1 @min-[30rem]/access:flex"
          >
            {shown.map((person, index) => (
              <Avatar
                key={`${person.name}-${index.toString()}`}
                name={person.name}
                src={person.avatarUrl}
                size="md"
                decorative
              />
            ))}
            {more > 0 && (
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-(--theme-muted-panel-bg) text-[11px] font-medium tabular-nums text-(--theme-muted-text-color)">
                {t.moreMembers(more)}
              </span>
            )}
          </span>
        </>
      )}
      {roleName &&
        (lead === 'tile' ? (
          <RoleText>{roleName}</RoleText>
        ) : (
          <span className="shrink-0 text-xs text-(--theme-muted-text-color)">{roleName}</span>
        ))}
      <Locked />
    </div>
  )
}

/** Person and group one by one where each holds one role: a flat row each, its role picked
 *  from a list on the row. */
export function ByPrincipalSingle({ model, order, actions, t, sectionId }: ViewProps) {
  return order.map((principalId) => {
    const principal = model.principalById.get(principalId)
    if (!principal) {
      return null
    }
    const owner = isOwner(model, principalId)
    const held = model.held.get(principalId) ?? []
    const inheritedRoles = (model.inherited.get(principalId) ?? []).map((holding) => holding.role)
    const role = held[0]
    const name = principalLabel(principal, t)
    const failure = actions.failure?.principalId === principalId ? actions.failure.node : undefined
    const removal: PendingRemoval = {
      principalId,
      roleIds: held.map((r) => r.id),
      all: held.length > 1,
    }
    if (actions.removal?.principalId === principalId) {
      return (
        <div key={principalId} className="border-b border-(--theme-border)">
          <RemoveConfirm
            model={model}
            removal={actions.removal}
            saving={actions.saving.size > 0}
            onCancel={actions.onCancelRemove}
            onConfirm={() => actions.removal && actions.onRemove(actions.removal)}
            t={t}
          />
        </div>
      )
    }
    const saving = held.some((r) => actions.saving.has(key({ principalId, roleId: r.id })))
    const options = [
      ...model.grantable,
      ...(role && !model.grantable.includes(role) ? [role] : []),
    ].map((r) => ({
      value: r.id,
      label: r.name,
      description: replacesHint(model, principalId, r, t),
    }))
    const control = owner ? (
      <StatusBadge size="md" variant="info">
        {t.owner}
      </StatusBadge>
    ) : !role ? (
      <RoleText>{inheritedRoles.map((r) => r.name).join(', ')}</RoleText>
    ) : actions.readOnly ? (
      <RoleText>{role.name}</RoleText>
    ) : (
      <Select<string>
        size="sm"
        aria-label={t.roleFor(name)}
        items={options}
        value={role.id}
        disabled={saving}
        onValueChange={(next) => {
          if (next !== null && (next !== role.id || held.length > 1)) {
            actions.onChangeRole(principalId, next)
          }
        }}
        className="w-36 shrink-0"
      />
    )
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: the row's menu repeats its controls
      <div
        key={principalId}
        id={sectionId(principalId)}
        tabIndex={-1}
        className="border-b border-(--theme-border) outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--theme-focus)"
        onContextMenu={
          role && !owner
            ? rowMenu(actions, () => rowEntries(model, principal, actions, t, removal))
            : undefined
        }
      >
        <div className="flex items-center gap-3 px-4 py-2.5">
          <PrincipalTile principal={principal} className="hidden @min-[30rem]/access:flex" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium wrap-anywhere">{name}</span>
            {aboutOf(principal, t) && (
              <span className="text-xs wrap-anywhere text-(--theme-muted-text-color)">
                {aboutOf(principal, t)}
              </span>
            )}
          </span>
          {control}
          {owner || !role ? (
            <Locked />
          ) : actions.readOnly ? (
            <NoAction />
          ) : (
            <RemoveButton
              label={t.removeRole(name, role.name)}
              saving={saving}
              removal={removal}
              onAsk={actions.onAskRemove}
            />
          )}
        </div>
        {failure && <div className="px-4 pb-3">{failure}</div>}
      </div>
    )
  })
}
