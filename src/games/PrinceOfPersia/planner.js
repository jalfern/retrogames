// PRINCE OF PERSIA — the autopilot. This IS the attract demo, and
// scripts/popcheck.mjs runs this exact code to prove every level is clearable
// (and clearable again at slack). A reactive pilot: hold right through the
// doorways, climb a step or hop a pit when the floor ahead is not there, wait
// behind a chomper until its jaws are up, walk onto the raise button and race
// the gate before it slams, and duel by reading the guard's wind-up — block the
// lunge, then strike while he recoils. The numeric constants mirror CFG in
// sim.js — popcheck pins the agreement.

import { RW, SOLID, PLATFORM, LOOSE, SPIKE, GATE, RAISE, EXIT } from './levels.js'
import { CFG, chompDown } from './sim.js'

export const P = {
    G: 0.45,
    WALK: 1.45,
    RUN: 2.6,
    JUMP: 8.4,
    REACH: 44,
    NEAR: 5 * 32,
}

const T = 32

const cell = (g, c, r) => {
    if (c < 0 || c >= g.level.W) return SOLID
    if (r < 0) return 0
    if (r >= g.level.H) return SOLID
    return g.level.grid[r * g.level.W + c]
}
const roomSolid = (g, code, c) => {
    if (code === GATE) return g.gateOpen[Math.floor(c / RW)] < CFG.gateOpen
    if (code === EXIT) return !g.exitOpen
    return code === SOLID || code === PLATFORM || code === LOOSE || code === SPIKE
        || code === RAISE || code === 7 || code === 8 || code === 11 || code === 13
}
const groundAt = (g, c, r) => cell(g, c, r)

export function decide(g) {
    const inp = { left: false, right: false, up: false, down: false, jump: false, shift: false, atk: false }
    const p = g.p
    if (g.status !== 'play') return inp
    const fr = Math.floor(p.y / T)
    const fc = Math.floor(p.x / T)
    const room = Math.floor(fc / RW)

    if (p.hang) { inp.up = true; return inp }
    if (fc >= g.level.W - 1) return inp   // at the far wall

    // ---- lair of the shadow: at the exit threshold stand and let it merge ---
    if (g.level.merge && g.shadow && !g.shadow.dead && !g.merged
        && room === Math.floor(g.level.exit.c / RW) && !p.duelDrawn) {
        return inp
    }

    // ---- duel ---------------------------------------------------------------
    let gd = null, best = 1e9
    for (const q of g.guards) {
        if (q.dead || q.room !== room) continue
        const d = Math.abs(q.x - p.x)
        if (d < P.NEAR && d < best) { best = d; gd = q }
    }
    if (gd) {
        const dir = gd.x > p.x ? 1 : -1
        if (gd.wind > 0) { inp.up = true; return inp }                 // block the lunge
        if (best > P.REACH - 4) {
            // never chase a recoiling blade across open teeth — hold at the lip
            const nc = fc + dir
            if (groundAt(g, nc, fr) === SPIKE) return inp
            for (const ch of g.chomps) {
                if (ch.c === nc && ch.r === fr) {
                    const ph = (g.tick + ch.phase) % CFG.chompPeriod
                    if (ph < CFG.chompWait && CFG.chompWait - ph < T / P.RUN + 10) return inp
                    if (ph >= CFG.chompWait) return inp
                }
            }
            inp[dir > 0 ? 'right' : 'left'] = true; return inp
        }
        if (g.tick % 7 < 2) inp.atk = true                             // strike the opening
        return inp
    }

    // ---- a poison flask on the path: hop it (the shadow behind will drink) --
    for (const pot of g.pots) {
        if (pot.type !== 'b' || pot.taken || pot.room !== room) continue
        const ahead = pot.c - fc
        if (ahead >= 2 && ahead <= 4 && pot.r === fr && p.onGround) {
            inp.right = true; inp.jump = true; return inp
        }
    }

    // ---- gate: walk onto the raise button, then race the slow close ---------
    let gateAhead = null
    for (const gc of columnsOf(g, 'gate')) {
        if (Math.floor(gc / RW) === room && gc > fc && gc - fc <= RW) {
            gateAhead = gateAhead === null ? gc : Math.min(gateAhead, gc)
        }
    }
    if (gateAhead !== null) {
        const btn = g.level.plates.find((b) => b.room === room && b.c < gateAhead)
        const sd = [1, 2, 3].map((d) => (g.level.grid[fr * g.level.W + fc + d] === SPIKE ? d : 9)).reduce((a, b) => Math.min(a, b), 9)
        if (sd <= 3) {
            inp.right = true
            if (p.onGround && ((Math.abs(p.vx) > CFG.run - 0.4 && sd <= 2) || sd <= 1)) inp.jump = true
            return inp                                                                                   // jump the spikes on the way
        }
        if (btn) {
            if (g.gateOpen[room] >= CFG.gateOpen) { inp.right = true; return inp }   // door up — race the close
            if (btn.c < fc && g.gateOpen[room] < CFG.gateOpen) { inp.left = true; return inp }  // back onto the button
            if (btn.c === fc && p.onGround && g.gateOpen[room] < 0.99) return inp    // hold it fully up
            inp.right = true; return inp                                               // step onto the button
        }
        inp.right = true; return inp
    }

    // ---- chomper: wait for the jaws, then cross -----------------------------
    for (const ch of g.chomps) {
        if (ch.room !== room) continue
        const ahead = ch.c - fc
        if (ahead > 0 && ahead <= 3) {
            if (chompDown(g, ch)) {
                if (p.x > ch.c * T) { inp.right = true; return inp }     // committed — get clear
                return inp                                                // wait behind the jaws
            }
            // Only step in when the jaws will stay up long enough to clear the
            // whole cell at a run; hold while still stoppable, commit once the
            // skid distance rules the stop out.
            const ph = (g.tick + ch.phase) % CFG.chompPeriod
            const upLeft = ph < CFG.chompWait ? CFG.chompWait - ph : 0
            const edge = ch.c * T
            const far = (ch.c + 1) * T + CFG.HW
            const stopDist = Math.abs(p.vx) > P.WALK + 0.2 ? Math.abs(p.vx) * 5 : 0
            const crossTime = (far - p.x) / P.RUN + 8
            if (p.x + stopDist < edge) {
                if (upLeft < crossTime) return inp
                inp.right = true; return inp
            }
            inp.right = true; return inp
        }
    }

    // ---- exit: press the plate then climb into the door (all on the path) ---
    // fall through to floor logic; the plate and stairs are walked/jumped.

    // ---- escape a pit (fell below the ground floor) -------------------------
    if (p.y >= (g.level.H - 1) * T) { inp.right = true; inp.jump = p.onGround; return inp }

    // ---- floor obstacles straight ahead: spikes, a step up, or a gap --------
    const footAhead = groundAt(g, fc + 1, fr)
    const stepUp = roomSolid(g, cell(g, fc + 1, fr - 1), fc + 1) && !roomSolid(g, cell(g, fc + 1, fr), fc + 1)
    const ledgeAhead = roomSolid(g, cell(g, fc + 1, fr - 2), fc + 1) && !roomSolid(g, cell(g, fc + 1, fr - 1), fc + 1)
    const spikeDist = [1, 2, 3].map((d) => (groundAt(g, fc + d, fr) === SPIKE ? d : 9)).reduce((a, b) => Math.min(a, b), 9)
    const spikeAhead = spikeDist <= 3
    const wallAhead = roomSolid(g, footAhead, fc + 1)
    const gapAhead = !roomSolid(g, footAhead, fc + 1) && !roomSolid(g, cell(g, fc + 1, fr + 1), fc + 1)
    const lethal = spikeAhead || gapAhead
    const speedReady = Math.abs(p.vx) > P.RUN - 0.4
    // a lethal jump (spikes, a pit) must be taken at full speed, or a short
    // standing hop sets the prince down on the teeth — build up first, then go
    if (lethal) {
        inp.right = true
        if (p.onGround && ((speedReady && spikeDist <= 2) || spikeDist <= 1 || gapAhead)) inp.jump = true
        return inp
    }
    if (stepUp || ledgeAhead || wallAhead) {
        inp.right = true
        inp.jump = p.onGround
        return inp
    }

    // ---- default: run right ---------------------------------------------------
    inp.right = true
    return inp
}

function columnsOf(g, kind) {
    if (kind === 'gate') {
        const out = []
        for (let r = 0; r < g.level.H; r++) for (let c = 0; c < g.level.W; c++) if (g.level.grid[r * g.level.W + c] === GATE) out.push(c)
        return out
    }
    return []
}
