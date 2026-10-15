import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button } from '../components/Button'
import { Callout } from '../components/Callout'
import { Drawer } from '../components/Drawer'
import { EmptyState } from '../components/EmptyState'
import { SearchInput } from '../components/SearchInput'
import { SegmentedControl } from '../components/SegmentedControl'
import { LoadingRegion, Skeleton } from '../components/Skeleton'
import { useQueryMatch } from '../components/search'
import { toast } from '../components/Toast'
import { AddIcon, LockIcon, UsersIcon } from '../icons'
import { ByGroup, ByRole, type PendingRemoval, removeKey } from './AccessList'
import { holdFocus, useFocusAfterRender } from './focus'
import { type GrantSelection, useGrantView } from './GrantView'
import type { DetailsCache } from './GroupPicker'
import { type AccessModel, buildModel, invert, key, warnAboutMisuse } from './model'
import { type AccessStrings, useAccessStrings } from './strings'
import type {
  AccessChange,
  AccessGrant,
  AccessGroup,
  AccessGroupDetails,
  AccessPermission,
  AccessRole,
} from './types'

export type AccessArrangement = 'role' | 'group'

export interface AccessDrawerProps {
  open: boolean
  onClose: () => void
  /** What access is to, as the reader knows it: "gpu-cluster-east". */
  resourceName: string
  /** Every role that can be granted here, in the order to list them. */
  roles: readonly AccessRole[]
  /** Every group that holds a role here, and everyone when the resource can be granted to
   *  everyone. Without `searchGroups`, also every group that can be granted one. */
  groups: readonly AccessGroup[]
  /** Who holds which role. The drawer shows these and never changes them itself. */
  grants: readonly AccessGrant[]
  /** Names the permissions roles list, for what a group loses when it loses a role. */
  permissions?: readonly AccessPermission[] | undefined
  /** Saves a change. Return a promise that settles once it is saved: until then its rows show
   *  that they are saving, and when it rejects the drawer says that nothing changed and offers
   *  to try again. Pass the new grants back through `grants`. */
  // biome-ignore lint/suspicious/noConfusingVoidType: accepts sync and async handlers
  onChange?: ((change: AccessChange) => void | Promise<unknown>) | undefined
  /** The grants are still loading: skeletons hold their place. */
  loading?: boolean | undefined
  /** Shows who has access without letting the reader change it. */
  readOnly?: boolean | undefined
  /** Who can change it, said in read-only mode: "Only people with the Admin role can change it." */
  readOnlyReason?: ReactNode
  /** More about a group, asked for when it is highlighted in the group picker and kept while the
   *  drawer is mounted. A highlight that moves on aborts `signal`. */
  describeGroup?:
    | ((groupId: string, signal: AbortSignal) => Promise<AccessGroupDetails>)
    | undefined
  /** Finds groups to grant to, for an organization with too many to pass in `groups`. A newer
   *  query aborts `signal`. Without it, the picker filters `groups`. */
  searchGroups?:
    | ((query: string, signal: AbortSignal) => Promise<readonly AccessGroup[]>)
    | undefined
  /** How many groups the organization has, for the picker's hint and heading. */
  groupCount?: number | undefined
  /** Groups the reader granted to lately, listed first in the picker. */
  recentGroupIds?: readonly string[] | undefined
  /** How the list starts out: role by role, or group by group. */
  defaultArrangement?: AccessArrangement | undefined
  /** As `Drawer`'s. */
  width?: number | string | undefined
}

interface Failure {
  change: AccessChange
  title: string
  message: string | undefined
  /** Where it shows: the grant form, or under the role or group the change was about. */
  inGrant: boolean
  groupId: string
  roleId?: string | undefined
}

const EMPTY_SELECTION: GrantSelection = { groupIds: [], roleIds: [] }

/** Who has access to one resource, and the place to change it: roles granted to groups.
 *  Overlapping roles are allowed and only redundant, which the drawer points out; taking a
 *  role away first says exactly what the group loses. Each change is saved as it is made, with
 *  Undo in a toast. */
export function AccessDrawer({
  open,
  onClose,
  resourceName,
  roles,
  groups,
  grants,
  permissions,
  onChange,
  loading = false,
  readOnly = false,
  readOnlyReason,
  describeGroup,
  searchGroups,
  groupCount,
  recentGroupIds,
  defaultArrangement = 'role',
  width = 560,
}: AccessDrawerProps) {
  const t = useAccessStrings()
  const uid = useId()
  const model = useMemo(
    () => buildModel(roles, groups, grants, permissions),
    [roles, groups, grants, permissions],
  )
  useEffect(() => {
    if (!loading) {
      warnAboutMisuse(roles, groups, grants, permissions)
    }
  }, [roles, groups, grants, permissions, loading])

  const [view, setView] = useState<'list' | 'grant'>('list')
  const [selection, setSelection] = useState<GrantSelection>(EMPTY_SELECTION)
  const [arrangement, setArrangement] = useState<AccessArrangement>(defaultArrangement)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Record<AccessArrangement, ReadonlySet<string>>>({
    role: new Set(),
    group: new Set(),
  })
  const [removal, setRemoval] = useState<PendingRemoval>()
  const [saving, setSaving] = useState<AccessChange>()
  const [failure, setFailure] = useState<Failure>()
  const cache = useRef<DetailsCache>(new Map()).current
  const seen = useRef(new Map<string, AccessGroup>()).current
  const body = useRef<HTMLDivElement | null>(null)
  // Also as state, so the group list can be bounded by it once it is there.
  const [bodyElement, setBodyElement] = useState<HTMLDivElement | null>(null)
  const bodyRef = useCallback((element: HTMLDivElement | null) => {
    body.current = element
    setBodyElement(element)
  }, [])
  const focusLater = useFocusAfterRender()
  // The latest handler, for an Undo pressed after the drawer has moved on or closed.
  const change = useRef(onChange)
  change.current = onChange

  const match = useQueryMatch()
  const filtered = useFiltered(model, arrangement, query.trim(), match, t)
  const editable = !readOnly && onChange !== undefined
  const sectionId = (id: string) => `${uid}${arrangement}${id}`

  const names = (changed: AccessChange) => {
    const all = [...changed.grant, ...changed.revoke]
    const groupNames = [...new Set(all.map((grant) => grant.groupId))].map((id) => {
      const group = seen.get(id) ?? model.groupById.get(id)
      return group?.kind === 'everyone' ? t.everyone : (group?.name ?? id)
    })
    const roleNames = [...new Set(all.map((grant) => grant.roleId))].map(
      (id) => model.roleById.get(id)?.name ?? id,
    )
    return { groupNames, roleNames }
  }

  const undo = (done: AccessChange) => {
    Promise.resolve(change.current?.(invert(done))).then(
      () => toast.info(t.undone),
      (error: unknown) => toast.error(t.nothingChanged(messageOf(error)), { title: t.undoFailed }),
    )
  }

  /** Saves a change and reports how it went; resolves true once saved. */
  const save = async (next: AccessChange, where: Omit<Failure, 'change' | 'title' | 'message'>) => {
    if (!onChange || (next.grant.length === 0 && next.revoke.length === 0)) {
      return false
    }
    const { groupNames, roleNames } = names(next)
    setSaving(next)
    setFailure(undefined)
    try {
      await onChange(next)
    } catch (error) {
      setFailure({
        change: next,
        title:
          next.grant.length > 0
            ? t.grantFailed(groupNames, roleNames)
            : t.removeFailed(groupNames[0] ?? '', roleNames),
        message: messageOf(error),
        ...where,
      })
      return false
    } finally {
      setSaving(undefined)
    }
    toast.success(
      next.grant.length > 0 ? t.granted(groupNames, roleNames) : t.removed(groupNames, roleNames),
      { action: { label: t.common.undo, onClick: () => undo(next) } },
    )
    return true
  }

  const toList = () => {
    setView('list')
    setFailure((current) => (current?.inGrant ? undefined : current))
    focusLater(() => visible(body.current?.querySelectorAll<HTMLElement>('[data-grant-access]')))
  }

  const toGrant = (groupIds: string[] = []) => {
    setSelection({ groupIds, roleIds: [] })
    setRemoval(undefined)
    setView('grant')
    focusLater(() => body.current?.querySelector<HTMLElement>('input[role="combobox"]'))
  }

  const grant = async (next: AccessChange) => {
    if (await save(next, { inGrant: true, groupId: next.grant[0]?.groupId ?? '' })) {
      // The new grants show opened, so the reader sees where they went.
      setExpanded((current) => ({
        role: new Set([...current.role, ...next.grant.map((g) => g.roleId)]),
        group: new Set([...current.group, ...next.grant.map((g) => g.groupId)]),
      }))
      toList()
    }
  }

  const remove = async (pending: PendingRemoval) => {
    const next = {
      grant: [],
      revoke: pending.roleIds.map((roleId) => ({ groupId: pending.groupId, roleId })),
    }
    const anchor = arrangement === 'role' && !pending.all ? pending.roleIds[0] : undefined
    await save(next, { inGrant: false, groupId: pending.groupId, roleId: anchor })
    setRemoval(undefined)
    // The row it was on is gone, or has its error under it: its section takes focus, or the
    // filter when the section went with it.
    focusLater(
      () =>
        document.getElementById(sectionId(anchor ?? pending.groupId)) ??
        body.current?.querySelector<HTMLElement>('input[type="search"]'),
    )
  }

  const retry = (failed: Failure) =>
    failed.inGrant
      ? grant(failed.change)
      : save(failed.change, { inGrant: false, groupId: failed.groupId, roleId: failed.roleId })

  const failureNode = failure && (
    <Callout
      tone="error"
      live
      title={failure.title}
      action={
        <Button size="sm" variant="secondary" onClick={() => retry(failure)}>
          {t.common.retry}
        </Button>
      }
      onDismiss={() => setFailure(undefined)}
    >
      {t.nothingChanged(failure.message)}
    </Callout>
  )

  const close = () => {
    setView('list')
    setRemoval(undefined)
    setQuery('')
    onClose()
  }

  const grantView = useGrantView({
    model,
    selection,
    onSelectionChange: setSelection,
    resourceName,
    describeGroup,
    searchGroups,
    groupCount,
    recentGroupIds,
    cache,
    seen,
    saving: saving !== undefined,
    failure: failure?.inGrant ? failureNode : undefined,
    onGrant: grant,
    onCancel: toList,
    focusLater,
    boundary: bodyElement,
    t,
  })

  const savingKeys = useMemo(() => new Set(saving?.revoke.map(key) ?? []), [saving])
  const empty = !loading && model.held.size === 0
  const View = arrangement === 'role' ? ByRole : ByGroup
  const grantButton = (className: string) => (
    <Button
      variant="primary"
      icon={<AddIcon />}
      data-grant-access=""
      disabled={loading}
      onClick={() => toGrant()}
      className={className}
    >
      {t.grantAccess}
    </Button>
  )

  const list = (
    <div className="@container/access flex min-h-0 flex-1 flex-col">
      {readOnly && (
        <div className="px-4 pt-3">
          <Callout tone="info" icon={<LockIcon />}>
            {t.readOnly} {readOnlyReason ?? t.readOnlyReason}
          </Callout>
        </div>
      )}
      {!empty && (
        <div className="flex flex-wrap items-center gap-2 border-b border-(--theme-border) px-4 py-3">
          <div className="w-full @min-[30rem]/access:w-auto">
            <SegmentedControl
              fill
              label={t.arrange}
              value={arrangement}
              onValueChange={setArrangement}
              options={[
                { value: 'role', label: t.byRole },
                { value: 'group', label: t.byGroup },
              ]}
            />
          </div>
          <SearchInput
            label={t.filter}
            value={query}
            onValueChange={(next) => {
              setQuery(next)
              setExpanded(expandedFor(model, next.trim(), match, t))
            }}
            className="min-w-0 flex-1 basis-full @min-[30rem]/access:basis-0"
          />
          {editable && grantButton('hidden @min-[30rem]/access:inline-flex')}
        </div>
      )}
      {failure && !failure.inGrant && !filtered.order.includes(anchorOf(failure, arrangement)) && (
        <div className="px-4 pt-3">{failureNode}</div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <LoadingRegion label={t.loading}>
            <RowsSkeleton />
          </LoadingRegion>
        ) : empty ? (
          <EmptyState
            variant="bare"
            icon={<UsersIcon />}
            title={t.emptyTitle}
            description={t.emptyDescription(resourceName)}
            action={editable && grantButton('')}
            className="py-16"
          />
        ) : filtered.order.length === 0 ? (
          <EmptyState
            variant="bare"
            title={t.noMatches}
            action={
              <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
                {t.clearFilter}
              </Button>
            }
          />
        ) : (
          <View
            model={model}
            shown={filtered.shown}
            order={filtered.order}
            expanded={expanded[arrangement]}
            onExpandedChange={(id, isOpen) =>
              setExpanded((current) => {
                const next = new Set(current[arrangement])
                if (isOpen) {
                  next.add(id)
                } else {
                  next.delete(id)
                }
                return { ...current, [arrangement]: next }
              })
            }
            filtering={query.trim() !== ''}
            sectionId={sectionId}
            t={t}
            actions={{
              readOnly: !editable,
              saving: savingKeys,
              removal,
              onAskRemove: (next) => {
                // The confirmation takes the trash button's place.
                holdFocus()
                setFailure(undefined)
                setRemoval(next)
              },
              onCancelRemove: () => {
                const asked = removal
                setRemoval(undefined)
                // Back to the button that asked.
                if (asked) {
                  focusLater(() =>
                    body.current?.querySelector<HTMLElement>(
                      `[data-remove="${CSS.escape(removeKey(asked))}"]`,
                    ),
                  )
                }
              },
              onRemove: remove,
              onGrantMore: (groupId) => toGrant([groupId]),
              failure:
                failure && !failure.inGrant
                  ? { node: failureNode, groupId: failure.groupId, roleId: failure.roleId }
                  : undefined,
            }}
          />
        )}
      </div>
      {editable && !empty && (
        <div className="border-t border-(--theme-border) p-4 @min-[30rem]/access:hidden">
          {grantButton('w-full')}
        </div>
      )}
    </div>
  )

  const granting = view === 'grant'
  return (
    <Drawer
      open={open}
      onClose={close}
      width={width}
      padded={false}
      title={granting ? t.grantAccess : t.title}
      description={
        granting
          ? resourceName
          : loading
            ? resourceName
            : t.summary(
                resourceName,
                [...model.held.keys()].filter((id) => id !== model.everyone?.id).length,
                model.everyone !== undefined && model.held.has(model.everyone.id),
              )
      }
      onBack={granting ? toList : undefined}
      backLabel={t.back}
      footer={granting ? grantView.footer : undefined}
      onKeyDown={(e) => {
        // In the form, Escape steps back to the list rather than dropping what was chosen; an
        // open list in the form takes it first.
        const target = e.target as HTMLElement
        if (
          granting &&
          e.key === 'Escape' &&
          !e.defaultPrevented &&
          target.getAttribute('aria-expanded') !== 'true'
        ) {
          e.stopPropagation()
          // The drawer's own Escape handler runs after this one; it must not close the drawer.
          e.preventBaseUIHandler()
          toList()
        }
      }}
    >
      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
        {granting ? grantView.body : list}
      </div>
    </Drawer>
  )
}

const messageOf = (error: unknown) =>
  error instanceof Error && error.message ? error.message : undefined

const anchorOf = (failure: Failure, arrangement: AccessArrangement) =>
  arrangement === 'role' ? (failure.roleId ?? '') : failure.groupId

/** The first of several elements that is laid out, such as the one of two buttons a width shows. */
/** The one of `elements` that is laid out, or the first where nothing is (as in tests). */
function visible(elements: NodeListOf<HTMLElement> | undefined) {
  const all = [...(elements ?? [])]
  return all.find((element) => element.getClientRects().length > 0) ?? all[0]
}

type Match = (query: string, ...texts: (string | undefined)[]) => boolean

const groupNames = (group: AccessGroup, t: AccessStrings) =>
  group.kind === 'everyone' ? [group.name, t.everyone, t.everyoneInOrganization] : [group.name]

/** The sections in view and the rows under each. A section named by the query shows all its
 *  rows; otherwise only the rows the query names, and no section when none are. */
function useFiltered(
  model: AccessModel,
  arrangement: AccessArrangement,
  query: string,
  match: Match,
  t: AccessStrings,
) {
  return useMemo(
    () => filterAccess(model, arrangement, query, match, t),
    [model, arrangement, query, match, t],
  )
}

export function filterAccess(
  model: AccessModel,
  arrangement: AccessArrangement,
  query: string,
  match: Match,
  t: AccessStrings,
) {
  const shown = new Map<string, readonly string[]>()
  const order: string[] = []
  if (arrangement === 'role') {
    for (const role of model.roles) {
      const holders = model.holders.get(role.id) ?? []
      const rows =
        !query || match(query, role.name, role.description)
          ? holders
          : holders.filter((group) => match(query, ...groupNames(group, t)))
      if (!query || rows.length > 0) {
        order.push(role.id)
        shown.set(
          role.id,
          rows.map((group) => group.id),
        )
      }
    }
  } else {
    const everyone = model.everyone
    const holders = [...model.held.keys()].sort((a, b) =>
      a === everyone?.id ? -1 : b === everyone?.id ? 1 : 0,
    )
    for (const groupId of holders) {
      const group = model.groupById.get(groupId)
      const held = model.held.get(groupId) ?? []
      if (!group) {
        continue
      }
      const rows =
        !query || match(query, ...groupNames(group, t))
          ? held
          : held.filter((role) => match(query, role.name, role.description))
      if (!query || rows.length > 0) {
        order.push(groupId)
        shown.set(
          groupId,
          rows.map((role) => role.id),
        )
      }
    }
  }
  return { shown, order }
}

/** Opens the sections a query found rows in, so the matches show; each can then be folded. */
function expandedFor(model: AccessModel, query: string, match: Match, t: AccessStrings) {
  if (!query) {
    return { role: new Set<string>(), group: new Set<string>() }
  }
  const open = (arrangement: AccessArrangement) => {
    const { shown } = filterAccess(model, arrangement, query, match, t)
    return new Set([...shown].filter(([, rows]) => rows.length > 0).map(([id]) => id))
  }
  return { role: open('role'), group: open('group') }
}

function RowsSkeleton() {
  return ['a', 'b', 'c', 'd'].map((row) => (
    <div key={row} className="flex items-center gap-3 border-b border-(--theme-border) px-4 py-3">
      <Skeleton width={16} height={16} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton width="30%" />
        <Skeleton width="60%" className="text-sm" />
      </div>
      <Skeleton width={56} />
    </div>
  ))
}
