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
}
r.check('every scripted move was answered', moveErrors === 0, `${moveErrors} failures`)

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

r.exit()
