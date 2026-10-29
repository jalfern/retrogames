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
//
// Merged-PR paging: none — rates read CLOSED ISSUE lineage (`building` /
// `feedback`, newest-closed-first), 3 pages max. If GitHub is unreachable the
// script exits 1 without writing — telemetry then keeps the last good file, so
// the board shows last known runway rather than a hole.

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { computeRunway } from './lib/runway.mjs'

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
        '[.[] | {number, title, state, pull_request, body, created_at, labels: [.labels[].name]}]'])
    // Closed issues list newest-closed-first: page until a page is older
    // than the window (rates are coarse, so 3 pages = 300 closes is a cap,
    // and a lane shipping >300 items/14 d has a runway of hours anyway).
    // #1233: rows carry created_at + title + body-line too — the trend
    // reconstructs what the queue looked like each day, which needs to know
    // when each closed item was born and how big it was.
    const closed = (label) => {
        const rows = []
        for (let page = 1; page <= 3; page++) {
            const chunk = gh([`repos/${REPO}/issues?state=closed&labels=${label}&per_page=100&page=${page}`,
                '--jq', '[.[] | {closed_at, created_at, title, body: ((.body // "") | split("\\n")[0][:200])}]'])
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
if (outFile) writeFileSync(outFile, JSON.stringify(runway))
console.log(json ? JSON.stringify(runway) : runway.line)
