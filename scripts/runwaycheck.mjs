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
//      stalled/needs-approval never count), and the digest body carries the
//      questions plus the runway line;
//   B. the wiring — telemetry.sh materialises the estimator from origin/main
//      and attaches it to board.json, ForgeBoard renders the strip (tone from
//      floor.js runwayBadge), jonq.mjs has `digest`, checks.mjs + ci.yml +
//      package.json carry the alias. Source-level tripwires: delete the board
//      attach from telemetry.sh and this goes red.
//
// Mutant proof (required one): flip AMBER_UNDER_DAYS in scripts/lib/runway.mjs
// from 1 to 0 -> every amber fixture goes red. Verified by hand.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
    AMBER_UNDER_DAYS, SIZES, TREND_DAYS, computeRunway, digestText, estimateIssue,
    fmtDays, laneRunway, laneTrend, runwayLine, shipRate, sizeClass,
} from './lib/runway.mjs'
import { runwayBadge, runwayMath, runwayTrend } from '../src/pages/floor.js'

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

// laneTrend (#1233): the sparkline data — days-per-lane reconstructed for the
// last TREND_DAYS days. Membership at a snapshot = items that existed then
// (open + closed-since); rate = closes in the window ENDING that day; no
// closes in a window = null point (a gap, never a lie).
{
    ok(TREND_DAYS === 7, 'the trend spans a week')
    const open = [
        { number: 40, title: 'GAME — FROGGER', body: '', created_at: daysAgo(25) },
        { number: 41, title: 'GAME — FROGGER', body: '', created_at: daysAgo(25) },
        { number: 42, title: 'GAME — FROGGER', body: '', created_at: daysAgo(2) },
    ]
    const closed = [4, 6, 8, 10].map((d) => ({ title: 'GAME — DONE', body: '', created_at: daysAgo(30), closed_at: daysAgo(d) }))
    const tr = laneTrend({ openItems: open, closed, now: NOW })
    eq(tr.length, 7, 'seven daily points, oldest first')
    eq(tr[6].days, 8.4, 'today: three open M at 4 closes/14 d = 8.4 days')
    eq(tr[0].days, 11.2, 'six days back: C1 still a member (closed later), 3 closes in window = 11.2')
    eq(tr[2].days, 5.6, 'four days back: C1 just closed out, two old M = 5.6')
    eq(tr[4].days, 8.4, 'two days back: the fresh item joined, rate 4/window = 8.4')
    ok(tr.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.t)), 'every point carries a plain date')
    const cold = laneTrend({ openItems: open, closed: [], now: NOW })
    ok(cold.every((p) => p.days === null), 'no closes anywhere = a week of honest nulls')
    const born = laneTrend({ openItems: [{ number: 43, title: 'GAME — X' }], closed: [], now: NOW })
    eq(born[0].days, null, 'unknown created_at still counts as existing (rate null keeps it honest)', born[0])
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
const board = read('../src/pages/ForgeBoard.jsx')
ok(board.includes('runwayBadge') && board.includes('data-runway'), 'ForgeBoard renders the runway strip via the shared badge')
ok(board.includes('setRunway(d.runway ?? null)'), 'ForgeBoard reads runway off board.json')
ok(board.includes('runwayMath') && board.includes('data-runway-reveal'), 'ForgeBoard reveals the runway math on hover/tap (#1233)')
ok(board.includes('setRunwayOpen') && board.includes('onMouseEnter') && board.includes('onClick'), 'the strip toggles its reveal (desktop hover + touch tap)')
ok(board.includes('runwayTrend') && board.includes('data-runway-sparkline'), 'ForgeBoard draws the 7-day trend sparklines in the reveal (#1233)')
ok(board.includes('polyline') && board.includes('shrinking'), 'the sparkline is drawn (SVG) and says which way the queue is moving')
ok(read('./runway.mjs').includes('created_at'), 'the IO half fetches created_at — the trend reconstructs membership, not guesses')
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
        builder: { items: 2, size: 2.7, mix: { S: 1, M: 1, L: 1 }, rate: 1, days: 2.7, amber: false, polish: false },
        qa: { items: 4, size: 2.4, mix: { S: 0, M: 4, L: 0 }, rate: 15.93, days: 0.2, amber: true, polish: false },
    })
    eq(full.length, 2, 'one reveal row per lane')
    eq(full[0].name, 'Builder', 'the first row is the builder lane')
    eq(full[1].name, 'QA', 'the second row is the QA lane')
    eq(JSON.stringify(full[0].mix), JSON.stringify({ S: 1, M: 1, L: 1 }), 'the S/M/L mix rides the reveal data')
    eq(full[1].rate, 15.93, 'the two rates ride the reveal')
    eq(full[1].amber, true, 'the amber flag rides the reveal')
    // old schema (no mix) degrades to a null mix and keeps the rest — never throws
    const oldSchema = runwayMath({ builder: { items: 1, size: 1.5, rate: 0.43, days: 3.5 }, qa: { items: 4, size: 2.4, rate: 15.93, days: 0.2, amber: true } })
    eq(oldSchema[0].mix, null, 'a missing mix degrades to null (pre-#1233 board.json)')
    eq(oldSchema[0].items, 1, 'the item count survives the old schema (reveal fallback)')
    eq(oldSchema[1].days, 0.2, 'days survive the old schema')
    eq(oldSchema[1].amber, true, 'amber survives the old schema')
    eq(runwayMath(null).length, 0, 'no runway draws no reveal rows')
    eq(runwayMath({ builder: null, qa: null }).length, 0, 'null lanes are filtered, not rendered')
}

// computeRunway carries the trend for both lanes (#1233): seven points each,
// and today's point must equal the live number — the reconstruction ends where
// the strip's "~N days" begins, or the sparkline would contradict its own
// headline and the whole reveal loses trust.
{
    const issues = [
        issue(50, 'GAME — BIG QUEST', ['game-queue']),
        issue(51, 'QA — fix audio', ['feedback']),
    ]
    const closed = (d) => ({ closed_at: daysAgo(d), created_at: daysAgo(d + 20), title: 'GAME — DONE', body: '' })
    const r = computeRunway({
        issues,
        closedBuilder: [closed(2), closed(8), closed(10), closed(12)],
        closedQa: [closed(2)],
        now: NOW,
    })
    eq(r.trend.builder.length, 7, 'the builder lane carries seven trend points')
    eq(r.trend.qa.length, 7, 'the QA lane carries seven trend points')
    eq(r.trend.builder[6].days, r.builder.days, 'today\'s trend point equals the live runway number')
    eq(r.trend.qa[6].days, r.qa.days, 'same on QA — the line and its headline never disagree')
    ok(r.trend.builder[0].days > r.builder.days, 'older points reflect the extra work still queued back then')
    const dry = computeRunway({ issues, closedBuilder: [], closedQa: [], now: NOW })
    ok(dry.trend.builder.every((p) => p.days === null), 'a lane with no recent ships trends as ?s, not zeros')
}

// runwayTrend (#1233): the board's sparkline rows — pure, hole-preserving,
// and honest about the direction word.
{
    ok(runwayTrend(null).length === 0, 'no runway data draws no trend rows')
    ok(runwayTrend({ builder: {}, qa: {} }).length === 0, 'pre-trend board.json degrades to nothing (schema lags until merge)')
    ok(runwayTrend({ trend: { builder: null, qa: null } }).length === 0, 'null lanes are filtered, not rendered')
    const t = runwayTrend({ trend: {
        builder: [{ t: '2026-10-23', days: 4 }, { t: '2026-10-24', days: null }, { t: '2026-10-25', days: 2 }],
        qa: [{ t: '2026-10-23', days: 1 }, { t: '2026-10-24', days: 1.5 }, { t: '2026-10-25', days: 2.5 }],
    } })
    eq(t.length, 2, 'one sparkline row per lane')
    eq(JSON.stringify(t[0].points), JSON.stringify([4, null, 2]), 'null days stay holes in the line, never zero')
    eq(t[0].delta, 'shrinking', 'fewer days left than a week ago is shrinking')
    eq(t[1].delta, 'growing', 'more days left is growing')
    eq(runwayTrend({ trend: { builder: [{ t: 'a', days: 3 }, { t: 'b', days: 3.2 }] } })[0].delta, 'flat', 'a drift under half a day is flat')
    ok(runwayTrend({ trend: { builder: [{ t: 'a', days: null }, { t: 'b', days: 2 }] } }).length === 0, 'one known point is not a trend')
    eq(runwayTrend({ trend: { builder: [{ t: 'a', days: 5 }, { t: 'b', days: 4 }, { t: 'c', days: null }] } })[0].delta, 'shrinking', 'the direction reads across a trailing hole')
}

console.log(`\x1b[1m\nrunwaycheck: ${pass} gates, ${fails.length} failures\x1b[0m`)
for (const f of fails) console.error(`FAIL ${f}`)
process.exit(fails.length ? 1 : 0)
