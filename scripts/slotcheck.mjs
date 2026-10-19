// SLOTCHECK (#494) — the player-slot determinism proof, in plain Node.
//
// The law the layer must satisfy: same seed + same per-player pad streams
// ⇒ same state hash, WHATEVER produced the pads. Each case records the pads
// a cpu seat emits, then replays them through model seats (a plain stream),
// tick by tick, and compares state hashes every tick.
//
//   node scripts/slotcheck.mjs           # must go green
//   node scripts/slotcheck.mjs --mutate # must go RED: a replay with one pad
//                                       # dropped is caught (cheat the replay,
//                                       # see red — the check has teeth)

import { makeSlot, setSlotKind, pushPad, padFor } from '../src/utils/slotSources.js'
import { slotPad, setStickVecSlot, clearAllSlots } from '../src/utils/onePad.js'
import { makeGame as gauntletGame, step as gauntletStep, stateHash as gauntletHash } from '../src/games/Gauntlet/sim.js'
import { partnerPad } from '../src/games/Gauntlet/planner.js'
import { makeGame as bobGame, step as bobStep, stateHash as bobHash } from '../src/games/BubbleBobble/sim.js'
import { decide as bobDecide } from '../src/games/BubbleBobble/planner.js'

let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.log(`FAIL   ${name}${info ? ` — ${info}` : ''}`) }
}

// ------------------------------------------------------------------ layer ----
console.log('slotSources')
{
    ok(padFor(makeSlot('off'), { method: 'stick' }).a === false, 'off seat is always idle')
    let threw = false
    try { makeSlot('wizard') } catch { threw = true }
    ok(threw, 'unknown kinds are refused')

    setStickVecSlot(2, 1, 0)
    const h = padFor(makeSlot('human', { padIndex: 2 }), { method: 'stick' })
    ok(h.right === true, 'human seat reads its #492 slot pad')
    clearAllSlots()

    const m = makeSlot('model')
    ok(pushPad(m, { a: true }) && padFor(m, { method: 'stick' }).a === true, 'model seat drains the pushed queue')
    ok(padFor(m, { method: 'stick' }).a === false, 'model seat idles when the queue runs dry')
    ok(pushPad(makeSlot('cpu'), {}) === false, 'only the model seat takes pushed pads')

    const r = makeSlot('remote', { transport: () => ({ a: true }) })
    ok(padFor(r, { method: 'stick' }).a === true, 'remote is reserved: a transport hook answers')
    ok(padFor(makeSlot('remote'), { method: 'stick' }).a === false, 'remote without a transport is idle')

    setSlotKind(m, 'cpu')
    ok(m.kind === 'cpu' && padFor(m, { method: 'stick' }).a === false, 'a seat can change kinds')
}

// -------------------------------------------------------------- gauntlet ----
// Seat 1: a scripted model stream (what a QA bot or RL policy pushes).
// Seat 2 run A: the cpu emitter (partnerPad). Run B replays A's recorded
// seat-2 pads through a model seat — different producer, same stream, same
// hashes. The native fold mirrors the shell's (up=fwd, down=back, a=sword).
const gNative = (pad, prev) => ({
    left: !!pad.left, right: !!pad.right, fwd: !!pad.up, back: !!pad.down,
    arrow: !!pad.b && !prev.b,
})
const gScript = (n) => Array.from({ length: n }, (_, i) => ({
    left: i % 97 < 14, right: i % 97 >= 20 && i % 97 < 34,
    up: i % 53 < 22, down: i % 53 >= 30 && i % 53 < 40,
    a: i % 19 < 2, b: i % 41 < 2,
}))

console.log('gauntlet: seed + pad streams ⇒ hash, whatever produced them')
function runGauntlet(seed, n, p2source) {
    const gs = gauntletGame(seed, 'warrior', { topDown: true, partner: true, partnerKey: 'elf' })
    gs.partnerOn = true; gs.partnerHuman = false
    const prev = { a1: false, b: false, a2: false }
    const hashes = [], pads = []
    let swung = false
    const p1pads = gScript(n)
    for (let i = 0; i < n && !gs.end; i++) {
        const p1 = p1pads[i]
        const p2 = p2source(gs, i, { a: prev.a2 })
        const sword = !!p2.a && !prev.a2
        pads.push([p1, p2])
        gauntletStep(gs, { ...gNative(p1, prev), sword: !!p1.a && !prev.a1 }, { ...gNative(p2, prev), sword })
        prev.a1 = !!p1.a; prev.b = !!p1.b; prev.a2 = !!p2.a
        gs.events.length = 0
        hashes.push(gauntletHash(gs))
    }
    swung = pads.some(([, p], i) => p.a && !(pads[i - 1] ? pads[i - 1][1].a : false))
    return { gs, hashes, pads, swung }
}

for (const seed of [11, 5]) {
    const a = runGauntlet(seed, 600, (gs, _i, prev) => partnerPad(gs, prev.a))
    const travel = Math.hypot(a.gs.partner.x - 5.5, a.gs.partner.y - 5.5)
    ok(a.pads.length > 300, `seed ${seed}: the cpu seat kept talking (ticks ${a.pads.length})`)
    ok(a.pads.some(([, p]) => p.left || p.right || p.up || p.down || p.a), `seed ${seed}: cpu seat emitted real pads, not just idle`)
    ok(a.swung, `seed ${seed}: the cpu seat pulses its sword edge like a pad would`)

    const b = runGauntlet(seed, 600, (_gs, i) => a.pads[i] ? a.pads[i][1] : { left: false, right: false, up: false, down: false, a: false })
    ok(a.hashes.length === b.hashes.length && a.hashes.every((h, i) => h === b.hashes[i]),
        `seed ${seed}: cpu seat vs replayed stream — identical hashes through tick ${a.hashes.length}`,
        a.hashes.findIndex((h, i) => h !== b.hashes[i]) >= 0 ? `diverged at tick ${a.hashes.findIndex((h, i) => h !== b.hashes[i])}` : '')
    ok(travel > 0.4, `seed ${seed}: the pad-emitting partner moved under its own pads (${travel.toFixed(2)})`)
}

// ---------------------------------------------------------- bubble bobble ----
console.log('bubble bobble: both seats cpu, replayed through model seats')
{
    const seed = 3, N = 900
    const toPad = (d) => ({ left: !!d.left, right: !!d.right, up: !!d.up, down: !!d.down, a: !!d.fire })
    const fromPad = (p) => ({ left: !!p.left, right: !!p.right, up: !!p.up, down: !!p.down, fire: !!p.a })

    const gs = bobGame(seed, { players: 2 })
    const s1 = makeSlot('cpu', { emit: () => toPad(bobDecide(gs, 0)) })
    const s2 = makeSlot('cpu', { emit: () => toPad(bobDecide(gs, 1)) })
    const hashes = [], pads = []
    for (let i = 0; i < N && !gs.end; i++) {
        const p1 = padFor(s1, { method: 'dpad', tick: i })
        const p2 = padFor(s2, { method: 'dpad', tick: i })
        pads.push([p1, p2])
        bobStep(gs, [fromPad(p1), fromPad(p2)])
        gs.events.length = 0
        hashes.push(bobHash(gs))
    }
    ok(pads.length > 300, `cpu seats talked for ${pads.length} ticks`)
    ok(pads.some(([, p]) => p.left || p.right || p.up || p.a), 'cpu Bob emitted real pads (not just idle)')

    const g2 = bobGame(seed, { players: 2 })
    const m1 = makeSlot('model'), m2 = makeSlot('model')
    let mismatch = -1
    for (let i = 0; i < pads.length; i++) {
        pushPad(m1, pads[i][0]); pushPad(m2, pads[i][1])
        const p1 = padFor(m1, { method: 'dpad', tick: i })
        const p2 = padFor(m2, { method: 'dpad', tick: i })
        bobStep(g2, [fromPad(p1), fromPad(p2)])
        g2.events.length = 0
        if (bobHash(g2) !== hashes[i]) { mismatch = i; break }
    }
    ok(mismatch === -1, 'recorded cpu pads replayed through model seats match every tick', mismatch >= 0 ? `tick ${mismatch}` : '')
    ok(bobHash(g2) === hashes[hashes.length - 1], 'final state hash matches, whatever produced the pads')

    if (process.argv.includes('--mutate')) {
        const cut = pads.findIndex(([, p], i) => i > 50 && (p.left || p.right || p.up || p.down || p.a))
        if (cut < 0) { ok(false, 'MUTANT: no live pad found to drop') }
        else {
            const gm = bobGame(seed, { players: 2 })
            let caught = -1
            for (let i = 0; i < pads.length; i++) {
                const p2 = i === cut ? { left: false, right: false, up: false, down: false, a: false } : pads[i][1]
                bobStep(gm, [fromPad(pads[i][0]), fromPad(p2)])
                gm.events.length = 0
                if (bobHash(gm) !== hashes[i]) { caught = i; break }
            }
            ok(caught >= cut, `MUTANT (dropped live pad at tick ${cut}) is caught`, caught >= 0 ? `diverged at ${caught}` : 'never diverged')
        }
    }
}

console.log(`${fail ? 'FAIL ' + fail : 'PASS'} ${pass}`)
process.exit(fail ? 1 : 0)
