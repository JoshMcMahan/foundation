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
import {
  ByPrincipal,
  ByRole,
  OWNER_SECTION,
  type PendingRemoval,
  principalLabel,
  removeKey,
} from './AccessList'
import { holdFocus, useFocusAfterRender } from './focus'
import { type GrantSelection, useGrantView } from './GrantView'
import {
  type AccessModel,
  buildModel,
  invert,
  key,
  principalsWithAccess,
  warnAboutMisuse,
} from './model'
import type { DetailsCache, SearchPrincipals } from './PrincipalPicker'
import { type AccessStrings, useAccessStrings } from './strings'
import type {
  AccessChange,
  AccessGrant,
  AccessGroupDetails,
  AccessInheritedGrant,
  AccessPermission,
  AccessPrincipal,
  AccessRole,
} from './types'

export type AccessArrangement = 'role' | 'principal'

export interface AccessDrawerProps {
  open: boolean
  onClose: () => void
  /** What access is to, as the reader knows it: "gpu-cluster-east". */
  resourceName: string
  /** Every role that can be granted here, in the order to list them, and any held here only
   *  through somewhere else (`grantable: false`). */
  roles: readonly AccessRole[]
  /** Every person and group that holds a role here or owns it, the groups those people are in,
   *  and everyone when the resource can be granted to everyone. Without `searchPrincipals`,
   *  also everyone who can be granted one. */
  principals: readonly AccessPrincipal[]
  /** Who holds which role. The drawer shows these and never changes them itself. */
  grants: readonly AccessGrant[]
  /** The principal who owns it, among `principals`: it has every permission, always, and can't
   *  be removed. */
  owner?: string | undefined
  /** Roles held through something the resource is part of, such as its organization: they
   *  show, locked, and count toward what someone keeps. */
  inherited?: readonly AccessInheritedGrant[] | undefined
  /** Names the permissions roles list, for what someone loses when they lose a role. */
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
  /** More about a group, asked for when it is highlighted in the picker and kept while the
   *  drawer is mounted. A highlight that moves on aborts `signal`. */
  describeGroup?:
    | ((groupId: string, signal: AbortSignal) => Promise<AccessGroupDetails>)
    | undefined
  /** Finds people and groups to grant to, for an organization with too many to pass in
   *  `principals`. A newer query aborts `signal`. Without it, the picker filters `principals`. */
  searchPrincipals?: SearchPrincipals | undefined
  /** How many groups the organization has, for the picker's hint and heading. */
  groupCount?: number | undefined
  /** How many people the organization has, for the picker's hint and heading. */
  peopleCount?: number | undefined
  /** People and groups the reader granted to lately, listed first in the picker. */
  recentPrincipalIds?: readonly string[] | undefined
  /** How the list starts out: role by role, or person and group one by one. */
  defaultArrangement?: AccessArrangement | undefined
  /** As `Drawer`'s. */
  width?: number | string | undefined
}

interface Failure {
  change: AccessChange
  title: string
  message: string | undefined
  /** Where it shows: the grant form, or under the role or principal the change was about. */
  inGrant: boolean
  principalId: string
  roleId?: string | undefined
}

const EMPTY_SELECTION: GrantSelection = { principalIds: [], roleIds: [] }

/** Who has access to one resource, and the place to change it: roles granted to people and
 *  groups. Overlapping roles are allowed and only redundant, which the drawer points out; taking
 *  a role away first says exactly what is lost. The owner and roles granted above the resource
 *  show, locked. Each change is saved as it is made, with Undo in a toast. */
export function AccessDrawer({
  open,
  onClose,
  resourceName,
  roles,
  principals,
  grants,
  owner,
  inherited,
  permissions,
  onChange,
  loading = false,
  readOnly = false,
  readOnlyReason,
  describeGroup,
  searchPrincipals,
  groupCount,
  peopleCount,
  recentPrincipalIds,
  defaultArrangement = 'role',
  width = 560,
}: AccessDrawerProps) {
  const t = useAccessStrings()
  const uid = useId()
  const model = useMemo(
    () => buildModel({ roles, principals, grants, permissions, inherited, owner }),
    [roles, principals, grants, permissions, inherited, owner],
  )
  useEffect(() => {
    if (!loading) {
      warnAboutMisuse({ roles, principals, grants, permissions, inherited, owner })
    }
  }, [roles, principals, grants, permissions, inherited, owner, loading])

  const [view, setView] = useState<'list' | 'grant'>('list')
  const [selection, setSelection] = useState<GrantSelection>(EMPTY_SELECTION)
  const [arrangement, setArrangement] = useState<AccessArrangement>(defaultArrangement)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Record<AccessArrangement, ReadonlySet<string>>>({
    role: new Set(),
    principal: new Set(),
  })
  const [removal, setRemoval] = useState<PendingRemoval>()
  const [saving, setSaving] = useState<AccessChange>()
  const [failure, setFailure] = useState<Failure>()
  const cache = useRef<DetailsCache>(new Map()).current
  const seen = useRef(new Map<string, AccessPrincipal>()).current
  const body = useRef<HTMLDivElement | null>(null)
  // Also as state, so the picker's list can be bounded by it once it is there.
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
    const principalNames = [...new Set(all.map((grant) => grant.principalId))].map((id) => {
      const principal = seen.get(id) ?? model.principalById.get(id)
      return principal?.kind === 'everyone' ? t.everyone : (principal?.name ?? id)
    })
    const roleNames = [...new Set(all.map((grant) => grant.roleId))].map(
      (id) => model.roleById.get(id)?.name ?? id,
    )
    return { principalNames, roleNames }
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
    const { principalNames, roleNames } = names(next)
    setSaving(next)
    setFailure(undefined)
    try {
      await onChange(next)
    } catch (error) {
      setFailure({
        change: next,
        title:
          next.grant.length > 0
            ? t.grantFailed(principalNames, roleNames)
            : t.removeFailed(principalNames[0] ?? '', roleNames),
        message: messageOf(error),
        ...where,
      })
      return false
    } finally {
      setSaving(undefined)
    }
    toast.success(
      next.grant.length > 0
        ? t.granted(principalNames, roleNames)
        : t.removed(principalNames, roleNames),
      { action: { label: t.common.undo, onClick: () => undo(next) } },
    )
    return true
  }

  const toList = () => {
    setView('list')
    setFailure((current) => (current?.inGrant ? undefined : current))
    focusLater(() => visible(body.current?.querySelectorAll<HTMLElement>('[data-grant-access]')))
  }

  const toGrant = (principalIds: string[] = []) => {
    setSelection({ principalIds, roleIds: [] })
    setRemoval(undefined)
    setView('grant')
    focusLater(() => body.current?.querySelector<HTMLElement>('input[role="combobox"]'))
  }

  const grant = async (next: AccessChange) => {
    if (await save(next, { inGrant: true, principalId: next.grant[0]?.principalId ?? '' })) {
      // The new grants show opened, so the reader sees where they went.
      setExpanded((current) => ({
        role: new Set([...current.role, ...next.grant.map((g) => g.roleId)]),
        principal: new Set([...current.principal, ...next.grant.map((g) => g.principalId)]),
      }))
      toList()
    }
  }

  const remove = async (pending: PendingRemoval) => {
    const next = {
      grant: [],
      revoke: pending.roleIds.map((roleId) => ({ principalId: pending.principalId, roleId })),
    }
    const anchor = arrangement === 'role' && !pending.all ? pending.roleIds[0] : undefined
    await save(next, { inGrant: false, principalId: pending.principalId, roleId: anchor })
    setRemoval(undefined)
    // The row it was on is gone, or has its error under it: its section takes focus, or the
    // filter when the section went with it.
    focusLater(
      () =>
        document.getElementById(sectionId(anchor ?? pending.principalId)) ??
        body.current?.querySelector<HTMLElement>('input[type="search"]'),
    )
  }

  const retry = (failed: Failure) =>
    failed.inGrant
      ? grant(failed.change)
      : save(failed.change, {
          inGrant: false,
          principalId: failed.principalId,
          roleId: failed.roleId,
        })

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
    searchPrincipals,
    groupCount,
    peopleCount,
    recentPrincipalIds,
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
  const withAccess = principalsWithAccess(model)
  const empty = !loading && withAccess.length === 0
  const View = arrangement === 'role' ? ByRole : ByPrincipal
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
                { value: 'principal', label: t.byPrincipal },
              ]}
            />
          </div>
          {editable && grantButton('ms-auto hidden @min-[30rem]/access:inline-flex')}
          {/* A row of its own, as the switch and Grant access leave too little room for it. */}
          <SearchInput
            label={t.filter}
            value={query}
            onValueChange={(next) => {
              setQuery(next)
              setExpanded(expandedFor(model, next.trim(), match, t))
            }}
            className="min-w-0 basis-full"
          />
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
              onGrantMore: (principalId) => toGrant([principalId]),
              failure:
                failure && !failure.inGrant
                  ? {
                      node: failureNode,
                      principalId: failure.principalId,
                      roleId: failure.roleId,
                    }
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
                withAccess.filter((principal) => principal.kind === 'user').length,
                withAccess.filter((principal) => principal.kind === 'group').length,
                withAccess.some((principal) => principal.kind === 'everyone'),
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
  arrangement === 'role' ? (failure.roleId ?? '') : failure.principalId

/** The one of `elements` that is laid out, such as the one of two buttons a width shows, or the
 *  first where nothing is (as in tests). */
function visible(elements: NodeListOf<HTMLElement> | undefined) {
  const all = [...(elements ?? [])]
  return all.find((element) => element.getClientRects().length > 0) ?? all[0]
}

type Match = (query: string, ...texts: (string | undefined)[]) => boolean

/** What a principal can be found by. */
const principalTexts = (model: AccessModel, principal: AccessPrincipal, t: AccessStrings) => [
  principalLabel(principal, t),
  principal.name,
  principal.detail,
  ...(principal.kind === 'everyone' ? [t.everyone] : []),
  ...(model.owner?.id === principal.id ? [t.owner] : []),
]

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
  const found = (principal: AccessPrincipal) => match(query, ...principalTexts(model, principal, t))
  if (arrangement === 'role') {
    const owner = model.owner
    if (owner && (!query || match(query, t.owner) || found(owner))) {
      order.push(OWNER_SECTION)
      shown.set(OWNER_SECTION, [owner.id])
    }
    for (const role of model.roles) {
      // Own grants first, then those from above, each once.
      const holders = [
        ...new Map(
          [
            ...(model.holders.get(role.id) ?? []),
            ...(model.inheritedHolders.get(role.id) ?? []).map((holder) => holder.principal),
          ].map((principal) => [principal.id, principal]),
        ).values(),
      ]
      if (role.grantable === false && holders.length === 0) {
        continue
      }
      const rows =
        !query || match(query, role.name, role.description) ? holders : holders.filter(found)
      if (!query || rows.length > 0) {
        order.push(role.id)
        shown.set(
          role.id,
          rows.map((principal) => principal.id),
        )
      }
    }
  } else {
    for (const principal of principalsWithAccess(model)) {
      const roles = [
        ...new Set([
          ...(model.held.get(principal.id) ?? []),
          ...(model.inherited.get(principal.id) ?? []).map((holding) => holding.role),
        ]),
      ]
      const rows =
        !query || found(principal)
          ? roles
          : roles.filter((role) => match(query, role.name, role.description))
      if (!query || rows.length > 0 || (model.owner?.id === principal.id && found(principal))) {
        order.push(principal.id)
        shown.set(
          principal.id,
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
    return { role: new Set<string>(), principal: new Set<string>() }
  }
  const open = (arrangement: AccessArrangement) => {
    const { shown } = filterAccess(model, arrangement, query, match, t)
    return new Set([...shown].filter(([, rows]) => rows.length > 0).map(([id]) => id))
  }
  return { role: open('role'), principal: open('principal') }
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
