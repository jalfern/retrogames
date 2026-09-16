// aicheck — the src/ai spine's own contract, in Node, in ~1 second.
//
// Why this exists: `AgentLoop` was written as "the spine" and imported by
// nothing. A loop that no brain has ever run is a loop whose watchdog,
// rejection counter and diary are all still hypothetical — and those three
// mechanisms are the entire reason this project will not repeat the last two.
// So the spine gets tested against fake brains until a real one shows up in
// stage 1, and the fakes are deliberately the failures we already lived through:
//
//   * a brain that names a skill the game does not implement. King's Quest's old
//     remote agent did exactly this on every parse failure, and its fallback was
//     `testEsc` — the debug wizard. Here that decision is REJECTED and COUNTED,
//     visibly, and the loop survives to be debugged.
//   * a brain that oscillates. The watchdog must ask for recovery once and then
//     STOP with a reason. An unattended agent will happily wave at a closed door
//     for an hour; `zorkcheck`'s equivalent rule is that silence is not a result.
//   * a confident sensor. Every field of a Percept carries a `conf`, and the
//     defaults are 0, not `undefined` — so a sensor that forgets to report
//     reads as "no idea" rather than as a plausible-looking hole.
//
// Usage: npm run aicheck

import { Report } from './lib/harness.mjs'
import { makePercept, perceptSignature, minConf } from '../src/ai/percept.js'
import { AgentLoop } from '../src/ai/loop.js'
import { armsForGame, effectiveArm, setArm, armLabel, ARMS } from '../src/ai/arms.js'

const r = new Report('aicheck')
const p = (over = {}) => makePercept(over)

// ── Percept: the contract brains are allowed to see ─────────────────────────
const a = p({ room: 'Kitchen', score: 7 })
const b = p({ room: 'Kitchen', score: 7, ts: 99999 })
const c = p({ room: 'Attic', score: 7 })
r.check('signature is stable across time', perceptSignature(a) === perceptSignature(b), 'ts must not count as change')
r.check('signature changes when the world changes', perceptSignature(a) !== perceptSignature(c))
for (const [label, over] of [
  ['ego moved', { ego: { x: 4, y: 9, dir: 'n', moving: true, conf: 1 } }],
  ['inventory changed', { inventory: ['lamp'] }],
  ['score changed', { score: 8 }],
  ['message changed', { message: { text: 'The troll raises his club.', conf: 1 } }],
  ['an actor moved', { actors: [{ id: 'troll', x: 3, y: 3, conf: 0.6 }] }],
]) {
  r.check(`signature notices: ${label}`, perceptSignature(a) !== perceptSignature({ ...a, ...over }))
}

// A missing conf is the bug: undefined is not "low confidence", it is a hole a
// planner will happily plan on.
const bare = p()
r.check('every sensed field ships a confidence, defaulting to zero',
  bare.ego.conf === 0 && bare.message.conf === 0 && Array.isArray(bare.actors) && bare.room === null,
  JSON.stringify({ ego: bare.ego.conf, msg: bare.message.conf }))
r.check('minConf takes the worst, not the first', minConf({ conf: 1 }, { conf: 0.2 }) === 0.2 && minConf() === 0)

// ── AgentLoop: the mechanisms, proven with fake brains ──────────────────────
const clock = () => ({ t: 0, now() { return this.t } })

function brain(over = {}) {
  const k = clock()
  return {
    name: over.name || 'fake',
    now: k.now,
    percept: p({ room: 'West of House', score: 0 }),
    skills: { north: async () => ({ ok: true, note: 'walked' }) },
    sense() { return this.percept },
    progress(pp) { return pp.score || 0 },
    step() { return { skill: 'north' } },
    ...over,
  }
}

{
  const b1 = brain()
  const loop = new AgentLoop({ brain: b1, arm: 'transcript', minActionGapMs: 0, now: b1.now })
  loop.running = true
  const entry = await loop.tick()
  r.check('a legal decision runs its skill and is recorded',
    entry && entry.ok === true && loop.successes === 1 && loop.diary.length === 1,
    JSON.stringify(entry && { did: entry.did, ok: entry.ok }))
  r.check('the diary says what it saw AND what it did',
    !!entry && typeof entry.saw === 'string' && typeof entry.did === 'string', JSON.stringify(entry && Object.keys(entry)))
}

{
  // The failure both old agents died of, made loud.
  const b2 = brain({ step: () => ({ skill: 'summon-debug-wizard' }) })
  const loop = new AgentLoop({ brain: b2, minActionGapMs: 0, now: b2.now })
  loop.running = true
  const e1 = await loop.tick()
  const e2 = await loop.tick()
  r.check('an unknown skill is REJECTED, not thrown', loop.invalid === 2 && loop.running, `invalid=${loop.invalid} running=${loop.running}`)
  r.check('the rejection is visible in the diary', /rejected/.test(e1.did) && e1.ok === false, e1.did)
  r.check('a rejected skill is never counted as an action', loop.actions === 0 && loop.failures === 0, `actions=${loop.actions}`)
  void e2
}

{
  // Watchdog: no progress -> recover asked once -> stops with a reason.
  let recoverAsked = 0
  const b3 = brain({
    progress: () => 0,                                  // never advances
    recover: () => { recoverAsked++; return null },
  })
  const loop = new AgentLoop({ brain: b3, watchdog: 2, minActionGapMs: 0, now: b3.now })
  loop.running = true
  const seen = []
  for (let i = 0; i < 6 && loop.running; i++) seen.push(await loop.tick())
  r.check('a brain that stops advancing trips the watchdog', loop.stuck >= 1 && recoverAsked >= 1, `stuck=${loop.stuck}`)
  r.check('with no recovery action it STOPS, with a reason',
    !loop.running && /stuck/.test(String(loop.reason)), `reason=${loop.reason} seen=${seen.filter(Boolean).length}`)
}

{
  // A skill that throws must not take the loop (or the game) down with it.
  const b4 = brain({ skills: { north: async () => { throw new Error('glk said no') } } })
  const loop = new AgentLoop({ brain: b4, minActionGapMs: 0, now: b4.now })
  loop.running = true
  const entry = await loop.tick()
  r.check('a throwing skill is caught and counted, loop survives',
    loop.failures === 1 && loop.running && entry.ok === false && /glk said no/.test(String(entry.note)),
    JSON.stringify(entry && entry.note))
}

{
  const b5 = brain({ step: () => null })
  const loop = new AgentLoop({ brain: b5, maxIdleTicks: 2, minActionGapMs: 0, now: b5.now })
  loop.running = true
  await loop.tick(); await loop.tick()
  r.check('a brain with no move stops rather than spins', !loop.running && /idle/.test(String(loop.reason)), `reason=${loop.reason}`)
}

// ── Arms: the lab switch, and the lie it exists to prevent ─────────────────
r.check('a title declaring no sensors gets none', armsForGame({ sensors: [] }).length === 0)
r.check('...and therefore no arm to advertise', effectiveArm({ sensors: [] }) === null)
r.check('a title cannot be handed an arm it does not have',
  effectiveArm({ sensors: ['transcript'] }) === 'transcript', String(effectiveArm({ sensors: ['transcript'] })))
setArm('ram')
r.check('the lab choice survives into an unsupported title by degrading, not lying',
  effectiveArm({ sensors: ['eye'] }) === 'eye', String(effectiveArm({ sensors: ['eye'] })))
// Every arm must have a printable label: an arm the HUD cannot name is an arm
// the player cannot be told about, which is how "AI" ends up meaning "vibes".
r.check('every arm has a printable label', ARMS.every((x) => /^[A-Z +]+$/.test(armLabel(x))), ARMS.map((x) => `${x}=${armLabel(x)}`).join(' '))
r.check('an unknown arm does not print as blank', armLabel('quantum') === 'QUANTUM', armLabel('quantum'))
setArm('hybrid')

r.exit()
