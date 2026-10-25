// JONQ — the questions-for-Jon protocol (#605), pinned offline.
//
//   npm run jonqcheck
//
// Two layers, like dailylogcheck:
//   A. scripts/lib/jonq.mjs (pure) — the body format round-trips, a question
//      only times out when it is genuinely past its deadline, Jon's word beats
//      his own default, the lane cap bites at 3, `halt` freezes, `steer`
//      ranks behind a corpse but ahead of `next`, and the idle order (#841)
//      puts the flagship polish stage behind the queue and ahead of STOP;
//   B. the wiring — warden.sh / forge.sh / forge-qa.sh / AGENTS.md /
//      FORGE.md actually contain the gates the protocol promises (shell that
//      cannot run offline still gets a source-level tripwire: delete the halt
//      guard from warden.sh and this goes red).
//
// Mutant proof (the one required per FORGE.md step 5): flip `isOverdue`'s
// comparison in scripts/lib/jonq.mjs (`>` -> `<`) -> OVERDUE cases go red.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
    claimOrder, decide, defaultComment, formatQuestion, halted, openQuestions,
    capReached, parseQuestion, steerIssue, validateAsk,
} from './lib/jonq.mjs'
import { FLAGSHIPS, FLAGSHIP_DIRS, parseGaps, ownsGap, flagshipStage, heldGames, qaIdleStage } from './lib/idle.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }

const NOW = new Date('2026-10-20T12:00:00Z')
const iso = (d) => d.toISOString()
const Q = (n, over = {}) => ({
    number: n, author: 'jalfern', state: 'open', created_at: '2026-10-19T00:00:00Z',
    labels: ['waiting-jon', 'question', 'lane:games'],
    body: formatQuestion({
        lane: 'games', question: `rider body? q${n}`, options: ['keep the duplicate', 'fetch a sixth body'],
        defaultText: 'keep the duplicate', now: NOW, ...over,
    }),
    comments: [],
})

// --- A. the pure protocol ----------------------------------------------
const body = formatQuestion({
    lane: 'games', question: 'Which rider-5 body?', options: ['keep the hooded duplicate', 'fetch a sixth CC0 body'],
    defaultText: 'keep the duplicate', now: NOW,
})
ok(body.includes('A) keep the hooded duplicate') && body.includes('B) fetch a sixth CC0 body'), 'options render A/B')
ok(body.includes('**Default:** keep the duplicate'), 'default line present')
ok(body.includes('**Deadline:** 2026-10-22T12:00:00.000Z'), 'deadline = now + 48 h (default)')
ok(body.includes('**Lane:** games'), 'lane line present')

const back = parseQuestion(body)
ok(back.defaultText === 'keep the duplicate', 'parse: default round-trips')
ok(back.options.length === 2 && back.options[1] === 'fetch a sixth CC0 body', 'parse: options round-trip')
ok(iso(back.deadline) === '2026-10-22T12:00:00.000Z', 'parse: deadline round-trips')
ok(back.lane === 'games', 'parse: lane round-trips')
ok(iso(parseQuestion(formatQuestion({ lane: 'qa', question: 'q', options: ['a', 'b'], defaultText: 'a', hours: 6, now: NOW })).deadline) === '2026-10-20T18:00:00.000Z', 'ask honors --hours')

ok(validateAsk({ lane: 'games', question: 'q?', options: ['a'], defaultText: 'a' }).length > 0, 'refuses a one-option question (an order, not a decision)')
ok(validateAsk({ lane: 'games', question: 'q?', options: ['a', 'b'] }).length > 0, 'refuses a question with no Default')
ok(validateAsk({ lane: null, question: 'q?', options: ['a', 'b'], defaultText: 'a' }).length > 0, 'refuses a question with no lane')
ok(validateAsk({ lane: 'qa', question: 'q?', options: ['a', 'b'], defaultText: 'a' }).length === 0, 'accepts a complete ask')

const LATE = new Date('2026-10-22T12:00:01Z')
ok(decide(Q(1), NOW).state === 'AWAITING', 'inside the deadline: AWAITING')
ok(decide(Q(2), LATE).state === 'OVERDUE', '1 s past the deadline: OVERDUE')
ok(decide(Q(3), new Date('2026-10-22T12:00:00Z')).state === 'AWAITING', 'exactly at the deadline is not yet OVERDUE (sweep defaults it next tick)')
ok(decide({ ...Q(4), comments: [{ author: 'jalfern', body: 'B — fetch it' }] }, LATE).state === 'ANSWERED', 'Jon replying after the deadline still wins: ANSWERED')
ok(decide({ ...Q(5), comments: [{ author: 'jalfern', body: 'A please' }] }, NOW).state === 'ANSWERED', 'Jon replying inside the deadline: ANSWERED')
for (const p of ['FORGE:', 'WARDEN:', 'QA:', 'QA (mini):']) {
    ok(decide({ ...Q(6), comments: [{ author: 'jalfern', body: `${p} noise` }] }, NOW).state === 'AWAITING', `robot comment "${p}…" is not an answer`)
}
ok(decide({ ...Q(7), comments: [{ author: 'jalfern', body: defaultComment('keep the duplicate', LATE) }] }, LATE).state === 'DEFAULTED', 'a taken default reads DEFAULTED, not ANSWERED')
ok(decide({ ...Q(8), body: '**Lane:** games\nno markers here' }, LATE).state === 'MALFORMED', 'no Default line: MALFORMED (nothing can time out)')
ok(defaultComment('keep the duplicate', LATE) === 'FORGE: no answer by 2026-10-22, took keep the duplicate', 'default note matches the spec wording exactly')

// --- caps ------------------------------------------------------------
const laneQ = (n, lane) => ({ ...Q(n), labels: ['waiting-jon', 'question', `lane:${lane}`] })
const three = [laneQ(11, 'games'), laneQ(12, 'games'), laneQ(13, 'games')]
ok(openQuestions(three, 'games').length === 3, 'openQuestions counts a lane\'s parked questions')
ok(capReached(three, 'games'), 'cap bites at 3 open questions in a lane')
ok(!capReached([laneQ(14, 'games'), laneQ(15, 'games')], 'games'), 'two open questions: still room')
ok(!capReached(three, 'qa'), 'other lanes have their own budget')
ok(openQuestions([{ ...laneQ(16, 'games'), state: 'closed' }], 'games').length === 0, 'closed questions stop counting toward the cap')
ok(openQuestions([{ ...laneQ(17, 'games'), labels: ['question', 'lane:games'] }], 'games').length === 0, 'a question Jon already un-parked is not open parking')

// --- halt + steer + claim ----------------------------------------------
ok(halted([{ number: 21, state: 'open', labels: ['halt'], author: 'jalfern', body: '', comments: [] }]), 'halt on an open issue freezes the factory')
ok(!halted([{ number: 22, state: 'closed', labels: ['halt'], author: 'jalfern', body: '', comments: [] }]), 'a lifted (closed) halt does not freeze')
ok(!halted([{ number: 23, state: 'open', labels: ['question'], author: 'jalfern', body: '', comments: [] }]), 'only the halt label freezes')

const ST = (n, author, labels, created = '2026-10-19T00:00:00Z') => ({ number: n, author, state: 'open', labels, created_at: created, body: '', comments: [] })
ok(steerIssue([ST(31, 'jalfern', ['steer', 'game-queue'])]) === 31, "jalfern's steer is found")
ok(steerIssue([ST(32, 'passing-by', ['steer', 'game-queue'])]) === null, "someone else's steer label is noise (labels are collaborator-only anyway)")
ok(steerIssue([ST(33, 'jalfern', ['steer', 'waiting-jon', 'question'])]) === null, 'a steered QUESTION is a decision, not a work item')
ok(steerIssue([ST(35, 'jalfern', ['steer'], '2026-10-18T00:00:00Z'), ST(34, 'jalfern', ['steer'], '2026-10-19T00:00:00Z')]) === 35, 'two steers: oldest first')
ok(claimOrder([ST(41, 'jalfern', ['building']), ST(42, 'jalfern', ['steer', 'game-queue'])]) === 41, 'claim: a half-built corpse outranks a steer')
ok(claimOrder([ST(43, 'jalfern', ['steer', 'game-queue']), ST(44, 'jalfern', ['next'])]) === 43, 'claim: steer outranks next')
ok(claimOrder([ST(45, 'jalfern', ['next']), ST(46, 'jalfern', ['game-queue'], '2026-10-15T00:00:00Z')]) === 45, 'claim: next outranks the oldest queue item')
ok(claimOrder([ST(47, 'jalfern', ['game-queue'], '2026-10-15T00:00:00Z'), ST(48, 'jalfern', ['game-queue'], '2026-10-16T00:00:00Z')]) === 47, 'claim: oldest queued first')
ok(claimOrder([ST(49, 'jalfern', ['game-queue', 'stalled'])]) === null, 'stalled items never claim themselves')
ok(claimOrder([]) === null, 'empty board: nothing to claim')

// --- idle: the flagship polish stage (#841) -----------------------------
// claimOrder misses -> QA borrow (prose + pgrep, step B) -> flagship stage ->
// only then STOP. A flagship stage is: first UNOWNED honest-gap of
// SSX, Emberwood, COMET DRIFT HD, Myst — skipping games QA holds building-qa.
const QA = (n, game, rest) => ({ number: n, title: `QA — ${game}: polish pass`, body: rest })
const README = (g) => read(`../src/games/${FLAGSHIP_DIRS[g]}/README.md`)
const REAL_GAPS = Object.fromEntries(FLAGSHIPS.map((g) => [g, parseGaps(README(g))]))
// #991: a flagship can honestly SHIP OUT of its gap list — #980 + #988 closed
// both open SSX notes, and parseGaps (correctly!) filtered the CLOSED-marked
// corpses down to []. The canary must therefore distinguish a broken parse
// (no section, no markers) from a finished list (CLOSED bullets present), and
// the order/ownership/kick fixtures below must not index [0] of a legal [].
// Synthetic FIX_GAPS carry the flagship-ORDER semantics; REAL_GAPS stay the
// ground truth for parse quality and for "what does the stage name TODAY".
const closedMarks = (md) => (((md.split(/^##\s+Honest gaps/im)[1] || '').split(/^##\s/m)[0]).match(/CLOSED by #\d+/g) || []).length
// #994: today's flagship rotation. SSX, Emberwood and COMET DRIFT HD have all
// honestly shipped out of their gap lists, so the un-skipped stage lands on the
// first flagship with a real open gap (Myst today). Hard-coding the two names
// that were "after" on Oct 24 turned the day HD shipped into red CI — derive it.
const FIRST_OPEN = FLAGSHIPS.find((g) => REAL_GAPS[g].length > 0)
const firstOpenExcluding = (skip) => FLAGSHIPS.find((g) => REAL_GAPS[g].length > 0 && !skip.includes(g))
const FIX_GAPS = {
    'SSX': ['demo SSX gap: the pack contact shadow still reads flat'],
    'Emberwood': ['demo Emberwood gap: townsfolk are rooted to their tiles'],
    'COMET DRIFT HD': ['demo comet gap: phones on the auto-fallback untested'],
    'Myst': ['demo Myst gap: the Spectator is a still panel'],
}
for (const g of FLAGSHIPS) {
    // #963: the floor guards against a broken parse (0 items), not against a
    // flagship running out of TODOs — closing gaps with **CLOSED by #n**
    // markers (#961) legitimately shrinks the list, and the next line still
    // catches empty/junk output. A fixed >= 3 would freeze the READMEs:
    // shipping honest work would be red.
    ok(REAL_GAPS[g].length >= 1 || closedMarks(README(g)) >= 1,
        `${g}: README honest-gaps parses nothing AND shows no CLOSED-by marker (parseGaps broken?)`)
    ok(REAL_GAPS[g].every((s) => s.length > 10), `${g}: parseGaps produced an empty/junk gap`)
}
ok(REAL_GAPS.Emberwood.length === 0 && closedMarks(README('Emberwood')) >= 4,
    'Emberwood ships out of its honest list — #994 closed the walk note, the CLOSED markers stay visible (filtered, not forgotten)')
ok(!REAL_GAPS.Emberwood.some((s) => /continue is keyboard-only/i.test(s)),
    '#965: Emberwood honest-gaps re-grew the shipped attract CONTINUE affordance — that work is gated, not open')
// #1001: this used to pin the sub-bullet-attachment guard on CometDriftHD's *real*
// open "Sound is … no music / Remainder" bullet. Closing that gap honestly made it
// red — the same #991 trap (a fixture indexing a flagship's always-open gap). The
// parse-quality property belongs on a synthetic open parent, so a flagship shipping
// out of its list can never turn main red.
{
    const sub = parseGaps('## Honest gaps\n- parent gap text that stays open here\n  - a child detail sub-bullet attached below\n')
    ok(sub.length === 1 && sub[0].includes('child detail sub-bullet'),
        'parseGaps joins a sub-bullet into its parent gap (synthetic — no flagship shipping can redden this guard)')
}
// #945: the SSX touch front-flip shipped with #894 and ssxmodelcheck gates it; the
// stale bullet that kept it in the list re-kicked free QA lanes onto closed work.
ok(!REAL_GAPS.SSX.some((s) => s.includes('added FRNT') || s.includes('retires it')),
    'SSX honest-gaps re-grew the shipped #871/#894 touch-flip note — that work is gated, not open')
ok(parseGaps('## Something else\n- no\n') .length === 0, 'parseGaps reads gaps outside the Honest-gaps section')
// #961: "**CLOSED by #<n>**" is shipped work, not a gap — keeping it re-kicked
// free QA lanes onto Emberwood's portrait note after #959/#960 shipped the fix.
ok(parseGaps('## Honest gaps\n- live gap still open here\n- shipped gap — **CLOSED by #959** (it shipped).\n').length === 1,
    '#961: parseGaps drops a CLOSED-marked bullet')
ok(parseGaps('## Honest gaps\n- open one\n- shipped **CLOSED by 959** without a hash\n').length === 2,
    '#961: only a "CLOSED by #<n>" marker closes a gap')
ok(!REAL_GAPS.Emberwood.some((s) => /portrait/i.test(s)),
    '#961: Emberwood honest-gaps re-grew the shipped #959/#960 portrait-full-bleed note')
const firstGapOwned = (game) => QA(900, game, FIX_GAPS[game][0])
ok(ownsGap([firstGapOwned('SSX')], 'SSX', FIX_GAPS.SSX[0]), 'ownsGap: an issue quoting the gap owns it')
ok(!ownsGap([QA(901, 'Myst', 'totally unrelated text')], 'SSX', FIX_GAPS.SSX[0]), 'ownsGap: another game\'s issue owns nothing here')
ok(!ownsGap([QA(902, 'SSX', 'general polish notes only')], 'SSX', FIX_GAPS.SSX[0]), 'ownsGap: naming the game without the gap does not own it')
ok(flagshipStage({ gapsByGame: FIX_GAPS, qaIssues: [], buildingQa: [] }).game === 'SSX',
    'idle: flagship order must start at SSX (Jon\'s order, #841)')
const stageReal = flagshipStage({ gapsByGame: REAL_GAPS, qaIssues: [], buildingQa: [] })
ok(REAL_GAPS.SSX.length === 0 && (FIRST_OPEN ? stageReal && stageReal.game === FIRST_OPEN : stageReal === null),
    '#991: SSX shipped its gap list empty (#980/#988) — the stage names the first flagship with a real gap, or null when every gap is owned (derived: today ' + (FIRST_OPEN || 'every gap owned -> null') + '), no crash')
ok(flagshipStage({ gapsByGame: { 'SSX': ['a', 'b'], 'Emberwood': ['c'] }, qaIssues: [QA(903, 'SSX', 'a')], buildingQa: [] }).gap === 'b',
    'idle: an owned gap is skipped for the next one in the same README')
ok(flagshipStage({ gapsByGame: { 'SSX': ['a', 'b'], 'Emberwood': ['c'] }, qaIssues: [QA(904, 'SSX', 'a'), QA(905, 'SSX', 'b')], buildingQa: [] }).game === 'Emberwood',
    'idle: all of SSX owned -> next flagship, in Jon\'s order')
ok(flagshipStage({ gapsByGame: FIX_GAPS, qaIssues: [], buildingQa: ['ssx', 'emberwood'] }).game === 'COMET DRIFT HD',
    'idle: games QA holds building-qa are never touched (case-insensitive)')
ok(flagshipStage({ gapsByGame: {}, qaIssues: [], buildingQa: FLAGSHIPS }) === null,
    'idle: every flagship held still yields null — a held flagship is not an invitation')
const allOwned = {
    gapsByGame: { 'SSX': ['a'], 'Emberwood': ['b'], 'COMET DRIFT HD': ['c'], 'Myst': ['d'] },
    qaIssues: [QA(906, 'SSX', 'a'), QA(907, 'Emberwood', 'b'), QA(908, 'COMET DRIFT HD', 'c'), QA(909, 'Myst', 'd')],
    buildingQa: [],
}
ok(flagshipStage(allOwned) === null, 'idle: with EVERY gap owned, null — only now is STOP legal')
ok(claimOrder([]) === null && flagshipStage({ gapsByGame: FIX_GAPS, qaIssues: [], buildingQa: [] }) !== null,
    'idle: an empty board claims nothing yet has forgeable work — the studio must not idle')
ok(claimOrder([ST(51, 'jalfern', ['game-queue'])]) === 51,
    'idle: a queued issue outranks the flagship stage (stage only runs on a claimOrder miss)')

// --- the warden's idle kick (#869) ---------------------------------------
// #841's rule never ran: sessions only start on a warden kick, and step 4
// kicked only when TARGET existed. The kick decision is the same pure logic:
// empty queue + an unowned gap => KICK, every gap owned => NONE.
ok(heldGames([QA(910, 'SSX', 'polish notes')]).join() === 'SSX',
    'idle-kick: a building-qa issue names its game held')
ok(heldGames([QA(911, 'BLOB BATTLE', 'polish pass')]).length === 0,
    'idle-kick: a non-flagship QA issue holds nothing')
ok(heldGames([{ title: 'QA — comet drift hd polish', body: '' }]).join() === 'COMET DRIFT HD',
    'idle-kick: the held match is case-insensitive')
ok(claimOrder([]) === null && flagshipStage({ gapsByGame: FIX_GAPS, qaIssues: [QA(913, 'BLOB BATTLE', 'polish pass')], buildingQa: [] }).game === 'SSX',
    '#869: empty queue + unowned gap -> KICK; QA noise on non-flagship games changes nothing')

// --- the unified queue (#878): a free QA lane takes an unowned flagship gap ---
// Oct 23: the Studio QA stream idled for hours with feedback empty while SSX's
// gaps were unowned — the builder's flagship path (#869) only fires when the
// whole builder is free. qaIdleStage lets the QA lane claim that gap itself.
const IQ = (n, labels, title = '', body = '') => ({ number: n, author: 'jalfern', state: 'open', labels, created_at: '2026-10-19T00:00:00Z', title, body, comments: [] })
ok(qaIdleStage({ issues: [IQ(920, ['game-queue'])], gapsByGame: FIX_GAPS }).game === 'SSX',
    '#878: empty feedback + unowned flagship gap -> the Studio QA lane gets kicked to SSX')
ok(qaIdleStage({ issues: [IQ(921, ['feedback'])], gapsByGame: REAL_GAPS }) === null,
    '#878: real feedback outranks the flagship stage — a claimable feedback item means no flagship kick')
ok(qaIdleStage({ issues: [IQ(922, ['waiting-jon', 'question']), IQ(923, ['needs-approval', 'feedback'])], gapsByGame: FIX_GAPS }).game === 'SSX',
    '#878: a parked question and an un-approved item are NOT claimable feedback — the stage still fires')
const skipBuild = qaIdleStage({ issues: [IQ(924, ['building'], 'GAME — SSX: the deep pass')], gapsByGame: REAL_GAPS })
const wantSkip = firstOpenExcluding(['SSX'])
ok(wantSkip ? skipBuild && skipBuild.game === wantSkip : skipBuild === null,
    '#878: a game the builder is inside (building) is skipped — one lane per game (derived: today ' + (wantSkip || 'every gap owned -> null') + ')')
const skipQa = qaIdleStage({ issues: [IQ(925, ['building-qa'], 'QA — SSX: polish pass')], gapsByGame: REAL_GAPS })
ok(wantSkip ? skipQa && skipQa.game === wantSkip : skipQa === null,
    '#878: a game another QA lane holds (building-qa) is skipped too (derived: today ' + (wantSkip || 'every gap owned -> null') + ')')
const allHeldByQa = FLAGSHIPS.map((g, i) => IQ(930 + i, ['building-qa'], `QA — ${g}: polish`))
ok(qaIdleStage({ issues: allHeldByQa, gapsByGame: REAL_GAPS }) === null,
    '#878: every flagship held -> null — STOP stays legal, the QA lane is not forced at a held game')


// --- B. the wiring says what the protocol promises --------------------
const warden = read('warden.sh')
ok(/HALTED=yes/.test(warden) && warden.includes('LANES=()'), 'warden: halt zeroes the QA lanes')
ok(warden.includes('TARGET=""') && /\[\[ "\$HALTED" == yes \]\] && TARGET=""/.test(warden), 'warden: halt suppresses the builder target')
ok(warden.includes('.name == "steer"') && warden.includes('$owner'), 'warden: the steer tier is in TARGET, gated on the owner')
ok(warden.includes('jonq.mjs" sweep') && warden.includes('no sweep, no kicks'), 'warden: the sweep runs each tick, unless halted')
ok(/halted=\$HALTED/.test(warden) && /questions=\$QWAIT/.test(warden), 'warden: the pulse line reports halted + questions')
ok(/ALIVE" == no && -z "\$TARGET" && "\$HALTED" != yes/.test(warden) && warden.includes('idle-kick.mjs'),
    '#869: warden asks idle-kick.mjs when the builder is idle, TARGET is empty and nothing is halted')
ok(warden.includes('== KICK*') && warden.includes('idle-kick'),
    '#869: the idle kick is gated on the answer — NONE (every gap owned) never starts a session')
const kick = read('idle-kick.mjs')
ok(kick.includes('flagshipStage') && kick.includes("'NONE'") && kick.includes('heldGames'),
    '#869: idle-kick answers from flagshipStage + heldGames only; any failure prints NONE, never a fabricated kick')
ok(kick.includes('qaIdleStage({') && kick.includes("=== 'qa'"),
    '#878: idle-kick.mjs qa mode routes a free QA lane through qaIdleStage')
ok(warden.includes('idle-kick.mjs" qa') && warden.includes('forge-qa-studio') && warden.includes('qa-flagship:studio') && warden.includes('"$ALIVE" == yes'),
    '#878: the warden kicks Studio QA to an unowned flagship gap while the builder is busy and feedback is empty')

const fs = read('forge.sh')
ok(!/ghJson\(\[/.test(read('jonq.mjs')) || /Array\.isArray\(args\[0\]\)/.test(read('jonq.mjs')),
    'jonq.mjs: ghJson never receives a nested array un-normalized (a nested argv reaches gh as one comma-joined URL)')
ok(/title: i\.title/.test(read('jonq.mjs')), 'jonq.mjs: toIssue keeps the title (list printed undefined without it)')
ok(fs.includes('jonq.mjs" halt') && fs.includes('stays asleep'), 'forge.sh: refuses to start while halted')
ok(fs.includes('jonq.mjs" steer') && fs.includes('STEER'), 'forge.sh: names jalfern\'s steer in the prompt')
ok(read('forge-qa.sh').includes('jonq.mjs" halt'), 'forge-qa.sh: refuses to start while halted')
const law = read('../AGENTS.md')
ok(/rule 7|7\. Every ~4 hours/.test(law) && law.includes('jonq.mjs ask') && !law.includes('three questions for Jon'), 'AGENTS.md rule 7: questions are issues now, not STATE lines')
ok(law.includes('`halt`') && law.includes('`steer`'), 'AGENTS.md: halt + steer are law')
const playbook = read('FORGE.md')
ok(playbook.includes('Halt first') && playbook.includes('steer') && playbook.includes('jonq.mjs list'), 'FORGE.md step 2: halt-first, steer-first, questions are not work items')
ok(!playbook.includes('three questions for Jon') && playbook.includes('jonq.mjs ask'), 'FORGE.md step 9: STATE links questions, never carries them')
ok(read('FORGE-QA.md').includes('jonq.mjs ask --lane qa'), 'FORGE-QA.md 5b: decisions ask decidable')
ok(read('FORGE-QA.md').includes('idle-kick.mjs qa') && read('FORGE-QA.md').includes('Unified queue') && read('FORGE-QA.md').includes('#878'),
    '#878: FORGE-QA.md step 2 carries the unified-queue flagship borrow (never idle a free QA lane)')

// --- idle wiring: the playbook + the architecture map (#841) -------------
ok(!playbook.includes('nothing to forge'), 'FORGE.md still carries the old idle STOP ("nothing to forge")')
ok(playbook.includes('Never idle the builder') && playbook.includes('#841'),
    'FORGE.md step 2: the flagship-polish idle clause is missing')
for (const g of FLAGSHIPS) ok(playbook.includes(g), `FORGE.md idle clause does not name flagship ${g}`)
ok(playbook.indexOf('borrow the QA') < playbook.indexOf('Never idle the builder'),
    'FORGE.md: the QA-borrow step must stay ahead of the flagship stage')
ok(playbook.includes('building-qa') && playbook.includes('then claim it the normal way') && playbook.includes('File that stage as its own'),
    'FORGE.md idle clause: must skip QA-held games, file the stage as its own issue, then claim normally')
const map = read('../docs/HARNESS.md')
ok(map.includes('idle.mjs') && map.includes('SSX/Emberwood/COMET DRIFT HD/Myst') && map.includes('borrow ONE QA'),
    'docs/HARNESS.md: the architecture map does not describe the idle order (borrow -> flagship -> STOP)')

console.log(`jonqcheck: ${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  FAIL  ${f}`)
process.exit(fails.length ? 1 : 0)
