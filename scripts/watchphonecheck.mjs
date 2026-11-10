// watchphonecheck — #1656 phone-WATCH contract, browser-free (this box has no
// Chrome — #1622 lineage; the layout contract is proven from source geometry
// instead of pixels, and CI advisories carry the pixel side). For every title
// the registry advertises WATCH, the gate proves:
//   1. the in-play pill is phone-sized (≥44pt, solid emerald, top-anchored —
//      never under the touch pad, which owns the bottom band);
//   2. the attract screen carries its own ▶ WATCH (Space start + Y seat,
//      or a named, justified skip for multi-screen/no-attract titles);
//   3. PauseOverlay offers the WATCH row for watched titles;
//   4. the gate itself is wired (alias, ci.yml, checks.mjs CORE).
// Run: npm run watchphonecheck   (~1 s, no dev server, no browser)
import { readFileSync } from 'node:fs'
import { Report } from './lib/harness.mjs'

const R = new Report('watchphonecheck')
const ok = (cond, label) => R.check(label, cond)
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const PILL_MIN_H = 44

// ── registry: every title that advertises WATCH, mapped to its game dir ─────
const games = read('src/config/games.js')
const lazy = {}
for (const m of games.matchAll(/const (\w+) = (?:lazy\(\(\) => )?import\('\.\.\/games\/(\w+)'\)/g)) lazy[m[1]] = m[2]
for (const m of games.matchAll(/import \{([^}]+)\} from '\.\.\/games\/(\w+)'/g)) for (const n of m[1].split(',')) lazy[n.trim()] = m[2]
const entries = []
{
    let buf = null
    const flush = () => {
        if (!buf) return
        const comp = buf.match(/component: (\w+)/)?.[1]
        const dir = comp && lazy[comp]
        const p = buf.match(/path: '([^']+)'/)?.[1]
        if (dir && p && buf.includes('WATCH_HELP')) entries.push({ path: p, dir })
        buf = null
    }
    for (const line of games.split('\n')) {
        if (/^    \{/.test(line)) { flush(); buf = line; continue }
        if (buf != null) buf += '\n' + line
        if (/^    \},?$/.test(line)) flush()
    }
    flush()
}
ok(entries.length >= 56, `registry advertises WATCH on ${entries.length} titles (>=56 tripwire)`)
ok(new Set(entries.map((e) => e.dir)).size === entries.length, 'each WATCH title maps to exactly one game dir')

// Titles honestly without an attract ▶ WATCH — see PR #<this>. Multi-screen
// boots (title → hero-select) must not promise "watch" from a button that
// only inserts a coin; Zork has no attract screen at all.
const SKIP_ATTRACT = {
    Zork: 'no attract screen (vm boots into the story)',
    IronRing: 'title → fighter select (a WATCH tap would not land in a run)',
    Gauntlet: 'title → hero select',
    FourHalls: 'title → hero select',
    BombDefuse: 'title → crew select (a WATCH tap would stop at the picker; the attract already self-drives the solver demo)',
}

// ── shared chrome ─────────────────────────────────────────────────────────────
const pill = read('src/components/WatchButton.jsx')
const h = Number(pill.match(/height: (\d+)/)?.[1] ?? 0)
const mw = Number(pill.match(/minWidth: (\d+)/)?.[1] ?? 0)
ok(h >= PILL_MIN_H && mw >= 96, `pill is phone-sized (${h}px tall >= ${PILL_MIN_H}, min width ${mw})`)
ok(/bg-emerald-500 border-emerald-200 text-white/.test(pill), 'off state is solid emerald (not white/10 glass)')
ok(pill.includes("'▶ WATCH'") && pill.includes("'◼ TAKE'"), 'button text contract preserved (watchcheck reads it)')
ok(pill.includes('data-watch-toggle="1"'), 'in-play pill keeps data-watch-toggle (takeover listeners)')

const attract = pill.match(/export const AttractWatchButton[\s\S]*?\n\}/)?.[0] || ''
ok(attract.includes('data-watch-attract="1"'), 'AttractWatchButton exists with data-watch-attract')
ok(/fire\('keydown', 'Space'/.test(attract) && /fire\('keyup', 'Space'/.test(attract), 'attract tap dispatches Space (shell any-key start)')
ok(/setTimeout\([\s\S]*?fire\('keydown', WATCH_KEY/.test(attract), 'attract tap seats the watcher (KeyY) after the run is up')
ok(attract.includes('e.stopPropagation()'), 'attract tap stopPropagations (no double tap-to-start)')
ok(/style=\{PILL\}/.test(attract), 'attract button shares the phone-size pill geometry')

const pause = read('src/components/PauseOverlay.jsx')
ok(pause.includes('data-watch-pause="1"'), 'PauseOverlay has the WATCH row')
ok(/gameHasWatch\(game\)/.test(pause), 'WATCH row gated on the registry (watched titles only)')
ok(pause.includes('onResume()'), 'pause WATCH resumes before seating')
ok(/onResume\(\)[\s\S]*?fire\('keydown', WATCH_KEY/.test(pause), 'pause WATCH seats the watcher after resume')
ok(pause.includes('min-h-[44px] mt-2'), 'pause WATCH row is touch-sized')

const wj = read('src/utils/watch.js')
ok(/export const gameHasWatch/.test(wj) && wj.includes("startsWith('Y / WATCH')"), 'gameHasWatch keys off WATCH_HELP')
ok(wj.includes("WATCH_KEY = 'KeyY'"), 'WATCH key contract unchanged')

// ── per-title contract ────────────────────────────────────────────────────────
let mounted = 0
for (const { path, dir } of entries) {
    const src = read(`src/games/${dir}/index.jsx`)
    const short = path.replace('/', '')
    // in-play pill: mounted, !paused-scoped, top-anchored (never in the pad band)
    const wi = src.indexOf('<WatchButton')
    ok(wi >= 0, `${short}: in-play pill mounted`)
    if (wi >= 0) {
        // window around the pill's wrapper, minus any attract block inserted above it (#1656)
        const around = src.slice(Math.max(0, wi - 600), wi)
            .replace(/\{\/\* #1656[\s\S]*?<\/div>\s*\)\}/g, '')
        ok(/!paused|padOn|attractUi/.test(around), `${short}: pill hides behind pause/attract screens`)
        // clear of the pad: top-anchored, or bottom lifted past the stick's
        // reach (vpadSize: stick ≈ 2.14·btn ≤ 180 px ≈ 11.5rem + margin).
        // Accept both plain rem and the safe-area calc form (#1653p1 law).
        const b = around.match(/bottom: '(?:calc\()?([\d.]+)rem/)
        ok(!/bottom:/.test(around) || (b && Number(b[1]) >= 12), `${short}: pill clear of the pad band`)
    }
    // attract button
    if (SKIP_ATTRACT[dir]) {
        ok(!src.includes('AttractWatchButton'), `${short}: attract WATCH skipped — ${SKIP_ATTRACT[dir]}`)
        continue
    }
    mounted++
    ok(src.includes('<AttractWatchButton'), `${short}: attract ▶ WATCH mounted`)
    const ai = src.indexOf('<AttractWatchButton')
    const ab = src.slice(Math.max(0, ai - 400), ai + 200)
    ok(/(screen|phase) === 'attract'|attractUi/.test(ab), `${short}: attract button scoped to the attract screen`)
    ok(ab.includes("bottom: '24%'"), `${short}: attract button sits in the clear band above the pad zone`)
    ok(ab.includes('z-[70]'), `${short}: attract button stacks above the attract overlay`)
    if (src.includes('net.active') || src.includes('netUi')) {
        ok(/!net\.active|!netUi/.test(ab), `${short}: net play excludes the attract WATCH (no guide online)`)
    }
}
ok(mounted === entries.length - Object.keys(SKIP_ATTRACT).length,
    `attract WATCH on ${mounted} titles = all advertised minus the named skips`)

// ── self-wiring ───────────────────────────────────────────────────────────────
ok(JSON.parse(read('package.json')).scripts.watchphonecheck === 'node scripts/watchphonecheck.mjs', 'npm alias registered')
ok(read('.github/workflows/ci.yml').includes('npm run watchphonecheck'), 'ci.yml runs it (static job)')
ok(read('scripts/checks.mjs').includes("'watchphonecheck'"), 'checks.mjs CORE lists it')

R.exit()
