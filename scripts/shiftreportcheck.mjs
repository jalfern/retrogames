// shiftreportcheck.mjs — the shift report harness (#614). Browser-free, ~0 s.
// Pins every computation rule from docs/forge/shift-report-ref.html's comment
// against fixtures: the hour window, lane-from-branch, stacked hour rows, the
// builder idle band, machine rollups (busy>60, load/16, dashed missing hours),
// CI medians/cancels/main-reds, theme grouping (game labels first, keyword
// buckets, <3 merges fold, private games hidden), and the notes contract
// (model supplies headline+lede+notes; without them the script writes a plain
// fallback headline and later regenerations carry the previous session's).
// Plus source tripwires: npm alias, /forge/report route, board link,
// telemetry.sh 4 h hook — so a merge that quietly unwires the pipe goes red.
//
// Prove-it-can-fail (done by hand once): flip the busy threshold `cpu > 60` to
// `cpu > 300` in scripts/shiftreport.mjs -> the machine-rollup asserts go red.

import { readFileSync, readdirSync } from 'node:fs'

const D = s => Date.parse(s)
let pass = 0
const fails = []
const ok = (name, cond) => { if (cond) pass++; else fails.push(name) }

const m = await import('./shiftreport.mjs')

for (const fn of ['hourKey', 'hourKeys', 'laneOf', 'medianMinutes', 'p90Minutes', 'buildRows', 'idleBand',
    'machineRows', 'ciStats', 'themeOf', 'buildThemes', 'parsePrivateLabels', 'parseGameLabels', 'parseGameEntries',
    'validateLook', 'buildGoLook', 'goLookCandidates', 'lookRoutes', 'buildReport', 'pushContents']) {
    ok(`boot: exports ${fn}`, typeof m[fn] === 'function')
}

// ---- #645: Contents PUT vs the 4 h tick — sha race retry loop ----
const race409 = () => { const e = new Error('Command failed: gh api'); e.stderr = 'gh: updating contents failed: SHA mismatch (HTTP 409)'; return e }
{
    let reads = 0, puts = 0
    const got = m.pushContents({ readSha: () => { reads++; return 'a'.repeat(40) }, put: () => { puts++; if (puts < 3) throw race409() } })
    ok('sha race retried: succeeds on attempt 3, sha re-read each time', got === 3 && reads === 3 && puts === 3)
}
{
    let puts = 0, threw = false
    try { m.pushContents({ readSha: () => 'b'.repeat(40), put: () => { puts++; throw race409() } }) } catch { threw = true }
    ok('persistent races give up after 3 attempts (no infinite loop)', threw && puts === 3)
}
{
    let puts = 0
    try { m.pushContents({ readSha: () => 'c'.repeat(40), put: () => { puts++; throw new Error('boom (HTTP 422)') } }) } catch { /* not retried */ }
    ok('non-409 failures are not retried', puts === 1)
}
{
    let seen = null
    const got = m.pushContents({ readSha: () => { throw new Error('not found') }, put: (sha) => { seen = sha } })
    ok('first write (no remote file) PUTs without a sha', got === 1 && seen === '')
}
{
    let last = null
    m.pushContents({ readSha: () => ' deadbeefdeadbeefdeadbeefdeadbeefdeadbeef ', put: s => { last = s } })
    ok('existing sha trimmed and passed to PUT', last === 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')
}

// ---- lanes come from branch prefixes only ----
ok('forge/ = builder', m.laneOf('forge/ssx-620') === 'builder')
ok('qa/ = QA', m.laneOf('qa/tetris-polish') === 'qa')
ok('anything else = ops', m.laneOf('docs/shift-report-ref') === 'ops' && m.laneOf('main') === 'ops')

// ---- the 48-hour window ----
const NOW = D('2026-10-20T18:00:00Z')            // Tue 11:00 PDT
ok('window is 48 hour buckets', m.hourKeys(NOW).length === 48)
ok('bucket keys are MM-DDTHH Pacific', m.hourKeys(NOW)[47] === '10-20T11' && m.hourKeys(NOW)[0] === '10-18T12')
ok('hourKey converts UTC to Pacific wall hour', m.hourKey(D('2026-10-18T17:30:00Z')) === '10-18T10')

// ---- hour rows: stacked lanes + machine rollup + dashed gaps ----
const iso = ms => new Date(ms).toISOString()
const H = 3600 * 1000
const samples = []
for (let i = 0; i < 48; i++) {
    const ts = Math.floor((NOW - (47 - i) * H) / 1000)
    if (i < 24) {
        samples.push({ ts, load: 8, tasks: { builder: null, mini: { cpu: 90, rss: 100 }, mbp: { cpu: 10, rss: 10 } } })
        samples.push({ ts: ts + 300, load: 12, tasks: { builder: null, mini: { cpu: 30, rss: 100 }, mbp: { cpu: 70, rss: 10 } } })
    }
    // hours 24..35: no samples at all -> dashed empty cells
    if (i >= 36) {
        samples.push({ ts, load: 4, tasks: { builder: null, mini: { cpu: 5, rss: 100 }, mbp: { cpu: 5, rss: 10 } } })
    }
}
const pulls = [
    { number: 1, merged_at: iso(NOW - 2 * H), created_at: iso(NOW - 12 * H), head: { ref: 'forge/ssx' }, title: 'SSX: rail grind' },
    { number: 2, merged_at: iso(NOW - 2 * H), created_at: iso(NOW - 3 * H), head: { ref: 'qa/ssx' }, title: 'QA — SSX: polish' },
    { number: 3, merged_at: iso(NOW - 47 * H), created_at: iso(NOW - 48 * H), head: { ref: 'docs/x' }, title: 'docs: readme' },
    { number: 4, merged_at: iso(NOW + H), head: { ref: 'forge/future' }, title: 'the future' },
]
const { rows, idx, buckets } = m.buildRows({ pulls, samples, now: NOW })
ok('rows are 48 tuples', rows.length === 48 && rows[0].length === 7)
ok('lanes stack in the merge hour', rows[idx['10-20T09']][1] === 1 && rows[idx['10-20T09']][2] === 1)
ok('ops lane counted', rows[0][3] === 1)
ok('future merge excluded', rows.flat().filter(x => x === 1).length >= 3 && !rows.some(r => r[1] + r[2] + r[3] > 2 && r[0] === '10-20T11'))
ok('mini busy fraction 24/48 hours => .5 avg early', rows[idx['10-18T12']][4] === 0.5)
ok('mbp busy fraction .5 early', rows[idx['10-18T12']][5] === 0.5)
ok('load averaged per hour', rows[idx['10-18T12']][6] === 10)
ok('missing hours stay null', rows[idx['10-19T12']][4] === null && rows[idx['10-19T12']][6] === null)

const machines = m.machineRows(rows)
ok('studio shaded against 16 cores', machines.studio[idx['10-18T12']] === 10 / 16)
ok('studio null when no samples', machines.studio[idx['10-19T12']] === null)

// ---- idle band: builder stopped at hour idx(NOW-36H), never ran again ----
const idle = m.idleBand({ rows, idx, buckets, pulls: pulls.filter(p => p.head.ref === 'forge/ssx'), samples, now: NOW })
ok('idle starts at last builder merge', idle && idle.start === idx['10-20T09'])
ok('idle runs to window end when builder never returns', idle && idle.end === 47)
ok('builder already running at the merge hour => no band',
    m.idleBand({ rows, idx, buckets, pulls: pulls.filter(p => p.head.ref === 'forge/ssx'),
        samples: [...samples, { ts: Math.floor((NOW - 2 * H) / 1000), load: 1, tasks: { builder: { cpu: 9, rss: 1 }, mini: null, mbp: null } }], now: NOW }) === null)
const idle2 = m.idleBand({ rows, idx, buckets, pulls, samples: [...samples, { ts: Math.floor((NOW - 40 * 60000) / 1000), load: 2, tasks: { builder: { cpu: 9, rss: 1 }, mini: null, mbp: null } }], now: NOW })
ok('idle ends when the builder runs again', idle2 && idle2.end === idx['10-20T10'])
ok('future merge timestamps ignored', m.idleBand({ rows, idx, buckets, pulls: [{ number: 7, merged_at: iso(NOW + 2 * H), head: { ref: 'forge/skew' } }], samples, now: NOW }) === null)
ok('no builder merges => no band', m.idleBand({ rows, idx, buckets, pulls: [], samples, now: NOW }) === null)

// ---- CI ----
const runs = [
    { id: 1, name: 'CI', event: 'push', conclusion: 'success', created_at: iso(NOW - 10 * H), updated_at: iso(NOW - 10 * H + 10 * 60000) },
    { id: 2, name: 'CI', event: 'push', conclusion: 'success', created_at: iso(NOW - 9 * H), updated_at: iso(NOW - 9 * H + 20 * 60000) },
    { id: 3, name: 'CI', event: 'pull_request', conclusion: 'cancelled', created_at: iso(NOW - 8 * H), updated_at: iso(NOW - 8 * H + 60000) },
    { id: 4, name: 'CI', event: 'push', conclusion: 'failure', created_at: iso(NOW - 7 * H), updated_at: iso(NOW - 7 * H + 30 * 60000) },
    { id: 5, name: 'Nightly Heist', event: 'schedule', conclusion: 'success', created_at: iso(NOW - 6 * H), updated_at: iso(NOW - 6 * H + 40 * 60000) },
    { id: 6, name: 'CI', event: 'pull_request', conclusion: 'success', created_at: iso(NOW - 100 * H), updated_at: iso(NOW - 99 * H) },
]
const ci = m.ciStats({ runs: runs.filter(r => D(r.created_at) >= NOW - 48 * H), pulls: [...pulls, { number: 9, state: 'closed', merged_at: null }] })
ok('finished excludes cancelled', ci.finished === 4)
ok('median minutes', ci.medianMin === 25)
ok('p90 minutes', ci.p90Min === 40)
ok('cancelled + on-main', ci.cancelled === 1 && ci.cancelledMain === 0)
ok('main went red counted', ci.mainFails === 1)
ok('nightlies separated', ci.nightlyTotal === 1 && ci.nightlyGreen === 1)
ok('closed unmerged PR counted', ci.closedUnmerged === 1)
ok('runs outside window excluded by shell input', m.ciStats({ runs: [], pulls: [] }).finished === 0)

// ---- themes ----
const GAME_FIXTURE = `
export const GAMES = [
    {
        path: '/a',
        label: 'SSX',
        visibility: 'public',
    },
    {
        path: '/b',
        pad: { buttons: [{ label: 'HIDDEN', code: 'X' }] },
        label: 'GAUNTLET',
    },
    {
        path: '/c',
        label: 'VEIL',
        visibility: 'private',
    },
]`
const labels = m.parseGameLabels(GAME_FIXTURE)
const privs = m.parsePrivateLabels(GAME_FIXTURE)
ok('public game labels parsed, private excluded', labels.includes('SSX') && labels.includes('GAUNTLET') && !labels.includes('VEIL'))
ok('pad button never a label', !labels.includes('HIDDEN'))
ok('game label beats keyword', m.themeOf('SSX: new attract loop', labels).name === 'SSX' && m.themeOf('SSX: new attract loop', labels).game === true)
ok('keyword bucket for non-game', m.themeOf('Attract sweep batch 3', labels).name === 'Attract screens')
ok('longest label wins', m.themeOf('GAUNTLET CO-OP fixes', labels).name === 'GAUNTLET')
const themed = m.buildThemes({
    pulls: [
        { number: 1, title: 'SSX: rails', head: { ref: 'forge/a' } },
        { number: 2, title: 'SSX: snow', head: { ref: 'qa/a' } },
        { number: 3, title: 'SSX: audio', head: { ref: 'qa/b' } },
        { number: 4, title: 'TETRIS: pad', head: { ref: 'qa/c' } },
        { number: 5, title: 'VEIL: secret work', head: { ref: 'qa/d' } },
        { number: 6, title: 'Attract text cleanup', head: { ref: 'qa/e' } },
    ],
    gameLabels: [...labels, 'TETRIS'],
    privates: privs,
})
const byName = Object.fromEntries(themed.map(t => [t.name, t]))
ok('game with 3 merges keeps own theme', byName.SSX.count === 3)
ok('minor game folds into polish umbrella', byName['Game polish, other titles']?.count === 1)
ok('private game hidden from themes', !byName.VEIL && !themed.some(t => /VEIL/.test(t.text)))
ok('attract keyword theme', byName['Attract screens'].count === 1)
ok('split bars sum to count', themed.every(t => t.split.builder + t.split.qa + t.split.ops === t.count))
ok('theme sentence is computed text', /^3 PRs \(1 builder, 2 qa\): rails; snow$/.test(byName.SSX.text))
ok('theme text stays short', themed.every(t => t.text.length < 150))

// ---- go look (#647): top 2 changes to try, games/demos only ----
const entries = m.parseGameEntries(GAME_FIXTURE)
ok('parseGameEntries: public games with paths, private excluded',
    entries.some(e => e.label === 'SSX' && e.path === '/a') && !entries.some(e => e.label === 'VEIL'))
ok('parseGameEntries: a block with nested pad braces still parses (the first ] must not end the scan)',
    entries.some(e => e.label === 'GAUNTLET' && e.path === '/b'))
const DEMOS = ['ocean', 'shore']
const ROUTES = m.lookRoutes({ gameEntries: entries, demos: DEMOS })
ok('lookRoutes: game routes + demo .html routes only',
    [...ROUTES].sort().join(',') === ['/retrogames/a', '/retrogames/b', '/retrogames/demos/ocean.html', '/retrogames/demos/shore.html'].sort().join(','))
const lookPulls = [
    { number: 1, title: 'SSX: rail grind', merged_at: iso(NOW - H), head: { ref: 'forge/a' } },
    { number: 2, title: 'SSX: audio', merged_at: iso(NOW - 2 * H), head: { ref: 'qa/a' } },
    { number: 3, title: 'SSX: hud', merged_at: iso(NOW - 3 * H), head: { ref: 'qa/a' } },
    { number: 4, title: 'Ocean: storm gusts', merged_at: iso(NOW - 4 * H), head: { ref: 'forge/o' } },
    { number: 5, title: 'Ocean: reflections', merged_at: iso(NOW - 5 * H), head: { ref: 'forge/o' } },
    { number: 6, title: 'docs: readme tidy', merged_at: iso(NOW - 6 * H), head: { ref: 'docs/d' } },
]
const look = m.buildGoLook({ pulls: lookPulls, gameEntries: entries, demos: DEMOS, privates: privs })
ok('go look: game + demo ranked by merge count, in-app links',
    look.length === 2 && look[0].text.startsWith('SSX') && look[0].href === '/retrogames/a' &&
    look[1].text.startsWith('Ocean demo') && look[1].href === '/retrogames/demos/ocean.html')
ok('go look: demo hrefs always carry .html (#809)', look.filter(g => g.href.includes('/demos/')).every(g => g.href.endsWith('.html')))
ok('go look: one line each', look.every(g => !g.text.includes('\n') && g.text.length <= 76))
ok('go look: plumbing-only window yields no picks',
    m.buildGoLook({ pulls: [{ title: 'docs: readme' }, { title: 'CI: bump runner' }], gameEntries: entries, demos: DEMOS, privates: privs }).length === 0)
ok('go look: private games never a pick',
    m.buildGoLook({ pulls: [{ title: 'VEIL: secret work' }], gameEntries: entries, demos: [], privates: privs }).length === 0)
ok('go look: private label colliding with a demo slug still never leaks',
    m.buildGoLook({ pulls: [{ title: 'VEIL: secret levels' }], gameEntries: entries, demos: ['veil'], privates: privs }).length === 0)
ok('validateLook: cap two, strip html, keep /retrogames/ hrefs',
    (() => { const v = m.validateLook([
        { text: 'Ocean demo got storm gusts', href: '/retrogames/demos/ocean.html' },
        { text: 'SSX rails <b>new</b>', href: '/retrogames/a' },
        { text: 'third', href: '/retrogames/b' }], privs, ROUTES)
    return v.length === 2 && v.every(g => !/[<>]/.test(g.text) && g.href.startsWith('/retrogames/')) })())
ok('validateLook: offsite href rejected',
    m.validateLook([{ text: 'click', href: 'https://evil.example/x' }], privs, ROUTES).length === 0)
ok('validateLook: private game rejected by href or text',
    m.validateLook([{ text: 'a secret teaser', href: '/retrogames/veil-x' }], privs, ROUTES).length === 0 &&
    m.validateLook([{ text: 'VEIL teaser', href: '/retrogames/a' }], privs, ROUTES).length === 0)
ok('validateLook: empty lines rejected',
    m.validateLook(null, privs, ROUTES).length === 0 && m.validateLook([{ text: ' ', href: '/retrogames/a' }], privs, ROUTES).length === 0)
ok('validateLook: demo href without .html 404s, rejected (#809)',
    m.validateLook([{ text: 'old shore link', href: '/retrogames/demos/shore' }], privs, ROUTES).length === 0)
ok('validateLook: unknown game route rejected',
    m.validateLook([{ text: 'nowhere', href: '/retrogames/nosuch' }], privs, ROUTES).length === 0)
ok('validateLook: real demo route accepted',
    m.validateLook([{ text: 'shore demo', href: '/retrogames/demos/shore.html' }], privs, ROUTES).length === 1)

// ---- whole report + notes contract ----
const rep = m.buildReport({
    now: NOW,
    pulls: [...pulls, { number: 5, state: 'closed', merged_at: null, created_at: iso(NOW - 5 * H), head: { ref: 'x' }, title: 'doomed PR' }],
    issues: [
        { number: 60, state: 'closed', closed_at: iso(NOW - 3 * H), created_at: iso(NOW - 9 * H) },
        { number: 61, state: 'open', created_at: iso(NOW - 1 * H) },
        { number: 62, pull_request: {}, state: 'open', created_at: iso(NOW - 1 * H) },
        { number: 63, state: 'closed', closed_at: iso(NOW - 200 * H), created_at: iso(NOW - 300 * H) },
    ],
    runs, samples, gamesSrc: GAME_FIXTURE,
})
ok('fallback headline is script text', rep.headline === '4 merges in 48 hours')
ok('stats lanes', rep.stats.merged.builder === 2 && rep.stats.merged.qa === 1 && rep.stats.merged.ops === 1)
ok('issues closed/opened counted, PRs excluded', rep.stats.issues.closed === 1 && rep.stats.issues.opened === 2)
ok('median merge minutes computed', rep.stats.medianMergeMin === 60)
ok('empty notes array without session notes', Array.isArray(rep.notes) && rep.notes.length === 0 && !rep.notesCarried)
ok('idle band rides along', rep.idle && rep.idle.start <= rep.idle.end)

const NOTED = { headline: 'Forty merges in 48 hours', lede: 'A <b>busy</b> shift.', notes: [{ tag: 'k', text: 'Fleet ran hot.' }] }
const withNotes = m.buildReport({ ...{ now: NOW, pulls, issues: [], runs, samples, gamesSrc: GAME_FIXTURE }, notes: NOTED })
ok('session notes land', withNotes.headline === NOTED.headline && withNotes.notes.length === 1 && withNotes.notesFrom)
const carried = m.buildReport({ now: NOW + H, pulls: [], issues: [], runs: [], samples: [], gamesSrc: '', notes: null, prev: withNotes })
ok('later run carries previous notes', carried.notes[0].text === 'Fleet ran hot.' && carried.notesCarried === true && carried.headline === NOTED.headline)
const replaced = m.buildReport({
    now: NOW + H, pulls: [], issues: [], runs: [], samples: [], gamesSrc: '', notes: null,
    prev: carried,
})
ok('carry-over chains stay stable', replaced.notes[0].text === 'Fleet ran hot.')
const overwritten = m.buildReport({ now: NOW + 2 * H, pulls: [], issues: [], runs: [], samples: [], gamesSrc: '', notes: { headline: 'Second shift', lede: '', notes: [{ tag: 'w', text: 'New note' }] }, prev: carried })
ok('new session notes replace carried ones', overwritten.headline === 'Second shift' && overwritten.notes[0].text === 'New note' && !overwritten.notesCarried)

// ---- go look rides the notes pipe (#647) ----
const lookRep = m.buildReport({ now: NOW, pulls: lookPulls, issues: [], runs, samples, gamesSrc: GAME_FIXTURE, demos: DEMOS })
ok('report carries go-look', Array.isArray(lookRep.look) && lookRep.look.length === 2 && lookRep.look.every(g => g.href.startsWith('/retrogames/')))
ok('report go-look only uses live routes', lookRep.look.every(g => ROUTES.has(g.href)))
const LOOKED = { headline: 'H', lede: '', notes: [{ tag: 'k', text: 'n' }], look: [{ text: 'Try the new shore MSAA', href: '/retrogames/demos/shore.html' }] }
const withLook = m.buildReport({ now: NOW, pulls: lookPulls, issues: [], runs, samples, gamesSrc: GAME_FIXTURE, demos: DEMOS, notes: LOOKED })
ok('session look picks win over computed', withLook.look.length === 1 && withLook.look[0].href === '/retrogames/demos/shore.html')
const carryLook = m.buildReport({ now: NOW + H, pulls: [], issues: [], runs, samples, gamesSrc: GAME_FIXTURE, demos: DEMOS, notes: null, prev: withLook })
ok('carried look dies when its path merged nothing in-window (#809)', carryLook.look.length === 0)
const carryStaleHref = m.buildReport({ now: NOW + H, pulls: [], issues: [], runs, samples, gamesSrc: GAME_FIXTURE, demos: DEMOS, notes: null,
    prev: { ...withLook, look: [{ text: 'old shore link', href: '/retrogames/demos/shore' }] } })
ok('carried look with a dead href falls back to computed (#809)', carryStaleHref.look.length === 0)
const carryAlive = m.buildReport({
    now: NOW + H,
    pulls: [{ number: 9, title: 'Shore: msaa on phones', merged_at: iso(NOW + 30 * 60000), created_at: iso(NOW), head: { ref: 'qa/s' } }],
    issues: [], runs, samples, gamesSrc: GAME_FIXTURE, demos: DEMOS, notes: null, prev: withLook,
})
ok('carried look kept while its path still merges', carryAlive.look.length === 1 && carryAlive.look[0].href === '/retrogames/demos/shore.html' && carryAlive.look[0].text === 'Try the new shore MSAA')
const freshNoLook = m.buildReport({ now: NOW + H, pulls: lookPulls, issues: [], runs, samples, gamesSrc: GAME_FIXTURE, demos: DEMOS,
    notes: { headline: 'Fresh', lede: '', notes: [] }, prev: withLook })
ok('fresh notes without look recompute from merges', freshNoLook.look.length === 2 && freshNoLook.look[0].text.startsWith('SSX'))
const noGamesNoDemos = m.buildReport({ now: NOW, pulls: [{ number: 8, title: 'docs: typo', merged_at: iso(NOW - H), head: { ref: 'docs/z' }, created_at: iso(NOW - 2 * H) }],
    issues: [], runs, samples, gamesSrc: '', demos: [] })
ok('go-look is an empty array, never missing', Array.isArray(noGamesNoDemos.look) && noGamesNoDemos.look.length === 0)

// ---- source tripwires: the pipe stays wired ----
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
ok('npm alias shiftreportcheck exists', JSON.parse(read('package.json')).scripts.shiftreportcheck === 'node scripts/shiftreportcheck.mjs')
ok('App routes /forge/report to ShiftReport', /\/forge\/report/.test(read('src/App.jsx')) && /ShiftReport/.test(read('src/App.jsx')))
ok('board links the shift report', read('src/pages/ForgeBoard.jsx').includes('to="/forge/report"'))
ok('telemetry job runs shiftreport every 4 h', read('scripts/telemetry.sh').includes('last-shiftreport') && read('scripts/telemetry.sh').includes('shiftreport.mjs'))
ok('reference look is committed', read('docs/forge/shift-report-ref.html').includes('SHIFT REPORT'))
ok('FORGE.md tells sessions to publish notes', read('scripts/FORGE.md').includes('SHIFTREPORT_NOTES'))
ok('FORGE.md documents the look picks', read('scripts/FORGE.md').includes('look'))
ok('report page renders the go-look box', /className="golook"/.test(read('src/pages/ShiftReport.jsx')) && /report\.look/.test(read('src/pages/ShiftReport.jsx')))
ok('generator enumerates public demos', read('scripts/shiftreport.mjs').includes('public/demos'))
ok('shiftreportcheck is wired as a core CI gate',
    read('scripts/checks.mjs').includes("'shiftreportcheck'") &&
    read('.github/workflows/ci.yml').includes('npm run shiftreportcheck'))
ok('fixture + ?report hook exist for the browser leg',
    JSON.parse(read('public/forge/report-fixture.json')).look.length === 2 &&
    read('src/pages/ShiftReport.jsx').includes("get('report')") &&
    read('src/pages/ShiftReport.jsx').includes('REPORT_URL'))
ok('?report hook ignores offsite fixtures',
    read('src/pages/ShiftReport.jsx').includes('/^\\/retrogames\\/'))

// ---- #809: every look.href maps to a real game route or an existing demo ----
const REAL_SRC = read('src/config/games.js')
const realEntries = m.parseGameEntries(REAL_SRC)
const realPrivs = m.parsePrivateLabels(REAL_SRC)
const realDemos = readdirSync(new URL('../public/demos/', import.meta.url))
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .map(f => f.slice(0, -'.html'.length))
const realRoutes = m.lookRoutes({ gameEntries: realEntries, demos: realDemos })
ok('registry + demos parse into live routes', realEntries.length > 10 && realDemos.includes('shore') && realRoutes.has('/retrogames/demos/shore.html'))
ok('go look on the real registry + demos only emits live routes (#809)', (() => {
    const pulls = [
        ...realEntries.slice(0, 3).map((e, i) => ({ number: i, title: `${e.label}: live now` })),
        ...realDemos.slice(0, 3).map((d, i) => ({ number: 10 + i, title: `${d}: fresh water` })),
    ]
    const look = m.buildGoLook({ pulls, gameEntries: realEntries, demos: realDemos, privates: realPrivs })
    return look.length > 0 && look.every(g => realRoutes.has(g.href))
})())
ok('go look demo picks always end in .html against the real tree (#809)', (() => {
    const pulls = realDemos.slice(0, 3).map((d, i) => ({ number: i, title: `${d}: fresh water` }))
    const look = m.buildGoLook({ pulls, gameEntries: realEntries, demos: realDemos, privates: realPrivs })
    return look.length > 0 && look.every(g => g.href.endsWith('.html'))
})())
ok('validateLook against the real tree drops 404 hrefs (#809)',
    m.validateLook([
        { text: 'old shore link', href: '/retrogames/demos/shore' },
        { text: 'no such game', href: '/retrogames/nosuch-game' },
        { text: 'live shore link', href: '/retrogames/demos/shore.html' },
    ], realPrivs, realRoutes).length === 1)
ok('committed fixture look hrefs are live routes (#809)',
    JSON.parse(read('public/forge/report-fixture.json')).look.every(g => realRoutes.has(g.href)))

if (fails.length) {
    console.error(`FAIL (${fails.length}/${pass + fails.length}):`)
    for (const f of fails) console.error('  ✗', f)
    process.exit(1)
}
console.log(`shiftreportcheck: ${pass}/${pass + fails.length} PASS`)
