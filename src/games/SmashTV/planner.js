// SMASH TV — the autopilot. Drives the SAME sim the player does, with the same
// twin-stick inputs, and proves the whole arena chain is winnable. The attract
// mode replays its proven run tick-for-tick; smashcheck grades it (and grades
// it again with the slack rule: one fewer crate and zero energy cells).
//
// #496 co-op: every doctrine below is seat-aware. plan() keeps driving seat 1
// exactly as it always did (its proven run is byte-identical); planCoop() seats
// the partner at seat 2, and partnerPad() wraps the same brain as a PAD
// EMITTER — the CPU plays by human rules because pads are all it ever says.
// padToInp / inpToPad are the shared fold between pads and sim inputs, so a
// harness can replay a 2P run from seed + per-player pad streams.

import { makeGame, step, stateHash, q8, los, CFG } from './sim.js'
import { EXITS, ENEMIES, CW, CH, HUD_H } from './levels.js'

const cx = (c) => c * 16 + 8
const cy = (r) => 24 + r * 16 + 8
const exitPos = (e) => [cx(e.c), cy(e.r)]

const norm = (x, y) => { const d = Math.hypot(x, y) || 1; return [x / d, y / d] }

const seatOf = (gs, pi) => gs.players[pi] || gs.player
const stallOf = (gs, pi) => {
    gs._st = gs._st || []
    return gs._st[pi] || (gs._st[pi] = { last: null, wantMove: false, stall: 0, detour: 0, side: 1 })
}

function nearestEnemy(gs, needLos, p) {
    let best = null, bd = 1e9
    for (const e of gs.enemies) {
        if (needLos && !los(gs, p.x, p.y, e.x, e.y)) continue
        const d = Math.hypot(e.x - p.x, e.y - p.y)
        if (d < bd) { bd = d; best = e }
    }
    return best
}

function dodge(gs, p) {
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

const aimH = (gs, inp, p, x, y) => {
    const [qx, qy] = q8(x - p.x, y - p.y)
    inp.fx = qx; inp.fy = qy
    inp.fire = true
}
const moveH = (gs, inp, p, x, y, drop = 0) => {
    let dx = x - p.x, dy = y - p.y
    if (drop) { const d = Math.hypot(dx, dy); if (d < drop) { dx = 0; dy = 0 } }
    const [qx, qy] = q8(dx, dy)
    inp.mx = qx; inp.my = qy
}

function nearestExit(gs, p) {
    let best = null, bd = 1e9
    for (const e of EXITS) {
        const [x, y] = exitPos(e)
        const d = Math.hypot(x - p.x, y - p.y)
        if (d < bd) { bd = d; best = [x, y] }
    }
    return best
}

export function decide(gs, pi = 0) {
    const p = seatOf(gs, pi)
    if (!p || p.deadT > 0 || p.out || gs.end) return {}
    const st = stallOf(gs, pi)
    const room = gs.roomData
    const inp = {}

    // stuck breaker: if we are trying to walk but barely moved, detour
    // sideways for a spell.
    if (st.last && st.wantMove) {
        const moved = Math.hypot(p.x - st.last[0], p.y - st.last[1])
        st.stall = moved < 0.3 ? st.stall + 1 : 0
    }
    st.last = [p.x, p.y]
    st.wantMove = false
    if (st.stall > 15) {
        st.detour = 30
        st.stall = 0
        st.side *= -1
    }
    if (st.detour > 0) {
        st.detour--
        // seat 1 keeps its proven horizontal break; a partner strafes VERTICALLY
        // first, because the stall it usually eats is a bar wall running vertical
        if (pi === 0) { inp.mx = st.side; inp.my = 0 }
        else { inp.mx = 0; inp.my = st.side }
        const th = nearestEnemy(gs, true, p)
        if (th) aimH(gs, inp, p, th.x, th.y)
        st.wantMove = true
        return inp
    }

    const aimAt = (x, y) => aimH(gs, inp, p, x, y)
    const moveToward = (x, y, drop = 0) => { moveH(gs, inp, p, x, y, drop); if (inp.mx || inp.my) st.wantMove = true }

    if (room.bonus) {
        let civ = null, bd = 1e9
        for (const v of gs.civilians) {
            const d = Math.hypot(v.x - p.x, v.y - p.y)
            if (d < bd) { bd = d; civ = v }
        }
        if (civ) { aimAt(civ.x + (civ.dx || 0) * 8, civ.y + (civ.dy || 0) * 8); moveToward(civ.x, civ.y, 4) }
        else if (gs.bonusT <= 0) { const e = gs.cleared ? nearestExit(gs, p) : null; if (e) moveToward(e[0], e[1]) }
        return inp
    }

    // firebombs when they pay: 3+ live non-boss enemies and spare energy
    if (gs.enemies.filter((e) => e.kind !== 'boss').length >= 3 && gs.energy >= CFG.firebombCost + 20 && p.invuln <= 0 && pi === 0) inp.bomb = true

    const dodgeVec = dodge(gs, p)
    const threat = nearestEnemy(gs, true, p) || nearestEnemy(gs, false, p)

    // upgrade run: while no threat is close and we still have the stock twin
    // pistols, smash the nearest crate and grab the gun inside.
    const crate = gs.crates.find((k) => k.hp > 0 && k.weapon !== p.weapon)
    if (!gs.cleared && !room.boss && crate && (p.weapon === 'twin' || p.weapon === 'spread') && (!threat || Math.hypot(threat.x - p.x, threat.y - p.y) > 45)) {
        aimAt(crate.x, crate.y)
        moveToward(crate.x, crate.y, 26)
        return inp
    }

    if (gs.cleared) {
        const e = nearestExit(gs, p)
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
                let s = Math.sign(p.x - threat.x) || st.side || 1
                if (p.x < 20) s = 1
                if (p.x > CW - 20) s = -1
                st.side = s
                inp.mx = s; inp.my = 0
            } else moveToward(threat.x, CH - 36, 40)
            return inp
        }
        if (dodgeVec) { inp.mx = Math.sign(dodgeVec[0]); inp.my = Math.sign(dodgeVec[1]); return inp }
        if (ENEMIES[threat.kind].kind === 'chaser' && d < 42) { inp.mx = -Math.sign(threat.x - p.x) || (p.x < CW / 2 ? 1 : -1); inp.my = -Math.sign(threat.y - p.y) || (p.y < CH / 2 ? 1 : -1); return inp }
        // The 8-way aim only lands what its line crosses, so a partner walks
        // ONTO the camera's row or column and empties the clip down the lane:
        // null out one axis at a time, stop at arm's length, and the shot that
        // follows cannot miss. (Seat 1 keeps its proven hold-and-shoot game.)
        if (pi !== 0 && threat.kind !== 'boss') {
            const dx = threat.x - p.x, dy = threat.y - p.y
            const canSee = los(gs, p.x, p.y, threat.x, threat.y)
            if (!canSee) moveToward(threat.x, threat.y)
            else if (threat.kind === 'turret' || threat.kind === 'walkcam') {
                if (d > 14) {
                    inp.mx = Math.abs(dx) > 5 ? Math.sign(dx) : 0
                    inp.my = Math.abs(dy) > 5 ? Math.sign(dy) : 0
                    st.wantMove = true
                }
            } else if (d > 80) {
                moveToward(threat.x, threat.y)
            } else {
                // lobbers and heavies punish a charge: hold a duelling distance
                // and walk the lane straight on without crossing it
                inp.mx = Math.abs(dx) > 40 ? Math.sign(dx) : 0
                inp.my = Math.abs(dy) > 40 ? Math.sign(dy) : 0
                if (inp.mx || inp.my) st.wantMove = true
            }
            aimAt(threat.x, threat.y)
            return inp
        }
        if (d > 80 || !los(gs, p.x, p.y, threat.x, threat.y)) moveToward(threat.x, threat.y)
        else { inp.mx = 0; inp.my = 0 }
        return inp
    }

    // no threat visible and not clear: hold center, wait for the wave
    moveToward(CW / 2, CH - 48, 24)
    // the partner gives its twin room on the same sheet of chrome
    if (pi === 1) {
        const other = seatOf(gs, 0)
        if (other && Math.hypot(other.x - p.x, other.y - p.y) < 14) {
            inp.mx = Math.sign(p.x - other.x) || -1
            inp.my = 0
        }
    }
    return inp
}

// --- pads: the only language a CPU seat speaks (#494 doctrine) --------------

// raw pad from a brain decision — what a human's thumbs would produce
export function decidePad(gs, pi = 0) {
    const d = decide(gs, pi)
    const mx = d.mx || 0, my = d.my || 0
    return {
        left: mx < 0, right: mx > 0, up: my < 0, down: my > 0,
        ax: d.fx || 0, ay: d.fy || 0,
        a: !!d.fire, b: !!d.bomb,
    }
}

// fold a pad back into a sim input — the game's shell does exactly this for
// every seat, human or model; the harness uses it to replay pad streams.
export function padToInp(pad) {
    const p = pad || {}
    const mx = (p.right ? 1 : 0) - (p.left ? 1 : 0)
    const my = (p.down ? 1 : 0) - (p.up ? 1 : 0)
    let fx = (p.aimRight ? 1 : 0) - (p.aimLeft ? 1 : 0)
    let fy = (p.aimDown ? 1 : 0) - (p.aimUp ? 1 : 0)
    if (!fx && !fy) { fx = Math.sign(p.ax || 0); fy = Math.sign(p.ay || 0) }
    return { mx, my, fx, fy, fire: !!p.a || !!(fx || fy), bomb: !!p.b }
}

// fold a sim input into a pad (the replay path proves both folds are inverse
// enough for the pilot's decision space: aim and fire always arrive together)
export function inpToPad(inp) {
    const i = inp || {}
    const mx = i.mx || 0, my = i.my || 0
    const fx = i.fx || 0, fy = i.fy || 0
    return {
        left: mx < 0, right: mx > 0, up: my < 0, down: my > 0,
        aimLeft: fx < 0, aimRight: fx > 0, aimUp: fy < 0, aimDown: fy > 0,
        ax: fx, ay: fy,
        a: !!i.fire || !!(fx || fy), b: !!i.bomb,
    }
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

// #496: the co-op autopilot. Seat 1 runs the proven solo doctrine; seat 2 is
// driven ONLY through pads (decidePad → padToInp), the same fold a human or a
// remote player gets — the CPU never touches more than a pad can say.
export function planCoop(seed = 0, opts = {}) {
    const gs = makeGame(seed, { ...opts, players: 2 })
    const script = []
    let deaths = 0
    const max = opts.maxTicks || 60000
    while (!gs.end && script.length < max) {
        const i1 = decide(gs, 0)
        const pad2 = decidePad(gs, 1)
        script.push([i1, pad2])
        step(gs, i1, padToInp(pad2))
        if (gs.events.some((e) => e.type === 'death')) deaths++
        gs.events.length = 0
    }
    return {
        won: gs.end === 'win', deaths, score: gs.score, score2: gs.players[1].score,
        script, hash: stateHash(gs), gs,
    }
}
