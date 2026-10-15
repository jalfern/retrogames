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
        if (best > P.REACH - 4) { inp[dir > 0 ? 'right' : 'left'] = true; return inp }
        if (g.tick % 7 < 2) inp.atk = true                             // strike the opening
        return inp
    }

    // ---- gate: walk onto the raise button, then race the slow close ---------
    let gateAhead = null
    for (const gc of columnsOf(g, 'gate')) {
        if (Math.floor(gc / RW) === room && gc > fc && gc - fc <= RW && g.gateOpen[room] < CFG.gateOpen) {
            gateAhead = gateAhead === null ? gc : Math.min(gateAhead, gc)
        }
    }
    if (gateAhead !== null) {
        const openSoon = g.gateOpen[room] >= 0.5
        if (openSoon) { inp.right = true; return inp }                  // door up — go
        const btn = g.level.plates.find((b) => b.room === room && b.c >= fc && b.c < gateAhead)
        if (btn) { inp.right = true; return inp }                        // step onto the button
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
            inp.right = true; return inp
        }
    }

    // ---- exit: press the plate then climb into the door (all on the path) ---
    // fall through to floor logic; the plate and stairs are walked/jumped.

    // ---- escape a pit (fell below the ground floor) -------------------------
    if (p.y > (g.level.H - 1) * T + 8) { inp.right = true; inp.jump = p.onGround; return inp }

    // ---- floor obstacles straight ahead: spikes, a step up, or a gap --------
    const footAhead = groundAt(g, fc + 1, fr)
    const stepUp = roomSolid(g, cell(g, fc + 1, fr - 1), fc + 1) && !roomSolid(g, cell(g, fc + 1, fr), fc + 1)
    const spikeAhead = footAhead === SPIKE || groundAt(g, fc + 2, fr) === SPIKE
    const wallAhead = roomSolid(g, footAhead, fc + 1)
    const gapAhead = !roomSolid(g, footAhead, fc + 1) && !roomSolid(g, cell(g, fc + 1, fr + 1), fc + 1)
    if (spikeAhead || stepUp || gapAhead || wallAhead) {
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
