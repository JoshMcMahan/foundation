// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { PageHeaderBar, PageHeaderProvider } from '../components/PageHeader'
import { ListDetail } from './ListDetail'

const setWidth = (width: number) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
  } as DOMRect)

afterEach(() => vi.restoreAllMocks())

function Page({ open }: { open: boolean }) {
  return (
    <PageHeaderProvider>
      <PageHeaderBar />
      <ListDetail
        listLabel="Messages"
        detailLabel="Message"
        open={open}
        detailBreadcrumbs={[{ label: 'Inbox', href: '/inbox' }, { label: 'Quota low' }]}
        list={<p>the list</p>}
        detail={<p>{open ? 'the message' : '3 unread'}</p>}
      />
    </PageHeaderProvider>
  )
}

describe('ListDetail', () => {
  it('shows the list and the detail side by side where both fit, keeping the page’s trail', () => {
    setWidth(1200)
    render(<Page open />)
    const list = screen.getByRole('region', { name: 'Messages' })
    expect(list).not.toHaveClass('invisible')
    expect(list).not.toHaveAttribute('inert')
    expect(screen.getByRole('region', { name: 'Message' })).not.toHaveClass('hidden')
    expect(screen.queryByRole('link', { name: 'Inbox' })).toBeNull()
  })

  it('shows what the detail says with nothing open beside the list', () => {
    setWidth(1200)
    render(<Page open={false} />)
    expect(screen.getByText('3 unread')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Message' })).not.toHaveClass('hidden')
  })

  it('shows the list alone where both don’t fit, with nothing open', () => {
    setWidth(390)
    render(<Page open={false} />)
    expect(screen.getByRole('region', { name: 'Messages' })).not.toHaveClass('invisible')
    expect(screen.getByRole('region', { name: 'Message' })).toHaveClass('hidden')
  })

  it('shows the open item alone where both don’t fit, with the trail leading back', () => {
    setWidth(390)
    render(<Page open />)
    const list = screen.getByRole('region', { name: 'Messages', hidden: true })
    // Kept laid out under the item, so it comes back where it was scrolled to.
    expect(list).toHaveClass('invisible')
    expect(list).toHaveAttribute('inert')
    expect(screen.getByText('the list')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Message' })).not.toHaveClass('hidden')
    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute('href', '/inbox')
  })
})
