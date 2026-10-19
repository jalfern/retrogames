// REPLAYCHECK (#495) — the recording format's proof, in plain Node.
//
// Records a GAUNTLET two-player run to a real `retrogames-rec/v1` file:
// seat 1 is a HUMAN slot fed by the device writers (raw sticks incl. sub
// dead-zone nudges through setStickVec + button presses), seat 2 is the CPU
// partner emitting pads. Then the file is read back from disk and replayed
// through plain MODEL seats: the sim must hit the recorded state.hash at every
// checkpoint. That is the issue's done-when: seed + pad streams ⇒ same hashes,
// written down once, replayable forever.
//
//   node scripts/replaycheck.mjs              # green, (re)writes the example file
//   node scripts/replaycheck.mjs --mutate   # RED by design: one pad dropped
//                                            # mid-file must be caught at its tick
//
// The example file ships at public/replays/gauntlet-2p.json and is the format's
// reference (docs/GAME-SHELL.md points at it).

import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRecorder, validate, verifyRecording, decodePad, encodePad, REC_FORMAT } from '../src/utils/recording.js'
import { makeSlot, padFor } from '../src/utils/slotSources.js'
import { setStickVec, press, release, rawPad, clearAllSlots } from '../src/utils/onePad.js'
import { makeGame, step, stateHash } from '../src/games/Gauntlet/sim.js'
import { partnerPad } from '../src/games/Gauntlet/planner.js'

const here = dirname(fileURLToPath(import.meta.url))
const REC_FILE = join(here, '..', 'public', 'replays', 'gauntlet-2p.json')
const SEED = 42
const MAX_TICKS = 900
const HASH_EVERY = 30
const MUTATE = process.argv.includes('--mutate')

let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.log(`FAIL   ${name}${info ? ` — ${info}` : ''}`) }
}

const build = (() => {
    try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'unknown' }
    catch { return 'unknown' }
})()

// --- the seat-to-sim fold (mirrors the index.jsx pad path, slotcheck's shape) --
const fold1 = (pad, prev) => ({
    left: !!pad.left, right: !!pad.right, fwd: !!pad.up, back: !!pad.down,
    sword: !!pad.a && !prev.a, arrow: !!pad.b && !prev.b,
})
const fold2 = (pad, prev) => ({
    left: !!pad.left, right: !!pad.right, fwd: !!pad.up, back: !!pad.down,
    sword: !!pad.a && !prev.a,
})

// --- seat 1's scripted device: raw sticks + button pulses ----------------------
// Four ticks of patterns per direction band so hero + camera actually travel and
// generators get hit; every 97th tick is a 0.08/0.03 sub-dead-zone nudge that
// must show up in raw while the pad idles — the raw channel's reason to exist.
const DIRS = [[0.9, 0], [0.64, -0.64], [0, -0.9], [-0.64, -0.64], [-0.9, 0], [-0.64, 0.64], [0, 0.9], [0.64, 0.64]]
const deviceAt = (i) => {
    if (i % 97 === 13) return { x: 0.08, y: 0.03, a: false, b: false, nudge: true }
    const d = DIRS[Math.floor(i / 37) % DIRS.length]
    return { x: d[0], y: d[1], a: i % 19 < 2, b: i % 41 < 2, nudge: false }
}

// ------------------------------------------------------------------ record ----
console.log('record: human seat 1 (device writers) + cpu seat 2')
clearAllSlots()
const gs = makeGame(SEED, 'warrior', { topDown: true, partner: true, partnerKey: 'elf' })
gs.partnerOn = true; gs.partnerHuman = false
const s1 = makeSlot('human', { padIndex: 1 })
const s2 = makeSlot('cpu', { emit: (ctx) => partnerPad(ctx.gs, ctx.prevA) })
const rec = createRecorder({
    gameId: 'gauntlet', method: 'stick', seed: SEED, players: 2, build,
    hashEvery: HASH_EVERY, sources: [{ kind: 'human' }, { kind: 'cpu' }],
})
const prev = { a1: false, b1: false, a2: false }
const home1 = { x: gs.hero.x, y: gs.hero.y }
const home2 = { x: gs.partner.x, y: gs.partner.y }
let nudges = 0
for (let i = 0; i < MAX_TICKS && !gs.end; i++) {
    const dev = deviceAt(i)
    setStickVec(dev.x, dev.y)
    if (dev.a) press('a'); else release('a')
    if (dev.b) press('b'); else release('b')
    const p1 = padFor(s1, { method: 'stick' })
    const p2 = padFor(s2, { method: 'stick', gs, tick: i, prevA: prev.a2 })
    const raws = [rawPad(1), rawPad(2)]
    step(gs, fold1(p1, prev), fold2(p2, prev))
    prev.a1 = !!p1.a; prev.b1 = !!p1.b; prev.a2 = !!p2.a
    gs.events.length = 0
    if (dev.nudge && p1.x === 0 && raws[0].x === 0.08) nudges++
    rec.addTick([p1, p2], raws, stateHash(gs))
}
const file = rec.finish(stateHash(gs))
clearAllSlots()

ok(validate(file) === null, 'recorded file validates', validate(file) || '')
ok(file.format === REC_FORMAT && file.game === 'gauntlet' && file.method === 'stick', 'header: format/game/method')
ok(file.seed === SEED && file.players === 2, `header: seed ${file.seed}, players ${file.players}`)
ok(rec.ticks > 300, `the run played ${rec.ticks} ticks`)
ok(file.slots[0].source.kind === 'human' && file.slots[1].source.kind === 'cpu', 'source labels: human + cpu')
ok(file.slots[0].pads.length === file.ticks && file.slots[1].raw.length === file.ticks, 'one pad + one raw per slot per tick')
ok(file.hashes.length >= Math.floor(rec.ticks / HASH_EVERY), `checkpoints every ${HASH_EVERY}: ${file.hashes.length} recorded`)
ok(file.build.length >= 7 || file.build === 'unknown', `build stamp: ${file.build}`)
const travel1 = Math.hypot(gs.hero.x - home1.x, gs.hero.y - home1.y)
const travel2 = Math.hypot(gs.partner.x - home2.x, gs.partner.y - home2.y)
ok(travel1 > 0.5, `seat 1 traveled ${travel1.toFixed(2)} under its sticks`)
ok(travel2 > 0.4, `cpu seat 2 traveled ${travel2.toFixed(2)} under its own pads`)
ok(nudges > 3, `sub-dead-zone nudges recorded in raw while the pad idled (${nudges} ticks)`)

// --- write + read back the example file -----------------------------------------
if (!existsSync(dirname(REC_FILE))) throw new Error('missing public/replays')
if (!MUTATE) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(REC_FILE, JSON.stringify(file) + '\n')
}
const onDisk = JSON.parse(readFileSync(REC_FILE, 'utf8'))
// The build stamp is whatever commit generated the sample; everything else in
// the file must be byte-identical to a fresh record at this commit.
ok(JSON.stringify({ ...onDisk, build: file.build }) === JSON.stringify(file), 'example file round-trips through disk byte-identical (build stamp aside)', `disk=${onDisk.build} fresh=${file.build}`)
ok(onDisk.slots.every((s) => s.pads.every((p) => JSON.stringify(encodePad(decodePad(p, 'stick'))) === JSON.stringify(p))), 'stored pads are canonical (decode/encode stable)')

// ------------------------------------------------------------------ replay ----
console.log('replay: same file through plain model seats')
function replayDriver(rec2) {
    let g = null
    const m1 = makeSlot('model'), m2 = makeSlot('model')
    const p = { a1: false, b1: false, a2: false }
    return verifyRecording(rec2, {
        reset: (seed, players) => {
            g = makeGame(seed % 97, 'warrior', { topDown: true, partner: true, partnerKey: 'elf' })
            g.partnerOn = players >= 2
        },
        step: (pads) => {
            m1.queue.push(pads[0] || {})
            m2.queue.push(pads[1] || {})
            const a = padFor(m1, { method: 'stick' })
            const b = padFor(m2, { method: 'stick' })
            step(g, fold1(a, p), fold2(b, p))
            p.a1 = !!a.a; p.b1 = !!a.b; p.a2 = !!b.a
            g.events.length = 0
        },
        state: () => ({ tick: g.tick, hash: stateHash(g) }),
    })
}

const res = replayDriver(onDisk)
ok(res.ok && !res.mismatch, `replay matches every checkpoint (${res.ticks} ticks)`, res.mismatch ? `diverged at tick ${res.mismatch.tick}: want ${res.mismatch.want} got ${res.mismatch.got}` : (res.error || ''))
ok(res.state.hash === onDisk.hashes[onDisk.hashes.length - 1].h, 'final state.hash identical')

// --- structural tampering -------------------------------------------------------
const bad1 = { ...onDisk, format: 'retrogames-rec/v99' }
ok(validate(bad1) !== null, 'unknown format tag refused')
const bad2 = { ...onDisk, seed: '42' }
ok(validate(bad2) !== null, 'string seed refused')
const bad3 = { ...onDisk, slots: onDisk.slots.slice(0, 1) }
ok(validate(bad3) !== null, 'slot count != players refused')
const bad4 = { ...onDisk, hashes: [{ t: 500, h: 1 }, { t: 500, h: 2 }] }
ok(validate(bad4) !== null, 'unordered checkpoints refused')
const cut = JSON.parse(JSON.stringify(onDisk))
cut.slots[0].pads.pop()
ok(validate(cut) !== null, 'missing final pad refused')

// ------------------------------------------------------------------ mutant ----
if (MUTATE) {
    console.log('mutant: one seat-1 direction pad dropped mid-file')
    const cand = onDisk.slots[0].pads.findIndex((p, i) => i > 60 && (p.left || p.right || p.up || p.down))
    ok(cand > 60, 'found a live pad to drop')
    if (cand > 60) {
        const tampered = JSON.parse(JSON.stringify(onDisk))
        tampered.slots[0].pads[cand] = {}
        const r2 = replayDriver(tampered)
        ok(!r2.ok && r2.mismatch && r2.mismatch.tick >= cand + 1, `dropped pad at tick ${cand + 1} is caught`, r2.mismatch ? `diverged at ${r2.mismatch.tick}` : 'never diverged')
    }
}

console.log(`${fail ? 'FAIL ' + fail : 'PASS'} ${pass}`)
process.exit(fail ? 1 : 0)
