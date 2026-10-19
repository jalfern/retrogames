// dailylogcheck.mjs — the daily log harness (#516). Browser-free, ~0 s.
// Proves: the module boots, the 07:00 Pacific day math survives both DST
// flips, entry membership obeys the rules from the issue (merged -> shipped on
// the right day, private titles gated, screenshots attached, silence = stalled,
// only `static` failures are regressions), entries are newest-first, and the
// live section really covers "since this morning". No network: the pure core
// gets fixtures; the network shell is what runs on the telemetry machine.
//
// Prove-it-can-fail (do it by hand once): CUTOFF_HOUR 7 -> 8 in
// scripts/dailylog.mjs -> this check goes red at the DST assertions.

const D = s => Date.parse(s)
let pass = 0
const fails = []
const ok = (name, cond) => { if (cond) pass++; else fails.push(name) }

const m = await import('./dailylog.mjs')

// ---- boot ----
for (const fn of ['cutoffFor', 'cutoffUTC', 'ptDateOf', 'pacificParts', 'parsePrivateLabels', 'isPrivateTitle', 'shotsByIssue', 'buildSections', 'buildLog']) {
    ok(`boot: exports ${fn}`, typeof m[fn] === 'function')
}

// ---- Pacific day math (the load-bearing wall) ----
ok('cutoff is 07:00 PDT in summer', new Date(m.cutoffUTC('2026-10-19')).toISOString() === '2026-10-19T14:00:00.000Z')
ok('cutoff is 07:00 PST in winter', new Date(m.cutoffUTC('2026-01-15')).toISOString() === '2026-01-15T15:00:00.000Z')
ok('fall-back day is 25 h', m.cutoffUTC('2026-11-01') - m.cutoffUTC('2026-10-31') === 25 * 3600 * 1000)
ok('spring-forward day is 23 h', m.cutoffUTC('2026-03-08') - m.cutoffUTC('2026-03-07') === 23 * 3600 * 1000)
ok('ptDateOf before cutoff is yesterday', m.ptDateOf(D('2026-10-19T06:59:00Z')) === '2026-10-18')
ok('ptDateOf at/after cutoff is today', m.ptDateOf(D('2026-10-19T14:00:00Z')) === '2026-10-19')

// ---- public gate (#379): only explicit-private games are excluded ----
const GAMES_FIXTURE = `
export const GAMES = [
    {
        path: '/a',
        pad: { layout: 'stick', buttons: [{ label: 'DRIFT', code: 'KeyR' }], analog: true },
        component: A,
        label: 'SECRET RACER',
    },
    {
        path: '/b',
        label: 'OPEN GAME',
        visibility: 'public',
    },
    {
        path: '/c',
        label: 'HIDDEN GAME',
        visibility: 'private',
    },
]`
const privs = m.parsePrivateLabels(GAMES_FIXTURE)
ok('parses explicit-private label', privs.length === 1 && privs[0] === 'HIDDEN GAME')
ok('pad button label never becomes a game label', !privs.includes('DRIFT'))
ok('private title gated', m.isPrivateTitle('HIDDEN GAME: the sequel (closes #9)', privs))
ok('public title passes', !m.isPrivateTitle('OPEN GAME: polish pass', privs))
ok('untagged legacy title passes', !m.isPrivateTitle('SECRET RACER: retro coat of paint', privs))

// ---- screenshots ----
const shots = m.shotsByIssue([
    { path: 'docs/shots/issue-7/one.png' },
    { path: 'docs/shots/issue-7/two.jpg' },
    { path: 'docs/other/shot.png' },
    { path: 'docs/shots/issue-7/notes.md' },
])
ok('shots keyed by issue', shots[7]?.length === 2)
ok('non- shot files ignored', !shots['other'] && !Object.keys(shots).some(k => +k !== 7))

// ---- a whole day with every kind of news ----
const NOW = D('2026-10-19T19:00:00Z')            // Mon 12:00 PDT
const dayBeforeEnd = m.cutoffUTC('2026-10-19')   // Mon 07:00 PDT
const iso = ms => new Date(ms).toISOString()
const log = m.buildLog({
    now: NOW,
    privates: ['HIDDEN GAME'],
    treeFiles: [
        { path: 'docs/shots/issue-41/goal.png' },
        { path: 'docs/shots/issue-41/a.png' }, { path: 'docs/shots/issue-41/b.png' },
        { path: 'docs/shots/issue-41/c.png' }, { path: 'docs/shots/issue-41/d.png' },
        { path: 'docs/shots/issue-41/e.png' }, { path: 'docs/shots/issue-41/f.png' },
    ],
    pulls: [
        { number: 41, state: 'closed', merged_at: iso(dayBeforeEnd + 2 * 3600 * 1000), created_at: iso(dayBeforeEnd + 1000), title: 'BIG SHIP: closes #41', html_url: 'u/41', body: 'closes #41' },
        { number: 42, state: 'closed', merged_at: iso(dayBeforeEnd + 5 * 3600 * 1000), created_at: iso(dayBeforeEnd + 1000), title: 'SECRET RACER: night mode', html_url: 'u/42', body: '' },
        { number: 43, state: 'closed', merged_at: iso(dayBeforeEnd - 5 * 3600 * 1000), created_at: iso(dayBeforeEnd - 9 * 3600 * 1000), title: 'YESTERDAY SHIP', html_url: 'u/43', body: '' },
        { number: 44, state: 'open', merged_at: null, created_at: iso(dayBeforeEnd + 3600 * 1000), title: 'OLDBUT OPEN PR', html_url: 'u/44' },
    ],
    issues: [
        { number: 50, pull_request: undefined, title: 'GAME — SILENT BUILDS', labels: [{ name: 'building' }], created_at: '2026-10-10T00:00:00Z', updated_at: iso(dayBeforeEnd + 1000), html_url: 'i/50' },
        { number: 51, pull_request: undefined, title: 'STALLED: WARDEN CALLED IT', labels: [{ name: 'building' }], created_at: '2026-10-10T00:00:00Z', updated_at: iso(dayBeforeEnd + 1000), html_url: 'i/51' },
        { number: 52, pull_request: undefined, title: 'JON DECIDES THINGS', labels: [{ name: 'waiting-jon' }], created_at: '2026-10-10T00:00:00Z', updated_at: iso(dayBeforeEnd + 2000), html_url: 'i/52' },
    ],
    runs: [
        { id: 901, run_number: 101, event: 'push', conclusion: 'failure', created_at: iso(dayBeforeEnd - 2 * 3600 * 1000), html_url: 'r/101', head_commit: { message: 'fix: broke the thing' } },
        { id: 902, run_number: 102, event: 'push', conclusion: 'failure', created_at: iso(dayBeforeEnd + 3 * 3600 * 1000), html_url: 'r/102', head_commit: { message: 'feat: flaky smoke' } },
        { id: 903, run_number: 103, event: 'pull_request', conclusion: 'failure', created_at: iso(dayBeforeEnd + 3 * 3600 * 1000), html_url: 'r/103', head_commit: { message: 'pr run' } },
    ],
    jobsByRun: {
        901: [{ name: 'static', conclusion: 'failure' }, { name: 'smoke', conclusion: 'success' }],
        902: [{ name: 'static', conclusion: 'success' }, { name: 'smoke', conclusion: 'failure' }],
    },
    commentsByIssue: {
        50: [],
        51: [],
    },
})

ok('log tz + cutoff published', log.tz === 'America/Los_Angeles' && log.cutoffHour === 7)
ok('entries newest-first', log.entries.every((e, i) => i === 0 || e.day < log.entries[i - 1].day))
ok('history length is days', log.entries.length === log.days)
ok('live starts at this morning 07:00 PT', log.live.start === new Date(m.cutoffUTC(log.live.day)).toISOString())
ok('live day is today (PT)', log.live.day === '2026-10-19')

const oct18 = log.entries.find(e => e.day === '2026-10-18')
ok('entries hold only completed days, newest = yesterday', log.entries[0].day === '2026-10-18')
ok('merged-in-window -> shipped yesterday', oct18.shipped.some(s => s.number === 43))
ok('merged-this-morning is live, not yesterday', !oct18.shipped.some(s => s.number === 41) && log.live.shipped.some(s => s.number === 41))
ok('private title dropped from live', !log.live.shipped.some(s => s.number === 42))
ok('screenshots attached via ref', log.live.shipped.find(s => s.number === 41)?.shots.length === 4)
ok('shots capped at 4', (log.live.shipped.find(s => s.number === 41)?.shots || []).length <= 4)
ok('silent building issue is stalled', oct18.stalled.some(s => s.number === 50) && log.live.stalled.some(s => s.number === 50))
ok('STALLED: title reported', log.live.stalled.some(s => s.number === 51 && s.note === 'stalled'))
ok('static failure = regression', oct18.regressed.some(r => r.run === 101 && !r.advisory))
ok('advisory-only failure flagged advisory', log.live.regressed.some(r => r.run === 102 && r.advisory))
ok('pull_request events are not daily news', !log.entries.some(e => e.regressed.some(r => r.run === 103)) && !log.live.regressed.some(r => r.run === 103))
ok('waiting-jon issue reported', log.live.waiting.some(w => w.number === 52 && w.kind === 'issue'))
ok('old open PR waits', log.live.waiting.some(w => w.number === 44 && w.kind === 'pr'))
ok('headline shape is machine text', /^\d+ shipped · \d+ stalled\/regressed · \d+ waiting on Jon$/.test(oct18.headline))

// ---- the day can actually be won: one day with every section populated ----
ok('a full day reports shipped', oct18.shipped.length === 1)
ok('a full day reports stalled', oct18.stalled.length === 2)
ok('a full day reports regression', oct18.regressed.filter(r => !r.advisory).length === 1)
ok('live reports Jon traffic', log.live.waiting.length === 2 && log.live.shipped.length === 1)
ok('headline counts match sections', oct18.headline === '1 shipped · 3 stalled/regressed · 0 waiting on Jon')

if (fails.length) {
    console.error(`FAIL (${fails.length}/${pass + fails.length}):`)
    for (const f of fails) console.error('  ✗', f)
    process.exit(1)
}
console.log(`dailylogcheck: ${pass}/${pass + fails.length} PASS`)
