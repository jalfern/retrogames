// shiftreport.mjs — THE SHIFT REPORT (#614).
//
// Builds report.json — a 48-hour control-room shift report for the factory,
// in the exact look of docs/forge/shift-report-ref.html — and pushes it to
// jalfern/forge-telemetry next to log.json/board.json, so the page at
// /retrogames/forge/report renders it over the same anonymous CDN pipe.
//
// Every NUMBER is computed here from GitHub + telemetry.json samples. The only
// model-written parts are the headline, the lede, the 3-4 "Notes from the
// forge" (#614) and the optional "Go look" picks (#647): a builder session
// supplies them at its end with
//   SHIFTREPORT_NOTES=notes.json node scripts/shiftreport.mjs
// (shape: {headline, lede, notes:[{tag:'w'|'h'|'k', text}],
//          look:[{text, href}]}) and this script
// carries those notes through every later 4 h regeneration until a session
// replaces them. Without notes the headline is script-generated
// ("N merges in 48 hours") — a fallback, never fake prose.
//
// Run from origin/main by the launchd telemetry job (every tick, self-gated to
// one run per 4 h via /tmp/forge/last-shiftreport):
//   git -C ~/Dev/retrogames show origin/main:scripts/shiftreport.mjs \
//     | SHIFTREPORT_PUSH=1 node --input-type=module -
// Manual dry-run: node scripts/shiftreport.mjs  ->  /tmp/forge/report-preview.json
//
// Self-contained on purpose (zero imports) — launchd pipes it to node on stdin.
// The pure core is exported for scripts/shiftreportcheck.mjs, which pins every
// rule against fixtures offline (npm run shiftreportcheck).
//
// Definitions (identical to the reference comment — keep them):
//   Window: last 48 h, America/Los_Angeles, 48 hour buckets keyed "MM-DDTHH".
//   Lane of a merged PR = head-branch prefix: forge… = builder, qa… = QA, else ops.
//   Builder idle band: last builder merge in the window until the next telemetry
//   sample with tasks.builder != null (window end when the builder never ran again).
//   Machines: samples rolled up per hour. mini/mbp busy fraction = whole-box
//   cpu > 60. Studio = mean load avg shaded against 16. Hours with no samples = null.
//   CI: Actions runs CREATED in the window — finished (not cancelled) count,
//   median/p90 run minutes, total wall-clock minutes (queue+run: the jobs-timing
//   API would cost one call per run for ~1% more accuracy), cancelled total and
//   on-push(main), main push failures, nightly runs + green, PRs closed unmerged.
//   Themes: merged PRs grouped by what they touched — registry game labels first
//   (longest title match), then demos / controls / factory / docs keyword rules,
//   else "Other merges". Private games (#379) never appear as a theme or in a
//   highlight sentence.
//   Go look (#647): the top 2 changes to try, one line each with a direct link.
//   Model picks them in notes.look (href must be a LIVE route — a registry game
//   or public/demos/<slug>.html — never a private game); with no model picks
//   they are computed from the window: games (registry label in a merged PR
//   title → /retrogames<path>) and demos (public/demos/<slug>.html named in a
//   merged PR title → /retrogames/demos/<slug>.html; the .html is real —
//   vercel.json has no cleanUrls, #809) ranked by merge count. Carried picks
//   die the moment none of their paths merged in the window (fall back to
//   computed, #809). Plumbing-only windows yield no picks.

const WINDOW_HOURS = 48
const TZ = 'America/Los_Angeles'
const STUDIO_CORES = 16
const REPO = 'repos/jalfern/retrogames'
const OUT = 'repos/jalfern/forge-telemetry'
const RAW_BASE = 'https://raw.githubusercontent.com/jalfern/retrogames/main/'
const TELEM_URL = 'https://raw.githubusercontent.com/jalfern/forge-telemetry/main/'

const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

export function pushContents({ readSha, put, warn = () => {} }) {
    // #645: the 4 h launchd tick can regenerate report.json between our sha
    // read and the Contents PUT (HTTP 409). Re-read the sha and retry up to
    // 3 attempts; a non-409 failure (or exhausting retries) rethrows.
    const isRace = e => /409/.test(String((e && e.stderr) || '') + String((e && e.message) || ''))
    for (let attempt = 1; ; attempt++) {
        let sha = ''
        try { sha = String(readSha() || '').trim() } catch { /* first write */ }
        try { put(sha); return attempt }
        catch (e) {
            if (attempt >= 3 || !isRace(e)) throw e
            warn(`push attempt ${attempt} lost the sha race (409) — re-reading sha`)
        }
    }
}

export function pacificParts(ts) {
    const p = {}
    for (const { type, value } of fmt.formatToParts(new Date(ts))) p[type] = +value
    return p
}

// "MM-DDTHH" bucket key for a UTC timestamp, in Pacific wall time.
export function hourKey(ts) {
    const p = pacificParts(ts)
    return `${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}`
}

// 48 contiguous bucket keys ending with the hour containing `now`.
export function hourKeys(now) {
    const keys = []
    for (let i = WINDOW_HOURS - 1; i >= 0; i--) keys.push(hourKey(now - i * 3600 * 1000))
    return keys
}

// Lane from head-branch name: forge… = builder, qa… = QA, everything else = ops.
export function laneOf(branch) {
    const b = (branch || '').toLowerCase()
    if (b.startsWith('forge')) return 'builder'
    if (b.startsWith('qa')) return 'qa'
    return 'ops'
}

const median = xs => {
    if (!xs.length) return null
    const s = [...xs].sort((a, b) => a - b)
    const m = s.length >> 1
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
export const medianMinutes = xs => {
    const m = median(xs)
    return m == null ? null : Math.round(m)
}
export const p90Minutes = xs => {
    if (!xs.length) return null
    const s = [...xs].sort((a, b) => a - b)
    return Math.round(s[Math.min(s.length - 1, Math.floor(0.9 * s.length))])
}

// 48 rows: [key, builder, qa, ops, miniPct|null, mbpPct|null, load|null].
// Same tuple shape as the reference's H array — the page renders it as-is.
export function buildRows({ pulls, samples, now }) {
    const keys = hourKeys(now)
    const idx = Object.fromEntries(keys.map((k, i) => [k, i]))
    const rows = keys.map(k => [k, 0, 0, 0, null, null, null])
    const touched = new Set()
    for (const p of pulls) {
        const at = idx[hourKey(Date.parse(p.merged_at))]
        if (at == null) continue
        const lane = laneOf(p.head?.ref || p.headBranch)
        rows[at][lane === 'builder' ? 1 : lane === 'qa' ? 2 : 3]++
        touched.add(at)
    }
    const buckets = {}
    for (const s of samples || []) {
        const at = idx[hourKey((s.ts || 0) * 1000)]
        if (at == null) continue
        const b = (buckets[at] ??= { n: 0, mini: 0, mbp: 0, load: 0, loadN: 0, builderSeen: false, builderBusy: null })
        b.n++
        if (s.tasks?.mini) { if (s.tasks.mini.cpu > 60) b.mini++ }
        if (s.tasks?.mbp) { if (s.tasks.mbp.cpu > 60) b.mbp++ }
        if (typeof s.load === 'number') { b.load += s.load; b.loadN++ }
        b.builderSeen = true
        if (s.tasks?.builder) b.builderBusy = (b.builderBusy ?? 0) + 1
    }
    for (const [at, b] of Object.entries(buckets)) {
        const r = rows[at]
        if (b.n) {
            r[4] = Math.round(b.mini / b.n * 100) / 100
            r[5] = Math.round(b.mbp / b.n * 100) / 100
            r[6] = b.loadN ? Math.round(b.load / b.loadN * 10) / 10 : null
        }
    }
    return { rows, idx, buckets, touched }
}

// Builder idle band: {start, end} bucket indices, or null.
// start = bucket of the last builder merge in the window (null when none);
// end   = bucket of the first sample after that merge with builder != null,
//         else the last bucket of the window (the builder never ran again).
export function idleBand({ rows, idx, buckets, pulls, samples, now }) {
    let lastMerge = null
    for (const p of pulls) {
        if (!p.merged_at) continue
        const t = Date.parse(p.merged_at)
        if (t > now) continue        // clock skew: a future merge is not idle data
        if (laneOf(p.head?.ref || p.headBranch) !== 'builder') continue
        if (lastMerge == null || t > lastMerge) lastMerge = t
    }
    if (lastMerge == null) return null
    const start = idx[hourKey(lastMerge)]
    if (start == null) return null
    for (const s of [...(samples || [])].filter(s => (s.ts || 0) * 1000 >= lastMerge).sort((a, b) => a.ts - b.ts)) {
        if (!s.tasks?.builder) continue
        const e = idx[hourKey(s.ts * 1000)]
        return e == null || e <= start ? null : { start, end: e }
    }
    return { start, end: WINDOW_HOURS - 1 }
}

// Machine heat rows for the Machines section (percent/busy fraction 0..1, null = no data).
export function machineRows(rows) {
    const frac = col => rows.map(r => r[col] == null ? null : r[col])
    return {
        mini: frac(4),
        mbp: frac(5),
        studio: rows.map(r => r[6] == null ? null : Math.min(r[6] / STUDIO_CORES, 1)),
        studioLoad: rows.map(r => r[6]),
    }
}

export function ciStats({ runs, pulls }) {
    const durMin = r => (Date.parse(r.updated_at) - Date.parse(r.created_at)) / 60000
    const finished = runs.filter(r => r.conclusion && r.conclusion !== 'cancelled')
    const minutes = finished.map(durMin)
    const cancelled = runs.filter(r => r.conclusion === 'cancelled')
    const nightly = runs.filter(r => /nightly|heist/i.test(r.name || ''))
    let closedUnmerged = 0
    for (const p of pulls) {
        if (p.state === 'closed' && !p.merged_at) closedUnmerged++
    }
    return {
        finished: finished.length,
        medianMin: medianMinutes(minutes),
        p90Min: p90Minutes(minutes),
        totalMin: Math.round(minutes.reduce((a, b) => a + b, 0)),
        cancelled: cancelled.length,
        cancelledMain: cancelled.filter(r => r.event === 'push').length,
        mainFails: runs.filter(r => r.event === 'push' && r.conclusion === 'failure').length,
        nightlyTotal: nightly.length,
        nightlyGreen: nightly.filter(r => r.conclusion === 'success').length,
        closedUnmerged,
    }
}

// ---------- themes ----------

export const normalizeTitle = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')

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

// Registry labels of PUBLIC games (label + display name) for theme matching.
export function parseGameLabels(src) {
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
        .filter(b => !/visibility:\s*'private'/.test(b))
        .map(b => (b.match(/^ {4,}label:\s*'([^']+)'/m) || [])[1])
        .filter(Boolean)
}

const KEYWORD_THEMES = [
    [/attract/i, 'Attract screens'],
    [/\b(demo|shore|ocean|webgpu|dawn)\b/i, 'WebGPU demos'],
    [/\b(gamepad|controller|virtual|touch|joystick|dpad|mobile|layout)\b/i, 'Controls and mobile'],
    [/\b(ci|warden|telemetry|board|report|deploy|vercel|launchd|workflow|harness|check|docs|readme)\b/i, 'Factory and site ops'],
]

export function themeOf(title, gameLabels) {
    const t = normalizeTitle(title)
    let best = null
    for (const g of gameLabels) {
        const n = normalizeTitle(g)
        if (n && t.includes(n) && (!best || n.length > best.length)) best = g
    }
    if (best) return { name: best, game: true }
    for (const [re, name] of KEYWORD_THEMES) if (re.test(title)) return { name, game: false }
    return { name: 'Other merges', game: false }
}

// A registry game earns its own theme only with MIN_GAME_PRS merges; smaller
// game counts fold into "Game polish, other titles" (the reference groups ~40
// titles under one umbrella).
const MIN_GAME_PRS = 3
const FOLD = 'Game polish, other titles'

// Themes: [{name, count, split:{builder,qa,ops}, text}] sorted by count desc.
export function buildThemes({ pulls, gameLabels, privates }) {
    const hidden = new Set(privates.map(normalizeTitle))
    const themes = new Map()
    const add = (name, lane, title) => {
        const th = themes.get(name) || { name, count: 0, split: { builder: 0, qa: 0, ops: 0 }, titles: [] }
        th.count++
        th.split[lane]++
        if (th.titles.length < 2) th.titles.push(title.split(' — ')[0].split(':')[1]?.trim() || title)
        themes.set(name, th)
    }
    const minor = []
    for (const p of pulls) {
        const title = String(p.title || '').split('\n')[0]
        if ([...hidden].some(h => h && normalizeTitle(title).includes(h))) continue
        const lane = laneOf(p.head?.ref || p.headBranch)
        const th = themeOf(title, gameLabels)
        if (th.game) minor.push({ th: th.name, lane, title })
        else add(th.name, lane, title)
    }
    const byGame = {}
    for (const m of minor) (byGame[m.th] ??= []).push(m)
    for (const [name, ms] of Object.entries(byGame)) {
        if (ms.length >= MIN_GAME_PRS) for (const m of ms) add(name, m.lane, m.title)
        else for (const m of ms) add(FOLD, m.lane, `${name}: ${m.title}`)
    }
    return [...themes.values()]
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .map(t => {
            const lanes = ['builder', 'qa', 'ops'].filter(k => t.split[k]).map(k => `${t.split[k]} ${k}`).join(', ')
            const clip = x => (x.length > 44 ? `${x.slice(0, 43)}…` : x)
            const body = t.titles.map(clip).join('; ')
            return {
                name: t.name, count: t.count, split: t.split,
                text: `${t.count} PR${t.count === 1 ? '' : 's'} (${lanes}): ${body}`,
            }
        })
}

// Registry entries of PUBLIC games ({label, path}) — go-look needs the path too.
export function parseGameEntries(src) {
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
        .filter(b => !/visibility:\s*'private'/.test(b))
        .map(b => ({
            label: (b.match(/^ {4,}label:\s*'([^']+)'/m) || [])[1],
            path: (b.match(/^ {4,}path:\s*'([^']+)'/m) || [])[1],
        }))
        .filter(e => e.label && e.path && e.path.startsWith('/'))
}

// ---------- go look (#647) ----------

const LOOK_LIMIT = 2
const LOOK_HREF = /^\/retrogames\/[a-z0-9._/-]+$/i
const clipLook = x => (x.length > 76 ? `${x.slice(0, 75)}…` : x)

// Model-written picks, validated: one line, an in-app /retrogames/… link,
// never a private game, at most LOOK_LIMIT. Invalid entries are dropped, not
// rendered — the box only ever shows something tryable. `routes` (a Set of
// live hrefs, see lookRoutes) additionally rejects any pick that would 404
// (#809: the demo links shipped without their .html).
export function validateLook(look, privates = [], routes) {
    const hidden = new Set(privates.map(normalizeTitle))
    const out = []
    for (const g of Array.isArray(look) ? look : []) {
        if (!g || out.length >= LOOK_LIMIT) continue
        const text = String(g.text || '').replace(/<[^>]*>/g, '').trim()
        const href = String(g.href || '').trim()
        if (!text || !LOOK_HREF.test(href)) continue
        if (routes && !routes.has(href)) continue
        if ([...hidden].some(h => h && (normalizeTitle(href).includes(h) || normalizeTitle(text).includes(h)))) continue
        out.push({ text: clipLook(text), href })
    }
    return out
}

// The live /retrogames/… hrefs a look pick may point at: registry game
// routes plus the committed demo pages, which are served as <slug>.html —
// vercel.json has no cleanUrls (#809).
export function lookRoutes({ gameEntries = [], demos = [] }) {
    return new Set([
        ...gameEntries.map(e => `/retrogames${e.path}`),
        ...demos.filter(d => d && d !== 'index').map(d => `/retrogames/demos/${d}.html`),
    ])
}

// All in-window candidates (games + demos) ranked by merge count. The top
// LOOK_LIMIT become the computed picks; the full list is also what "merged
// in the window" means for carried picks (#809). Plumbing (docs/CI/board
// work) is never a pick.
export function goLookCandidates({ pulls = [], gameEntries = [], demos = [], privates = [] }) {
    const hidden = new Set(privates.map(normalizeTitle))
    const cand = new Map()
    const bump = (key, name, href, title) => {
        const c = cand.get(key) || { name, href, count: 0, latest: 0, title }
        c.count++
        if ((title || '').length && title !== c.title) c.title = title
        cand.set(key, c)
    }
    for (const p of pulls) {
        const title = String(p.title || '').split('\n')[0]
        const t = normalizeTitle(title)
        if ([...hidden].some(h => h && t.includes(h))) continue
        let best = null
        for (const g of gameEntries) {
            const n = normalizeTitle(g.label)
            if (n && t.includes(n) && (!best || n.length > best.n.length)) best = { n, g }
        }
        if (best) {
            bump(`g:${best.g.path}`, best.g.label, `/retrogames${best.g.path}`, title)
            continue
        }
        for (const d of demos) {
            if (!d || d === 'index') continue
            if (new RegExp(`\\b${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(title)) {
                bump(`d:${d}`, `${d[0].toUpperCase()}${d.slice(1)} demo`, `/retrogames/demos/${d}.html`, title)
            }
        }
    }
    return [...cand.values()]
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

// Computed fallback picks: the top LOOK_LIMIT in-window candidates.
export function buildGoLook(args) {
    return goLookCandidates(args)
        .slice(0, LOOK_LIMIT)
        .map(c => {
            const after = c.title.includes(':') ? c.title.split(':').slice(1).join(':').trim() : ''
            const what = after || c.title
            return { text: clipLook(`${c.name}: ${what}`), href: c.href }
        })
}

export function buildReport({ now, pulls = [], issues = [], runs = [], samples = [], gamesSrc = '', notes = null, prev = null, demos = [] }) {
    const windowStart = now - WINDOW_HOURS * 3600 * 1000
    const merged = pulls.filter(p => p.merged_at && Date.parse(p.merged_at) >= windowStart)
    const privates = parsePrivateLabels(gamesSrc)
    const gameLabels = parseGameLabels(gamesSrc)
    const gameEntries = parseGameEntries(gamesSrc)

    const split = { builder: 0, qa: 0, ops: 0 }
    for (const p of merged) split[laneOf(p.head?.ref || p.headBranch)]++

    let overnight = 0
    for (const p of merged) {
        const h = pacificParts(Date.parse(p.merged_at)).hour
        if (h >= 23 || h < 7) overnight++
    }
    const openMin = merged
        .filter(p => p.created_at)
        .map(p => (Date.parse(p.merged_at) - Date.parse(p.created_at)) / 60000)
    const issuesClosed = issues.filter(i => !i.pull_request && i.state === 'closed'
        && i.closed_at && Date.parse(i.closed_at) >= windowStart).length
    const issuesOpened = issues.filter(i => !i.pull_request && Date.parse(i.created_at) >= windowStart).length

    const { rows, idx, buckets } = buildRows({ pulls: merged, samples, now })
    const idle = idleBand({ rows, idx, buckets, pulls: merged, samples, now })
    const machines = machineRows(rows)
    const ci = ciStats({ runs: runs.filter(r => Date.parse(r.created_at) >= windowStart), pulls })

    const fresh = notes && notes.headline
    const carried = !fresh && prev && prev.notes ? prev : null
    const headline = fresh ? notes.headline : (carried ? carried.headline : `${merged.length} merges in 48 hours`)
    const lede = fresh ? notes.lede : (carried ? carried.lede : null)
    const noteList = fresh ? notes.notes : (carried ? carried.notes : [])
    const notesFrom = fresh ? new Date(now).toISOString() : (carried ? carried.notesFrom || null : null)

    const routes = lookRoutes({ gameEntries, demos })
    const freshLook = validateLook(notes && notes.look, privates, routes)
    const carriedLook = carried ? validateLook(carried.look, privates, routes) : []
    // A carried pick only stays while its path actually merged in THIS
    // window; once none of them did, the box falls back to computed picks
    // instead of advertising yesterday's work (#809).
    const mergedHrefs = new Set(goLookCandidates({ pulls: merged, gameEntries, demos, privates }).map(c => c.href))
    const carriedAlive = carriedLook.some(g => mergedHrefs.has(g.href))
    const chosenLook = fresh ? freshLook : (carried && carriedAlive ? carriedLook : [])
    const look = chosenLook.length
        ? chosenLook
        : buildGoLook({ pulls: merged, gameEntries, demos, privates })

    return {
        generated: new Date(now).toISOString(),
        tz: TZ, hours: WINDOW_HOURS,
        headline, lede, notes: noteList, notesFrom,
        notesCarried: !!carried,
        look,
        stats: {
            merged: { total: merged.length, ...split },
            issues: { closed: issuesClosed, opened: issuesOpened },
            overnight,
            medianMergeMin: medianMinutes(openMin),
        },
        rows,
        idle: idle ? { start: idle.start, end: idle.end } : null,
        machines,
        themes: buildThemes({ pulls: merged, gameLabels, privates }),
        ci,
    }
}

// ---------- network shell (runs only under SHIFTREPORT_PUSH=1) ----------

async function fetchJson(url) {
    try {
        const r = await fetch(url, { cache: 'no-store' })
        return r.ok ? await r.json() : null
    } catch { return null }
}
async function fetchText(url) {
    try {
        const r = await fetch(url, { cache: 'no-store' })
        return r.ok ? await r.text() : ''
    } catch { return '' }
}

async function main() {
    const { execFileSync } = await import('node:child_process')
    const { writeFileSync, readFileSync, existsSync, mkdirSync } = await import('node:fs')
    const gh = (...args) => JSON.parse(execFileSync('gh', ['api', ...args, '--jq', '.'], { maxBuffer: 64 * 1024 * 1024 }).toString())
    const now = Date.now()
    const sinceMs = now - WINDOW_HOURS * 3600 * 1000
    const sinceIso = new Date(sinceMs).toISOString()

    const pullsOpen = gh(`${REPO}/pulls?state=open&per_page=50`)
    const pullsClosed = gh(`${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100`)
        .filter(p => Date.parse(p.updated_at) >= sinceMs)
    const pulls = [...pullsOpen, ...pullsClosed]

    const issuesOpen = gh(`${REPO}/issues?state=open&per_page=100`)
    const issuesClosed = gh(`${REPO}/issues?state=closed&since=${sinceIso}&per_page=100`)
        .filter(i => i.closed_at && Date.parse(i.closed_at) >= sinceMs)
    const issues = [...issuesOpen, ...issuesClosed]

    const runs = []
    for (let page = 1; page <= 4; page++) {
        const batch = gh(`${REPO}/actions/runs?created=%3E${sinceIso}&per_page=100&page=${page}`).workflow_runs || []
        runs.push(...batch)
        if (batch.length < 100) break
    }

    const telemText = await (async () => {
        try {
            const r = await fetch(TELEM_URL + 'telemetry.json', { cache: 'no-store' })
            return r.ok ? await r.text() : ''
        } catch { return '' }
    })()
    const samples = telemText.split('\n').filter(l => l.startsWith('{')).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

    const gamesSrc = await fetchText(RAW_BASE + 'src/config/games.js')
    let demos = []
    try {
        demos = gh(`${REPO}/contents/public/demos?ref=main`)
            .filter(f => f.type === 'file' && f.name.endsWith('.html') && f.name !== 'index.html')
            .map(f => f.name.slice(0, -'.html'.length))
    } catch { demos = [] }
    const prev = await fetchJson(TELEM_URL + 'report.json')

    let notes = null
    const notesFile = process.env.SHIFTREPORT_NOTES
    if (notesFile && existsSync(notesFile)) {
        try { notes = JSON.parse(readFileSync(notesFile, 'utf8')) } catch { notes = null }
    }

    const report = buildReport({ now, pulls, issues, runs, samples, gamesSrc, notes, prev, demos })

    if (!process.env.SHIFTREPORT_PUSH) {
        mkdirSync('/tmp/forge', { recursive: true })
        writeFileSync('/tmp/forge/report-preview.json', JSON.stringify(report, null, 1))
        console.log('dry-run: /tmp/forge/report-preview.json', report.headline)
        return
    }
    const data = Buffer.from(JSON.stringify(report)).toString('base64')
    const attempts = pushContents({
        readSha: () => execFileSync('gh', ['api', `${OUT}/contents/report.json?ref=main`, '--jq', '.sha'], { encoding: 'utf8' }),
        put: (sha) => {
            const body = { message: 'shift report', content: data, branch: 'main' }
            if (/^[0-9a-f]{40}$/.test(sha)) body.sha = sha
            execFileSync('gh', ['api', '-X', 'PUT', `${OUT}/contents/report.json`, '--input', '-'], { input: JSON.stringify(body) })
        },
        warn: msg => console.warn(msg),
    })
    if (attempts > 1) console.log(`pushed after ${attempts} attempts (sha races: ${attempts - 1})`)
    console.log('shift report pushed:', report.headline)
}

const DIRECT = (process.argv[1] || '').endsWith('shiftreport.mjs')
if (DIRECT || process.env.SHIFTREPORT_PUSH) await main()
