// PICK RUSH — the pure sim. No DOM, no Math.random in the rules path: every
// random the sim consumes comes from the seed (mulberry32). The autopilot in
// this file scripts the attract demo AND the CPU seat AND the Node harness's
// "it can be won" proof — one brain, three jobs.
//
// Contract: step(gs, pads) advances exactly one tick; pads is an array of
// per-seat pads { left, right, a, b }. state.hash makes drift visible.

export const FIXED_DT = 1000 / 60
export const VIEW_W = 426
export const VIEW_H = 240

export const RAIL_Y = 30
export const BELT_Y = 96           // belt tread top edge
export const BELT_END = 416
export const ARM_MIN = 14
export const ARM_MAX = 412
export const ARM_SPEED = 2.4
export const CLAW_UP = 40         // claw tip stow height
export const CLAW_DOWN = 97       // claw tip at the belt
export const CLAW_SPEED = 3.0
export const CARRY_TIP = 55       // auto-hoist stops here (item clears the belt)
export const GRAB_DX = 11
export const BIN_TOP = 152
export const FLOOR_Y = 208
export const GRAV = 0.5
export const BREAK_VY = 8.0       // fragile goods shatter harder than this
export const BREAK_VX = 3.2
export const SHIFT_TICKS = 4200   // 70 s shift
export const FUSES = 3

export const KINDS = {
    crate:  { w: 15, h: 14, fragile: false, roll: false, bin: 0 },
    can:    { w: 12, h: 16, fragile: false, roll: false, bin: 1 },
    barrel: { w: 15, h: 15, fragile: false, roll: true,  bin: 1 },
    bottle: { w: 9,  h: 18, fragile: true,  roll: false, bin: 2 },
    coil:   { w: 16, h: 12, fragile: false, roll: false, bin: 3 },
    scrap:  { w: 14, h: 13, fragile: false, roll: false, bin: 4 },
}

export const BINS = [
    { label: 'CRATE',  x: 37,  w: 64, kind: 'crate' },
    { label: 'CAN',    x: 109, w: 64, kind: 'can' },
    { label: 'BOTTLE', x: 181, w: 64, kind: 'bottle' },
    { label: 'COIL',   x: 253, w: 64, kind: 'coil' },
    { label: 'SCRAP',  x: 325, w: 64, kind: 'scrap' },
]

// quotas are the tuned promise: the shipped autopilot clears every one on
// seeds 1–12 with 4+ picks of headroom (pickcheck re-proves it per shift).
export const SHIFTS = [
    { speed: 1.00, quota: 18 },
    { speed: 1.14, quota: 19 },
    { speed: 1.28, quota: 20 },
    { speed: 1.42, quota: 21 },
]

const mulberry32 = (a) => {
    let s = a >>> 0
    return () => {
        s = (s + 0x6d2b79f5) >>> 0
        let t = s
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const KIND_MIX = [
    [['crate', 0.40], ['can', 0.35], ['coil', 0.25]],
    [['crate', 0.32], ['can', 0.28], ['coil', 0.20], ['bottle', 0.20]],
    [['crate', 0.26], ['can', 0.22], ['coil', 0.17], ['bottle', 0.18], ['barrel', 0.17]],
    [['crate', 0.22], ['can', 0.18], ['coil', 0.15], ['bottle', 0.17], ['barrel', 0.16], ['scrap', 0.12]],
]
const pickKind = (rnd, shift) => {
    const mix = KIND_MIX[Math.min(shift, KIND_MIX.length - 1)]
    let r = rnd(), acc = 0
    for (const [k, p] of mix) { acc += p; if (r < acc) return k }
    return mix[mix.length - 1][0]
}

const fnv = (h, n) => {
    let x = (h ^ Math.round(n)) >>> 0
    x = Math.imul(x, 0x01000193) >>> 0
    return x
}

let NEXT_ID = 1

export function makeGame(seed = 1, players = 1) {
    NEXT_ID = 1
    const gs = {
        seed: seed >>> 0,
        players: Math.max(1, Math.min(2, players | 0 || 1)),
        tick: 0,
        end: null,               // 'fired' | 'win'
        endReason: '',
        shift: 0,
        shiftTick: 0,
        correct: 0,
        score: 0,
        combo: 0,
        bestCombo: 0,
        warnings: 0,
        beltPos: 0,
        items: [],
        fx: [],                 // cosmetic-only ledger (juice hook)
        ev: [],
        hash: 0,
        arms: [],
        rng: mulberry32(seed >>> 0),
        nextSpawn: 30,
        spawnN: 0,
        binFill: BINS.map(() => 0),
    }
    for (let i = 0; i < gs.players; i++) {
        gs.arms.push({
            x: 90 + i * 240, vx: 0, tip: CLAW_UP,
            mode: 'up',         // up | lowering | low | rising
            held: null,         // item id
            clamp: 0,           // clamp-close animation frames
            score: 0,           // this seat's bank (head-to-head)
            // autopilot memory
            target: -1, walk: 0, commit: 0,
        })
    }
    return gs
}

const beltSpeed = (gs) => SHIFTS[Math.min(gs.shift, SHIFTS.length - 1)].speed
const beltV = (gs) => 1.05 * beltSpeed(gs)
const quotaFor = (gs) => SHIFTS[Math.min(gs.shift, SHIFTS.length - 1)].quota

const itemById = (gs, id) => gs.items.find((it) => it.id === id) || null

const clampX = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

const barrelUpright = (it) => {
    const r = ((it.rot % Math.PI) + Math.PI) % Math.PI
    return r < 0.42 || r > Math.PI - 0.42
}

function fault(gs, seat, type, x, y, msg) {
    gs.warnings++
    gs.combo = 0
    gs.ev.push({ type, seat, x, y })
    gs.fx.push({ t: 'fault', x, y, msg, k: 0 })
    if (gs.warnings >= FUSES) { gs.end = 'fired'; gs.endReason = msg; gs.ev.push({ type: 'fire', seat }) }
}

function endShift(gs) {
    const q = quotaFor(gs)
    if (gs.correct >= q) {
        gs.ev.push({ type: 'shift', shift: gs.shift, correct: gs.correct })
        gs.fx.push({ t: 'shift', msg: `SHIFT ${gs.shift + 1} CLEAR`, k: 0 })
        if (gs.shift >= SHIFTS.length - 1) {
            gs.end = 'win'
            gs.endReason = 'ALL SHIFTS CLEARED'
            gs.ev.push({ type: 'win' })
            return
        }
        gs.shift++
        gs.shiftTick = 0
        gs.correct = 0
        gs.warnings = 0
        gs.score += 500
    } else {
        gs.end = 'fired'
        gs.endReason = `QUOTA MISSED (${gs.correct}/${q})`
        gs.ev.push({ type: 'fire', seat: 0 })
    }
}

// NOTE: the two carriages ride twin rails (the belt is shared, the rails are
// not) — a cargo bound for a far bin never deadlocks behind the rival crane.

function stepArm(gs, seat, pad) {
    const arm = gs.arms[seat]
    const l = !!(pad && pad.left), r = !!(pad && pad.right)
    const d = !!(pad && pad.down)
    const a = !!(pad && pad.a), b = !!(pad && pad.b)
    const speed = ARM_SPEED * (arm.held !== null ? 0.72 : 1)
    arm.vx = (r ? speed : 0) - (l ? speed : 0)
    arm.x = clampX(arm.x + arm.vx, ARM_MIN, ARM_MAX)

    // A multiplexes the crane: press lowers / releases; DOWN feathers the
    // climb down while carrying (the only safe way to land fragile goods).
    if (a && !arm.prevA) {
        if (arm.held !== null) releaseHeld(gs, seat)
        else if (arm.mode === 'up' || arm.mode === 'rising') arm.mode = 'lowering'
        else if (arm.mode === 'low') arm.mode = 'rising'
        else if (arm.mode === 'lowering' && arm.held === null) arm.mode = 'rising'
    }
    if (b && !arm.prevB && arm.held !== null) releaseHeld(gs, seat)
    arm.prevA = a; arm.prevB = b

    if (arm.held !== null && d && arm.tip < CLAW_DOWN) arm.mode = 'lowering-feather'
    else if (arm.held !== null && arm.mode === 'lowering-feather' && !d) arm.mode = 'rising'

    if (arm.mode === 'lowering' || arm.mode === 'lowering-feather') {
        arm.tip = Math.min(CLAW_DOWN, arm.tip + CLAW_SPEED)
        if (arm.tip >= CLAW_DOWN) arm.mode = 'low'
    } else if (arm.mode === 'rising') {
        const stop = arm.held !== null ? CARRY_TIP : CLAW_UP
        arm.tip = Math.max(stop, arm.tip - CLAW_SPEED)
        if (arm.tip <= stop) arm.mode = 'up'
    }

    // clamp attempt while the claw is open and in the grab window, empty
    if (arm.held === null && arm.clamp === 0 && arm.tip >= 76) {
        for (const it of gs.items) {
            if (it.carriedBy !== -1 || !it.onBelt) continue
            if (Math.abs(it.x - arm.x) > GRAB_DX) continue
            const K = KINDS[it.kind]
            if (K.roll && !barrelUpright(it)) {
                gs.ev.push({ type: 'slip', seat, x: arm.x, y: arm.tip })
                gs.fx.push({ t: 'slip', msg: 'SLIPPED!', x: arm.x, y: arm.tip - 10, k: 0 })
                arm.clamp = 10
                if (arm.mode !== 'low') arm.mode = 'rising'
                break
            }
            it.carriedBy = seat
            it.lastSeat = seat
            it.onBelt = false
            it.vx = 0; it.vy = 0
            arm.held = it.id
            arm.clamp = 8
            arm.mode = 'rising'
            gs.ev.push({ type: 'grab', seat, kind: it.kind, x: arm.x })
            break
        }
    }
    if (arm.clamp > 0) arm.clamp--

    // carried item rides the claw
    if (arm.held !== null) {
        const it = itemById(gs, arm.held)
        if (it) { it.x = arm.x; it.y = arm.tip + 9 }
    }
}

function releaseHeld(gs, seat) {
    const arm = gs.arms[seat]
    const it = itemById(gs, arm.held)
    arm.held = null
    arm.mode = arm.tip > CLAW_UP + 2 ? 'rising' : 'up'
    if (!it) return
    it.carriedBy = -1
    it.vx = arm.vx
    it.vy = 2
    gs.ev.push({ type: 'release', seat, kind: it.kind, x: it.x, y: it.y })
}

function stepItems(gs) {
    const vb = beltV(gs)
    for (let i = gs.items.length - 1; i >= 0; i--) {
        const it = gs.items[i]
        if (it.carriedBy !== -1) continue
        if (it.onBelt) {
            it.x += vb
            const K = KINDS[it.kind]
            if (K.roll) it.rot += vb / 6.5
            if (it.x > BELT_END) {
                it.onBelt = false
                it.vy = 0
                it.lost = true
                gs.combo = 0
                gs.score = Math.max(0, gs.score - 50)
                gs.ev.push({ type: 'miss', x: it.x, y: BELT_Y })
                gs.fx.push({ t: 'missline', msg: 'MISSED −50', x: BELT_END - 30, y: BELT_Y - 16, k: 0 })
            }
        } else if (it.lost) {
            it.vy += GRAV
            it.y += it.vy
            if (it.y > VIEW_H + 24) gs.items.splice(i, 1)
            continue
        } else {
            it.vy += GRAV
            it.x += it.vx
            it.y += it.vy
            const bottom = it.y + KINDS[it.kind].h / 2
            // bin catch
            if (it.vy > 0 && bottom >= BIN_TOP && it.y < BIN_TOP + 30) {
                const bin = BINS.find((bn) => it.x >= bn.x + 5 && it.x <= bn.x + bn.w - 5)
                if (bin) {
                    const want = KINDS[it.kind].bin === BINS.indexOf(bin)
                    if (it.fragile && (it.vy > BREAK_VY || Math.abs(it.vx) > BREAK_VX)) {
                        gs.ev.push({ type: 'shatter', x: it.x, y: BIN_TOP })
                        gs.fx.push({ t: 'shatter', msg: 'SMASHED!', x: it.x, y: BIN_TOP - 14, k: 0 })
                        fault(gs, -1, 'break', it.x, BIN_TOP, 'FRAGILE SMASHED')
                    } else if (want) {
                        it.landed = true
                        gs.combo++
                        gs.bestCombo = Math.max(gs.bestCombo, gs.combo)
                        const pts = 100 + (gs.combo - 1) * 25 + gs.shift * 25
                        gs.score += pts
                        const credited = gs.arms[it.lastSeat ?? 0] || gs.arms[0]
                        credited.score += pts
                        gs.correct++
                        gs.binFill[BINS.indexOf(bin)]++
                        gs.ev.push({ type: 'drop', kind: it.kind, bin: BINS.indexOf(bin), pts, combo: gs.combo, x: it.x })
                        gs.fx.push({ t: 'ok', msg: `+${pts}`, x: it.x, y: BIN_TOP - 14, k: 0 })
                    } else {
                        gs.ev.push({ type: 'wrong', x: it.x, y: BIN_TOP })
                        gs.fx.push({ t: 'wrong', msg: 'WRONG BIN', x: it.x, y: BIN_TOP - 14, k: 0 })
                        fault(gs, -1, 'wrong', it.x, BIN_TOP, 'WRONG BIN')
                    }
                    gs.items.splice(i, 1)
                    continue
                }
            }
            if (bottom >= FLOOR_Y) {
                gs.fx.push({ t: 'miss', msg: 'NOT IN BIN', x: it.x, y: FLOOR_Y - 12, k: 0 })
                fault(gs, -1, 'floor', it.x, FLOOR_Y, 'DROPPED ON FLOOR')
                gs.items.splice(i, 1)
                continue
            }
        }
    }
}

function spawn(gs) {
    if (gs.tick < gs.nextSpawn) return
    const kind = pickKind(gs.rng, gs.shift)
    const K = KINDS[kind]
    gs.items.push({
        id: NEXT_ID++, n: gs.spawnN++, kind, x: -12, y: BELT_Y - K.h / 2,
        vx: 0, vy: 0, rot: gs.rng() * Math.PI, onBelt: true,
        carriedBy: -1, fragile: K.fragile, landed: false,
    })
    const gapBase = Math.max(42, 84 - gs.shift * 9)
    gs.nextSpawn = gs.tick + gapBase + Math.floor(gs.rng() * 34)
}

// ---------------- autopilot (CPU seat + attract demo + win proof) ------------
// Targets the nearest catchable item, leads it for the claw's descent time,
// and soft-releases fragile goods into their bin. Seed-jitter keeps it
// beatable by a good human.
export function autopilot(gs, seat) {
    const arm = gs.arms[seat]
    const rnd = gs.rng
    const pad = {}
    if (gs.end) return pad

    if (arm.held !== null) {
        const it = itemById(gs, arm.held)
        const bin = BINS[it ? KINDS[it.kind].bin : 0]
        const cx = bin.x + bin.w / 2
        if (Math.abs(arm.x - cx) > 12) { pad[it && arm.x < cx ? 'right' : 'left'] = true; return pad }
        if (it && it.fragile && arm.tip < CLAW_DOWN - 12) { pad.down = true; return pad }
        // release needs a fresh press edge: gap tick, then press
        if (arm.prevA) pad.a = false
        else pad.a = true
        return pad
    }

    // empty claw: coast through the descent; bottomed out with nothing → rise
    if (arm.mode === 'low') {
        if (arm.prevA) pad.a = false
        else pad.a = true
        return pad
    }
    if (arm.mode !== 'up') return pad
    if (arm.prevA) { pad.a = false; return pad }

    // with a rival on the rail, every other piece belongs to each crane
    // (P1: even spawns, foreman: odd); solo, the whole line is yours
    const home = gs.players > 1 ? (it) => (it.n ?? 0) % 2 === seat : () => true
    let best = null
    for (const it of gs.items) {
        if (it.carriedBy !== -1 || !it.onBelt) continue
        if (it.x > BELT_END - 24) continue
        if (!home(it)) continue
        if (it.x < arm.x - 40) continue
        if (!best || it.x < best.x) best = it
    }
    if (!best) {
        if (seat === 0) {
            const behind = gs.items.filter((it) => it.onBelt && it.carriedBy === -1 && it.x < arm.x - 30 && home(it))
            if (behind.length) pad.left = true
            else if (arm.x > 110) pad.left = true
        } else if (arm.x > 250) pad.left = true
        else if (arm.x < 250) pad.right = true
        return pad
    }
    if (arm.target !== best.id) { arm.target = best.id; arm.jitter = Math.round((rnd() - 0.5) * 3); arm.skip = rnd() < 0.03 }
    if (arm.skip) return pad
    const lead = beltV(gs) * Math.ceil((CLAW_DOWN - arm.tip) / CLAW_SPEED) + arm.jitter
    const tx = clampX(best.x + lead, ARM_MIN, BELT_END - 8)
    if (tx > arm.x + 1.5) pad.right = true
    else if (tx < arm.x - 1.5) pad.left = true
    else pad.a = true
    return pad
}

export function stateHash(gs) {
    let h = 0x811c9dc5
    h = fnv(h, gs.tick); h = fnv(h, gs.score); h = fnv(h, gs.shift)
    h = fnv(h, gs.correct); h = fnv(h, gs.warnings); h = fnv(h, gs.combo)
    h = fnv(h, gs.items.length)
    for (const it of gs.items) {
        h = fnv(h, it.id); h = fnv(h, it.x * 4); h = fnv(h, it.y * 4)
        h = fnv(h, it.carriedBy + 2); h = fnv(h, it.onBelt ? 1 : 0)
    }
    for (const a of gs.arms) { h = fnv(h, a.x * 8); h = fnv(h, a.tip * 8); h = fnv(h, a.held === null ? 0 : a.held); h = fnv(h, a.mode.length) }
    h = fnv(h, gs.end ? (gs.end === 'win' ? 11 : 7) : 0)
    return h >>> 0
}

export function step(gs, pads) {
    gs.ev.length = 0
    if (gs.end) return
    gs.tick++
    gs.shiftTick++
    gs.beltPos = (gs.beltPos + beltV(gs)) % 16

    spawn(gs)
    for (let s = 0; s < gs.players; s++) {
        stepArm(gs, s, Array.isArray(pads) ? pads[s] : (s === 0 ? pads : {}))
    }
    stepItems(gs)
    if (!gs.end && gs.shiftTick >= SHIFT_TICKS) endShift(gs)
    for (const f of gs.fx) f.k++
    gs.hash = stateHash(gs)
}

// drives seats that the pads array doesn't cover with the autopilot
export function stepWithAuto(gs, pads, autoSeats) {
    const p = Array.isArray(pads) ? pads.slice() : [pads || {}]
    for (const s of autoSeats) {
        if (s < gs.players) p[s] = autopilot(gs, s)
    }
    step(gs, p)
}
