// tsc emits specifiers verbatim, so its declarations keep the extensionless
// form src/ uses, which node16/nodenext consumers reject. Vite does this for
// the JavaScript; this does it for the declarations.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const DIST = resolve(import.meta.dirname, '../dist')

function declarations(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      out.push(...declarations(p))
    } else if (name.endsWith('.d.ts')) {
      out.push(p)
    }
  }
  return out
}

function exists(p) {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

// The path group must also accept a bare '.' or '..'.
const SPECIFIER = /((?:from|import)\s*\(?\s*)(['"])(\.\.?(?:\/[^'"]*)?)\2/g

let rewritten = 0
const unresolved = []

for (const file of declarations(DIST)) {
  const src = readFileSync(file, 'utf8')
  const out = src.replace(SPECIFIER, (match, pre, quote, spec) => {
    if (/\.(js|json|css)$/.test(spec)) {
      return match
    }
    // No directory imports exist, so guessing an index would hide a mistake.
    if (!exists(`${resolve(dirname(file), spec)}.d.ts`)) {
      unresolved.push(`${file}: ${spec}`)
      return match
    }
    rewritten++
    return `${pre}${quote}${spec}.js${quote}`
  })
  if (out !== src) {
    writeFileSync(file, out)
  }
}

if (unresolved.length > 0) {
  console.error(`Could not resolve ${unresolved.length} declaration specifier(s):`)
  for (const u of unresolved) {
    console.error(`  ${u}`)
  }
  process.exit(1)
}

console.log(`Rewrote ${rewritten} declaration specifiers.`)
