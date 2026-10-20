// JONQ — the questions-for-Jon protocol (#605), pinned offline.
//
//   npm run jonqcheck
//
// Two layers, like dailylogcheck:
//   A. scripts/lib/jonq.mjs (pure) — the body format round-trips, a question
//      only times out when it is genuinely past its deadline, Jon's word beats
//      his own default, the lane cap bites at 3, `halt` freezes, `steer`
//      ranks behind a corpse but ahead of `next`;
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

// --- B. the wiring says what the protocol promises --------------------
const warden = read('warden.sh')
ok(/HALTED=yes/.test(warden) && warden.includes('LANES=()'), 'warden: halt zeroes the QA lanes')
ok(warden.includes('TARGET=""') && /\[\[ "\$HALTED" == yes \]\] && TARGET=""/.test(warden), 'warden: halt suppresses the builder target')
ok(warden.includes('.name == "steer"') && warden.includes('$owner'), 'warden: the steer tier is in TARGET, gated on the owner')
ok(warden.includes('jonq.mjs" sweep') && warden.includes('no sweep, no kicks'), 'warden: the sweep runs each tick, unless halted')
ok(/halted=\$HALTED/.test(warden) && /questions=\$QWAIT/.test(warden), 'warden: the pulse line reports halted + questions')
const fs = read('forge.sh')
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

console.log(`jonqcheck: ${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  FAIL  ${f}`)
process.exit(fails.length ? 1 : 0)
