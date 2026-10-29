#!/usr/bin/env node
// runway — "N days of queued work left" per lane (#1201). IO half: gh in,
// JSON out. The math and the line format live in scripts/lib/runway.mjs
// (pure, pinned by npm run runwaycheck); nothing is invented here.
//
//   node scripts/runway.mjs              # print the line ("Builder: … · QA: …")
//   node scripts/runway.mjs --json     # full per-lane object
//   node scripts/runway.mjs --out f    # also write JSON to f (telemetry.sh
//                                      # drops it at /tmp/forge/runway.json and
//                                      # attaches it to board.json)
// The JSON also carries `history` — the 7-day trend (#1233), appended per run
// to $RUNWAY_HISTORY (default /tmp/forge/runway-history.json; /tmp is local,
// so a reboot refills the sparkline over seven days).
//
// Merged-PR paging: none — rates read CLOSED ISSUE lineage (`building` /
// `feedback`, newest-closed-first), 3 pages max. If GitHub is unreachable the
// script exits 1 without writing — telemetry then keeps the last good file, so
// the board shows last known runway rather than a hole.

import { execFileSync } from 'node:child_process'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { computeRunway, historyAppend, historyPoint } from './lib/runway.mjs'

const REPO = process.env.RUNWAY_REPO || 'jalfern/retrogames'

function gh(args) {
    return JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 }))
}

const argv = process.argv.slice(2)
const json = argv.includes('--json')
const outIdx = argv.indexOf('--out')
const outFile = outIdx >= 0 ? argv[outIdx + 1] : null

let issues, closedBuilder, closedQa
try {
    // --jq keeps payloads small: full objects blew execFileSync's default
    // buffer (ENOBUFS) at 300 rows.
    issues = gh([`repos/${REPO}/issues?state=open&per_page=100`, '--jq',
        '[.[] | {number, title, state, pull_request, body, labels: [.labels[].name]}]'])
    // Closed issues list newest-closed-first: page until a page is older
    // than the window (rates are coarse, so 3 pages = 300 closes is a cap,
    // and a lane shipping >300 items/14 d has a runway of hours anyway).
    const closed = (label) => {
        const rows = []
        for (let page = 1; page <= 3; page++) {
            const chunk = gh([`repos/${REPO}/issues?state=closed&labels=${label}&per_page=100&page=${page}`,
                '--jq', '[.[] | {closed_at}]'])
            rows.push(...chunk)
            if (chunk.length < 100) break
        }
        return rows
    }
    closedBuilder = closed('building')
    closedQa = closed('feedback')
} catch (e) {
    console.error(`runway: github fetch failed — ${String(e.message || e).slice(0, 120)}`)
    process.exit(1)
}

const runway = { generated: new Date().toISOString(), ...computeRunway({ issues, closedBuilder, closedQa, now: Date.now() }) }
// 7-day trend (#1233) — one sample per UTC day, appended here because this
// script is what the telemetry tick runs every 5 min. RUNWAY_HISTORY is the
// test hook (point it at a temp file); the default sits next to runway.json
// in /tmp/forge, so a failed write just means the sparkline won't grow.
const histPath = process.env.RUNWAY_HISTORY || '/tmp/forge/runway-history.json'
let history = []
try { history = JSON.parse(readFileSync(histPath, 'utf8')) } catch { /* first tick / missing / corrupt */ }
history = historyAppend(history, historyPoint(runway, new Date().toISOString().slice(0, 10)))
try {
    writeFileSync(histPath + '.tmp', JSON.stringify(history))
    renameSync(histPath + '.tmp', histPath)   // atomic: the next tick never reads a torn file
} catch { /* read-only FS: the strip still ships, the trend just won't grow */ }
runway.history = history
if (outFile) writeFileSync(outFile, JSON.stringify(runway))
console.log(json ? JSON.stringify(runway) : runway.line)
