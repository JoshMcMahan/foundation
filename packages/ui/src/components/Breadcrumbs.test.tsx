// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { IBreadcrumbItem } from './Breadcrumbs'
import {
  BreadcrumbProvider,
  useBreadcrumb,
  useSetBreadcrumbs,
  useSetDefaultBreadcrumbs,
} from './Breadcrumbs'

function Trail() {
  const { breadcrumbs } = useBreadcrumb()
  return <p>{breadcrumbs.map((b) => b.label).join(' > ')}</p>
}

function Layout({ crumbs, children }: { crumbs: IBreadcrumbItem[]; children?: React.ReactNode }) {
  useSetDefaultBreadcrumbs(crumbs)
  return <>{children}</>
}

function Page({ crumbs }: { crumbs: IBreadcrumbItem[] }) {
  useSetBreadcrumbs(crumbs)
  return null
}

const layoutCrumbs = (org: string) => [{ label: org }, { label: 'threshold' }]
const pageCrumbs = [{ label: 'demo' }, { label: 'Adding New Threshold' }]

describe('useSetDefaultBreadcrumbs', () => {
  it('yields to a page that set its own breadcrumbs, even when the layout re-runs', () => {
    window.history.replaceState({}, '', '/org/demo/threshold/add')
    const { rerender } = render(
      <BreadcrumbProvider>
        <Trail />
        <Layout crumbs={layoutCrumbs('demo')}>
          <Page crumbs={pageCrumbs} />
        </Layout>
      </BreadcrumbProvider>,
    )
    expect(screen.getByText('demo > Adding New Threshold')).toBeTruthy()

    rerender(
      <BreadcrumbProvider>
        <Trail />
        <Layout crumbs={layoutCrumbs('Demo Organization')}>
          <Page crumbs={pageCrumbs} />
        </Layout>
      </BreadcrumbProvider>,
    )
    expect(screen.getByText('demo > Adding New Threshold')).toBeTruthy()
  })

  it('applies the layout breadcrumbs on a path no page has claimed', () => {
    window.history.replaceState({}, '', '/org/demo/users')
    render(
      <BreadcrumbProvider>
        <Trail />
        <Layout crumbs={layoutCrumbs('Demo Organization')} />
      </BreadcrumbProvider>,
    )
    expect(screen.getByText('Demo Organization > threshold')).toBeTruthy()
  })
})
