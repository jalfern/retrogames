// SMASH TV — the autopilot. Drives the SAME sim the player does, with the same
// twin-stick inputs, and proves the whole arena chain is winnable. The attract
// mode replays its proven run tick-for-tick; smashcheck grades it (and grades
// it again with the slack rule: one fewer crate and zero energy cells).
//
// Doctrine: engage the nearest threat you can see (fire is 8-way instant aim),
// dodge incoming bullets by strafing perpendicular, keep a pistol's distance
// from chasers, sprint for an open exit once the room falls, chase civilians
// in the bonus, and strafe under THE ANNOUNCER pouring lead upward.

import { makeGame, step, stateHash, q8, los, CFG } from './sim.js'
import { EXITS, ENEMIES, CW, CH, HUD_H } from './levels.js'

const cx = (c) => c * 16 + 8
const cy = (r) => 24 + r * 16 + 8
const exitPos = (e) => [cx(e.c), cy(e.r)]

const norm = (x, y) => { const d = Math.hypot(x, y) || 1; return [x / d, y / d] }

function nearestEnemy(gs, needLos) {
    const p = gs.player
    let best = null, bd = 1e9
    for (const e of gs.enemies) {
        if (needLos && !los(gs, p.x, p.y, e.x, e.y)) continue
        const d = Math.hypot(e.x - p.x, e.y - p.y)
        if (d < bd) { bd = d; best = e }
    }
    return best
}

function dodge(gs) {
    const p = gs.player
    const threats = [...gs.ebullets, ...gs.grenades]
    let best = null, bt = 1e9
    for (const b of threats) {
        const dx = p.x - b.x, dy = p.y - b.y
        const d = Math.hypot(dx, dy)
        if (d > 26) continue
        const closing = b.dx * dx + b.dy * dy
        if (closing < 0) continue
        const t = d / (Math.hypot(b.dx, b.dy) || 1)
        if (t < bt) { bt = t; best = b }
    }
    if (!best) return null
    // perpendicular to the bullet's heading, away from walls
    const [px, py] = norm(-best.dy, best.dx)
    const s1 = [px, py], s2 = [-px, -py]
    const roomy = (v) => p.x + v[0] * 10 > 14 && p.x + v[0] * 10 < CW - 14 && p.y + v[1] * 10 > HUD_H + 14 && p.y + v[1] * 10 < CH - 14
    if (roomy(s1)) return s1
    if (roomy(s2)) return s2
    return null
}

const aimH = (gs, inp, x, y) => {
    const p = gs.player
    const [qx, qy] = q8(x - p.x, y - p.y)
    inp.fx = qx; inp.fy = qy
    inp.fire = true
}
const moveH = (gs, inp, x, y, drop = 0) => {
    const p = gs.player
    let dx = x - p.x, dy = y - p.y
    if (drop) { const d = Math.hypot(dx, dy); if (d < drop) { dx = 0; dy = 0 } }
    const [qx, qy] = q8(dx, dy)
    inp.mx = qx; inp.my = qy
    if (qx || qy) gs._pWantMove = true
}

export function decide(gs) {
    const p = gs.player
    if (!p || p.deadT > 0 || gs.end) return {}
    const room = gs.roomData
    const inp = {}

    // stuck breaker: if we are trying to walk but barely moved, detour
    // sideways for a spell.
    if (gs._pLast && gs._pWantMove) {
        const moved = Math.hypot(p.x - gs._pLast[0], p.y - gs._pLast[1])
        gs._pStall = moved < 0.3 ? (gs._pStall || 0) + 1 : 0
    }
    gs._pLast = [p.x, p.y]
    gs._pWantMove = false
    if (gs._pStall > 15) {
        gs._pDetour = 30
        gs._pStall = 0
        gs._pSide = (gs._pSide || 1) * -1
    }
    if (gs._pDetour > 0) {
        gs._pDetour--
        inp.mx = gs._pSide
        inp.my = 0
        const th = nearestEnemy(gs, true)
        if (th) aimH(gs, inp, th.x, th.y)
        gs._pWantMove = true
        return inp
    }

    const aimAt = (x, y) => aimH(gs, inp, x, y)
    const moveToward = (x, y, drop = 0) => moveH(gs, inp, x, y, drop)

    if (room.bonus) {
        let civ = null, bd = 1e9
        for (const v of gs.civilians) {
            const d = Math.hypot(v.x - p.x, v.y - p.y)
            if (d < bd) { bd = d; civ = v }
        }
        if (civ) { aimAt(civ.x + (civ.dx || 0) * 8, civ.y + (civ.dy || 0) * 8); moveToward(civ.x, civ.y, 4) }
        else if (gs.bonusT <= 0) { const e = gs.cleared ? nearestExit(gs) : null; if (e) moveToward(e[0], e[1]) }
        return inp
    }

    // firebombs when they pay: 3+ live non-boss enemies and spare energy
    if (gs.enemies.filter((e) => e.kind !== 'boss').length >= 3 && gs.energy >= CFG.firebombCost + 20 && gs.player.invuln <= 0) inp.bomb = true

    const dodgeVec = dodge(gs)
    const threat = nearestEnemy(gs, true) || nearestEnemy(gs, false)

    // upgrade run: while no threat is close and we still have the stock twin
    // pistols, smash the nearest crate and grab the gun inside.
    const crate = gs.crates.find((k) => k.hp > 0 && k.weapon !== gs.weapon)
    if (!gs.cleared && !room.boss && crate && (gs.weapon === 'twin' || gs.weapon === 'spread') && (!threat || Math.hypot(threat.x - p.x, threat.y - p.y) > 45)) {
        aimAt(crate.x, crate.y)
        moveToward(crate.x, crate.y, 26)
        return inp
    }

    if (gs.cleared) {
        const e = nearestExit(gs)
        if (e) moveToward(e[0], e[1])
        if (threat && Math.hypot(threat.x - p.x, threat.y - p.y) < 90) aimAt(threat.x, threat.y)
        return inp
    }

    if (threat) {
        const d = Math.hypot(threat.x - p.x, threat.y - p.y)
        aimAt(threat.x, threat.y)
        if (threat.kind === 'boss') {
            // track under the ANNOUNCER and break his fan: when any of his
            // bullets is moments away, jink horizontally AWAY from his lane —
            // the fan converges where you were, so sideways beats precision.
            let incoming = false
            for (const b of gs.ebullets) {
                const bd = Math.hypot(b.x - p.x, b.y - p.y)
                if (bd < 34 && b.dy > 0) { incoming = true; break }
            }
            if (incoming) {
                let s = Math.sign(p.x - threat.x) || gs._pSide || 1
                if (p.x < 20) s = 1
                if (p.x > CW - 20) s = -1
                gs._pSide = s
                inp.mx = s; inp.my = 0
            } else moveToward(threat.x, CH - 36, 40)
            return inp
        }
        if (dodgeVec) { inp.mx = Math.sign(dodgeVec[0]); inp.my = Math.sign(dodgeVec[1]); return inp }
        if (ENEMIES[threat.kind].kind === 'chaser' && d < 42) { inp.mx = -Math.sign(threat.x - p.x) || (p.x < CW / 2 ? 1 : -1); inp.my = -Math.sign(threat.y - p.y) || (p.y < CH / 2 ? 1 : -1); return inp }
        if (d > 80) moveToward(threat.x, threat.y)
        else { inp.mx = 0; inp.my = 0 }
        return inp
    }

    // no threat visible and not clear: hold center, wait for the wave
    moveToward(CW / 2, CH - 48, 24)
    return inp
}

function nearestExit(gs) {
    const p = gs.player
    let best = null, bd = 1e9
    for (const e of EXITS) {
        const [x, y] = exitPos(e)
        const d = Math.hypot(x - p.x, y - p.y)
        if (d < bd) { bd = d; best = [x, y] }
    }
    return best
}

export function plan(seed = 0, opts = {}) {
    const gs = makeGame(seed, opts)
    const script = []
    let deaths = 0
    const max = opts.maxTicks || 60000
    while (!gs.end && script.length < max) {
        const inp = decide(gs)
        script.push(inp)
        step(gs, inp)
        if (gs.events.some((e) => e.type === 'death')) deaths++
        gs.events.length = 0
    }
    return { won: gs.end === 'win', deaths, score: gs.score, script, hash: stateHash(gs), gs }
}
