// PRINCE OF PERSIA — the autopilot. This IS the attract demo, and
// scripts/popcheck.mjs runs this exact code to prove the whole dungeon is
// winnable (and winnable again at slack). A tiny reactive pilot: read the
// room a few tiles ahead, hold for the guillotine, hop the pits and the
// poison, and duel by reading the guard's stance telegraph.
// The numeric constants mirror CFG in sim.js — popcheck pins the agreement.

import { W, SOLID, SPIKE, SPIKE_PORTED, PLATE } from './levels.js'
import { CFG } from './sim.js'

export const P = {
    G: 0.45,
    WALK: 1.45,
    RUN: 2.6,
    JUMP: 8.6,
    REACH: 46,
    GAP_MAX: 3,
    GUARD_NEAR: 8 * 32,
}

const T = 32
const cell = (g, c, r) => {
    if (c < 0 || c >= W) return SOLID
    if (r < 0 || r >= g.level.grid.length / W) return 0
    return g.level.grid[r * W + c]
}
const portOpen = (g) => g.portLatch

export function decide(g) {
    const inp = { left: false, right: false, up: false, down: false, jump: false, shift: false, atk: false }
    const p = g.p
    if (g.status !== 'play') return inp
    const fr = Math.floor((p.y - 1) / T)
    const fc = Math.floor(p.x / T)

    // ---- if hanging, pull up --------------------------------------------------
    if (p.hang) { inp.up = true; return inp }

    // ---- hop over poison wherever it stands on our line ----------------------
    for (const pot of g.pots) {
        if (pot.taken || pot.type !== 'X') continue
        const dx = (pot.c + 0.5) * T - p.x
        if (dx > 0 && dx < 1.6 * T && Math.abs(pot.r - fr) <= 1) {
            inp.right = true
            if (p.onGround && dx < 1.15 * T) inp.jump = true
            return inp
        }
    }

    // ---- duel ---------------------------------------------------------------
    let gd = null
    let best = 1e9
    for (const q of g.guards) {
        if (q.dead) continue
        const d = Math.abs(q.x - p.x)
        if (d < P.GUARD_NEAR && d < best && Math.abs(q.y - p.y) < 2 * T) { best = d; gd = q }
    }
    if (gd) {
        const dir = gd.x > p.x ? 1 : -1
        const reach = gd.boss ? P.REACH + 6 : P.REACH
        if (gd.wind > 0) {
            // hold the height the blade is coming in at: parry
            if (gd.stance === 2) inp.up = true
            else if (gd.stance === 0) inp.down = true
            if (best > reach - 4) inp[dir > 0 ? 'right' : 'left'] = true
        } else if (best > reach - 12) {
            inp[dir > 0 ? 'right' : 'left'] = true
        } else if (best <= reach + 8 && g.tick % 20 < 2) {
            // strike at a height the guard is NOT holding
            const s = gd.stance === 2 ? 0 : gd.stance + 1
            if (s === 2) inp.up = true
            else if (s === 0) inp.down = true
            inp.atk = true
        } else if (best > reach - 26) {
            inp[dir > 0 ? 'right' : 'left'] = true
        }
        return inp
    }

    // ---- exit close: walk in ------------------------------------------------
    const ex = g.level.exit
    if (ex && Math.abs(p.x - (ex.c + 0.5) * T) < 3 * T) {
        inp.right = true
        return inp
    }

    // ---- guillotine ----------------------------------------------------------
    for (const gu of g.level.guills) {
        const gx = (gu.c + 0.5) * T
        const ahead = gx - p.x
        if (ahead > -T * 0.4 && ahead < 4.4 * T) {
            const ph = g.tick % CFG.guillPeriod
            const safe = ph < CFG.guillWait - 10 || ph >= CFG.guillWait + CFG.guillDrop + 8
            if (!safe) {
                if (p.x > gx - T * 0.5) { inp.right = true; return inp }  // commit, get out
                return inp                                           // hold behind the blade
            }
            if (ahead < 2.6 * T) { inp.right = true; return inp }
        }
    }

    // ---- spikes: wait for the port, or walk to the plate that opens it ------
    for (let a = 1; a <= 2; a++) {
        const c = fc + a
        const foot = cell(g, c, fr)
        const spikeNow = foot === SPIKE || (foot === SPIKE_PORTED && !portOpen(g))
        if (spikeNow && !(a === 1 && !p.onGround)) {
            if (portOpen(g)) continue
            const plateAhead = g.level.plates.some((pl) => pl.r === fr && pl.c > fc && pl.c <= fc + 6)
            if (plateAhead) { inp.right = true; return inp }
            return inp
        }
    }

    // ---- pit ahead: hop the lip (hold while rising for distance) ------------
    for (let a = 1; a <= P.GAP_MAX; a++) {
        const c = fc + a
        const foot = cell(g, c, fr)
        const below = cell(g, c, fr + 1)
        const openCell = foot !== SOLID && foot !== SPIKE && !(foot === SPIKE_PORTED && !portOpen(g)) && !g.fallen[fr * W + c]
        const openBelow = below !== SOLID && below !== SPIKE && below !== PLATE && !g.fallen[(fr + 1) * W + c]
        const gap = openCell && openBelow
        if (!gap && a === 1) break
        if (gap && a === 1) {
            inp.right = true
            inp.jump = p.onGround
            return inp
        }
    }

    // ---- default: run right -----------------------------------------------------
    inp.right = true
    if (ex && p.x > (ex.c + 0.5) * T) inp.right = false
    return inp
}
