// VISIBILITY TAG — the #379 registry contract, proven in Node.
//
//   npm run visibilitycheck
//
// The site will later split into public games and a login-gated vault. This
// prep PR only sets the contract: `visibility: 'public' | 'private'` on
// registry entries, missing means 'private', nothing reads the field yet, and
// only Jon promotes. This check keeps all four of those honest:
//
//   A. the registry (bundled with the esbuild Vite ships, game components
//      stubbed — the builtbycheck trick): every entry's visibility is absent
//      or exactly 'public'/'private', and NO entry is 'public' — the split is
//      unwired and every promotion is Jon's call, so a forge session that
//      auto-promotes a game dies here;
//   B. the field is provably unread: no code outside the registry uses a
//      `visibility: 'public'|'private'` key or a `.visibility` property
//      access (the DOM `visibilitychange`/`visibilityState` listeners are not
//      this field and pass);
//   C. the docs carry the rules: the registry header documents the contract
//      and scripts/FORGE.md tells new games to register 'private'.
//
// ~1 s, no browser.

import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const VIS = ['public', 'private']

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }

// --- layer A: the registry ---------------------------------------------
const STUB = join(root, 'node_modules', '.visibility-stub.cjs')
writeFileSync(STUB, `module.exports = new Proxy({}, { get: (t, p) => p === 'default' ? () => null : () => null })\n`)
const SRC = join(root, 'node_modules', '.visibility-A.src.jsx')
const OUT = join(root, 'node_modules', '.visibility-A.mjs')
writeFileSync(SRC, `import { GAMES } from ${JSON.stringify(join(root, 'src', 'config', 'games.js'))}\nexport { GAMES }\n`)
await build({
  entryPoints: [SRC],
  absWorkingDir: root,
  outfile: OUT,
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
const { GAMES } = await import(pathToFileURL(OUT).href)

ok(Array.isArray(GAMES) && GAMES.length > 0, `GAMES imported (${GAMES && GAMES.length} entries)`)
for (const g of GAMES) {
  ok(typeof g.path === 'string' && g.path.length > 0, `${g.label || '?'}: has a path`)
  if (g.visibility === undefined) {
    ok(true, `${g.path}: untagged — defaults to 'private' (missing means private)`)
  } else {
    ok(VIS.includes(g.visibility), `${g.path}: visibility '${g.visibility}' is one of ${VIS.join('/')}`)
    ok(g.visibility !== 'public', `${g.path}: not 'public' — the split is unwired and every promotion is Jon's call`)
  }
}
ok(GAMES.every((g) => g.visibility !== 'public'), `zero entries are 'public' before Jon's first promotion`)

// --- layer B: the field is unread outside the registry ----------------
function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.jsx?$/.test(e)) acc.push(p)
  }
  return acc
}
const REGISTRY = join(root, 'src', 'config', 'games.js')
const FORGE_MD = join(root, 'scripts', 'FORGE.md')
const KEY = /\bvisibility:\s*['"](public|private)['"]/
const ACCESS = /\.\s*visibility\b/
const readers = []
for (const f of walk(join(root, 'src'))) {
  if (f === REGISTRY) continue
  const text = readFileSync(f, 'utf8')
  for (const [i, line] of text.split('\n').entries()) {
    if (KEY.test(line) || ACCESS.test(line)) readers.push(`${relative(root, f)}:${i + 1}: ${line.trim().slice(0, 80)}`)
  }
}
ok(readers.length === 0, `nothing outside the registry reads the field (${readers.length} site(s)): ${readers.join(' | ') || 'no .visibility access, no visibility: key'}`)

// --- layer C: the docs carry the rules ---------------------------------
const regSrc = readFileSync(REGISTRY, 'utf8')
ok(/visibility:\s*'public'\s*\|\s*'private'/.test(regSrc), 'registry header documents the visibility field contract')
ok(/missing means\s*'private'/i.test(regSrc), "registry header states missing means 'private'")
const forgeSrc = readFileSync(FORGE_MD, 'utf8')
ok(/visibility:\s*'private'/.test(forgeSrc), "FORGE.md tells new games to register visibility: 'private'")
ok(/only Jon\s*\n?\s*promotes/i.test(forgeSrc) || /only Jon promotes/i.test(forgeSrc), 'FORGE.md reserves public promotion for Jon')

console.log(`visibilitycheck: ${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  FAIL  ${f}`)
process.exit(fails.length ? 1 : 0)
