// NEVER-BE-DRY — the #1571 rule, pinned: the lanes never run dry.
//
//   npm run neverbudrycheck              # the laws
//   npm run neverbudrycheck -- --mutant # prove every text law can fail
//
// What it pins (all offline — raw text + the pure halves of idle/jonq):
//   1. FORGE.md step 2 ends in the NEVER RUN DRY rung, AFTER the #841
//      flagship stage, and the old "may you STOP"-on-flagships sentence is
//      gone; the rung demands a why-weakest line and a player-noticeable
//      gameplay fix (refactor/check-only excluded).
//   2. idle-kick.mjs consults weakestStage only after flagshipStage, and
//      answers the `weak` shape; lib/idle.mjs exports the whole never-dry
//      machinery; warden 4b is the never-dry kick and still never files a
//      question (a dry queue is the warden's normal state, not a crisis).
//   3. jonq refuses dry-queue asks, caps new-title asks at one per lane
//      per week, and sweep flags Default:-without-`question` issues — the
//      flag carries the FORGE prefix so ROBOT_SHAPE keeps it out of
//      answer-detection (a JONQ: prefix false-answered questions, #1403).
//   4. weakestStage behaves: most-unowned-gaps loses (weakest = worst),
//      held titles skipped, QA-owned gaps discounted, ties to the older
//      title, an empty shelf answers null (only then is STOP legal); and
//      frozen (`waiting-jon`) feedback suppresses but never weakens (#3074).
//   5. the registry really enumerates (the pick must come from the shelf
//      as it is, not from memory), and the alias + CORE entry exist so CI
//      actually runs this file.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseGaps, parseRegistry, weakestStage, heldDirs } from './lib/idle.mjs'
import { validateAsk, titleAskBlocked, unlabeledQuestions, UNLABELED_FLAG } from './lib/jonq.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }

// ---------------------------------------------------------------- texts ----
const forgeMd = read('scripts/FORGE.md')
const warden = read('scripts/warden.sh')
const kick = read('scripts/idle-kick.mjs')
const idleLib = read('scripts/lib/idle.mjs')
const jonqLib = read('scripts/lib/jonq.mjs')
const jonqCli = read('scripts/jonq.mjs')
const pkg = read('package.json')
const checksTable = read('scripts/checks.mjs')
const registry = read('src/config/games.js')

// ------------------------------------------------------------- the laws ----
const rungPresent = (t) => /NEVER RUN DRY\s*\(###?1571\)/i.test(t)
    || (/NEVER RUN DRY/i.test(t) && /#1571/.test(t))
const rungAfterFlagship = (t) => {
    const dry = t.search(/NEVER RUN DRY/i)
    const flagship = t.search(/Never idle the builder \(#841\)/)
    return dry > -1 && flagship > -1 && dry > flagship
}
const stopOnFlagshipsGone = (t) => !/flagship.s every gap is owned may you STOP/.test(t)
const rungDemands = (t) => /why-weakest/i.test(t) && /check-only change does not count/i.test(t)
const kickWired = (t) => /flagshipStage\(/.test(t) && /\|\|\s*weakestStage\(/.test(t)
    && t.search(/flagshipStage\(/) < t.search(/\|\|\s*weakestStage\(/)
    && /stage\.weak/.test(t)
const idleExports = (t) => /export function weakestStage/.test(t) && /export function parseRegistry/.test(t)
    && /export function heldDirs/.test(t)
const idleDeclinesFrozen = (t) => /includes\('waiting-jon'\)/.test(t)
// #3479: the import regex must carry the default-alias branch — a shelf that
// silently drops `import XGame from '../games/X'` mis-scores never-dry.
const idleParsesDefaults = (t) => /\(\?:\\\{\[\^\}\]\*\\\}\|\\w\+\)\\s\+from/.test(t)
const wardenNeverAsks = (t) => !/jonq\.mjs"? ask/.test(t)
const wardenNeverDryRung = (t) => /NEVER-DRY KICK/.test(t) && /#1571/.test(t)
const jonqRefusesDry = (t) => /DRY_QUEUE_SHAPE\.test\(/.test(t)
const jonqCapsTitle = (t) => /TITLE_ASK_DAYS\s*=\s*7/.test(t) && /titleAskBlocked\(/.test(t)
const cliChecksCap = (t) => /titleAskBlocked\(recent/.test(t)
const sweepFlagsUnlabeled = (t) => /unlabeledQuestions\(/.test(t) && /UNLABELED_FLAG/.test(t)
const flagIsRobotShaped = (t) => /FORGE: unlabeled question/.test(t) // JONQ: would read as Jon's answer (#1403)
const aliasWired = (p, table) => /"neverbudrycheck"\s*:/.test(p) && /'neverbudrycheck'/.test(table)

// --------------------------------------------------------------- laws ----
ok(rungPresent(forgeMd), 'FORGE.md is missing the NEVER RUN DRY rung (#1571) — the picking order ends dry')
ok(rungAfterFlagship(forgeMd), 'the never-dry rung must sit AFTER the #841 flagship stage (flagship order is Jon\'s)')
ok(stopOnFlagshipsGone(forgeMd), 'FORGE.md still promises STOP once flagships are spent — that is the dry rule #1571 replaced')
ok(rungDemands(forgeMd), 'the rung must demand a why-weakest line and exclude refactor/check-only changes')
ok(kickWired(kick), 'idle-kick.mjs must answer KICK ... weak via weakestStage after flagshipStage')
ok(idleExports(idleLib), 'lib/idle.mjs must export weakestStage + parseRegistry + heldDirs')
ok(idleDeclinesFrozen(idleLib), "weakestStage's named count must decline `waiting-jon` feedback (#3074 — an unactionable item is not weakness)")
ok(wardenNeverAsks(warden), 'warden.sh files a question — the warden never asks; only sessions ask, via jonq')
ok(wardenNeverDryRung(warden), 'warden 4b must name the never-dry kick (#1571)')
ok(jonqRefusesDry(jonqLib), 'validateAsk must refuse dry-queue asks (DRY_QUEUE_SHAPE)')
ok(jonqCapsTitle(jonqLib), 'the new-title ask needs the 7-day per-lane cap (TITLE_ASK_DAYS + titleAskBlocked)')
ok(cliChecksCap(jonqCli), 'jonq ask must actually consult titleAskBlocked before filing')
ok(sweepFlagsUnlabeled(jonqCli), 'sweep must flag Default:-without-question issues (unlabeledQuestions + flag constant)')
ok(flagIsRobotShaped(jonqLib), 'the flag comment must be FORGE-prefixed — a non-robot prefix would false-answer the issue (#1403)')
ok(aliasWired(pkg, checksTable), 'neverbudrycheck must exist in package.json AND CORE.checks, or CI never runs it')

// ------------------------------------------------- weakestStage fixtures ----
const GS = [
    { dir: 'Pong', label: 'PONG', gaps: ['a', 'b'] },
    { dir: 'Adventure', label: 'ADVENTURE', gaps: ['x', 'y', 'z'] },
    { dir: 'Held', label: 'HELD GAME', gaps: ['p', 'q', 'r', 's'] },
]
const qa = [{ title: 'QA — HELD GAME: polish pass', body: 'juice it' }]
ok(JSON.stringify(weakestStage({ games: GS, qaIssues: qa, heldDirs: ['Held'] }))
    === JSON.stringify({ game: 'ADVENTURE', dir: 'Adventure', gap: 'x', index: 0, score: 3, weak: true }),
'weakestStage must name the unheld title with the most unowned gaps, oldest gap first')
ok(weakestStage({ games: GS, qaIssues: [], heldDirs: [] }).dir === 'Held',
'the weakest is the WORST: most open work wins')
ok(weakestStage({ games: [GS[0], { ...GS[1], gaps: ['z', 'y', 'x'] }], qaIssues: [], heldDirs: [] }).gap === 'z',
'ties break toward... the first-listed gap stays oldest (README order)')
ok(weakestStage({ games: [
    { dir: 'Pong', label: 'PONG', gaps: [] },
    { dir: 'Other', label: 'OTHER', gaps: [] },
], qaIssues: [{ title: 'QA — OTHER: something', body: 'polish' }], heldDirs: [] }).dir === 'Other',
'open feedback naming a game makes it weak even with an empty gap list (score from feedback)')
ok(weakestStage({ games: [
    { dir: 'Pong', label: 'PONG', gaps: [] },
    { dir: 'Other', label: 'OTHER', gaps: [] },
], qaIssues: [{ title: 'QA — OTHER: something', body: 'polish', labels: ['feedback', 'waiting-jon'] }], heldDirs: [] }) === null,
'#3074: waiting-jon feedback names weakness no lane may act on — naming must not weaken it; an otherwise-dry shelf stays STOP-legal')
ok(weakestStage({ games: [
    { dir: 'Other', label: 'OTHER', gaps: ['alpha gap'], },
], qaIssues: [{ title: 'QA — OTHER: polish pass', body: 'alpha gap remains open', labels: ['feedback', 'waiting-jon'] }], heldDirs: [] }) === null,
'#3074: ownership stays label-blind — a waiting-jon issue still SUPPRESSES the gaps it owns (the fix must never rekind a suppressed gap into a kick)')
ok(weakestStage({ games: [
    { dir: 'Other', label: 'OTHER', gaps: [] },
], qaIssues: [{ title: 'QA — OTHER: something', body: 'polish', labels: ['feedback'] }], heldDirs: [] }).dir === 'Other',
'#3074 boundary: actionable feedback (no waiting-jon) still weakens — the filter must not blind the ladder')
ok(weakestStage({ games: [], qaIssues: [], heldDirs: [] }) === null,
'an empty shelf answers null — ONLY then is STOP legal')
ok(heldDirs(GS, [{ labels: ['building'], title: 'POLISH — HELD GAME: q', body: '' }]).join() === 'Held',
'heldDirs skips titles a building/building-qa issue is inside')

// ---- Restored subsections do not score (#3553 follow-up, 2026-11-26) ----
// `### Restored in …` subsections inside Honest gaps are shipped history. The
// old parser stopped only at h2 and counted nine restored Adventure bullets as
// open gaps — ADVENTURE scored 13 on never-dry where the honest count was 1,
// and idle-kick aimed slot b at a phantom.
ok(parseGaps('## Honest gaps\n- Real open A.\n- Real open B.\n\n### Restored in the #1545 polish pass\n- the magnet attracts items now\n\n## Other section\n- outside the list\n').join('|')
    === 'Real open A.|Real open B.',
'h3 subsections end the Honest gaps list — Restored bullets do not score')
ok(parseGaps('- No guidance surface — restored in the #1572 feel pass item 2 (see below).').length === 0,
'"Restored in the #N pass" bullets are CLOSED-class history, not gaps')
{
    const md = read('src/games/Adventure/README.md')
    const gaps = parseGaps(md)
    ok(!gaps.some((g) => /variant selector/i.test(g)),
        'ADVENTURE: the variant-selector line is marked CLOSED by #1572 (VARIANTS + SELECT GAME ship today)')
    ok(!gaps.some((g) => /pen-shaped dragon sounds/.test(g)),
        'ADVENTURE: the silent-cart adjudication carries **DISCLAIMER** and is not scored weakness')
    ok(!gaps.some((g) => /magnet \*\*attracts|dragon \*\*respawns|guidance tab|chew|sparkle|rooms cut/i.test(g)),
        'ADVENTURE: no Restored-subsection bullet counts against the title anymore')
}
ok(heldDirs(GS, [{ labels: ['building-qa'], title: 'QA — HELD GAME: polish pass',
    body: 'PONG scores 2 but held; Adventure is gap-free — SSX/Emberwood/COMET/Myst gap-free' }]).join() === 'Held',
'#2571: heldDirs matches TITLES only — a why-weakest body that verbatim-names skipped titles must not phantom-hold them')

// ------------------------------------------------------ jonq pure fixtures ----
ok(validateAsk({ lane: 'games', question: 'The queue is empty — what should we build next?', options: ['a', 'b'], defaultText: 'a' }).length > 0,
'jonq must refuse a dry-queue question (#1571)')
ok(validateAsk({ lane: 'games', question: 'What next, boss?', options: ['a', 'b'], defaultText: 'a' }).length > 0,
'"what next" is the dry shape too')
ok(validateAsk({ lane: 'games', question: 'SSX rider 5 body — keep the duplicate or fetch a sixth CC0 body?', options: ['a', 'b'], defaultText: 'a' }).length === 0,
'a real decision must still pass (the refusal must not eat honest asks)')
const now = new Date('2026-11-04T12:00:00Z')
ok(titleAskBlocked([{ labels: ['question', 'lane:games'], title: 'New flagship title?', body: 'x', created_at: '2026-11-01T00:00:00Z' }], 'games', now),
'a title ask from this week blocks the lane')
ok(!titleAskBlocked([{ labels: ['question', 'lane:games'], title: 'New flagship title?', body: 'x', created_at: '2026-10-01T00:00:00Z' }], 'games', now),
'older than the cap re-opens the lane')
ok(!titleAskBlocked([{ labels: ['question', 'lane:qa'], title: 'New flagship title?', body: 'x', created_at: '2026-11-01T00:00:00Z' }], 'games', now),
'the cap is per lane')
ok(unlabeledQuestions([
    { number: 1, state: 'open', labels: ['game-queue'], body: 'do a thing\n\n**Default:** just do it', comments: [] },
    { number: 2, state: 'open', labels: ['question'], body: '**Default:** fine', comments: [] },
    { number: 3, state: 'open', labels: [], body: 'no markers here', comments: [] },
    { number: 4, state: 'open', labels: [], body: '**Default:** y', comments: [{ body: UNLABELED_FLAG + ' — see #1571' }] },
]).map((i) => i.number).join() === '1',
'unlabeledQuestions flags Default:-without-label once and only once')

// ----------------------------------------------------- registry (the shelf) ----
const shelf = parseRegistry(registry)
ok(shelf.length >= 50, `the registry enumerates the shelf (${shelf.length} titles — fewer means the parser broke)`)
// #3479: the loose floor hid a parser that silently dropped every DEFAULT import
// (`import DefenderGame from '../games/Defender'`) — 21 titles vanished off the
// never-dry shelf while this check stayed green. Cross-check against the source
// text itself: every dir ANY import style references must be enumerated.
const referenced = new Set([...registry.matchAll(/['"]\.\.\/games\/([\w]+)['"]/g)].map((m) => m[1]))
const parsedDirs = new Set(shelf.map((g) => g.dir))
const missing = [...referenced].filter((d) => !parsedDirs.has(d))
ok(missing.length === 0, `parseRegistry enumerates every imported dir (${missing.length} missing: ${missing.slice(0, 5).join(', ')})`)
ok(shelf.some((g) => g.dir === 'Defender' && g.label) && shelf.some((g) => g.dir === 'Adventure' && g.label),
'the shelf carries the static default imports (Defender, Adventure) — the #3479 hole')
ok(shelf.some((g) => g.label === 'SSX') && shelf.some((g) => g.dir === 'CometDrift' && g.label),
'the shelf carries labels so feedback naming a game counts toward weakness')

console.log(`neverbudry: ${pass} ok / ${fails.length} fail`)
for (const f of fails) console.log(`  FAIL ${f}`)

// --------------------------------------------------------------- mutants ----
if (process.argv.includes('--mutant')) {
    const spec = {
        forge: [forgeMd, [rungPresent, rungAfterFlagship, stopOnFlagshipsGone, rungDemands]],
        kick: [kick, [kickWired]],
        idleLib: [idleLib, [idleExports, idleDeclinesFrozen, idleParsesDefaults]],
        warden: [warden, [wardenNeverAsks, wardenNeverDryRung]],
        jonqLib: [jonqLib, [jonqRefusesDry, jonqCapsTitle, flagIsRobotShaped]],
        jonqCli: [jonqCli, [cliChecksCap, sweepFlagsUnlabeled]],
        pkg: [pkg, [(t) => aliasWired(t, checksTable)]],
        table: [checksTable, [(t) => aliasWired(pkg, t)]],
    }
    const mutants = [
        ['FORGE.md rung deleted', 'forge', (t) => t.replace(/\*\*NEVER RUN DRY[\s\S]*?not a question\)\./, '(rung deleted)')],
        ['rung moved before flagship stage', 'forge', (t) => t.replace('Never idle the builder (#841)', 'NEVER RUN DRY (#1571) placeholder')],
        ['old dry STOP restored', 'forge', (t) => t + "\nOnly when every flagship's every gap is owned may you STOP — say so in STATE.md and exit.\n"],
        ['why-weakest bar removed', 'forge', (t) => t.replace(/why-weakest/g, 'nice')],
        ['idle-kick stops at flagships', 'kick', (t) => t.replace(/\n\s*\|\| weakestStage\([\s\S]*?\)\n/, '\n')],
        ['waiting-jon filter removed (#3074)', 'idleLib', (t) => t.replace("includes('waiting-jon')", "includes('never-jon')")],
        ['registry drops default imports (#3479)', 'idleLib', (t) => t.replace('(?:\\{[^}]*\\}|\\w+)', '(?:\\{[^}]*\\})')],
        ['warden files questions again', 'warden', (t) => t.replace('ACTIONS+=("questions:$N")', 'node "$REPO/scripts/jonq.mjs" ask --lane games --title t --question "queue empty, what next?" --option a --option b --default a; ACTIONS+=("questions:$N")')],
        ['warden forgets the rung', 'warden', (t) => t.replace(/IDLE NEVER-DRY KICK \(#869[^)]*\)/, 'IDLE FLAGSHIP KICK (#869)')],
        ['jonq accepts dry asks', 'jonqLib', (t) => t.replace("DRY_QUEUE_SHAPE.test(String(question || ''))", 'false')],
        ['title cap widened to forever', 'jonqLib', (t) => t.replace(/TITLE_ASK_DAYS\s*=\s*7/, 'TITLE_ASK_DAYS = 36500')],
        ['flag switched to JONQ: prefix', 'jonqLib', (t) => t.replace('FORGE: unlabeled question?', 'JONQ: unlabeled question?')],
        ['cli never consults the cap', 'jonqCli', (t) => t.replace('titleAskBlocked(recent, lane, now)', 'false')],
        ['sweep stops flagging unlabeled', 'jonqCli', (t) => t.replace('unlabeledQuestions([issue]).length', '0')],
        ['alias removed from package.json', 'pkg', (t) => t.replace(/"neverbudrycheck"\s*:\s*"[^"]*",?/, '')],
        ['CORE entry removed', 'table', (t) => t.replace(/'neverbudrycheck',?/, '')],
    ]
    let killed = 0
    for (const [name, key, mutate] of mutants) {
        const [text, laws] = spec[key]
        const broken = mutate(text)
        const dead = laws.some((L) => !L(broken))
        console.log(`${dead ? 'ok  ' : 'FAIL'} mutant ${dead ? 'killed' : 'SURVIVED'}: ${name}`)
        if (dead) killed++; else fails.push(`mutant survived: ${name}`)
    }
    console.log(`neverbudry mutants: ${killed}/${mutants.length} killed`)
}

if (fails.length) {
    process.exit(1)
}
