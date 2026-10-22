// dailylog.mjs — THE DAILY LOG generator (#516).
//
// Builds log.json — one entry per day covering the previous 24 h, cut at
// 07:00 America/Los_Angeles (DST-safe), newest first — and pushes it to
// jalfern/forge-telemetry next to board.json, so the SPA reads it over the
// same anonymous CDN pipe (no Vercel build-quota burn, no API limit in the
// browser). Headlines are PR/issue titles: script-generated, never model prose.
//
// Run from origin/main by the launchd telemetry job (stdin, like telemetry.sh):
//   git -C ~/Dev/retrogames show origin/main:scripts/dailylog.mjs | DAILYLOG_PUSH=1 node --input-type=module -
// Manual:  DAILYLOG_PUSH=1 node scripts/dailylog.mjs   (or without the env to dry-run to /tmp)
//
// Self-contained on purpose (zero imports): launchd pipes it to node on stdin,
// where relative imports cannot resolve. The pure core (window math, entry
// building, games.js parsing) is exported for scripts/dailylogcheck.mjs, which
// pins every rule against fixtures without touching the network.
//
// Sections per day:
//   shipped   merged PRs in the window; screenshots attached from the
//             docs/shots/issue-<n>/ convention (the QA lane's own layout).
//   stalled   explicit `STALLED:` titles active in the window, plus `building`
//             issues silent for the whole day (no comment at all).
//   regressed `static` failed on main in the window (required-check failures;
//             advisory failures are listed under their run but flagged advisory).
//   waiting   PRs open >30 min at window end; issues parked on Jon
//             (`waiting-jon`/`needs-approval`) with activity in the window.
//
// Public gate (#379): PRs whose title matches a registry game with explicit
// `visibility: 'private'` are dropped — not cleared for public. Untagged
// legacy entries are what the site already serves, so they stay in.
//
// Honest gaps: GitHub stores no label history, so historical `waiting`/
// `stalled` membership reconstructs from created/merged/comment timestamps
// (exact for the newest completed day, approximate further back); screenshots
// only exist where the QA lane committed docs/shots/issue-<n>/.

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const REPO = 'repos/jalfern/retrogames'
const OUT = 'repos/jalfern/forge-telemetry'
const TZ = 'America/Los_Angeles'
const CUTOFF_HOUR = 7
const HISTORY_DAYS = 14
const RAW_BASE = 'https://raw.githubusercontent.com/jalfern/retrogames/main/'

// ---------- pure core (pinned by dailylogcheck.mjs) ----------

const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

export function pacificParts(ts) {
    const p = {}
    for (const { type, value } of fmt.formatToParts(new Date(ts))) p[type] = +value
    return p
}

export function ptDateOf(ts) {
    const p = pacificParts(ts)
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

// UTC ms of CUTOFF_HOUR:00 Pacific on the Pacific calendar day that contains
// ts. Iterative offset solve: converge local-wall == target; two passes
// suffice because 07:00 is never ambiguous across a US DST flip.
export function cutoffFor(ts) {
    const { year, month, day } = pacificParts(ts)
    const wallTarget = Date.UTC(year, month - 1, day, CUTOFF_HOUR, 0, 0)
    let guess = wallTarget
    for (let i = 0; i < 3; i++) {
        const p = pacificParts(guess)
        const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
        const offset = wall - guess
        if (offset === 0) break
        guess = wallTarget - offset
    }
    return guess
}

// UTC ms of the cutoff starting the Pacific day `day` ('YYYY-MM-DD').
export function cutoffUTC(day) {
    const [y, m, d] = day.split('-').map(Number)
    return cutoffFor(Date.UTC(y, m - 1, d, 12, 0, 0))
}

export const normalizeTitle = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')

// Parse src/config/games.js text -> labels of games explicitly private.
// Brace-counted walk over the GAMES array; no imports, tolerant of nesting.
export function parsePrivateLabels(src) {
    const start = src.indexOf('export const GAMES')
    if (start < 0) return []
    const open = src.indexOf('[', start)
    let depth = 1, objStart = -1
    const blocks = []
    for (let i = open; i < src.length; i++) {
        const c = src[i]
        if (c === '{') { if (depth === 1 && objStart < 0) objStart = i; depth++ }
        else if (c === '}') { depth--; if (depth === 1 && objStart >= 0) { blocks.push(src.slice(objStart, i)); objStart = -1 } }
        else if (c === ']' && depth === 1) break
    }
    return blocks
        .filter(b => /visibility:\s*'private'/.test(b))
        .map(b => (b.match(/^ {4,}label:\s*'([^']+)'/m) || [])[1])
        .filter(Boolean)
}

export const isPrivateTitle = (title, privates) => {
    const t = normalizeTitle(title)
    return privates.some(l => t.includes(normalizeTitle(l)))
}

const refsOf = text => {
    const out = new Set()
    for (const m of (text || '').matchAll(/#(\d{2,4})/g)) out.add(+m[1])
    return [...out]
}

// shots: array of { path } docs trees -> { issueNumber: [rawUrl,...] }
export function shotsByIssue(files) {
    const map = {}
    for (const f of files) {
        const m = f.path.match(/^docs\/shots\/issue-(\d+)\/(.+\.(?:png|jpe?g|gif|webp))$/i)
        if (!m) continue
        const n = +m[1]
        ;(map[n] ??= []).push(RAW_BASE + f.path)
    }
    return map
}

// One day's sections from already-windowed raw data. Pure.
export function buildSections({ prsInWindow = [], openIssues = [], runsInWindow = [], jobsByRun = {}, commentsByIssue = {}, shots = {}, privates = [], windowStart = null, windowEnd = null }) {
    const shipped = prsInWindow
        .filter(p => p.merged_at && !isPrivateTitle(p.title, privates))
        .map(p => {
            const own = [p.number, ...refsOf(`${p.title}\n${p.body || ''}`)]
            const imgs = [...new Set(own.flatMap(n => shots[n] || []))].slice(0, 4)
            return { number: p.number, title: p.title.split('\n')[0], url: p.html_url, shots: imgs }
        })
        .sort((a, b) => b.number - a.number)

    const silentAllDay = n => {
        const cs = (commentsByIssue[n] || []).filter(t => t >= windowStart && t < windowEnd)
        return cs.length === 0
    }
    const stalled = openIssues
        .filter(i => i.title.startsWith('STALLED:') && Date.parse(i.updated_at) <= windowEnd)
        .map(i => ({ number: i.number, title: i.title, url: i.html_url, note: 'stalled' }))
    for (const i of openIssues) {
        if (!(i.labels || []).some(l => l.name === 'building')) continue
        if (Date.parse(i.created_at) >= windowEnd || stalled.some(s => s.number === i.number)) continue
        if (silentAllDay(i.number)) {
            const last = (commentsByIssue[i.number] || []).slice(-1)[0]
            stalled.push({ number: i.number, title: i.title, url: i.html_url, note: last ? `last checkpoint ${new Date(last).toISOString().slice(0, 16)}Z` : 'no checkpoint yet' })
        }
    }

    const regressed = runsInWindow
        .filter(r => r.event === 'push' && r.conclusion === 'failure')
        .map(r => {
            const jobs = jobsByRun[r.id] || []
            const req = jobs.find(j => j.name === 'static')
            // rule 3: only the required check is a regression; a flaky advisory
            // suite (or an unrecoverable jobs payload) is flagged, not counted.
            return { run: r.run_number, title: (r.head_commit?.message || '').split('\n')[0].slice(0, 90), url: r.html_url, advisory: !(req && req.conclusion === 'failure') }
        })

    const waiting = openIssues
        .filter(i => (i.labels || []).some(l => l.name === 'waiting-jon' || l.name === 'needs-approval')
            && Date.parse(i.updated_at) <= windowEnd)
        .map(i => ({ number: i.number, title: i.title, url: i.html_url, kind: 'issue' }))
    if (windowEnd) {
        for (const p of prsInWindow) {
            if (p.merged_at) continue
            if (windowEnd - Date.parse(p.created_at) > 30 * 60 * 1000) waiting.push({ number: p.number, title: p.title.split('\n')[0], url: p.html_url, kind: 'pr' })
        }
    }

    const trouble = stalled.length + regressed.filter(r => !r.advisory).length
    const headline = `${shipped.length} shipped · ${trouble} stalled/regressed · ${waiting.length} waiting on Jon`
    return { headline, shipped, stalled, regressed, waiting }
}

// Full log document from fetched inputs. `now` injected — the harness pins it.
export function buildLog({ now, pulls = [], issues = [], runs = [], jobsByRun = {}, commentsByIssue = {}, treeFiles = [], privates = [] }) {
    const shots = shotsByIssue(treeFiles)
    const today = ptDateOf(now)
    const todayCutoff = cutoffFor(now)
    const openIssues = issues.filter(i => !i.pull_request)
    const openPrs = pulls.filter(p => p.state === 'open' && !p.merged_at)
    const merged = pulls.filter(p => p.merged_at)

    const dayWindows = []
    let start = todayCutoff
    for (let d = 0; d < HISTORY_DAYS; d++) {
        const end = start
        // noon back from a 07:00 cutoff is always the previous Pacific day
        // (days are 23-25 h around a DST flip, never < 19 h).
        start = cutoffUTC(ptDateOf(start - 12 * 3600 * 1000))
        dayWindows.push({ day: ptDateOf(start), start, end })
    }

    const entry = (day, winStart, winEnd, live) => {
        const sections = buildSections({
            prsInWindow: [...merged.filter(p => Date.parse(p.merged_at) >= winStart && Date.parse(p.merged_at) < winEnd),
                ...openPrs.filter(p => Date.parse(p.created_at) >= winStart && Date.parse(p.created_at) < winEnd)],
            openIssues, runsInWindow: runs.filter(r => Date.parse(r.created_at) >= winStart && Date.parse(r.created_at) < winEnd),
            jobsByRun, commentsByIssue, shots, privates, windowStart: winStart, windowEnd: live ? now : winEnd,
        })
        return { day, start: new Date(winStart).toISOString(), end: new Date(winEnd).toISOString(), live: !!live, ...sections }
    }

    const live = entry(today, todayCutoff, now, true)
    const entries = dayWindows.map(w => entry(w.day, w.start, w.end, false))
    return {
        generated: new Date(now).toISOString(),
        tz: TZ, cutoffHour: CUTOFF_HOUR, days: HISTORY_DAYS,
        live, entries,
    }
}

// ---------- network shell (runs only under DAILYLOG_PUSH=1) ----------

const gh = (...args) => JSON.parse(execFileSync('gh', ['api', ...args, '--jq', '.'], { maxBuffer: 32 * 1024 * 1024 }).toString())

// One page is NOT enough (#525): with sort=updated, the 100 most-recently
// updated closed PRs all live in the last ~2 days on a fast-moving repo, so
// merged_at coverage collapsed to zero for older days in the window. Walk
// pages until updates fall out of the window (updated_at >= merged_at, so
// every PR merged in-window has been updated in-window too).
export function fetchClosedPulls(since, api, maxPages = 10) {
    const all = []
    for (let page = 1; page <= maxPages; page++) {
        const batch = api(`${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`) || []
        all.push(...batch)
        const last = batch[batch.length - 1]
        if (batch.length < 100 || !last || last.updated_at < since) break
    }
    return all.filter(p => !p.merged_at || p.merged_at >= since)
}

async function main() {
    const now = Date.now()
    const since = new Date(cutoffUTC(ptDateOf(now)) - HISTORY_DAYS * 24 * 3600 * 1000).toISOString()
    const openIssuesRaw = gh(`${REPO}/issues?state=open&per_page=100`)
    const pullsRaw = fetchClosedPulls(since, gh)
    const pullsOpen = gh(`${REPO}/pulls?state=open&per_page=50`)
    const pulls = [...pullsOpen, ...pullsRaw]
    const runs = gh(`${REPO}/actions/runs?branch=main&event=push&created=%3E${since}&per_page=100`).workflow_runs || []
    const jobsByRun = {}
    for (const r of runs.filter(x => x.conclusion === 'failure').slice(0, 10)) {
        try {
            jobsByRun[r.id] = (gh(`${REPO}/actions/runs/${r.id}/jobs?per_page=30`).jobs || [])
                .map(j => ({ name: j.name, conclusion: j.conclusion }))
        } catch { jobsByRun[r.id] = [] }
    }
    const buildingNums = openIssuesRaw.filter(i => (i.labels || []).some(l => l.name === 'building') || i.title.startsWith('STALLED:')).map(i => i.number)
    const commentsByIssue = {}
    for (const n of buildingNums.slice(0, 5)) {
        const total = (gh(`${REPO}/issues/${n}`)?.comments) || 0
        const page = Math.max(1, Math.ceil(total / 100))
        commentsByIssue[n] = (gh(`${REPO}/issues/${n}/comments?per_page=100&page=${page}`) || [])
            .map(c => Date.parse(c.created_at))
    }
    const tree = (gh(`${REPO}/git/trees/main?recursive=1`).tree || []).filter(t => t.type === 'blob' && t.path.startsWith('docs/'))
    const privates = parsePrivateLabels(await (await fetch(RAW_BASE + 'src/config/games.js')).text())

    const log = buildLog({ now, pulls, issues: openIssuesRaw, runs, jobsByRun, commentsByIssue, treeFiles: tree, privates })

    if (!process.env.DAILYLOG_PUSH) {
        writeFileSync('/tmp/forge/dailylog-preview.json', JSON.stringify(log, null, 1))
        console.log('dry-run: /tmp/forge/dailylog-preview.json', log.live.headline)
        return
    }
    const data = Buffer.from(JSON.stringify(log)).toString('base64')
    const body = { message: 'board', content: data, branch: 'main' }
    let sha = ''
    try {
        sha = execFileSync('gh', ['api', `${OUT}/contents/log.json?ref=main`, '--jq', '.sha'], { encoding: 'utf8' }).trim()
    } catch { /* first write */ }
    if (/^[0-9a-f]{40}$/.test(sha)) body.sha = sha
    execFileSync('gh', ['api', '-X', 'PUT', `${OUT}/contents/log.json`, '--input', '-'], { input: JSON.stringify(body) })
    console.log('daily log pushed:', log.live.headline)
}

// Direct run (`node scripts/dailylog.mjs`) always runs — dry without
// DAILYLOG_PUSH. Under launchd the file arrives via stdin, so the env flag
// is what fires main there; the harness imports the module and fires neither.
const DIRECT = (process.argv[1] || '').endsWith('dailylog.mjs')
if (DIRECT || process.env.DAILYLOG_PUSH) await main()
