import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button } from '../components/Button'
import { Callout } from '../components/Callout'
import { useOpenMenu } from '../components/ContextMenu'
import { Drawer } from '../components/Drawer'
import { dialogFooterClassName } from '../components/dismiss'
import { EmptyState } from '../components/EmptyState'
import { IconButton } from '../components/IconButton'
import { Loader } from '../components/Loader'
import { SearchInput } from '../components/SearchInput'
import { SegmentedControl } from '../components/SegmentedControl'
import { Select } from '../components/Select'
import { LoadingRegion, Skeleton } from '../components/Skeleton'
import { useQueryMatch } from '../components/search'
import { toast } from '../components/Toast'
import { cx } from '../cx'
import { AddIcon, ArrowLeftIcon, LockIcon, UsersIcon } from '../icons'
import {
  ByPrincipal,
  ByPrincipalSingle,
  ByRole,
  OWNER_SECTION,
  type PendingRemoval,
  principalLabel,
  RuleRow,
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
  replacedBy,
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
  AccessRule,
  AccessVisibility,
} from './types'

export type AccessArrangement = 'role' | 'principal'

/** What the drawer and the inline panel share: everything but where they sit. */
export interface AccessEditorProps {
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
  /** How the list starts out: role by role, or person and group one by one. Person by person
   *  where each holds one role, role by role otherwise. */
  defaultArrangement?: AccessArrangement | undefined
  /** A switch above the list between open to everyone who can see what the resource is in
   *  and only those listed. It saves as a grant does, with Undo in a toast. */
  visibility?: AccessVisibility | undefined
  /** Reasons someone has access that no grant here changes, such as admins who always do:
   *  locked rows ahead of the grants. */
  rules?: readonly AccessRule[] | undefined
  /** Each person and group holds one role here. Their row picks it from a list, a change
   *  swaps the old role for the new one in a single change, and the grant form picks one. */
  singleRole?: boolean | undefined
  /** Why a save failed, in the reader's words, under "Couldn’t grant…": a fixed sentence, or
   *  one made from what `onChange` rejected with, such as a localized message for its error
   *  code. Without it, a generic sentence; the error's own message never shows, as a
   *  server's words aren't the reader's. */
  errorMessage?: string | ((error: unknown) => string | undefined) | undefined
  /** Access here is set somewhere else, such as on what the resource is part of: the list
   *  shows, read-only, under a note that says where, with a link there. */
  managedElsewhere?: AccessManagedElsewhere | undefined
}

export interface AccessManagedElsewhere {
  /** Where access is set and why: "This team follows the workspace’s access." Without it, a
   *  generic sentence. */
  reason?: ReactNode
  /** Where to change it, through the host's router. */
  href?: string | undefined
  /** The link's text, which says where it goes: "Workspace access". Without it, "Manage
   *  access". */
  linkLabel?: string | undefined
}

export interface AccessDrawerProps extends AccessEditorProps {
  open: boolean
  onClose: () => void
  /** As `Drawer`'s. */
  width?: number | string | undefined
}

export interface AccessPanelProps extends AccessEditorProps {
  /** On the panel's frame. */
  className?: string | undefined
  /** Under the list, inside the frame and ruled off from it: a note or actions about access
   *  as a whole. The grant form takes its place while it shows. */
  footer?: ReactNode
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

interface AccessEditor {
  granting: boolean
  title: string
  description: string
  toList: () => void
  /** Forgets the form, the pending removal and the filter, as closing does. */
  reset: () => void
  body: ReactNode
  footer: ReactNode
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
}

/** The list and the grant form, and the saving, failing and undoing they share, for the drawer
 *  and the inline panel to lay out. */
function useAccessEditor(
  {
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
    singleRole = false,
    defaultArrangement = singleRole ? 'principal' : 'role',
    visibility,
    rules,
    errorMessage,
    managedElsewhere,
  }: AccessEditorProps,
  inline: boolean,
): AccessEditor {
  const t = useAccessStrings()
  const uid = useId()
  const openMenu = useOpenMenu()
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
  const [visibilitySaving, setVisibilitySaving] = useState(false)
  const [visibilityFailure, setVisibilityFailure] = useState<{
    restricted: boolean
    message: string | undefined
  }>()
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
  // The latest handlers, for an Undo pressed after the drawer has moved on or closed.
  const change = useRef(onChange)
  change.current = onChange
  const visibilityChange = useRef(visibility?.onChange)
  visibilityChange.current = visibility?.onChange

  const match = useQueryMatch()
  const filtered = useFiltered(model, arrangement, query.trim(), match, t)
  const editable = !readOnly && !managedElsewhere && onChange !== undefined
  const messageOf = (error: unknown) =>
    (typeof errorMessage === 'function' ? errorMessage(error) : errorMessage) || t.failedReason
  const sectionId = (id: string) => `${uid}${arrangement}${id}`

  const nameOf = (id: string) => {
    const principal = seen.get(id) ?? model.principalById.get(id)
    return principal?.kind === 'everyone' ? t.everyone : (principal?.name ?? id)
  }
  const names = (grants: readonly AccessGrant[]) => ({
    principalNames: [...new Set(grants.map((grant) => grant.principalId))].map(nameOf),
    roleNames: [...new Set(grants.map((grant) => grant.roleId))].map(
      (id) => model.roleById.get(id)?.name ?? id,
    ),
  })

  const undo = (done: AccessChange) => {
    Promise.resolve(change.current?.(invert(done))).then(
      () => toast.info(t.undone),
      (error: unknown) => toast.error(t.nothingChanged(messageOf(error)), { title: t.undoFailed }),
    )
  }

  /** One role swapped for another, as a row's role picker sends it. */
  const swapped = (next: AccessChange) =>
    next.grant.length === 1 &&
    next.revoke.length > 0 &&
    next.revoke.every((revoked) => revoked.principalId === next.grant[0]?.principalId)

  /** Saves a change and reports how it went; resolves true once saved. */
  const save = async (next: AccessChange, where: Omit<Failure, 'change' | 'title' | 'message'>) => {
    if (!onChange || (next.grant.length === 0 && next.revoke.length === 0)) {
      return false
    }
    // Named by what it gives, so whoever it takes a role from doesn't read as getting one.
    const { principalNames, roleNames } = names(next.grant.length > 0 ? next.grant : next.revoke)
    // A revoked role that is also granted went from its holder to someone else.
    const granting = new Set(next.grant.map((grant) => grant.roleId))
    const replaced = next.revoke.filter((revoked) => granting.has(revoked.roleId))
    const swap = swapped({
      grant: next.grant,
      revoke: next.revoke.filter((revoked) => !granting.has(revoked.roleId)),
    })
    const newRole = model.roleById.get(next.grant[0]?.roleId ?? '')?.name ?? ''
    setSaving(next)
    setFailure(undefined)
    try {
      await onChange(next)
    } catch (error) {
      setFailure({
        change: next,
        title: swap
          ? t.roleChangeFailed(principalNames[0] ?? '', newRole)
          : next.grant.length > 0
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
      replaced.length > 0 && next.grant.length === 1
        ? t.replaced(
            newRole,
            replaced.map((held) => nameOf(held.principalId)),
            principalNames[0] ?? '',
          )
        : swap
          ? t.roleChanged(principalNames[0] ?? '', newRole)
          : next.grant.length > 0
            ? t.granted(principalNames, roleNames)
            : t.removed(principalNames, roleNames),
      { action: { label: t.common.undo, onClick: () => undo(next) } },
    )
    return true
  }

  const openLabel = visibility?.openLabel ?? ''
  const restrictedLabel = visibility?.restrictedLabel ?? t.restrictedLabel
  const choiceLabel = (restricted: boolean) => (restricted ? restrictedLabel : openLabel)

  const saveVisibility = async (restricted: boolean) => {
    const save = visibilityChange.current
    if (!save) {
      return
    }
    setVisibilitySaving(true)
    setVisibilityFailure(undefined)
    try {
      await save(restricted)
    } catch (error) {
      setVisibilityFailure({ restricted, message: messageOf(error) })
      return
    } finally {
      setVisibilitySaving(false)
    }
    toast.success(t.visibilityChanged(choiceLabel(restricted)), {
      action: {
        label: t.common.undo,
        onClick: () =>
          Promise.resolve(visibilityChange.current?.(!restricted)).then(
            () => toast.info(t.undone),
            (error: unknown) =>
              toast.error(t.nothingChanged(messageOf(error)), { title: t.undoFailed }),
          ),
      },
    })
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

  const changeRole = (principalId: string, roleId: string) => {
    const held = (model.held.get(principalId) ?? []).filter((role) => role.id !== roleId)
    const has = (model.held.get(principalId) ?? []).some((role) => role.id === roleId)
    const grant = has ? [] : [{ principalId, roleId }]
    void save(
      {
        grant,
        revoke: [
          ...held.map((role) => ({ principalId, roleId: role.id })),
          ...replacedBy(model, grant),
        ],
      },
      { inGrant: false, principalId },
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

  const reset = () => {
    setView('list')
    setRemoval(undefined)
    setQuery('')
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
    singleRole,
    t,
  })

  const savingKeys = useMemo(() => new Set(saving?.revoke.map(key) ?? []), [saving])
  const withAccess = principalsWithAccess(model)
  const empty = !loading && withAccess.length === 0
  const View = arrangement === 'role' ? ByRole : singleRole ? ByPrincipalSingle : ByPrincipal
  const needle = query.trim()
  const shownRules = (rules ?? []).filter(
    (rule) => !needle || match(needle, rule.title, rule.detail),
  )
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

  const visibilityValue = visibility?.restricted ? 'restricted' : 'open'
  const visibilityOptions: { value: 'open' | 'restricted'; label: string }[] = [
    { value: 'open', label: openLabel },
    { value: 'restricted', label: restrictedLabel },
  ]
  const visibilityRow = visibility && (
    <div className="flex flex-col gap-3 border-b border-(--theme-border) px-4 py-3">
      <div className="flex items-center gap-2">
        {/* Side by side where both labels fit; a list where they would be cut off. */}
        <div className="hidden @min-[30rem]/access:block">
          <SegmentedControl
            label={t.visibility}
            value={visibilityValue}
            disabled={!editable || visibilitySaving}
            onValueChange={(next) => {
              void saveVisibility(next === 'restricted')
            }}
            options={visibilityOptions}
          />
        </div>
        <Select<'open' | 'restricted'>
          aria-label={t.visibility}
          items={visibilityOptions}
          value={visibilityValue}
          disabled={!editable || visibilitySaving}
          onValueChange={(next) => {
            if (next !== null && next !== visibilityValue) {
              void saveVisibility(next === 'restricted')
            }
          }}
          className="min-w-0 flex-1 @min-[30rem]/access:hidden"
        />
        {visibilitySaving && <Loader inline size="1em" label={t.common.loading} />}
      </div>
      {visibilityFailure && (
        <Callout
          tone="error"
          live
          title={t.visibilityFailed(choiceLabel(visibilityFailure.restricted))}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => saveVisibility(visibilityFailure.restricted)}
            >
              {t.common.retry}
            </Button>
          }
          onDismiss={() => setVisibilityFailure(undefined)}
        >
          {t.nothingChanged(visibilityFailure.message)}
        </Callout>
      )}
    </div>
  )

  const ruleRows = shownRules.map((rule) => (
    <RuleRow
      key={rule.id}
      lead={arrangement === 'role' ? 'chevron' : singleRole ? 'tile' : 'both'}
      rule={rule}
      roleName={rule.roleId ? model.roleById.get(rule.roleId)?.name : undefined}
      t={t}
    />
  ))

  const list = (
    <div className="@container/access flex min-h-0 flex-1 flex-col">
      {managedElsewhere ? (
        // Ruled off by the switch or the filter below it; on its own when nothing is.
        <div className={cx('px-4 pt-3', empty && !visibility && 'pb-3')}>
          <Callout tone="info" icon={<LockIcon />}>
            {/* The link beside the note where both fit, under it where the note would be
                squeezed into a narrow column. */}
            <div className="flex flex-col items-start gap-2 @min-[30rem]/access:flex-row @min-[30rem]/access:gap-3">
              <div className="min-w-0 flex-1">{managedElsewhere.reason ?? t.managedElsewhere}</div>
              {managedElsewhere.href !== undefined && (
                // One line tall, so the button centers on the note's first line.
                <div className="flex shrink-0 items-center @min-[30rem]/access:h-5">
                  <Button size="sm" variant="secondary" href={managedElsewhere.href}>
                    {managedElsewhere.linkLabel ?? t.manageAccess}
                  </Button>
                </div>
              )}
            </div>
          </Callout>
        </div>
      ) : (
        readOnly && (
          <div className="px-4 pt-3">
            <Callout tone="info" icon={<LockIcon />}>
              {t.readOnly} {readOnlyReason ?? t.readOnlyReason}
            </Callout>
          </div>
        )
      )}
      {visibilityRow}
      {!empty && (
        <div className="flex flex-wrap items-center gap-2 border-b border-(--theme-border) px-4 py-3">
          {/* With one role each, a row already says it: the list needs no second arrangement. */}
          {!singleRole && (
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
          )}
          {editable &&
            grantButton(
              singleRole
                ? 'order-last hidden @min-[30rem]/access:inline-flex'
                : 'ms-auto hidden @min-[30rem]/access:inline-flex',
            )}
          {/* A row of its own beside the switch, as it and Grant access leave too little room. */}
          <SearchInput
            label={t.filter}
            value={query}
            onValueChange={(next) => {
              setQuery(next)
              setExpanded(expandedFor(model, next.trim(), match, t))
            }}
            className={singleRole ? 'min-w-0 flex-1' : 'min-w-0 basis-full'}
          />
        </div>
      )}
      {failure && !failure.inGrant && !filtered.order.includes(anchorOf(failure, arrangement)) && (
        <div className="px-4 pt-3">{failureNode}</div>
      )}
      <div
        className={cx(
          'min-h-0 flex-1',
          // Inline, the list grows with the page; the panel's frame closes off its last row.
          inline ? '[&>:last-child]:border-b-0' : 'overflow-y-auto',
        )}
      >
        {loading ? (
          <LoadingRegion label={t.loading}>
            <RowsSkeleton />
          </LoadingRegion>
        ) : empty && managedElsewhere ? (
          // Saying no one has access, with nothing to do about it here, would only alarm.
          ruleRows
        ) : empty ? (
          <>
            {ruleRows}
            <EmptyState
              variant="bare"
              icon={<UsersIcon />}
              title={t.emptyTitle}
              description={t.emptyDescription(resourceName)}
              action={editable && grantButton('')}
              className={ruleRows.length > 0 ? 'py-8' : 'py-16'}
            />
          </>
        ) : filtered.order.length === 0 && shownRules.length === 0 ? (
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
          <>
            {ruleRows}
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
              filtering={needle !== ''}
              sectionId={sectionId}
              t={t}
              actions={{
                readOnly: !editable,
                saving: savingKeys,
                removal,
                singleRole,
                openMenu,
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
                onChangeRole: changeRole,
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
          </>
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
  return {
    granting,
    title: granting ? t.grantAccess : t.title,
    description:
      granting || loading
        ? resourceName
        : t.summary(
            resourceName,
            withAccess.filter((principal) => principal.kind === 'user').length,
            withAccess.filter((principal) => principal.kind === 'group').length,
            withAccess.some((principal) => principal.kind === 'everyone'),
          ),
    toList,
    reset,
    footer: granting ? grantView.footer : undefined,
    onKeyDown: (e) => {
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
        ;(e as { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.()
        toList()
      }
    },
    body: (
      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
        {granting ? grantView.body : list}
      </div>
    ),
  }
}

/** Who has access to one resource, and the place to change it: roles granted to people and
 *  groups. Overlapping roles are allowed and only redundant, which the drawer points out; taking
 *  a role away first says exactly what is lost. The owner and roles granted above the resource
 *  show, locked. Each change is saved as it is made, with Undo in a toast. `AccessPanel` is the
 *  same editor inline on a page. */
export function AccessDrawer({ open, onClose, width = 560, ...props }: AccessDrawerProps) {
  const t = useAccessStrings()
  const editor = useAccessEditor(props, false)
  return (
    <Drawer
      open={open}
      onClose={() => {
        editor.reset()
        onClose()
      }}
      width={width}
      padded={false}
      title={editor.title}
      description={editor.description}
      onBack={editor.granting ? editor.toList : undefined}
      backLabel={t.back}
      footer={editor.footer}
      onKeyDown={editor.onKeyDown}
    >
      {editor.body}
    </Drawer>
  )
}

/** The access editor inline on a page, such as a settings section, rather than in a drawer: the
 *  list in a frame, which the grant form takes over with a back arrow in its own header. */
export function AccessPanel({ className, footer, ...props }: AccessPanelProps) {
  const t = useAccessStrings()
  const editor = useAccessEditor(props, true)
  return (
    <section
      data-access-panel=""
      tabIndex={-1}
      aria-label={editor.granting ? t.grantAccess : t.title}
      onKeyDown={editor.onKeyDown}
      className={cx(
        'flex min-w-0 flex-col overflow-hidden rounded-xl border border-(--theme-border) bg-(--theme-panel-bg) text-(--theme-app) outline-none',
        className,
      )}
    >
      {editor.granting && (
        <div className="flex shrink-0 items-start gap-3 border-b border-(--theme-border) px-4 py-3">
          <IconButton
            icon={<ArrowLeftIcon />}
            label={t.back}
            onClick={editor.toList}
            className="-my-1 -ms-1.5"
          />
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-sm font-semibold wrap-break-word">{editor.title}</h3>
            <p className="m-0 mt-0.5 text-xs text-(--theme-muted-text-color)">
              {editor.description}
            </p>
          </div>
        </div>
      )}
      {editor.body}
      {editor.footer ? (
        <div className={dialogFooterClassName}>{editor.footer}</div>
      ) : (
        footer !== undefined &&
        footer !== null &&
        footer !== false && (
          <div className="border-t border-(--theme-border) px-4 py-3 text-sm text-(--theme-muted-text-color)">
            {footer}
          </div>
        )
      )}
    </section>
  )
}

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
