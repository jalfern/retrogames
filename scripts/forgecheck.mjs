// THE FORGE FLOOR — the board's animation, proven at the DOM level in Node.
//
//   npm run forgecheck              # derive + render fixtures, assert the HTML
//   npm run forgecheck -- --dump    # print the rendered HTML for fixture "full"
//
// Why this shape: the issue asked for a harness that renders "at the DOM level
// in the existing verify suite (node + the board's state plumbing)". So the
// harness imports the board's OWN derivation (src/pages/floor.js), bundles the
// board's OWN component with the esbuild Vite already ships, renders it with
// react-dom/server (MemoryRouter so real <Link href>s are produced), and
// asserts against the resulting HTML. No dev server, no browser, ~0.5 s.
//
// The lies this specifically cannot tell (each is an assertion below):
//   - a queue card for something not in the queue (shipped/building leak in)
//   - a green gate while a PR is in checks
//   - a fire lit by a dead warden (stale pulse = dark, not spark)
//   - a cart rolling without a pulse proving a building->shipped flip
//   - shelf carts that do not equal the fetched `shipped` label count

import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const dump = process.argv.includes('--dump')

// Absolute imports so the entry can live inside node_modules (gitignored,
// regenerated every run) without a relative dance.
const ENTRY = join(root, 'src', 'pages')
const entry = `
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import FactoryFloor from ${JSON.stringify(join(ENTRY, 'FactoryFloor.jsx'))}
import { deriveFloor, shortName } from ${JSON.stringify(join(ENTRY, 'floor.js'))}
export { deriveFloor, shortName }
export const render = data => renderToStaticMarkup(
    <MemoryRouter><FactoryFloor floor={deriveFloor(data)} /></MemoryRouter>)
`
const bundle = join(root, 'node_modules', '.forgecheck-entry.mjs')
writeFileSync(join(root, 'node_modules', '.forgecheck-entry.src.jsx'), entry)
await build({
    entryPoints: [join(root, 'node_modules', '.forgecheck-entry.src.jsx')],
    absWorkingDir: root,
    outfile: bundle,
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    // react-dom/server is CJS and require()s node builtins at load.
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
    logLevel: 'silent',
})
const mod = await import(pathToFileURL(bundle).href)
const { render, deriveFloor, shortName } = mod

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = s => console.log(`\x1b[1m${s}\x1b[0m`)
const count = (html, attr) => (html.match(new RegExp(`${attr}=`, 'g')) || []).length

// ---------------------------------------------------------------- fixtures ----
const NOW = Date.parse('2026-10-10T12:00:00Z')
const issue = (n, title, labels, state = 'open') => ({
    number: n, title, state, pull_request: undefined,
    html_url: `https://github.com/jalfern/retrogames/issues/${n}`,
    labels: labels.map(name => ({ name })),
})
const pulse = (minsAgo, { shipped = 2, building = 1, gate = 'none' } = {}) => ({
    id: minsAgo,
    body: `12:0${minsAgo % 10} alive=yes queue=9 building=${building} shipped=${shipped} main=abc1234 gate=${gate} actions=none`,
    updated_at: new Date(NOW - minsAgo * 60000).toISOString(),
})
const pr = (n = 108) => ({ number: n, title: 'Add thing', html_url: `https://github.com/jalfern/retrogames/pull/${n}` })

const QUEUED = [
    issue(71, 'GAME 07 — Galaga', ['game-queue']),
    issue(72, 'GAME 08 — Polarity Shooter (Ikaruga-like)', ['game-queue']),
    issue(99, 'GAME 99 — From An Unlabeled Submitter', []),
]
const OTHER = [
    issue(70, 'GAME 06 — Ice Climber Co-op', ['shipped'], 'closed'),
    issue(103, 'GAME 16 — Forge Conveyor (factory floor visualization)', ['building']),
    issue(80, 'QA — mario: firebar clipping', ['feedback']),
]
const FULL = { issues: [...QUEUED, ...OTHER], prs: [pr()], pulses: [pulse(4), pulse(20, { shipped: 1 })], now: NOW }

// ----------------------------------------------------------- zero data -------
section('ZERO DATA (the board must render honestly with nothing)')
{
    const html = render({ issues: [], prs: [], pulses: [], now: NOW })
    ok(html.includes('data-floor="1"'), 'empty data rendered no floor at all')
    ok(count(html, 'data-queue-card') === 0, 'queue has cards with no issues')
    ok(html.includes('data-queue-empty'), 'empty queue bin does not say so')
    ok(html.includes('data-shelf-empty'), 'empty shelf does not say "nothing forged yet"')
    ok(html.includes('data-gate="clear"'), 'gate is not clear with no PRs and no pulse')
    ok(html.includes('data-anvil="dark"'), 'anvil is lit with no building issue and no warden pulse')
    ok(!html.includes('data-cart='), 'a cart rolled with no pulses at all')
    ok(!html.includes('NaN') && !html.includes('undefined'), 'empty render leaked NaN/undefined into the DOM')
    const nul = render({ issues: null, prs: [], pulses: [], now: NOW })
    ok(nul.includes('data-floor="1"'), 'floor crashed on issues=null (pre-first-fetch state)')
}

// ---------------------------------------------------- queue: N cards, N issues -
section('QUEUE BIN (N cards for N issues, oldest first)')
{
    const html = render(FULL)
    ok(count(html, 'data-queue-card') === 3, `expected 3 queue cards for 3 queued issues, got ${count(html, 'data-queue-card')}`)
    ok(!html.includes('Galaga</div>') || html.indexOf('Galaga') < html.indexOf('Polarity'), 'queue is not oldest-first')
    ok(html.includes('From An Unlab…'),
        'unlabeled GAME issue (board title rule) did not become a card')
    ok(!html.includes('▸ Ice Climber') && !html.includes('▸ Forge Conveyor') && !html.includes('▸ mario'),
        'a shipped/building/feedback issue leaked into the queue bin')
    const d = deriveFloor(FULL)
    ok(!d.queued.some(i => i.number === 70 || i.number === 103 || i.number === 80),
        'derive queued the shipped/building/feedback issue into the queue')
}

// ------------------------------------------------------------- CI gate --------
section('CI GATE (color follows PR state, not optimism)')
{
    const clear = render({ issues: [], prs: [], pulses: [pulse(20)], now: NOW })
    ok(clear.includes('data-gate="clear"'), 'gate busy with no PR and gate=none pulse')
    const busy = render(FULL)
    ok(busy.includes('data-gate="busy"'), 'gate clear while PR #108 is open — the lie this check exists for')
    ok(busy.includes('PR #108'), 'gate busy but never showed the PR number')
    const pulsesGate = render({ issues: [], prs: [], pulses: [pulse(20, { gate: 'red' })], now: NOW })
    ok(pulsesGate.includes('data-gate="busy"') && pulsesGate.includes('red'), 'gate ignored a pulse reporting gate=red')
}

// ---------------------------------------------------------------- anvil -------
section('ANVIL (lit only by a builder or a FRESH warden pulse)')
{
    const glow = deriveFloor({ issues: [issue(103, 'GAME 16 — X', ['building'])], prs: [], pulses: [], now: NOW }).anvil
    ok(glow.glow && glow.dark === false && glow.building === 'X', 'building issue did not light the forge')
    const spark = deriveFloor({ issues: [], prs: [], pulses: [pulse(4)], now: NOW }).anvil
    ok(spark.spark && !spark.dark, 'a 4-minute-old pulse did not spark the anvil (<15 min is fresh)')
    const dark = deriveFloor({ issues: [], prs: [], pulses: [pulse(30)], now: NOW }).anvil
    ok(dark.dark && !dark.glow && !dark.spark, 'anvil is NOT dark while the warden is silent 30 min — dark-by-a-dead-warden is the honesty clause')
    const boundary = deriveFloor({ issues: [], prs: [], pulses: [pulse(15)], now: NOW }).anvil
    ok(!boundary.spark, '15-minute-old pulse counted as fresh — <15 min is strict')
    ok(deriveFloor(FULL).anvil.building === 'Forge Conveyor', 'anvil does not name the issue under construction')
}

// --------------------------------------------------------- conveyor/cart ------
section('CONVEYOR (a cart rolls ONLY on a pulse-proven building->shipped flip)')
{
    const flip = deriveFloor({ issues: [], prs: [], pulses: [pulse(2, { shipped: 3 }), pulse(18, { shipped: 2 })], now: NOW })
    ok(flip.cart && flip.cart.count === 1, 'shipments went 2->3 between pulses but no cart rolled')
    const flat = deriveFloor({ issues: [], prs: [], pulses: [pulse(2, { shipped: 3 }), pulse(18, { shipped: 3 })], now: NOW })
    ok(!flat.cart, 'a cart rolled with NO shipped-flip in the pulses')
    const lone = deriveFloor({ issues: [], prs: [], pulses: [pulse(2, { shipped: 9 })], now: NOW })
    ok(!lone.cart, 'a single pulse with no predecessor proved a flip it cannot know about')
    const html = render(FULL)
    ok(html.includes('data-cart="1"') || !html.includes('data-cart'), 'cart attribute desynced from derived cart')
    ok(render({ ...FULL, pulses: [pulse(2, { shipped: 2 }), pulse(18, { shipped: 2 })] }).includes('CONVEYOR'),
        'conveyor stopped rendering when idle (the track is always there, the cart is not)')
}

// ------------------------------------------------- shelf + lamp-count truth ---
section('SHELF + COUNTS (carts = fetched `shipped` labels, cards = fetched queue)')
{
    const html = render(FULL)
    const d = deriveFloor(FULL)
    ok(count(html, 'data-shelf-car') === 1, `shelf shows ${count(html, 'data-shelf-car')} carts, fetched shipped count is 1`)
    ok(d.shipped.length === 1 && d.shipped[0].number === 70, 'shipped derivation lost the shipped issue')
    ok(html.includes('Ice Climber C…'), 'shipped cartridge does not carry a short name')
    ok(/href="\/retrogames\/games"|href="\/games"/.test(html), 'shelf cartridge is not a link to /games')
    const queues = render(FULL)
    ok(queues.includes('QUEUE BIN · 3') && queues.includes('SHELF · 1'), 'station count labels do not equal the derived counts')
}

// -------------------------------------------------------------- shortName -----
section('SHORT NAMES')
{
    ok(shortName('GAME 07 — Galaga') === 'Galaga', `shortName("GAME 07 — Galaga") = "${shortName('GAME 07 — Galaga')}"`)
    ok(shortName('GAME 08 — Polarity Shooter (Ikaruga-like)') === 'Polarity Shoo…',
        `parenthetical not trimmed: "${shortName('GAME 08 — Polarity Shooter (Ikaruga-like)')}"`)
    ok(shortName('QA — thing: broken') === 'QA — thing: b…',
        `non-GAME title should truncate at 14, got "${shortName('QA — thing: broken')}"`)
    ok(shortName('') === '?', 'empty title must not render an empty cartridge')
}

if (dump) {
    console.log(render(FULL).replace(/><(?!\/)/g, '>\n<').slice(0, 4000))
}

console.log(`\n${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  \x1b[31mFAIL\x1b[0m ${f}`)
process.exit(fails.length ? 1 : 0)
