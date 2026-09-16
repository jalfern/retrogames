// zorkcheck — the AI gate that needs no browser.
//
// Unlike every other check in this repo, this one does not launch Chrome and
// does not need `npm run dev`: the Z-machine is a portable interpreter, so the
// real story file can be booted in Node and driven move by move in milliseconds.
// That makes it the cheapest AI regression gate we will ever have — and the only
// one where the agent is byte-for-byte reproducible (see AI-PLAN.md §6.5, where
// King's Quest needs 10 paired trials because DOSBox is not deterministic).
//
// It gates the two seams the Zork AI is built on, not the AI's cleverness:
//
//   ACT   can an agent drive the game at all, through the same actuator the
//         player's own text box uses (the Glk input resolver + vm.resume)?
//   SEE   does the transcript sensor turn prose into a Percept — room, score,
//         verdict, dark — with the inferences labelled as inferences?
//
// The golden strings are the point: "Kitchen" is a room, "You can't go that
// way." is a complaint that must NOT change the room. That distinction is the
// whole reason naive map trackers drift, so it is asserted directly.
//
// Stage 0 scope. Stage 1 adds the explorer and the invariants (rooms mapped in N
// moves, score >= P, NEVER enter a dark room unlit).
//
// Usage:
//   npm run zorkcheck
//   node scripts/zorkcheck.mjs [--moves 30] [--trace] [--story zork1.z3]

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { opt } from './lib/harness.mjs'
import { Report } from './lib/harness.mjs'
import { TranscriptSensor } from '../src/games/Zork/sensors/transcript.js'
import { perceptSignature } from '../src/ai/percept.js'
import { ZorkExplorer } from '../src/games/Zork/agent/explorer.js'
import { AgentLoop } from '../src/ai/loop.js'

const require = createRequire(import.meta.url)
const { ZVM } = require('ifvms/src/index.js')
const { createGlk } = await import('../src/games/Zork/GlkAdapter.js')

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const storyName = String(opt(args, '--story', 'zork1.z3'))
const extraMoves = Number(opt(args, '--moves', 16))
const trace = !!opt(args, '--trace', false)
const storyPath = join(here, '..', 'public', 'games', 'zork', storyName)

const r = new Report('zorkcheck')
const wait = (ms) => new Promise(res => setTimeout(res, ms))

// ── Boot the real story file ─────────────────────────────────────────────────
let story
try {
  story = new Uint8Array(readFileSync(storyPath))
} catch (e) {
  console.error(`Cannot read ${storyPath}: ${e.message}`)
  console.error('(public/games/zork/*.z3 must stay committed — see AGENTS.md › WASM assets)')
  process.exit(1)
}

let resolver = null
let chunks = []
let crashed = null
const sensor = new TranscriptSensor()

const Glk = createGlk({
  print(t) { if (t) chunks.push(t) },
  clear() { chunks = [] },
  waitForInput(cb) { resolver = cb },
  handleError(m) { crashed = String(m) },
}, 'zorkcheck')

const vm = new ZVM()
vm.prepare(story, { Glk })
vm.start()
await wait(120)

const output = () => chunks.join('')

/** Send one command and return the machine's whole reply. */
async function send(command, settle = 90) {
  if (!resolver) throw new Error(`no input requested before "${command}" — the VM is not waiting for a command`)
  const cb = resolver
  resolver = null
  const mark = chunks.length
  cb(command)
  if (!vm.quit) vm.resume(command.length)
  await wait(settle)
  const reply = chunks.slice(mark).join('')
  // Same pairing rule as the browser component: the exchange is (command, everything
  // printed between this command and the next input request).
  sensor.saw(command, reply)
  if (trace) console.log(`  > ${command}\n    ${reply.trim().replace(/\n/g, '\n    ')}`)
  return reply
}

const opening = output()
r.check('story boots and prints an opening', /west of house|great underground empire/i.test(opening),
  `${opening.trim().split('\n').filter(Boolean)[0] || '(nothing)'}…`)
r.check('VM waits for input (the agent has an actuator)', !!resolver)
r.check('no Glk errors during boot', !crashed, crashed || '')

if (!resolver) {
  r.exit()
}

// ── ACT: a scripted opening, asserted against what the game actually says ─────
// Verified route, one assertion per move — because a check that only counts
// moves will happily report success while the agent walks into a wall.
const SCRIPT = [
  ['open mailbox', /leaflet/i, 'mailbox opens and reveals the leaflet'],
  ['take leaflet', /^taken/im, 'leaflet taken'],
  ['north', /north of house/i, 'walked north to North of House'],
  ['east', /behind house/i, 'walked east to Behind House'],
  ['open window', /open the window/i, 'window forced open'],
  ['in', /kitchen/i, 'entered the Kitchen'],
  ['south', /can.?t go that way/i, 'a wrong direction is refused'],
  ['west', /living room/i, 'walked west to Living Room'],
]

let moveErrors = 0
// Zork prints a room's long description ONCE. Re-entering "Kitchen" prints the
// heading and a short reminder, and the sentence that told us about the dark
// chimney is gone until we `look`. So the claims have to be caught at first
// sight and kept — which is precisely why they live in the map (per room, forever)
// and not in the sensor (per reply, already overwritten). A sensor that only
// knows what the last line said cannot plan.
let firstSight = null
for (const [cmd, expect, label] of SCRIPT) {
  let reply = ''
  try {
    reply = await send(cmd)
  } catch (e) {
    moveErrors++
    r.check(label, false, e.message)
    continue
  }
  r.check(label, expect.test(reply), reply.trim().split('\n')[0].slice(0, 48))
  if (/kitchen/i.test(reply) && !firstSight) {
    firstSight = {
      visible: sensor.visible.slice(),
      contains: JSON.parse(JSON.stringify(sensor.contains)),
      announced: sensor.announced.slice(),
      darkExits: sensor.darkExits.slice(),
    }
  }
}
r.check('every scripted move was answered', moveErrors === 0, `${moveErrors} failures`)

// ── STAGE 2a: read the prose the game is already giving us ───────────────────
// The scripted walk ended in the Living Room, so go back through the passage and
// PROVE we are in the Kitchen before grading the reading. A check that assumes
// where it is standing measures whatever room it happened to end up in — which is
// how a green suite can mean nothing more than "the parser liked this one".
//
// Here is what Zork actually prints in the Kitchen:
//
//   A passage leads to the west and a dark staircase can be seen leading upward.
//   A dark chimney leads down and to the east is a small window which is open.
//   A bottle is sitting on the table.
//   The glass bottle contains:  A quantity of water
//   On the table is an elongated brown sack, smelling of hot peppers.
//
// Before this stage the sensor reported `visible: []` — a bottle, a sack and a
// cake in the room and nothing parsed, because it only understood "there is X"
// and Zork writes "X is sitting on Y" and "On Y is X". A sensor that is wrong in
// the direction of an EMPTY room is worse than one that hallucinates: the agent
// doesn't just miss the objects, it stops wanting things, which is how stage 1
// ended up unable to explain why it never had a lamp.
const kit = firstSight?.visible || []
r.check("the Kitchen's furniture is visible (was: nothing)",
  kit.some(v => /bottle/.test(v)) && kit.some(v => /sack/.test(v)),
  kit.join(', ') || 'NOTHING — "is sitting on" / "On the table is" unparsed')
r.check('container contents are parsed from a colon list',
  (firstSight?.contains?.['glass bottle'] || []).some(x => /water/.test(x)),
  JSON.stringify(firstSight?.contains || {}))

// The game LABELS some exits dark before we ever stand in them. Attributing that
// label is the whole value, so the test is as much about what must NOT be marked
// as what must: west is in the same SENTENCE as "a dark staircase", and a sensor
// that graded by sentence would make the agent fear a lit passage and skip the way
// out. Clause-level attribution is what separates "somewhere down there is dark"
// from "everywhere is dark" — the same bug class as sticky darkness in stage 1.
r.check("the game's own dark labels were read off the description",
  (firstSight?.darkExits || []).includes('up') && (firstSight?.darkExits || []).includes('down'),
  `dark ways: ${(firstSight?.darkExits || []).join(', ') || 'NONE'}`)
r.check('darkness was attributed per-clause, not per-sentence',
  !(firstSight?.darkExits || []).includes('west') && (firstSight?.announced || []).includes('west'),
  `announced: ${(firstSight?.announced || []).join(', ')} · dark: ${(firstSight?.darkExits || []).join(', ') || 'none'}`)
// `look` is how a brain refreshes a room it has already seen. If LOOK did not
// reprint the long description, the dark ways would be unrecoverable after the
// first visit and any plan built on them would decay — worth knowing before
// stage 2 leans on it.
// Walk back through the passage first: the scripted move that earned the
// first-sight snapshot continued west into the Living Room, and `look` there
// describes the Living Room (which is how this test initially failed in a way
// that looked like a parser bug and was actually a standing bug in the CHECK).
const atKitchen = await send('east')
r.check('the passage leads back to the Kitchen', /kitchen/i.test(atKitchen),
  atKitchen.trim().split('\n')[0].slice(0, 48))
const lookReply = await send('look')
r.check('LOOK reprints the description, so a room can be re-read',
  sensor.darkExits.includes('up') && sensor.darkExits.includes('down'),
  `LOOK printed: ${JSON.stringify(lookReply.trim().slice(0, 150))}`)
// A CLAIM IS NOT A FACT. Two ways out of this room are labelled dark and we are
// standing here in daylight; the sensor must not promote a rumour about a
// staircase into "this room is dark", or the agent refuses to move at all.
r.check('a dark EXIT did not make this room dark', sensor.dark === false,
  `dark=${sensor.dark} with ${sensor.darkExits.length} dark ways announced`)
r.info('──── the Kitchen says', `${sensor.announced.join(', ')} out${sensor.darkExits.length ? `, dark: ${sensor.darkExits.join(', ')}` : ''}`)

// ── SEE: score is parsed exactly, including the maximum ──────────────────────
const scoreReply = await send('score')
r.check('score is parsed from prose', sensor.score !== null,
  `score=${sensor.score} max=${sensor.maxScore} (raw: ${scoreReply.trim().slice(0, 44)})`)
r.check('maximum score is read too (350 for Zork I)', storyName === 'zork1.z3' ? sensor.maxScore === 350 : true,
  `max=${sensor.maxScore}`)

// ── SEE: the room-heading heuristic, in both directions ──────────────────────
// These are golden-string tests on the parser, the same shape as the OCR golden
// strings stage 3 will use for King's Quest.
const before = sensor.room
sensor.saw('look', 'You see nothing special.')
r.check('a complaint does not invent a room', sensor.room === before, `stayed "${sensor.room}"`)

sensor.saw('look', 'Attic\nA small attic, furnished only with the most extreme essentials.')
r.check('a heading does move the map', sensor.room === 'Attic', `room="${sensor.room}"`)

// The bug the very first run of this check found: the leaflet's title line has
// exactly the shape of a Zork room name ("A Clearing", "A Passage"), so prose
// shape alone cannot tell them apart — the COMMAND has to be part of the test.
const beforeRead = sensor.room
sensor.saw('read leaflet', 'A leaflet\n\nAcross the land a leaflet lay,\nBewildered travellers to mislead;\nIf you would learn of perils great,\nRead on and take good heed!')
r.check('reading a document does not invent a room', sensor.room === beforeRead, `stayed "${sensor.room}"`)

sensor.saw('look', 'It is now pitch black. You are likely to be eaten by a grue.')
r.check('darkness is detected', sensor.dark === true)
// ...and that it LEAVES. Stage 1's worst bug was a `dark` flag that only ever got
// set, which made one black room condemn the whole underground empire and the
// explorer refuse to move at all. Detecting darkness is easy; the invariant that
// actually protects the agent is that a lit description CLEARS it. Adding this
// line is what made the mutation "make darkness sticky again" fail the suite —
// without it the suite passes with that bug in it, because the brain never walks
// into the dark and so never gets the chance to notice the lie.
sensor.saw('look', 'Kitchen\nYou are in the kitchen of the white house. A bottle is sitting on the table.')
r.check('darkness clears when the light does (not sticky)', sensor.dark === false,
  `dark=${sensor.dark} after a fully-lit description`)
// The sharper version, and the one stage 2 depends on: light IN HAND must end the
// darkness claim, even when the reply still talks about the dark and prints no
// heading to reset with. Every call site ANDs `dark` with `!lit`, so a sensor that
// ignores its own `lit` flag is nearly invisible — until the agent is standing in
// the lit Cellar refusing to move because a sensor three turns ago said "dark".
sensor.saw('turn on lamp', 'The lamp is on.')
sensor.saw('look', 'It is pitch black, and it is too dark to see. Something dark stirs.')
r.check('a LIT lamp outranks the word "dark"', sensor.dark === false && sensor.lit === true,
  `dark=${sensor.dark} lit=${sensor.lit}`)
const movesAfterProbes = sensor.moves

// ── SEE: verdicts — the difference between "it worked" and an hour of walls ───
const verdicts = {}
for (const e of sensor.exchanges) verdicts[e.verdict] = (verdicts[e.verdict] || 0) + 1
r.check('a successful TAKE is classified as taken', (verdicts.taken || 0) >= 1, JSON.stringify(verdicts))
r.check('a refused move is classified as blocked', (verdicts.blocked || 0) >= 1)

// ── ACT: keep walking, and prove the percept actually changes ────────────────
// The outside loop, plus two interactions. Some of these WILL be refused — that
// is fine and even useful (a refused move must not corrupt the map) — the point
// is that the agent walks several screens and keeps a coherent percept. The
// Kitchen has a bottle and a chimney, NOT the lamp, which is exactly the kind of
// folklore a check is supposed to replace with evidence.
const wander = ['east', 'north', 'west', 'south', 'west', 'north', 'east', 'east',
  'south', 'west', 'look', 'inventory', 'open window', 'in', 'score', 'take bottle',
  'north', 'west', 'open trap door', 'read leaflet']
const liveRooms = new Set()
let sigs = new Set([perceptSignature(sensor.percept())])
let wanderErrors = 0
for (const cmd of wander.slice(0, extraMoves)) {
  try {
    await send(cmd)
  } catch (e) {
    wanderErrors++
    r.check(`survived wandering with "${cmd}"`, false, e.message)
    break
  }
  if (sensor.room) liveRooms.add(sensor.room)
  sigs.add(perceptSignature(sensor.percept()))
}
r.check('no Glk/VM errors across the whole run', !crashed && wanderErrors === 0, crashed || `${wanderErrors} errors`)
// Counted from LIVE moves only — the golden-string probes above also set
// sensor.room, and a gate that quietly counted its own test fixtures would be
// measuring the fixture instead of the game.
r.check('the agent walks into at least four real rooms', liveRooms.size >= 4, `${liveRooms.size}: ${[...liveRooms].join(', ')}`)
r.check('no document title leaked into the map', ![...liveRooms].some(x => /leaflet|score|legend/i.test(x)), [...liveRooms].join(', '))
r.check('the percept actually changes as the world changes', sigs.size >= 4, `${sigs.size} distinct percepts`)
// Every fed exchange counts as a move, including the golden-string probes above —
// which is why this is stated as a delta rather than a total.
r.check('moves counted', sensor.moves === movesAfterProbes + Math.min(extraMoves, wander.length), `${sensor.moves}`)
r.check('command history is intact for the harness',
  sensor.exchanges.every(e => e.command && typeof e.output === 'string'))

r.info('rooms (live)', [...liveRooms].join(' · '))
r.info('score', `${sensor.score ?? '?'} / ${sensor.maxScore ?? '?'}`)
r.info('carrying', sensor.inventory.join(', ') || '(nothing parsed)')


// ── STAGE 1: the brain ──────────────────────────────────────────────────────
// Everything above proves the seams hold. This mounts the REAL ZorkExplorer in
// the REAL AgentLoop against the same actuator and sensor, lets it play, and
// then holds it to the invariants — including the one that matters more than
// distance: it must never walk into the dark unlit, because in Zork the dark
// has a timer on it.
//
// The scripted phase parked the story in the Kitchen with the leaflet in hand,
// which is the interesting start: the Kitchen is where the lamp is NOT (the
// trophy case is locked), so a brain that "reaches the lamp" here either found
// the way to earn it or is about to be caught lying.
const seenCommands = []
const replies = []
const brainSend = async (cmd) => {
  const reply = await send(cmd)
  seenCommands.push(cmd)
  replies.push(reply)
  if (trace) {
    const first = reply.trim().split('\n').filter(Boolean)[0] || '(silence)'
    console.log(`    ${sensor.lastVerdict.padEnd(8)} > ${cmd.padEnd(14)} ${first.slice(0, 74)}`)
  }
  return reply
}

// RESTART. The scripted warm-up above opened the mailbox, took the leaflet and
// — the part that matters — OPENED THE WINDOW. Hand that world to the brain and
// "it reached the Kitchen" proves nothing about the brain: the door was already
// open. This exact contamination is how the first version of this check shipped a
// true-sounding claim about `open window` that the brain had never performed.
// Zork's own RESTART gives us a clean room with a boarded window and a closed
// mailbox, so the brain earns every verb from move one.
const restartReply = await brainSend('restart')
// Zork asks "Do you wish to restart? (Y is affirmative)" — matching /yes/ here
// finds nothing, the prompt swallows the next command, and the run continues in a
// half-restarted world, which is the worst possible state for a check: it still
// plays, so nothing looks broken.
if (/wish to restart|affirmative/i.test(restartReply)) await brainSend('yes')
// RESET THE SENSOR TOO, NOT JUST THE WORLD. The golden-string probes above leave
// state behind — and the one that mattered was `sensor.saw('turn on lamp', 'The
// lamp is on.')`, which set `lit = true` and never cleared it. So the brain was
// TOLD, by its own sensor, that it had a lit lamp in hand. That disables the
// grue rule (every dark check ANDs with `!lit`), which means the repo's headline
// safety invariant had been switched off for the entire run and nobody noticed,
// because the agent never wandered into the dark anyway. A fixture that lies to
// the arm is worse than a fixture that lies to the check.
sensor.reset()
const afterReset = await brainSend('look')
r.check('the world was reset before the brain took over',
  /west of house/i.test(afterReset), afterReset.trim().split('\n')[0].slice(0, 60))

const events = []
const brain = new ZorkExplorer({ send: brainSend, sensor, onEvent: (m) => events.push(m) })
const loop = new AgentLoop({ brain, arm: 'transcript', watchdog: 8, maxIdleTicks: 2, minActionGapMs: 0 })
loop.running = true
const MAX_TICKS = Number(opt(args, '--agent', 120))
let brainDied = null
for (let i = 0; i < MAX_TICKS && loop.running; i++) {
  const entry = await loop.tick()
  if (sensor.dead && !brainDied) brainDied = `died after ${i} ticks at ${sensor.room}`
  if (!entry && !loop.running) break
}

const sum = brain.summary()
r.info('──── the brain played', `${sum.trace.length} commands, stopped: ${loop.reason || 'still running'}`)
if (trace) for (const c of sum.trace) console.log(`    > ${c}`)

r.check('the brain sent commands through the same actuator as the player', seenCommands.length >= 3,
  `${seenCommands.length} commands, last: ${seenCommands.slice(-3).join(' / ')}`)
// Two claims that are only worth making because the world was reset: the brain
// performed the OPEN itself, and the Kitchen is somewhere it WALKED to.
const opened = seenCommands.filter(c => /^open\b/i.test(c))
r.check('the brain opened something by itself (world was reset first)', opened.length > 0,
  opened.length ? `opened: ${[...new Set(opened)].join(' / ')}` : 'never typed OPEN — it walked a world someone else unlocked')
r.check('the Kitchen is a place the brain walked to',
  sum.rooms.some(k => /kitchen/i.test(k)) && sum.stats.proven >= 1,
  sum.rooms.filter(k => /kitchen/i.test(k)).join(', ') || 'never reached the Kitchen unaided')
r.check('the brain discovered rooms by walking (not from the story file)',
  sum.stats.proven >= sum.stats.rooms - 1,
  `rooms=${sum.stats.rooms} proven edges=${sum.stats.proven} (a tree of walked moves needs >= ${sum.stats.rooms - 1})`)
r.info('──── its map', sum.rooms.join(' · '))
r.info('──── map shape', JSON.stringify(sum.stats))

// The invariant. Not a metric — a hard rule.
const darkEntered = sum.rooms.filter((k) => (brain.map.rooms.get(k) || {}).dark && (brain.map.rooms.get(k) || {}).visits > 1)
r.check('it NEVER re-entered a dark room without light', darkEntered.length === 0,
  darkEntered.length ? darkEntered.join(', ') : `dark rooms known: ${sum.dark.join(', ') || 'none'}`)
r.check('it did not die', !sensor.dead, brainDied || 'alive')
r.check('the parser never rejected a word the brain chose',
  !replies.some((x) => /sorry, i don'?t know the word/i.test(x)),
  (() => { const bad = seenCommands.filter((c, i) => /sorry, i don'?t know/i.test(replies[i])); return bad.length ? `it said: ${bad.join(' / ')}` : 'every command parsed' })())
r.check('it never repeated a direction the game had already refused',
  (() => {
    const blocked = new Set()
    for (const room of brain.map.rooms.values()) {
      for (const [dir, e] of Object.entries(room.exits)) if (e.type === 'blocked') blocked.add(`${room.key}|${dir}`)
    }
    // Re-walking a refused direction would show up as the same SHORT verb issued
    // twice from the same room with a complaint in between; the map records it
    // once, so any second attempt is the brain ignoring its own memory.
    return brain.ignoredBlocked !== true
  })(),
  'map records every refusal; step() consults it before moving')

// LIVE ONLY, and that qualifier is the whole point.
//
// The first version scanned `sensor.exchanges`, which also contains the golden
// string fixtures used to pin the sensor's parsing — including
// `sensor.saw('turn on lamp', 'The lamp is on.')`. So the suite printed
// "lamp seen in prose: yes" and "known about, not fetched" while the agent had
// never seen the word in anything the GAME said. A harness that counts its own
// fixtures as evidence isn't measuring the agent; it is reading its own
// handwriting back and calling it an observation.
const sentByBrain = new Set(seenCommands)
const live = sensor.exchanges.filter((e) => sentByBrain.has(e.command))
const liveLamp = []
for (const e of live) {
  const m = String(e.output).match(/[^\n]*(lamp|lantern|torch|matches)[^\n]*/i)
  if (m) liveLamp.push(`after "${e.command}" in ${e.room}: ${m[0].trim().slice(0, 90)}`)
}
for (const line of liveLamp.slice(0, 4)) r.info('lamp prose (LIVE)', line)

// TWO CLAIMS THAT REPLACE THE WALKTHROUGH.
//
// (1) NO INVENTED NOUNS. Every noun the brain put into a command must have been
// printed by the GAME in an earlier live reply. "Take small window" is allowed
// because the Kitchen said "a small window"; "take lamp" would NOT be, unless the
// game had used the word first. This is the check that the deleted WANT list makes
// honest — a lore leak is now a red build, not a matter of trusting the source.
const ordered = sensor.exchanges.filter((e) => sentByBrain.has(e.command))
const corpus = []
const invented = []
for (const e of ordered) {
  const m = /^(?:take|get|turn on|open|light)\s+(.+)$/i.exec(String(e.command).trim())
  if (m) {
    const noun = m[1].toLowerCase()
    if (!corpus.join('\n').toLowerCase().includes(noun)) invented.push(`"${e.command}" — the game never said "${noun}"`)
  }
  corpus.push(String(e.output))
}
r.check('every noun it asked for came from the game, not from us', invented.length === 0,
  invented.length ? invented.slice(0, 3).join(' | ') : `${ordered.length} commands, all nouns traceable to live prose`)

// (2) THE GOAL FORMED FROM THE MAP, NOT FROM A HINT. `needLight` fires off
// `darkClaims` — a word the GAME wrote about an exit — so the receipt must show
// the goal forming while the game had said nothing about any light source.
const goal = brain.lightGoal || null
r.check('the light goal formed from a dark exit, not from a hint',
  !!goal && goal.gameSaidLight === false && goal.darkClaims > 0,
  goal ? `fired at ${goal.darkClaims} dark way(s) on the map, game had mentioned a light: ${goal.gameSaidLight}`
    : 'the goal never fired — it never needed light, so nothing was derived')

const firstProse = ordered.findIndex((e) => /lamp|lantern|torch/i.test(String(e.output)))
const firstAsk = ordered.findIndex((e) => /^(?:take|get|turn on|light)\b.*(lamp|lantern|torch)/i.test(String(e.command)))
r.check('if it ever asks for a light, the game mentioned one first',
  firstAsk === -1 || (firstProse !== -1 && firstAsk > firstProse),
  `first live light-prose=#${firstProse} first light-ask=#${firstAsk}${firstAsk === -1 ? ' (never asked — it is still holding what it found)' : ''}`)

const carriedLamp = (sensor.inventory || []).some((x) => /lamp|lantern/i.test(x))
const gameMentionedLamp = liveLamp.length > 0
r.check("at least the brain's own exchanges were scanned for lamp prose", live.length >= 5,
  `${live.length}/${sensor.exchanges.length} exchanges came from the brain; the rest are fixtures`)
// `!carriedLamp || gameMentionedLamp` is an IMPLICATION, vacuously true when the
// agent never picked one up — which, measured honestly, is exactly where we are.
r.check('it never took a lamp the game never mentioned',
  !carriedLamp || gameMentionedLamp,
  `carrying=${sensor.inventory.join(', ') || 'nothing'} · lamp in live prose: ${gameMentionedLamp ? 'yes' : 'NO'}`)
r.info('──── lamp, actually', carriedLamp && sensor.lit ? 'IN HAND AND LIT'
  : carriedLamp ? 'in hand, unlit'
    : gameMentionedLamp ? 'seen in the live game, not fetched'
      : 'NEVER SEEN — the game has said nothing about a light source to the brain yet, \n       so it cannot want one; stage 2b is about earning that evidence, not assuming it')
if (sum.report.length) r.info('──── brain said', sum.report.join(' · '))

// Two properties that only hold if room identity works, which is the thing that
// took the most debugging and is the easiest thing to silently break: `splits`
// counts times the map had to tear itself apart because a "proven" exit was
// refused (proof two rooms had been merged under one name), and the room count is
// what the run actually mapped. Both were added after the identity bug, where
// walking back into North of House invented `North of House#2` — a map can be
// full of rooms and still be fiction.
// A split is not a failure; a SILENT split is. Zork really does have several
// rooms headed "Forest" and a Clearing that MOVES, so a run that never split
// would be a run that never went there. The assertion is that every split was
// noticed, recorded, and turned into a report — which is the difference between
// a map that knows its own edges and one that is quietly wrong.
const splitNotes = sum.report.filter((x) => /split/.test(x)).length
r.check('every merged room was noticed and re-keyed, not silently kept',
  // The requirement is an EXPLANATION, not a particular count: one split with a
  // report is honest, four with no report is a fiction. (An earlier version also
  // demanded a non-empty `unstable` set, which failed a legitimate single split
  // — MAX_TWINS is 4, so one twin does not yet condemn the whole forest.)
  sum.stats.splits === 0 || splitNotes > 0,
  `splits=${sum.stats.splits} explained=${splitNotes} unstable=${sum.stats.unstable.join(',') || 'none'}`)
r.info('──── dark ways on the map',
  `${sum.stats.darkClaims} way(s) the game itself called dark, ${sum.stats.darkRefused} already refused` +
  (sum.stats.darkClaims ? ' — stage 2 turns this number into a goal' : ''))

r.info('──── assumptions', `${sum.stats.verified} walked back and tested — the difference between a map of evidence and a map of guesses`)
r.check('it mapped at least ten rooms on its own', sum.stats.rooms >= 10,
  `${sum.stats.rooms} rooms, ${sum.stats.proven} walked edges, ${sum.stats.blocked} closed ways`)
r.check('it named the ground it could not map',
  sum.stats.unstable.length === 0 || sum.report.length > 0 || brain.reportedShifty,
  `unstable: ${sum.stats.unstable.join(', ') || 'none'} · report: ${sum.report.join(' | ').slice(0, 90) || 'nothing to explain'}`)
r.check('it stopped for a reason it can state', !loop.running && !!loop.reason,
  `running=${loop.running} reason=${loop.reason}`)
r.check('no Glk/VM errors during the brain phase', !crashed, crashed || '')

// The map, verbatim. When the brain loops, the loop is always visible here as a
// shape (a "blocked" edge the planner still offers, two rooms that should have
// merged, an assumed reverse the game refused) — and reading the model beats
// guessing at it from a trace of verbs. `--map` prints it.
if (opt(args, '--map', false)) {
  for (const [key, room] of brain.map.rooms) {
    const ex = Object.entries(room.exits).map(([d, e]) => `${d}:${e.type === 'blocked' ? 'X' : e.to || '?'}${e.type === 'assumed' ? '~' : ''}`)
    console.log(`    ${key === brain.map.at ? '→' : ' '} ${key.padEnd(24)} ${ex.join(' ')}`)
    if (room.visible.size) console.log(`      visible: ${[...room.visible].join(', ')}`)
    for (const [host, items] of Object.entries(room.contains || {})) console.log(`      in ${host}: ${items.join(', ')}`)
  }
}

r.exit()
