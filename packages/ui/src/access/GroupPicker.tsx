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
import { type AccessModel, covers } from './model'
import type { AccessStrings } from './strings'
import type { AccessGroup, AccessGroupDetails, AccessRole } from './types'

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
export type SearchGroups = (query: string, signal: AbortSignal) => Promise<readonly AccessGroup[]>

/** Details already loaded, kept for as long as the drawer is open. */
export type DetailsCache = Map<string, AccessGroupDetails>

export function GroupTile({ everyone, className }: { everyone: boolean; className?: string }) {
  const Icon = everyone ? OrganizationIcon : UsersIcon
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4',
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

interface GroupPickerProps {
  model: AccessModel
  value: readonly string[]
  onValueChange: (ids: string[]) => void
  /** The roles being granted, which the details weigh against what the group holds. */
  granting: readonly AccessRole[]
  resourceName: string
  describeGroup?: DescribeGroup | undefined
  searchGroups?: SearchGroups | undefined
  groupCount?: number | undefined
  recentGroupIds?: readonly string[] | undefined
  cache: DetailsCache
  /** Every group the picker has seen, by id, so a chosen one found by a search keeps its name. */
  seen: Map<string, AccessGroup>
  id: string
  describedBy: string
  /** The drawer's body, above its footer, which the open list fills. */
  boundary: Element | null
  t: AccessStrings
}

/** The groups field: everyone pinned first, then recent groups, then all of them; a pane beside
 *  the list says who is in the highlighted group and what it holds here. */
export function GroupPicker({
  model,
  value,
  onValueChange,
  granting,
  resourceName,
  describeGroup,
  searchGroups,
  groupCount,
  recentGroupIds = [],
  cache,
  seen,
  id,
  describedBy,
  boundary,
  t,
}: GroupPickerProps) {
  const [highlighted, setHighlighted] = useState<string | undefined>(undefined)
  const details = useDetails(highlighted, describeGroup, cache)
  const search = useSearch(searchGroups)
  const match = useQueryMatch()
  // Remembered as they arrive, idempotently, so a chosen group's chip keeps its name after the
  // search that found it is gone.
  for (const group of [...model.groupById.values(), ...(search.results ?? [])]) {
    seen.set(group.id, group)
  }

  // The highlighted group's details, once loaded, say whether it is synced, which its row reads.
  // biome-ignore lint/correctness/useExhaustiveDependencies: details.details marks the cache's change
  const items = useMemo(() => {
    const roleNames = (groupId: string) => (model.held.get(groupId) ?? []).map((r) => r.name)
    const item = (group: AccessGroup): ComboboxItem<string> => {
      const everyone = group.kind === 'everyone'
      const held = roleNames(group.id)
      const size =
        group.memberCount === undefined
          ? undefined
          : everyone
            ? t.people(group.memberCount)
            : t.members(group.memberCount)
      return {
        value: group.id,
        label: everyone ? t.everyone : group.name,
        description: [size, held.length > 0 && t.hasRoles(held)].filter(Boolean).join(' · '),
        accessibleDescription: t.groupSummary(
          group.memberCount,
          everyone,
          cache.get(group.id)?.source,
          held,
        ),
        icon: <GroupTile everyone={everyone} className="size-7" />,
      }
    }
    const everyone = model.everyone
    const recent = recentGroupIds
      .map((groupId) => seen.get(groupId))
      .filter((group): group is AccessGroup => group !== undefined && group.kind !== 'everyone')
    const listed = search.results ?? [...model.groupById.values()]
    const pinned = new Set([everyone?.id, ...recent.map((group) => group.id)])
    const rest = listed.filter((group) => group.kind !== 'everyone' && !pinned.has(group.id))
    // While searching, recent groups are among the results rather than above them.
    const searching = search.results !== undefined
    const groups: ComboboxGroup<string>[] = [
      // The host's search finds groups; everyone is the drawer's own, so it is matched here.
      ...(everyone && (!searching || match(search.query, everyone.name, t.everyone))
        ? [{ label: t.organization, items: [item(everyone)] }]
        : []),
      ...(!searching && recent.length > 0 ? [{ label: t.recent, items: recent.map(item) }] : []),
      {
        label: t.allGroups,
        description: (groupCount ?? listed.length).toLocaleString(),
        items: (searching ? listed.filter((g) => g.kind !== 'everyone') : rest).map(item),
      },
    ]
    return groups.filter((group) => group.items.length > 0)
  }, [
    model,
    recentGroupIds,
    search.results,
    search.query,
    match,
    groupCount,
    seen,
    cache,
    t,
    details.details,
  ])

  const everyoneChosen = model.everyone !== undefined && value.includes(model.everyone.id)
  const nameOf = (groupId: string) => {
    const group = seen.get(groupId)
    return group?.kind === 'everyone' ? t.everyoneInOrganization : (group?.name ?? groupId)
  }

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
        placeholder={t.addGroup}
        onQueryChange={searchGroups ? search.setQuery : undefined}
        loading={search.loading}
        onItemHighlighted={setHighlighted}
        collisionBoundary={boundary}
        details={(groupId) => (
          <GroupDetailsPane
            group={groupId === undefined ? undefined : seen.get(groupId)}
            state={details}
            model={model}
            granting={granting}
            resourceName={resourceName}
            t={t}
          />
        )}
        detailsSummary={() =>
          details.details ? <DetailsLine details={details.details} t={t} /> : null
        }
      />
      <p id={describedBy} className="m-0 mt-1.5 text-xs text-(--theme-muted-text-color)">
        {everyoneChosen
          ? t.everyoneCoversGroups
          : t.groupsHint(groupCount, model.everyone !== undefined)}
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
function useSearch(searchGroups: SearchGroups | undefined) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ query: string; groups: readonly AccessGroup[] }>()
  const trimmed = query.trim()
  useEffect(() => {
    if (!searchGroups || trimmed === '') {
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchGroups(trimmed, controller.signal).then(
        (groups) => setFound({ query: trimmed, groups }),
        () => {
          if (!controller.signal.aborted) {
            setFound({ query: trimmed, groups: [] })
          }
        },
      )
    }, SEARCH_DELAY)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [searchGroups, trimmed])
  const active = searchGroups !== undefined && trimmed !== ''
  return {
    query: trimmed,
    setQuery,
    // The last results stay up while the next search runs, so the list doesn't flicker empty.
    results: active ? (found?.groups ?? []) : undefined,
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

function GroupDetailsPane({
  group,
  state,
  model,
  granting,
  resourceName,
  t,
}: {
  group: AccessGroup | undefined
  state: DetailsState
  model: AccessModel
  granting: readonly AccessRole[]
  resourceName: string
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
  const redundant = held.filter((role) => fresh.some((by) => covers(by, role)))
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
        <GroupTile everyone={everyone} />
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
      <div>
        <PaneHeading>{t.onResource(resourceName)}</PaneHeading>
        {held.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {held.map((role) => (
              <StatusBadge
                key={role.id}
                size="md"
                variant={role.highImpact ? 'warning' : 'default'}
              >
                {role.name}
              </StatusBadge>
            ))}
          </div>
        ) : (
          <p className="m-0 text-xs text-(--theme-muted-text-color)">{t.noRolesHere}</p>
        )}
        {redundant.length > 0 && (
          <p className="m-0 mt-2 text-xs leading-snug text-(--theme-muted-text-color)">
            {t.becomesRedundant(
              fresh.filter((by) => redundant.some((role) => covers(by, role))).map((r) => r.name),
              redundant.map((role) => role.name),
            )}
          </p>
        )}
        {granting.length > 0 && fresh.length === 0 && (
          <p className="m-0 mt-2 text-xs leading-snug text-(--theme-muted-text-color)">
            {t.alreadyHas(granting.map((role) => role.name))}
          </p>
        )}
      </div>
      {details?.updatedAt !== undefined && details.updatedAt !== null && (
        <Updated value={details.updatedAt} t={t} />
      )}
    </div>
  )
}
