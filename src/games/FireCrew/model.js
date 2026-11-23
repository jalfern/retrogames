// FIRE CREW MODEL (#1712 S2) — the crew's own senses AT THIS SEAT, the same
// doctrine as DoubleDragon's model.js (#1712), RallyCoDriver's (#1711),
// Gauntlet's (#2299 lineage) and FloorBoss's (#2805): features are what a
// firefighter at this seat can notice in the dark. The house is shared, but
// THE LIGHT is the crest: lightAt(g,x,y,seat) is ONE law that decides both
// what draws and what this seat could see (src/games/FireCrew/sim.js), so a
// victim the smoke hides is an honest zero here — never truth. Fire is the
// exception BY RULE: it glows through any smoke, so fire reads are shared.
//
// One definition: the S2 dataset featurizes with THIS file (scripts/
// plaicraft-dataset.mjs ADAPTERS['fire-crew']), a trainer eats these rows,
// and a seat agent that drops in later runs the same senses — a model can
// never train on one world and play on another (the silent-teacher bug class).
//
// `seat` is 0 (hose), 1 (rescue) or 2 (ladder). The ladder seat owns the
// loft window (lightAtRaw's seat-3 branch) — the split-information law,
// encoded rather than re-invented. `mem.pa` is the seat's own pad last tick
// (the autoregressive lane); the caller banks it AFTER the label.
//
// Hash-clean: pure reads of gs only — no rng, no writes.

import { W, H, CLOCK, VICTIMS, inLoft, lightAt, SWEEP_TICKS, DENY_ECHO_TICKS } from './sim.js'

export const FEAT_NAMES = [
    'clockFrac', 'rescuedFrac', 'lostFrac', 'scoreFrac',
    'windE', 'windS', 'windW', 'windN', 'windGust', 'vaneFrac',
    'ladder', 'ladderXFrac', 'ladderUp', 'slipping', 'braced',
    'myX', 'myY', 'inLoft', 'faceE', 'faceS', 'faceW', 'faceN', 'moving', 'down', 'hurt', 'knocks', 'climbing',
    'tank', 'battery', 'carrying',
    'f1Dx', 'f1Dy', 'f1Heat', 'f2Dx', 'f2Dy', 'f2Heat', 'f3Dx', 'f3Dy', 'f3Heat', 'fireGround', 'fireLoft',
    'v1', 'v1Dx', 'v1Dy', 'v1Loft', 'v2', 'v2Dx', 'v2Dy', 'v2Loft',
    'sweepW', 'sweepE', 'sweepBack', 'sweepFront', 'sweepLoft', 'sweepAll', 'sweepLeft',
    'radioLadder', 'radioHold', 'radioDeny', 'radioDenyLeft',
    'prevLeft', 'prevRight', 'prevUp', 'prevDown', 'prevA', 'prevB',
    'seatId',
]
export const N_FEAT = FEAT_NAMES.length // 67
export const N_ACT = 6 // left, right, up, down, A(soak), B(flare)

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const Z = 0 // the honest zero: a lane is silent, not small

// Which side of the house a sweep currently lights — one-hot, from the SIM's
// own sweep state (the radio call is shared knowledge: every screen shows the
// message and the light rises for every seat through lightAt).
const sweepLane = (g) => {
    if (!g.sweep || g.sweep.t <= 0) return [Z, Z, Z, Z, Z, Z, Z]
    const one = { west: 0, east: 1, back: 2, front: 3, loft: 4, all: 5 }
    const lane = [Z, Z, Z, Z, Z, Z, clamp01(g.sweep.t / SWEEP_TICKS)]
    const i = one[g.sweep.side]
    if (i !== undefined) lane[i] = 1
    return lane
}

export function featurize(g, seat, mem = {}) {
    const f = g.crew[seat]
    if (!f) return new Array(N_FEAT).fill(Z) // a seat the run never had: honest zeros
    const out = []

    // --- shared situation (the radio net and HUD make these everyone's) ----
    out.push(clamp01(1 - g.tick / CLOCK), g.rescued / VICTIMS, g.lost / VICTIMS, clamp01(g.score / 2000))

    // --- wind: the bed is heard by every seat; the vane counts the shift ----
    const windOne = [Z, Z, Z, Z]
    windOne[g.wind.dir] = 1 // DIRS: 0=E 1=S 2=W 3=N
    out.push(...windOne, g.wind.gust / 2, clamp01((g.wind.next - g.tick) / 1500))

    // --- the rig: ladder angle, truck column, the slip warning --------------
    out.push(clamp01(g.ladder), g.ladderX / (W - 1), g.ladder > 0.4 ? 1 : Z,
        g.slipT > 0 ? 1 : Z, g.braceHeld ? 1 : Z)

    // --- own body -------------------------------------------------------------
    const faceOne = [Z, Z, Z, Z]
    faceOne[f.face] = 1
    const down = f.downT > 0
    out.push(f.x / (W - 1), f.y / (H - 1), inLoft(f.y) ? 1 : Z, ...faceOne,
        f.moving > 0 && !down ? 1 : Z, down ? 1 : Z, f.hurtT > 0 ? 1 : Z,
        clamp01(f.knocks / 3), f.climbT > 0 ? 1 : Z)

    // --- own kit --------------------------------------------------------------
    out.push(clamp01(f.tank / 100), clamp01(f.battery / 100), f.carrying ? 1 : Z)

    // --- fire: shared by rule (it glows through any smoke) -------------------
    const fires = []
    let fireGround = 0
    let fireLoft = 0
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const c = g.cell[y * W + x]
            if (c && c.burning) {
                if (inLoft(y)) fireLoft++
                else fireGround++
                fires.push({ x, y, heat: clamp01(c.heat / 100), d: Math.abs(x - f.x) + Math.abs(y - f.y) })
            }
        }
    }
    fires.sort((a, b) => a.d - b.d)
    for (let i = 0; i < 3; i++) {
        const fr = fires[i]
        out.push(fr ? (fr.x - f.x) / (W - 1) : Z, fr ? (fr.y - f.y) / (H - 1) : Z, fr ? fr.heat : Z)
    }
    out.push(clamp01(fireGround / 8), clamp01(fireLoft / 8))

    // --- victims: ONLY what this seat's light reaches -------------------------
    // The lightAt law IS the split: a victim in dark is not in this seat's
    // world. Carried/rescued/lost victims are no longer asks — only `found`
    // (waiting, in the light) occupies a slot.
    const seen = g.victims
        .filter((v) => v.state === 'found' && lightAt(g, v.x, v.y, seat + 1) > 0.5)
        .map((v) => ({ v, d: Math.abs(v.x - f.x) + Math.abs(v.y - f.y) }))
        .sort((a, b) => a.d - b.d)
    for (let i = 0; i < 2; i++) {
        const s = seen[i]
        out.push(s ? 1 : Z, s ? (s.v.x - f.x) / (W - 1) : Z, s ? (s.v.y - f.y) / (H - 1) : Z,
            s && s.v.loft ? 1 : Z)
    }

    // --- the radio net (shared by rule: every seat sees/hears the call) -----
    // radioDeny/radioDenyLeft (#2985): the LIGHT DEAD echo, mirrored from
    // sweepLeft — a seat learning to shout must see that its shout failed,
    // or it trains on the command and never on the consequence.
    out.push(...sweepLane(g),
        g.voiceLadder && g.voiceLadder.t > 0 ? (g.voiceLadder.dir === 'up' ? 1 : -1) : Z,
        g.radioHoldT > 0 ? 1 : Z,
        g.radioDenyT > 0 ? 1 : Z, clamp01(g.radioDenyT / DENY_ECHO_TICKS))

    // --- autoregressive: the seat's own pad last tick --------------------------
    const pa = mem.pa || {}
    out.push(pa.left ? 1 : Z, pa.right ? 1 : Z, pa.up ? 1 : Z, pa.down ? 1 : Z, pa.a ? 1 : Z, pa.b ? 1 : Z)

    out.push(seat / 2)
    return out
}
