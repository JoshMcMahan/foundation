// Measures built benchmark pages in headless Chrome and writes what it found as Markdown.
//
//   node bench/run.ts [--rounds 3] [--out report.md] head=<built dir> [base=<built dir>]
//
// Each round loads every shape in every build in turn, so a busy moment of the machine slows each
// about alike. Chrome is the one at $CHROME, or where Linux and macOS install it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { type Browser, chromium, type Page } from 'playwright-core'
import { quantile, report, type Sample, type Variant } from './report.ts'

const SHAPES = ['thousand', 'three-thousand', 'nested']

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

/** Serves a built page on a free local port. */
async function serve(dir: string): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname))
    const file = join(dir, path === '/' ? 'index.html' : path)
    if (!file.startsWith(dir) || !existsSync(file)) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    response.end(readFileSync(file))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return { server, url: `http://127.0.0.1:${port}/index.html` }
}

/** Draws the graph again, and the time until its connectors are on screen. */
const mount = (page: Page) =>
  page.evaluate(async () => {
    const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve))
    const start = performance.now()
    ;(window as unknown as { mount: () => void }).mount()
    await new Promise((resolve) => setTimeout(resolve, 0))
    while (!document.querySelector('svg path')) {
      await frame()
    }
    await frame()
    return performance.now() - start
  })

/** Expands every subworkflow, and the time until the last of their nodes is on screen. */
const expand = (page: Page) =>
  page.evaluate(async () => {
    const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve))
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === 'Expand All',
    )
    if (!button) {
      return undefined
    }
    const count = () => document.querySelectorAll('[id^="node_"]').length
    const start = performance.now()
    let last = start
    let nodes = count()
    button.click()
    // Done once the nodes have held still for half a second of frames.
    for (let still = 0; still < 30; still++) {
      await frame()
      if (count() !== nodes) {
        nodes = count()
        last = performance.now()
        still = 0
      }
    }
    return last - start
  })

/** Every frame's length while `act` runs, and while a hover's highlight draws out after. */
const framesDuring = (page: Page, act: 'hover' | 'zoom') =>
  page.evaluate(async (act) => {
    const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve))
    const frames: number[] = []
    let on = true
    let last = performance.now()
    const timing = (async () => {
      while (on) {
        const now = await frame()
        frames.push(now - last)
        last = now
      }
    })()
    if (act === 'hover') {
      const nodes = document.querySelectorAll('[id^="node_"]')
      // Six jobs across the graph, each hovered and left, then the last one's highlight drawn out.
      for (let i = 1; i <= 6; i++) {
        const node = nodes[Math.floor((nodes.length * i) / 8)]
        node?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        await frame()
        await frame()
        node?.dispatchEvent(
          new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }),
        )
        await frame()
        await frame()
      }
      await new Promise((resolve) => setTimeout(resolve, 2500))
    } else {
      const wrapper = document.querySelector('.react-transform-wrapper')
      const box = wrapper?.getBoundingClientRect()
      for (const deltaY of [...Array(20).fill(-60), ...Array(20).fill(60)]) {
        wrapper?.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY,
            clientX: (box?.left ?? 0) + (box?.width ?? 0) / 3,
            clientY: (box?.top ?? 0) + (box?.height ?? 0) / 3,
            bubbles: true,
            cancelable: true,
          }),
        )
        await frame()
      }
    }
    on = false
    await timing
    return frames
  }, act)

async function sample(browser: Browser, url: string, shape: string): Promise<Sample> {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  try {
    await page.goto(`${url}?shape=${shape}`)
    await page.waitForSelector('svg path', { timeout: 120_000 })
    await page.waitForTimeout(1000)
    // The first draw also loads and compiles the page; drawing again measures the graph alone.
    const mounted = await mount(page)
    // A graph of subworkflows is hovered and zoomed with all of them open.
    const expanded = await expand(page)
    const elements = await page.evaluate(() => document.querySelectorAll('*').length)
    await page.waitForTimeout(500)
    const hover = await framesDuring(page, 'hover')
    const zoom = await framesDuring(page, 'zoom')
    return {
      mount: mounted,
      ...(expanded !== undefined && { expand: expanded }),
      hoverMedian: quantile(hover, 0.5),
      hoverP90: quantile(hover, 0.9),
      hoverMax: Math.max(...hover),
      zoomMedian: quantile(zoom, 0.5),
      zoomP90: quantile(zoom, 0.9),
      elements,
    }
  } finally {
    await page.close()
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { rounds: { type: 'string', default: '3' }, out: { type: 'string' } },
})
const builds = positionals.map((arg) => {
  const [name = '', dir = ''] = arg.split('=')
  return { name, dir: resolve(dir) }
})
const executablePath =
  process.env['CHROME'] ??
  ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(
    existsSync,
  )
const browser = await chromium.launch({
  ...(executablePath && { executablePath }),
  args: ['--headless=new'],
})
const served = await Promise.all(
  builds.map(async (build) => ({ ...build, ...(await serve(build.dir)) })),
)
const variants: Variant[] = builds.map(({ name }) => ({
  name,
  samples: Object.fromEntries(SHAPES.map((shape) => [shape, []])),
}))
for (let round = 0; round < Number(values.rounds); round++) {
  for (const shape of SHAPES) {
    for (const [i, { name, url }] of served.entries()) {
      const taken = await sample(browser, url, shape)
      variants[i]?.samples[shape]?.push(taken)
      console.error(`round ${round + 1} ${shape} ${name}: ${JSON.stringify(taken)}`)
    }
  }
}
await browser.close()
for (const { server } of served) {
  server.close()
}
const head = variants.find((v) => v.name === 'head') ?? variants[0]
const base = variants.find((v) => v.name === 'base')
if (!head) {
  throw new Error('usage: node bench/run.ts head=<built dir> [base=<built dir>]')
}
const markdown = report(head, base)
if (values.out) {
  writeFileSync(values.out, markdown)
}
console.log(markdown)
