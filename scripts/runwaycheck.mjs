// RUNWAY — "N days of queued work left" per lane (#1201), pinned offline.
//
//   npm run runwaycheck
//
// Two layers, like jonqcheck:
//   A. scripts/lib/runway.mjs (pure) — size classes decide S before L,
//      rates are closes-in-window (zero closes = null = `?`, never a made-up
//      number), days round to half-day buckets with Jon's own examples exact
//      ("~2.5 days queued · ~0.5 day"), a non-empty lane never reads "~0
//      days", under-a-day is amber, empty queue is the polish fallback said
//      out loud, computeRunway classifies lanes off labels (PR rows and
//      stalled/needs-approval never count), the digest body carries the
//      questions plus the runway line, the 7-day trend history (#1233) is
//      one sample per UTC day (same-day re-sample replaces, ascending,
//      capped, junk-safe) and the Builder platform/games split prices each
//      sub-queue at the SHARED one-worker rate;
//   B. the wiring — telemetry.sh materialises the estimator from origin/main
//      and attaches it to board.json, scripts/runway.mjs appends the trend
//      sample per run, ForgeBoard renders the strip (tone from floor.js
//      runwayBadge), the math reveal, the 7-day sparkline and the split
//      (all from floor.js pure text), jonq.mjs has `digest`, checks.mjs +
//      ci.yml + package.json carry the alias. Source-level tripwires: delete
//      the board attach from telemetry.sh or the history append from
//      runway.mjs and this goes red.
//
// Mutant proof (required one): flip AMBER_UNDER_DAYS in scripts/lib/runway.mjs
// from 1 to 0 -> every amber fixture goes red. Verified by hand.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
    AMBER_UNDER_DAYS, HISTORY_DAYS, SIZES, computeRunway, digestText,
    estimateIssue, fmtDays, historyAppend, historyPoint, laneRunway,
    runwayLine, shipRate, sizeClass, splitRunway,
} from './lib/runway.mjs'
import { runwayBadge, runwayMath, runwayTrend, sparkline } from '../src/pages/floor.js'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const eq = (got, want, m) => ok(got === want, `${m}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

const NOW = Date.parse('2026-10-29T12:00:00Z')
const daysAgo = (d) => new Date(NOW - d * 86400e3).toISOString()
const issue = (n, title, labels, body = '') => ({
    number: n, title, state: 'open', html_url: `https://github.com/x/y/issues/${n}`,
    labels: labels.map((name) => ({ name })), body,
})

section('A. pure core')
// size classes: S decides first, then L, else M
eq(sizeClass(issue(1, 'QA — SSX: fix audio on grind', ['feedback'])), 'S', 'polish/fix titles are S')
eq(sizeClass(issue(2, 'GAME — MYST: open-world 3D cathedral', ['game-queue'])), 'L', 'open-world/3d titles are L')
eq(sizeClass(issue(3, 'GAME — FROGGER', ['game-queue'])), 'M', 'default is M')
eq(sizeClass(issue(4, 'PLATFORM', ['game-queue'], 'Put a runway number at the top')), 'M', 'body first line joins the class call')
eq(estimateIssue(issue(5, 'x', ['game-queue'], 'multiplayer versus mode')), SIZES.L, 'estimate follows the class')
ok(SIZES.S < SIZES.M && SIZES.M < SIZES.L, 'S < M < L')

// fmtDays: Jon's examples verbatim + honest null + clamp
eq(fmtDays(null), '~?', 'no rate reads ?, never invented')
eq(fmtDays(0), '~0.5 day', 'clamped floor is half a day, never "~0 days"')
eq(fmtDays(0.4), '~0.5 day', '0.4 -> ~0.5 day (Jon\'s singular)')
eq(fmtDays(1), '~1 day', 'one is singular')
eq(fmtDays(1.3), '~1.5 days', '1.3 rounds to 1.5 plural')
eq(fmtDays(2.5), '~2.5 days', 'Jon\'s example plural')

// shipRate: real timestamps in window; misses and junk are null-safe
eq(shipRate([daysAgo(1), daysAgo(3), daysAgo(7), daysAgo(9), daysAgo(11), daysAgo(12), daysAgo(13)], { now: NOW }), 0.5, '7 closes / 14 d = 0.5 per day')
eq(shipRate([daysAgo(20), daysAgo(30)], { now: NOW }), null, 'all outside the window = null')
eq(shipRate([], { now: NOW }), null, 'no closes = null, not 0')
eq(shipRate(['nonsense', daysAgo(2)], { now: NOW }), 1 / 14, 'junk timestamps are ignored, valid ones count')

// laneRunway: the amber rule, the polish fallback, the honest null
{
    const b = laneRunway({ items: [issue(10, 'A', []), issue(11, 'B', [])], ratePerDay: 1 })
    eq(b.size, 1.6, 'two M items = 1.6 size')
    eq(b.amber, false, '1.6 days at 1/day is not amber')
    const s = laneRunway({ items: [issue(12, 'fix audio', [])], ratePerDay: 1 })
    eq(s.amber, true, 'under a day is amber')
    const p = laneRunway({ items: [], ratePerDay: 2 })
    eq(p.polish, true, 'empty queue is the polish fallback')
    eq(p.amber, false, 'polish is not amber — it is a different state')
    const n = laneRunway({ items: [issue(13, 'B', [])], ratePerDay: null })
    eq(n.days, null, 'no rate -> null days')
    eq(n.amber, false, 'unknown is never coloured amber')
}

// laneRunway.mix (#1233): the per-item S/M/L breakdown behind the total size —
// this is what the strip's reveal shows, so the number can be read apart.
{
    const mixed = laneRunway({ items: [issue(30, 'fix audio', []), issue(31, 'GAME — MYST open-world 3D', []), issue(32, 'GAME — FROGGER', [])], ratePerDay: 1 })
    eq(JSON.stringify(mixed.mix), JSON.stringify({ S: 1, M: 1, L: 1 }), 'mix counts each item by its size class')
    eq(mixed.size, 0.4 + 1.5 + 0.8, 'size is exactly the sum the mix explains')
    eq(mixed.items, 3, 'item count still rides alongside the mix')
    eq(JSON.stringify(laneRunway({ items: [], ratePerDay: 1 }).mix), JSON.stringify({ S: 0, M: 0, L: 0 }), 'an empty lane has an empty mix, not a missing one')
    eq(JSON.stringify(laneRunway({ items: [issue(33, 'A', []), issue(34, 'B', [])], ratePerDay: 0.5 }).mix), JSON.stringify({ S: 0, M: 2, L: 0 }), 'two plain items are two M')
}

// historyPoint / historyAppend (#1233): the 7-day trend the strip's sparkline
// draws — one sample per UTC day, same-day re-samples REPLACE (the tail reads
// as now), the list is ascending and capped, and junk degrades, never throws.
{
    const pt = historyPoint({ builder: { days: 2.5 }, qa: { days: null } }, '2026-10-29')
    eq(pt.d, '2026-10-29', 'a sample is keyed by its UTC day')
    eq(pt.b, 2.5, 'the builder day-count rides the sample')
    eq(pt.q, null, 'a lane with no rate rides null, not a made-up 0')
    eq(historyPoint(null, '2026-10-29').b, null, 'a missing runway degrades to nulls')

    let h = []
    for (const [d, b, q] of [['2026-10-25', 4, 1], ['2026-10-26', 3, 1], ['2026-10-27', 3, 0.5], ['2026-10-28', 2, 0.5], ['2026-10-29', 3.5, 0.5]])
        h = historyAppend(h, { d, b, q })
    eq(h.length, 5, 'five distinct days append five samples')
    eq(h[0].d, '2026-10-25', 'the list stays date-ascending')

    h = historyAppend(h, { d: '2026-10-27', b: 9, q: 1 })
    eq(h.length, 5, 'a same-day re-sample replaces, does not grow the list')
    eq(h.find((p) => p.d === '2026-10-27').b, 9, 'the re-sample carries the NEW value')

    let long = []
    for (let i = 0; i < 9; i++) long = historyAppend(long, { d: `2026-10-${String(20 + i).padStart(2, '0')}`, b: 1, q: 1 })
    eq(long.length, HISTORY_DAYS, 'the window is capped at HISTORY_DAYS (7)')
    eq(long[0].d, '2026-10-22', 'the oldest days fall off the left, the newest stay')

    eq(historyAppend(null, { d: '2026-10-29', b: 1, q: 1 }).length, 1, 'a missing file starts a one-sample history')
    eq(historyAppend('corrupt', { d: '2026-10-29', b: 1, q: 1 }).length, 1, 'a corrupt file degrades to empty, never throws')
    const junky = historyAppend([{ d: 'junk' }, 'x', null, { d: '2026-10-28', b: 2, q: 2 }], { d: '2026-10-29', b: 1, q: 1 })
    eq(junky.length, 2, 'junk entries are dropped, real ones kept')
    eq(junky[0].d, '2026-10-28', 'a bad `d` cannot poison the sort order')
}

// splitRunway (#1233): the Builder lane is ONE worker shared by platform and
// games, so the split prices each sub-queue at the SHARED full-lane rate and
// the two day-counts sum to the lane's days. Unlabeled = games (default job);
// `lane:platform` opts out.
{
    const items = [
        issue(40, 'PLATFORM: robot sim kit (SimReady)', ['building', 'lane:platform']),
        issue(41, 'GAME — FROGGER', ['game-queue']),
        issue(42, 'GAME — MYST: open-world 3D', ['game-queue']),
    ]
    const s = splitRunway(items, 1)
    eq(s.platform.items, 1, 'lane:platform items bucket to platform')
    eq(s.games.items, 2, 'unlabeled items bucket to games (the builder\'s default job)')
    eq(s.platform.size, SIZES.L, 'platform size is its own items only')
    eq(s.games.size, SIZES.M + SIZES.L, 'games size is its own items only')
    eq(s.platform.days, SIZES.L, 'platform days are priced at the SHARED lane rate')
    eq(s.games.days, SIZES.M + SIZES.L, 'games days are priced at the SHARED lane rate')
    ok(Math.abs(s.platform.days + s.games.days - (s.platform.size + s.games.size)) < 0.02,
        'at 1/day the split\'s days sum to the lane\'s total size (one worker)')
    eq(splitRunway(items, null).platform.days, null, 'no rate -> null split days, never invented')
    eq(splitRunway([], 1).platform.items, 0, 'an empty lane splits into two empty buckets')
}

// the line: symmetric per-lane shape ("something like" per the brief)
eq(runwayLine({
    builder: { days: 2.5, polish: false },
    qa: { days: 0.5, polish: false },
}), 'Builder: ~2.5 days queued · QA: ~0.5 day queued', 'line keeps Jon\'s numbers, half-day buckets and singular day')
eq(runwayLine({
    builder: { days: 0.6, polish: false },
    qa: { days: null, polish: false },
}), 'Builder: ~0.5 day queued · QA: ~? (no recent ships) queued', 'unknown rate says so in words')
eq(runwayLine({
    builder: { days: 0, polish: true },
    qa: { days: 0.5, polish: false },
}), 'Builder: polish-only — self-directed · QA: ~0.5 day queued', 'polish fallback is explicit')

// computeRunway: lanes off labels; PRs, stalled and needs-approval excluded
{
    const issues = [
        issue(20, 'GAME — BIG OPEN-WORLD 3D QUEST', ['game-queue', 'lane:games']),
        issue(21, 'PLATFORM: forge runway', ['building', 'lane:platform']),
        issue(22, 'GAME — SLEEPER', ['game-queue', 'stalled']),
        issue(23, 'QA — thing', ['feedback']),
        issue(24, 'QA — other', ['building-qa']),
        issue(25, 'QA — outsider', ['feedback', 'needs-approval']),
        { number: 26, title: 'a PR looking like an issue', state: 'open', pull_request: {}, labels: [{ name: 'game-queue' }] },
    ]
    const closedBuilder = [1, 3, 5, 7, 9, 11, 13].map(daysAgo).map((closed_at) => ({ closed_at }))
    const r = computeRunway({ issues, closedBuilder, closedQa: [1, 3, 4, 6].map(daysAgo).map((closed_at) => ({ closed_at })), now: NOW })
    eq(r.builder.items, 2, 'stalled and PR-shaped rows stay out of the builder queue')
    eq(r.builder.rate, 0.5, 'builder rate = building-closes per day')
    eq(r.qa.items, 2, 'needs-approval stays out of QA')
    eq(r.qa.rate, 0.29, 'qa rate = feedback-closes per day, rounded to 2 dp')
    ok(r.line.startsWith('Builder: ~4.5 days queued'), `big open-world L + building M at 0.5/day reads ~4.5 days (${r.line})`)
    eq(r.builder.lanes.platform.items, 1, 'computeRunway splits the builder lane off the lane: label')
    eq(r.builder.lanes.games.items, 1, 'the game-queue item stays in the games bucket')
    eq(r.builder.lanes.platform.size, SIZES.M, 'the platform bucket prices its own item only')
    eq(r.builder.lanes.platform.days, SIZES.M / 0.5, 'the split prices platform days at the shared lane rate')
    eq(r.qa.lanes, undefined, 'the QA lane carries no split (it has no sub-queues)')
    const cold = computeRunway({ issues, closedBuilder: [], closedQa: [], now: NOW })
    ok(cold.line.includes('~?'), 'no closes anywhere -> both lanes read ?', cold.line)
}

// digest body: header, questions, runway line last
{
    const d = digestText({
        questions: [{ number: 30, title: 'Rider 5 body?', state: 'AWAITING', lane: 'games', deadline: daysAgo(-2), defaultText: 'keep the duplicate' }],
        runway: { line: 'Builder: ~2.5 days queued · QA: ~0.5 day queued' },
        now: new Date(NOW),
    })
    ok(d.startsWith('FORGE QUESTIONS DIGEST — 2026-10-29'), 'digest is titled + dated')
    ok(d.includes('#30 [AWAITING] lane:games — Rider 5 body?'), 'question row carries number/state/lane')
    ok(d.includes('default: keep the duplicate'), 'default rides along')
    ok(d.trimEnd().endsWith('⏱ Builder: ~2.5 days queued · QA: ~0.5 day queued'), 'the runway line closes the digest (#1201)')
    ok(digestText({ questions: [] }).includes('(no open questions)'), 'quiet board prints a quiet digest')
    ok(!digestText({ questions: [], runway: null }).includes('⏱'), 'offline digest omits the runway line honestly')
}

section('B. wiring')
const pkg = JSON.parse(read('../package.json'))
ok(pkg.scripts.runwaycheck === 'node scripts/runwaycheck.mjs', 'package.json carries the runwaycheck alias')
ok(read('./checks.mjs').includes("'runwaycheck'"), 'checks.mjs CORE includes runwaycheck (nightly replay)')
ok(read('../.github/workflows/ci.yml').includes('npm run runwaycheck'), 'ci.yml runs runwaycheck on the static job')
const tele = read('./telemetry.sh')
ok(tele.includes('/tmp/forge/lib/runway.mjs') && tele.includes('runway-run.mjs'), 'telemetry.sh materialises runway + lib from origin/main (stdin cannot: relative imports resolve against /)')
ok(tele.includes("board['runway']"), 'telemetry.sh attaches runway to board.json')
ok(tele.includes('/tmp/forge/runway.json'), 'telemetry.sh reads the runway file the board ships')
const rw = read('./runway.mjs')
ok(rw.includes('historyAppend') && rw.includes('historyPoint'), 'runway.mjs appends the 7-day trend sample per run (#1233)')
ok(rw.includes('RUNWAY_HISTORY'), 'the history path is env-overridable (offline test hook)')
ok(rw.includes('runway.history = history'), 'the history rides the runway.json the board ships (no telemetry.sh change: the attach is whole-object)')
const board = read('../src/pages/ForgeBoard.jsx')
ok(board.includes('runwayBadge') && board.includes('data-runway'), 'ForgeBoard renders the runway strip via the shared badge')
ok(board.includes('setRunway(d.runway ?? null)'), 'ForgeBoard reads runway off board.json')
ok(board.includes('runwayMath') && board.includes('data-runway-reveal'), 'ForgeBoard reveals the runway math on hover/tap (#1233)')
ok(board.includes('setRunwayOpen') && board.includes('onMouseEnter') && board.includes('onClick'), 'the strip toggles its reveal (desktop hover + touch tap)')
ok(board.includes('runwayTrend') && board.includes('data-runway-trend') && board.includes('sparkline'), 'ForgeBoard renders the 7-day trend sparkline from floor.js (#1233)')
ok(board.includes('data-runway-split') && board.includes('splitLine'), 'ForgeBoard renders the Builder platform/games split in the reveal (#1233)')
const jq = read('./jonq.mjs')
ok(jq.includes("case 'digest'") && jq.includes('digestText'), 'jonq.mjs gained the digest command (#1201 email body)')
ok(jq.includes('ask|sweep|list|halt|steer|claim|digest'), 'usage line mentions digest')

// the board's colour mapping: amber decision rides from the lib, stale dims
eq(runwayBadge(null), null, 'no runway data draws nothing')
eq(runwayBadge({ line: 'x' }, NOW).tone, 'green', 'a healthy line is green')
eq(runwayBadge({ line: 'x', builder: { amber: true } }, NOW).tone, 'amber', 'one amber lane colours the whole strip')
eq(runwayBadge({ line: 'x', qa: { polish: true } }, NOW).tone, 'violet', 'polish fallback is violet, not alarming')
eq(runwayBadge({ line: 'x', generated: daysAgo(2) }, NOW).tone, 'dim', 'hours-old data dims')
eq(runwayBadge({ line: 'x' }, NOW).text, 'x', 'the strip shows the lib\'s line verbatim')

// runwayMath (#1233): the reveal's per-lane data — pure, and defensive on the
// old board.json schema (no `mix`), since the board renders whatever the
// telemetry machine last baked and that lags this branch until after merge.
{
    const full = runwayMath({
        builder: { items: 2, size: 2.7, mix: { S: 1, M: 1, L: 1 }, rate: 1, days: 2.7, amber: false, polish: false,
            lanes: { platform: { items: 1, size: 0.8, days: 0.8 }, games: { items: 1, size: 1.9, days: 1.9 } } },
        qa: { items: 4, size: 2.4, mix: { S: 0, M: 4, L: 0 }, rate: 15.93, days: 0.2, amber: true, polish: false },
    })
    eq(full.length, 2, 'one reveal row per lane')
    eq(full[0].name, 'Builder', 'the first row is the builder lane')
    eq(full[1].name, 'QA', 'the second row is the QA lane')
    eq(JSON.stringify(full[0].mix), JSON.stringify({ S: 1, M: 1, L: 1 }), 'the S/M/L mix rides the reveal data')
    eq(full[1].rate, 15.93, 'the two rates ride the reveal')
    eq(full[1].amber, true, 'the amber flag rides the reveal')
    eq(JSON.stringify(full[0].lanes), JSON.stringify({ platform: { items: 1, size: 0.8, days: 0.8 }, games: { items: 1, size: 1.9, days: 1.9 } }),
        'the platform/games split rides the builder row (#1233)')
    eq(full[1].lanes, null, 'the QA lane has no split to ride')
    // old schema (no mix) degrades to a null mix and keeps the rest — never throws
    const oldSchema = runwayMath({ builder: { items: 1, size: 1.5, rate: 0.43, days: 3.5 }, qa: { items: 4, size: 2.4, rate: 15.93, days: 0.2, amber: true } })
    eq(oldSchema[0].mix, null, 'a missing mix degrades to null (pre-#1233 board.json)')
    eq(oldSchema[0].items, 1, 'the item count survives the old schema (reveal fallback)')
    eq(oldSchema[0].lanes, null, 'a missing lanes block degrades to null (pre-split board.json)')
    eq(oldSchema[1].days, 0.2, 'days survive the old schema')
    eq(oldSchema[1].amber, true, 'amber survives the old schema')
    eq(runwayMath(null).length, 0, 'no runway draws no reveal rows')
    eq(runwayMath({ builder: null, qa: null }).length, 0, 'null lanes are filtered, not rendered')
}

// runwayTrend + sparkline (#1233): the 7-day sparkline as pure data + pure
// text. Old board.json has no `history` (no trend row), a lane without a
// number rides null (a blank cell, never zero), and each lane normalises to
// its OWN max so a quiet lane still uses the full glyph range.
{
    const full = runwayTrend({ history: [
        { d: '2026-10-28', b: 2, q: 0.5 },
        { d: '2026-10-29', b: 3.5, q: null },
    ] })
    eq(full.length, 2, 'one trend row per persisted day')
    eq(full[1].date, '2026-10-29', 'the rows keep their UTC day key')
    eq(full[1].builder, 3.5, 'the tail carries the newest builder reading')
    eq(full[1].qa, null, 'a lane with no number rides null, not a made-up 0')
    eq(runwayTrend({}).length, 0, 'old board.json (no history) draws no trend')
    eq(runwayTrend(null).length, 0, 'no runway draws no trend')
    eq(runwayTrend({ history: [{ d: 'junk' }, 'x', null, { d: '2026-10-29', b: 'nope', q: 1 }] }).length, 1, 'junk samples are dropped, real ones kept')

    eq(sparkline([1, 2, null, 4]), '▃▅ █', 'cells scale to the lane\'s own max, null = blank')
    eq(sparkline([4]), '█', 'a lone sample is the full block')
    eq(sparkline([2, 2, 2]), '███', 'equal samples fill the range evenly')
    eq(sparkline([0, 4]), '▁█', 'zero is the shortest bar, not blank')
    eq(sparkline([null, null]), '  ', 'all-null days leave blank cells')
    eq(sparkline([]), '', 'an empty window draws nothing')
}

console.log(`\x1b[1m\nrunwaycheck: ${pass} gates, ${fails.length} failures\x1b[0m`)
for (const f of fails) console.error(`FAIL ${f}`)
process.exit(fails.length ? 1 : 0)
