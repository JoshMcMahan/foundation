import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { useContextMenu } from '../components/ContextMenu'
import { PageHeader, PageHeaderBar, PageHeaderProvider } from '../components/PageHeader'
import { PageHeaderAddButton } from '../components/PageHeaderAction'
import { Table } from '../components/Table'
import { KeyIcon, RefreshIcon, StorageIcon } from '../icons'
import { ActionToolbar } from './ActionToolbar'
import { ListColumns, ListPage, ListRow, useListNavigate } from './ListPage'
import { ListCellText, listTableProps, NameCell } from './ListTable'
import { ListToolbar } from './ListToolbar'
import { useListSearch } from './listSearch'
import { useListView } from './listView'

type State = 'rows' | 'loading' | 'error' | 'empty' | 'noMatches'

interface Args {
  state: State
  iconTile: boolean
  subtitles: boolean
  toolbarWhenEmpty: boolean
}

const meta: Meta<Args> = {
  title: 'UI/List/Page',
  args: { state: 'rows', iconTile: true, subtitles: true, toolbarWhenEmpty: false },
  argTypes: {
    state: {
      control: 'inline-radio',
      options: ['rows', 'loading', 'error', 'empty', 'noMatches'],
      description: 'Which state the list is in: ListPage picks the body from it.',
    },
    iconTile: {
      description:
        'NameCell: the icon in a bordered tile beside a subtitle; a one-line row keeps it bare in the same width.',
    },
    subtitles: { description: 'NameCell: a second line under each name.' },
    toolbarWhenEmpty: { description: 'ListPage: keep the toolbar while the list is empty.' },
  },
}
export default meta

interface Token {
  name: string
  scope: string
  prefix: string
  uses: number
}

const TOKENS: Token[] = [
  { name: 'ci-deploy', scope: 'Deploy', prefix: 'tk_8f3c2a', uses: 1204 },
  { name: 'nightly-sync', scope: 'Read only', prefix: 'tk_91b7d4', uses: 88 },
  { name: 'laptop', scope: 'Full access', prefix: 'tk_e6f0aa', uses: 3 },
]

function TokensPage({ state, iconTile, subtitles, toolbarWhenEmpty }: Args) {
  const search = useListSearch(true)
  const view = useListView<Token>({
    storageKey: 'story-tokens',
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true },
      { key: 'prefix', label: 'Prefix' },
      { key: 'uses', label: 'Uses', align: 'end', stack: false },
    ],
  })
  const { openMenu, contextMenu } = useContextMenu()
  const goTo = useListNavigate()
  const rows = state === 'empty' ? [] : TOKENS
  const { setFilter, openSearch } = search
  // No matches shows a search that finds nothing, typed in the open field.
  useEffect(() => {
    if (state === 'noMatches') {
      setFilter('quota')
      openSearch()
    }
  }, [state, setFilter, openSearch])
  const query = search.filter.trim()
  const shown = rows.filter((row) => row.name.includes(query))
  return (
    <PageHeaderProvider>
      {/* Sizes are inline: the package's stylesheet doesn't scan stories. */}
      {/* A card that ends at its last row, as a settings list does. */}
      <div className="flex flex-col overflow-hidden rounded-md border border-(--theme-border) bg-(--theme-app-bg)">
        <PageHeaderBar />
        <PageHeader
          breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'API tokens' }]}
          actions={<PageHeaderAddButton label="New token" onClick={() => {}} />}
        />
        <div>
          <ListPage
            view={view}
            loading={state === 'loading'}
            error={state === 'error' ? new Error('The server took too long to answer.') : undefined}
            errorNoun="tokens"
            total={state === 'error' ? 0 : rows.length}
            matches={shown.length}
            toolbarWhenEmpty={toolbarWhenEmpty}
            empty={{
              icon: <KeyIcon />,
              title: 'No API tokens yet',
              description: 'Tokens let scripts and CI act as you. Create one from the header.',
            }}
            noMatches="No tokens match"
            toolbar={
              <ListToolbar
                count={{
                  total: rows.length,
                  matches: shown.length,
                  filterActive: query !== '',
                  noun: 'token',
                  nounPlural: 'tokens',
                }}
                view={view}
                search={search}
                searchLabel="Search tokens"
              />
            }
          >
            {/* In a card, its border ends the rows, so they need no rule of their own after the last. */}
            <Table {...listTableProps} tbodyClassName="divide-y divide-(--theme-border)">
              <ListColumns view={view} />
              {shown.map((token) => (
                <ListRow
                  key={token.name}
                  href={null}
                  items={[{ label: 'Revoke', destructive: true, onClick: () => {} }]}
                  goTo={goTo}
                  openMenu={openMenu}
                >
                  <NameCell
                    icon={<KeyIcon />}
                    iconTile={iconTile}
                    name={token.name}
                    subtitle={subtitles ? token.scope : undefined}
                    href={null}
                  />
                  <Table.Item>
                    <ListCellText mono>{token.prefix}</ListCellText>
                  </Table.Item>
                  <Table.Item>
                    <ListCellText className="tabular-nums">{token.uses}</ListCellText>
                  </Table.Item>
                </ListRow>
              ))}
            </Table>
          </ListPage>
        </div>
      </div>
      {contextMenu}
    </PageHeaderProvider>
  )
}

/** A settings list in the shared look: "+ Add" in the page header, the count,
 *  display options and search in the toolbar, rows whose icons sit in a tile,
 *  muted cell text and a figure column set against its right edge. Switch the
 *  state to see loading, an error, the empty list (no toolbar) and no matches. */
export const States: StoryObj<Args> = {
  render: (args) => <TokensPage {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    if (args.state === 'rows') {
      await expect(canvas.getByRole('columnheader', { name: 'Uses' })).toHaveClass('text-right')
      await expect(canvas.getByRole('status')).toHaveTextContent('3 tokens')
    }
    if (args.state === 'empty') {
      await expect(canvas.getByText('No API tokens yet')).toBeVisible()
      await expect(canvas.queryByRole('button', { name: 'Display options' })).toBeNull()
    }
  },
}

/** Rows with one line each, such as teams or labels: the icon stays bare in
 *  the tile's width, so a row is as short as its name and the names line up
 *  as they would beside tiles. */
export const OneLineRows: StoryObj<Args> = {
  args: { subtitles: false },
  render: (args) => <TokensPage {...args} />,
}

/** The empty list: the empty state in the body and no toolbar, with "+ Add" in
 *  the header. */
export const Empty: StoryObj<Args> = {
  args: { state: 'empty' },
  render: (args) => <TokensPage {...args} />,
}

/** A search that leaves nothing keeps the toolbar, so it can be changed. */
export const NoMatches: StoryObj<Args> = {
  args: { state: 'noMatches' },
  render: (args) => <TokensPage {...args} />,
}

/** A toolbar action busy with what it started: the spinner takes its icon's
 *  place and it can't be pressed again until done. */
export const BusyToolbarAction: StoryObj<{ loading: boolean; onRefresh: () => void }> = {
  args: { loading: true, onRefresh: fn() },
  argTypes: {
    loading: { description: 'ToolbarAction: busy' },
    onRefresh: { table: { disable: true } },
  },
  render: ({ loading, onRefresh }) => (
    <ActionToolbar
      label="Bucket controls"
      groups={[
        [
          { key: 'refresh', label: 'Refresh', icon: <RefreshIcon />, loading, onClick: onRefresh },
          { key: 'browse', label: 'Browse', icon: <StorageIcon />, href: '/buckets' },
        ],
      ]}
    />
  ),
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(args.onRefresh).toHaveBeenCalledTimes(args.loading ? 0 : 1))
  },
}
