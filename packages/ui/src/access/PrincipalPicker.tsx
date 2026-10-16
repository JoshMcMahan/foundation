import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { Callout } from '../components/Callout'
import { Combobox, type ComboboxGroup, type ComboboxItem } from '../components/Combobox'
import { useRelativeTime } from '../components/relativeTime'
import { Skeleton } from '../components/Skeleton'
import { StatusBadge } from '../components/StatusBadge'
import { useQueryMatch } from '../components/search'
import { cx } from '../cx'
import type { TimeValue } from '../format'
import { OrganizationIcon, RefreshIcon, UsersIcon } from '../icons'
import { type AccessModel, covers, isOwner } from './model'
import type { AccessStrings } from './strings'
import type { AccessGroupDetails, AccessPrincipal, AccessRole } from './types'

/** Waits this long on a highlighted group before asking for its details, so arrowing past
 *  groups doesn't ask for each one. */
const DESCRIBE_DELAY = 120
/** Waits this long after the last keystroke before searching. */
const SEARCH_DELAY = 200
/** Faces in a group's details, before the rest are a count. */
const FACES = 5
/** Names in a group's details, before the rest are a count. */
const NAMES = 3

export type DescribeGroup = (groupId: string, signal: AbortSignal) => Promise<AccessGroupDetails>
export type SearchPrincipals = (
  query: string,
  signal: AbortSignal,
) => Promise<readonly AccessPrincipal[]>

/** Details already loaded, kept for as long as the drawer is open. */
export type DetailsCache = Map<string, AccessGroupDetails>

/** A person's face, or a group's or everyone's icon, beside their name. */
export function PrincipalTile({
  principal,
  compact = false,
  className,
}: {
  principal: AccessPrincipal
  /** The smaller size, for a picker row. */
  compact?: boolean
  className?: string
}) {
  if (principal.kind === 'user') {
    // The name is beside it, so the face isn't read as well.
    return (
      <span
        aria-hidden="true"
        className={cx(
          'flex shrink-0 items-center justify-center',
          compact ? 'size-6' : 'size-8',
          className,
        )}
      >
        <Avatar src={principal.avatarUrl} name={principal.name} size={compact ? 'sm' : 'md'} />
      </span>
    )
  }
  const everyone = principal.kind === 'everyone'
  const Icon = everyone ? OrganizationIcon : UsersIcon
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4',
        // The same box as a person's face beside it, so a square and a circle read as one size.
        compact && 'size-6 [&_svg]:size-3.5',
        everyone
          ? 'bg-(--theme-info-muted) text-(--theme-info-text)'
          : 'bg-(--theme-muted-panel-bg) text-(--theme-muted-text-color)',
        className,
      )}
    >
      <Icon />
    </span>
  )
}

interface PrincipalPickerProps {
  model: AccessModel
  value: readonly string[]
  onValueChange: (ids: string[]) => void
  /** The roles being granted, which the details weigh against what the highlighted holds. */
  granting: readonly AccessRole[]
  describeGroup?: DescribeGroup | undefined
  searchPrincipals?: SearchPrincipals | undefined
  groupCount?: number | undefined
  peopleCount?: number | undefined
  recentPrincipalIds?: readonly string[] | undefined
  cache: DetailsCache
  /** Everyone the picker has seen, by id, so a chosen one found by a search keeps its name. */
  seen: Map<string, AccessPrincipal>
  id: string
  describedBy: string
  /** The drawer's body, above its footer, which the open list fills. */
  boundary: Element | null
  t: AccessStrings
}

/** The people and groups field: everyone pinned first, then recent picks, then people and
 *  groups; a pane beside the list says more about the highlighted one and what it holds here. */
export function PrincipalPicker({
  model,
  value,
  onValueChange,
  granting,
  describeGroup,
  searchPrincipals,
  groupCount,
  peopleCount,
  recentPrincipalIds = [],
  cache,
  seen,
  id,
  describedBy,
  boundary,
  t,
}: PrincipalPickerProps) {
  const [highlighted, setHighlighted] = useState<string | undefined>(undefined)
  const search = useSearch(searchPrincipals)
  const match = useQueryMatch()
  // Remembered as they arrive, idempotently, so a chosen one's chip keeps its name after the
  // search that found it is gone.
  for (const principal of [...model.principalById.values(), ...(search.results ?? [])]) {
    seen.set(principal.id, principal)
  }
  // People carry what the pane says about them; only groups and everyone are described.
  const describedId =
    highlighted !== undefined && seen.get(highlighted)?.kind !== 'user' ? highlighted : undefined
  const details = useDetails(describedId, describeGroup, cache)

  // The highlighted group's details, once loaded, say whether it is synced, which its row reads.
  // biome-ignore lint/correctness/useExhaustiveDependencies: details.details marks the cache's change
  const items = useMemo(() => {
    const roleNames = (principalId: string) =>
      (model.held.get(principalId) ?? []).map((r) => r.name)
    const item = (principal: AccessPrincipal): ComboboxItem<string> => {
      const held = roleNames(principal.id)
      const icon = <PrincipalTile principal={principal} compact />
      if (principal.kind === 'user') {
        const owner = isOwner(model, principal.id)
        return {
          value: principal.id,
          label: principal.name,
          description: [principal.detail, owner ? t.owner : held.length > 0 && t.hasRoles(held)]
            .filter(Boolean)
            .join(' · '),
          accessibleDescription: t.personSummary(principal.detail, owner, held),
          icon,
        }
      }
      const everyone = principal.kind === 'everyone'
      const size =
        principal.memberCount === undefined
          ? undefined
          : everyone
            ? t.people(principal.memberCount)
            : t.members(principal.memberCount)
      return {
        value: principal.id,
        label: everyone ? t.everyone : principal.name,
        description: [size, held.length > 0 && t.hasRoles(held)].filter(Boolean).join(' · '),
        accessibleDescription: t.groupSummary(
          principal.memberCount,
          everyone,
          cache.get(principal.id)?.source,
          held,
        ),
        icon,
      }
    }
    const everyone = model.everyone
    const recent = recentPrincipalIds
      .map((principalId) => seen.get(principalId))
      .filter(
        (principal): principal is AccessPrincipal =>
          principal !== undefined && principal.kind !== 'everyone',
      )
    const listed = search.results ?? [...model.principalById.values()]
    // While searching, recent picks are among the results rather than above them.
    const searching = search.results !== undefined
    const pinned = new Set(searching ? [] : recent.map((principal) => principal.id))
    const rest = listed.filter(
      (principal) => principal.kind !== 'everyone' && !pinned.has(principal.id),
    )
    const people = rest.filter((principal) => principal.kind === 'user')
    const groups = rest.filter((principal) => principal.kind === 'group')
    const count = (given: number | undefined, kind: AccessPrincipal['kind']) =>
      searching
        ? undefined
        : (given ?? listed.filter((principal) => principal.kind === kind).length).toLocaleString()
    const sections: ComboboxGroup<string>[] = [
      // The host's search finds people and groups; everyone is the drawer's own, so it is
      // matched here.
      ...(everyone && (!searching || match(search.query, everyone.name, t.everyone))
        ? [{ label: t.organization, items: [item(everyone)] }]
        : []),
      ...(!searching && recent.length > 0 ? [{ label: t.recent, items: recent.map(item) }] : []),
      { label: t.peopleSection, description: count(peopleCount, 'user'), items: people.map(item) },
      { label: t.groupsSection, description: count(groupCount, 'group'), items: groups.map(item) },
    ]
    return sections.filter((section) => section.items.length > 0)
  }, [
    model,
    recentPrincipalIds,
    search.results,
    search.query,
    match,
    groupCount,
    peopleCount,
    seen,
    cache,
    t,
    details.details,
  ])

  const everyoneChosen = model.everyone !== undefined && value.includes(model.everyone.id)
  const nameOf = (principalId: string) => {
    const principal = seen.get(principalId)
    return principal?.kind === 'everyone'
      ? t.everyoneInOrganization
      : (principal?.name ?? principalId)
  }
  const highlightedPrincipal = highlighted === undefined ? undefined : seen.get(highlighted)

  return (
    <>
      <Combobox<string>
        multiple
        id={id}
        aria-describedby={describedBy}
        items={items}
        value={value}
        onValueChange={onValueChange}
        itemToStringLabel={nameOf}
        placeholder={t.addPrincipal}
        onQueryChange={searchPrincipals ? search.setQuery : undefined}
        loading={search.loading}
        onItemHighlighted={setHighlighted}
        collisionBoundary={boundary}
        details={(principalId) => {
          const principal = principalId === undefined ? undefined : seen.get(principalId)
          return principal?.kind === 'user' ? (
            <PersonDetailsPane person={principal} model={model} granting={granting} t={t} />
          ) : (
            <GroupDetailsPane
              group={principal}
              state={details}
              model={model}
              granting={granting}
              t={t}
            />
          )
        }}
        detailsSummary={() =>
          highlightedPrincipal?.kind === 'user' ? (
            (highlightedPrincipal.detail ?? null)
          ) : details.details ? (
            <DetailsLine details={details.details} t={t} />
          ) : null
        }
      />
      <p id={describedBy} className="m-0 mt-1.5 text-xs text-(--theme-muted-text-color)">
        {everyoneChosen
          ? t.everyoneCoversGroups
          : t.pickerHint(peopleCount, groupCount, model.everyone !== undefined)}
      </p>
    </>
  )
}

interface DetailsState {
  groupId: string | undefined
  details: AccessGroupDetails | undefined
  loading: boolean
  failed: boolean
}

/** The highlighted group's details: from the cache, or asked for once the highlight rests on
 *  it, and the request dropped when it moves on. */
function useDetails(
  groupId: string | undefined,
  describe: DescribeGroup | undefined,
  cache: DetailsCache,
): DetailsState {
  const [failed, setFailed] = useState<string | undefined>(undefined)
  const [, setLoaded] = useState(0)
  const cached = groupId === undefined ? undefined : cache.get(groupId)
  useEffect(() => {
    if (groupId === undefined || !describe || cache.has(groupId)) {
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      describe(groupId, controller.signal).then(
        (details) => {
          cache.set(groupId, details)
          setLoaded((n) => n + 1)
        },
        () => {
          if (!controller.signal.aborted) {
            setFailed(groupId)
          }
        },
      )
    }, DESCRIBE_DELAY)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [groupId, describe, cache])
  return {
    groupId,
    details: cached,
    loading: groupId !== undefined && describe !== undefined && !cached && failed !== groupId,
    failed: groupId !== undefined && failed === groupId,
  }
}

/** A search on the host's side, run once typing pauses; a newer query drops the older one's. */
function useSearch(searchPrincipals: SearchPrincipals | undefined) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{
    query: string
    principals: readonly AccessPrincipal[]
  }>()
  const trimmed = query.trim()
  useEffect(() => {
    if (!searchPrincipals || trimmed === '') {
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchPrincipals(trimmed, controller.signal).then(
        (principals) => setFound({ query: trimmed, principals }),
        () => {
          if (!controller.signal.aborted) {
            setFound({ query: trimmed, principals: [] })
          }
        },
      )
    }, SEARCH_DELAY)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [searchPrincipals, trimmed])
  const active = searchPrincipals !== undefined && trimmed !== ''
  return {
    query: trimmed,
    setQuery,
    // The last results stay up while the next search runs, so the list doesn't flicker empty.
    results: active ? (found?.principals ?? []) : undefined,
    loading: active && found?.query !== trimmed,
  }
}

function PaneHeading({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mb-1.5 text-[11px] font-semibold tracking-wide text-(--theme-muted-text-color) uppercase">
      {children}
    </p>
  )
}

function Faces({ details, t }: { details: AccessGroupDetails; t: AccessStrings }) {
  const shown = details.members.slice(0, FACES)
  const more = details.memberCount - shown.length
  return (
    <div className="flex items-center gap-1">
      {shown.map((member, index) => (
        <Avatar
          // biome-ignore lint/suspicious/noArrayIndexKey: two members may share a name
          key={`${index}:${member.name}`}
          src={member.avatarUrl}
          name={member.name}
          size="md"
        />
      ))}
      {more > 0 && (
        <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-(--theme-muted-panel-bg) px-1.5 text-xs font-medium">
          {t.moreMembers(more)}
        </span>
      )}
    </div>
  )
}

const memberLine = (details: AccessGroupDetails, count: number, t: AccessStrings) => {
  const names = details.members.slice(0, count).map((member) => member.name)
  return names.length > 0 ? t.memberNames(names, details.memberCount - names.length) : undefined
}

/** The pane's one-line stand-in, under the highlighted group where the pane has no room. */
function Updated({ value, t }: { value: TimeValue; t: AccessStrings }) {
  const ago = useRelativeTime(value)
  return <p className="m-0 mt-auto text-xs text-(--theme-muted-text-color)">{t.updated(ago)}</p>
}

function DetailsLine({ details, t }: { details: AccessGroupDetails; t: AccessStrings }) {
  return (
    <>
      {[details.source === 'synced' && t.syncedShort, memberLine(details, 2, t)]
        .filter(Boolean)
        .join(' · ')}
    </>
  )
}

/** What the highlighted one holds here, and what granting the picked roles would change. */
function OnResource({
  principalId,
  model,
  granting,
  t,
}: {
  principalId: string
  model: AccessModel
  granting: readonly AccessRole[]
  t: AccessStrings
}) {
  const held = model.held.get(principalId) ?? []
  const owner = isOwner(model, principalId)
  const heldIds = new Set(held.map((role) => role.id))
  const fresh = owner ? [] : granting.filter((role) => !heldIds.has(role.id))
  const redundant = held.filter((role) => fresh.some((by) => covers(by, role)))
  return (
    <div>
      <PaneHeading>{t.currentRoles}</PaneHeading>
      {owner || held.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {owner && (
            <StatusBadge size="md" variant="info">
              {t.owner}
            </StatusBadge>
          )}
          {held.map((role) => (
            <StatusBadge key={role.id} size="md">
              {role.name}
            </StatusBadge>
          ))}
        </div>
      ) : (
        <p className="m-0 text-xs text-(--theme-muted-text-color)">{t.noRolesHere}</p>
      )}
      {owner && (
        <p className="m-0 mt-2 text-xs leading-snug text-(--theme-muted-text-color)">
          {t.ownerDescription}
        </p>
      )}
      {redundant.length > 0 && (
        <p className="m-0 mt-2 text-xs leading-snug text-(--theme-muted-text-color)">
          {t.becomesRedundant(
            fresh.filter((by) => redundant.some((role) => covers(by, role))).map((r) => r.name),
            redundant.map((role) => role.name),
          )}
        </p>
      )}
      {!owner && granting.length > 0 && fresh.length === 0 && (
        <p className="m-0 mt-2 text-xs leading-snug text-(--theme-muted-text-color)">
          {t.alreadyHas(granting.map((role) => role.name))}
        </p>
      )}
    </div>
  )
}

function PersonDetailsPane({
  person,
  model,
  granting,
  t,
}: {
  person: AccessPrincipal
  model: AccessModel
  granting: readonly AccessRole[]
  t: AccessStrings
}) {
  const groups = (person.groupIds ?? [])
    .map((id) => model.principalById.get(id))
    .filter((group): group is AccessPrincipal => group?.kind === 'group')
  return (
    <div className="flex min-h-full flex-col gap-4 p-4 text-sm">
      <div className="flex items-start gap-3">
        <PrincipalTile principal={person} />
        <div className="min-w-0">
          <p className="m-0 font-semibold wrap-break-word">{person.name}</p>
          {person.detail && (
            <p className="m-0 text-xs wrap-break-word text-(--theme-muted-text-color)">
              {person.detail}
            </p>
          )}
        </div>
      </div>
      {groups.length > 0 && (
        <div>
          <PaneHeading>{t.inGroups}</PaneHeading>
          <div className="flex flex-wrap gap-1">
            {groups.map((group) => (
              <StatusBadge key={group.id} size="md">
                {group.name}
              </StatusBadge>
            ))}
          </div>
        </div>
      )}
      <OnResource principalId={person.id} model={model} granting={granting} t={t} />
    </div>
  )
}

function GroupDetailsPane({
  group,
  state,
  model,
  granting,
  t,
}: {
  group: AccessPrincipal | undefined
  state: DetailsState
  model: AccessModel
  granting: readonly AccessRole[]
  t: AccessStrings
}) {
  if (!group) {
    return <p className="m-0 p-4 text-xs text-(--theme-muted-text-color)">{t.noHighlight}</p>
  }
  const everyone = group.kind === 'everyone'
  const held = model.held.get(group.id) ?? []
  const details = state.groupId === group.id ? state.details : undefined
  const count = details?.memberCount ?? group.memberCount
  const heldIds = new Set(held.map((role) => role.id))
  const fresh = granting.filter((role) => !heldIds.has(role.id))
  const source = everyone
    ? t.wholeOrganization
    : details?.source === 'synced'
      ? t.synced
      : details?.source === 'manual'
        ? t.manual
        : undefined
  return (
    <div className="flex min-h-full flex-col gap-4 p-4 text-sm">
      <div className="flex items-start gap-3">
        <PrincipalTile principal={group} />
        <div className="min-w-0">
          <p className="m-0 font-semibold wrap-break-word">{everyone ? t.everyone : group.name}</p>
          {state.loading && !everyone ? (
            <Skeleton width="10rem" className="mt-1 text-xs" />
          ) : (
            source && (
              <p className="m-0 flex items-start gap-1 text-xs text-(--theme-muted-text-color)">
                {details?.source === 'synced' && !everyone && (
                  <RefreshIcon className="mt-0.5 size-3 shrink-0" />
                )}
                {source}
              </p>
            )
          )}
        </div>
      </div>
      {state.loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton count={2} className="text-xs" />
          <Skeleton width="60%" className="mt-2 text-xs" />
          <Skeleton circle height={24} width="9rem" className="rounded-full" />
        </div>
      ) : (
        <>
          {state.failed && (
            <p className="m-0 text-xs text-(--theme-error-text)">{t.detailsFailed}</p>
          )}
          {details?.description && <p className="m-0 leading-snug">{details.description}</p>}
          {count !== undefined && (
            <div>
              <PaneHeading>{everyone ? t.people(count) : t.members(count)}</PaneHeading>
              {details && details.members.length > 0 && (
                <>
                  <Faces details={details} t={t} />
                  <p className="m-0 mt-1.5 text-xs leading-snug text-(--theme-muted-text-color)">
                    {memberLine(details, NAMES, t)}
                  </p>
                </>
              )}
              {everyone && (
                <p className="m-0 mt-1.5 text-xs leading-snug text-(--theme-muted-text-color)">
                  {t.joinLater}
                </p>
              )}
            </div>
          )}
        </>
      )}
      {everyone && fresh.length > 0 && (
        <Callout tone="warning" size="sm" icon={false}>
          {t.everyoneReach(
            fresh.map((role) => role.name),
            count,
          )}
        </Callout>
      )}
      <OnResource principalId={group.id} model={model} granting={granting} t={t} />
      {details?.updatedAt !== undefined && details.updatedAt !== null && (
        <Updated value={details.updatedAt} t={t} />
      )}
    </div>
  )
}
