// BUILT BY — the arcade menu's attribution, proven at the DOM level in Node.
//
//   npm run builtbycheck
//
// Issue #172: the games list showed no indication of what built what
// (by hand with Qwen, from the Forge, with Claude). The fix is a `builtBy`
// field on every GAMES entry, rendered as a tag on each card. This check
// keeps it honest with the same trick as forgecheck: bundle the app's OWN
// modules with the esbuild Vite already ships, stub only the heavy game
// components (three.js/js-dos do not run in Node), and assert on the result.
//
// Two layers, both against the real code:
//   A. the registry itself — import src/config/games.js and assert every
//      entry (including hidden ones) carries a valid builtBy, and that the
//      three builders are all represented (a wholesale relabeling dies here);
//   B. the rendered menu — renderToStaticMarkup of the real GamesList and
//      assert one attribution tag per visible card, matching the registry
//      value per path (a card shipped with no tag, or a tag that lies about
//      its builder, fails the merge).
//
// ~1 s, no browser, in the static gate.

import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// Stub every game component: the registry imports 44 of them, and three.js /
// ifvms / js-dos are browser weight this check has no business loading. The
// stub must answer BOTH default imports (the lazy() wrappers) and named
// imports ({ ZorkI, ZorkII, ZorkIII }) — a Proxy answers anything.
const STUB = join(root, 'node_modules', '.builtby-stub.cjs')
writeFileSync(STUB, `module.exports = new Proxy({}, { get: (t, p) => p === 'default' ? () => null : () => null })\n`)

async function bundle(entrySrc, outfile) {
  writeFileSync(join(root, 'node_modules', outfile + '.src.jsx'), entrySrc)
  const src = join(root, 'node_modules', outfile + '.src.jsx')
  const out = join(root, 'node_modules', outfile)
  await build({
    entryPoints: [src],
    absWorkingDir: root,
    outfile: out,
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
    logLevel: 'silent',
    plugins: [{
      name: 'stub-games',
      setup(b) {
        b.onResolve({ filter: /(^|\.\.\/)games\// }, () => ({ path: STUB, external: false }))
        b.onResolve({ filter: /^\.\/games\// }, () => ({ path: STUB, external: false }))
      },
    }],
  })
  return pathToFileURL(out).href
}

const BUILT = ['qwen', 'forge', 'claude']

// --- layer A: the registry ---------------------------------------------
const A = await bundle(`
import { GAMES } from ${JSON.stringify(join(root, 'src', 'config', 'games.js'))}
export { GAMES }
`, '.builtby-A.mjs')
const { GAMES } = await import(A)

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }

ok(Array.isArray(GAMES) && GAMES.length > 0, `GAMES imported (${GAMES && GAMES.length} entries)`)
for (const g of GAMES) {
  ok(typeof g.path === 'string' && g.path.length > 0, `${g.label || '?'}: has a path`)
  if (!g.builtBy) {
    ok(false, `${g.path}: missing builtBy (every entry needs an attribution)`)
  } else {
    ok(BUILT.includes(g.builtBy), `${g.path}: builtBy '${g.builtBy}' is one of ${BUILT.join('/')}`)
  }
}
for (const b of BUILT) {
  ok(GAMES.some((g) => g.builtBy === b), `builder '${b}' is represented (a relabel of the whole list dies here)`)
}

// --- layer B: the rendered menu ----------------------------------------
const B = await bundle(`
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import GamesList from ${JSON.stringify(join(root, 'src', 'components', 'GamesList.jsx'))}
import { GAMES } from ${JSON.stringify(join(root, 'src', 'config', 'games.js'))}
export const html = () => renderToStaticMarkup(<MemoryRouter><GamesList /></MemoryRouter>)
export { GAMES }
`, '.builtby-B.mjs')
const { html, GAMES: GAMES2 } = await import(B)
const page = html()

const visible = GAMES2.filter((g) => !g.hidden)
const cards = page.match(/<a[^>]*href="[^"]+"[^>]*>/g) || []
const gameCards = cards.filter((c) => visible.some((g) => c.includes(`href="${g.path}"`)))
ok(gameCards.length === visible.length, `rendered ${gameCards.length} game cards for ${visible.length} visible entries`)

const tags = (page.match(/data-built-by="[^"]*"/g) || [])
ok(tags.length === visible.length, `rendered ${tags.length} attribution tags, expected one per visible card (${visible.length})`)

// per-card: exactly one tag, and it agrees with the registry for that path
for (const g of visible) {
  const i = gameCards.findIndex((c) => c.includes(`href="${g.path}"`))
  if (i < 0) { ok(false, `${g.path}: card missing from the rendered menu`); continue }
  const seg = page.slice(page.indexOf(gameCards[i]), page.indexOf('</a>', page.indexOf(gameCards[i])) + 4)
  const n = (seg.match(/data-built-by="/g) || []).length
  ok(n === 1, `${g.path}: card renders ${n} attribution tag(s), expected 1`)
  ok(seg.includes(`data-built-by="${g.builtBy}"`), `${g.path}: card shows '${g.builtBy}' (the registry says '${g.builtBy}')`)
}

for (const b of BUILT) {
  const want = visible.filter((g) => g.builtBy === b).length
  const got = (page.match(new RegExp(`data-built-by="${b}"`, 'g')) || []).length
  ok(got === want, `tag '${b}': ${got} rendered, ${want} in the registry`)
}

console.log(`builtbycheck: ${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  FAIL  ${f}`)
process.exit(fails.length ? 1 : 0)
