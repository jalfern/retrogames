// THE SIM — Joust (Williams, 1982) in pure, deterministic ticks. No
// Math.random, no Date, no DOM: the same tick sequence in and out of a
// browser, which is what lets scripts/joustcheck.mjs audit the joust rule,
// the egg chain, the terrain and the wave ledger offline — and lets the
// attract demo be the autopilot's own proven run.
//
// The two load-bearing rules of the title:
//   JOUST — on rider contact the LOWER rider loses; dead-even height kills
//   both. There are no enemy projectiles: death is always a joust, a hand
//   or the lava.
//   EGG CHAIN — a defeated rider drops an egg; touch collects it (+100),
//   leave it resting and it hatches into the next-stronger rider.

import { WAVES, LAVA_TOP, GROUND_Y } from './waves.js'

export { WAVES, LAVA_TOP, GROUND_Y }
export const W = 256, H = 224
export const FIXED_DT = 1000 / 60

export const CFG = {
    life: 3,
    gravity: 0.045,
    thrust: 0.112,
    thrustX: 0.85,
    dragX: 0.994,
    maxVX: 2.3,
    maxFall: 2.0,
    maxRise: -2.6,
    upright: 0.018,
    rotFast: 0.052,
    rotSlow: 0.026,
    tiltIdle: 0.87,
    safeTilt: 0.52,
    joustTol: 3,
    foot: 10,
    rx: 11,
    ry: 13,
    deadT: 90,
    invuln: 120,
    banner: 100,
    eggV: 1.8,
    eggHatch: 240,
    handRise: 70,
    handHold: 50,
    handDown: 70,
    crumbleT: 100,
    score: { bounder: 200, hunter: 400, shadow: 800, egg: 100, terrain: 50 },
    perfectBonus: 1000,
    waveBonus: 500,
    oneUpEvery: 10000,
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

export function makeGame(opts = {}) {
    const players = opts.players === 2 ? 2 : 1
    const gs = {
        tick: 0, wave: 0, end: null, phase: 'banner', phaseT: CFG.banner,
        pending: null, events: [], total: 0, nextLife: CFG.oneUpEvery,
        players: [], riders: [], eggs: [], hands: [],
        eggDrops: 0, eggsGot: 0, deaths: 0, killsThisWave: 0,
        players2: players,
    }
    for (let i = 0; i < players; i++) {
        gs.players.push({
            id: i, score: 0, lives: CFG.life, out: false,
            rider: null, respawn: null,
        })
    }
    startWave(gs, 0)
    return gs
}

function startWave(gs, w) {
    const def = WAVES[w]
    gs.wave = w
    gs.segs = def.segs.map((s) => ({ ...s, rideT: 0, gone: false }))
    gs.hands = def.hands.map((h) => ({ ...h, y: LAVA_TOP + 6, out: false }))
    gs.riders = []
    gs.eggs = []
    gs.eggDrops = 0
    gs.eggsGot = 0
    gs.deaths = 0
    gs.killsThisWave = 0
    def.roster.forEach((r) => {
        gs.riders.push(spawn(gs, r.kind, r.x, -14, 0.55, false, r.delay))
    })
    gs.players.forEach((p, i) => {
        const [sx, sy] = def.spawns[i] || def.spawns[0]
        p.respawn = [sx, sy]
        if (!p.out) p.rider = makeRider(gs, sx, sy, true)
    })
    gs.phase = 'banner'
    gs.phaseT = CFG.banner
    gs.events.push({ t: 'wave', wave: w, name: def.name })
}

function makeRider(gs, x, y, isPlayer) {
    return {
        x, y, vx: 0, vy: 0, a: 0, onGround: false,
        state: isPlayer ? 'alive' : 'enter',
        deadT: 0, invuln: isPlayer ? CFG.invuln : 0,
        flapT: 0, kind: null, sitT: 0, delay: 0, entryVY: 0,
    }
}

function spawn(gs, kind, x, y, vy, hunting, delay) {
    const r = makeRider(gs, x, y, false)
    r.kind = kind
    r.entryVY = vy
    r.state = delay > 0 ? 'wait' : 'enter'
    r.delay = delay || 0
    if (hunting) r.state = 'hunt'
    return r
}

export function groundTopAt(gs, x) {
    const xi = clamp(x, 0, W - 1)
    let best = null
    for (const s of gs.segs) {
        if (s.gone) continue
        if (xi >= s.x0 && xi < s.x1) {
            if (best === null || s.y < best.y) best = s
        }
    }
    return best
}

const inPit = (gs, x) => groundTopAt(gs, x) === null

export function handYAt(h) {
    return h.y
}

// one hand cycle: rise / hold / sink / rest
function advanceHand(gs, h) {
    const p = (gs.tick + h.phase) % h.period
    if (p < CFG.handRise) {
        h.out = true
        const u = p / CFG.handRise
        h.y = LAVA_TOP + 6 - (LAVA_TOP + 6 - h.outY) * u
    } else if (p < CFG.handRise + CFG.handHold) {
        h.out = true
        h.y = h.outY
    } else if (p < CFG.handRise + CFG.handHold + CFG.handDown) {
        h.out = true
        const u = (p - CFG.handRise - CFG.handHold) / CFG.handDown
        h.y = h.outY + (LAVA_TOP + 6 - h.outY) * u
    } else {
        h.out = false
        h.y = LAVA_TOP + 6
    }
}

// ------------------------------------------------------ the behavior rules ----
// Pure function of the world snapshot: the harness interrogates the exact
// moment of a decision, and the attract demo trusts it tick for tick.
export function decide(gs, e) {
    if (e.kind === 'bounder') {
        if (e.sitT > 0) return { mode: 'sit' }
        const p = targetOf(gs)
        if (!p) return { mode: 'drift', ax: 0 }
        const dx = wrapDelta(p.x - e.x)
        return { mode: 'fly', ax: clamp(dx * 0.0022, -0.012, 0.012), ay: 0.016, maxVX: 0.9, maxVY: 1.1 }
    }
    if (e.kind === 'hunter') {
        const p = targetOf(gs)
        if (!p) return { mode: 'hover' }
        const ax = clamp(wrapDelta(p.x - e.x) * 0.003, -0.03, 0.03)
        const ay = clamp((p.y - e.y) * 0.003, -0.03, 0.03)
        return { mode: 'seek', ax, ay, maxV: 1.7 }
    }
    if (e.kind === 'shadow') {
        const p = targetOf(gs)
        if (!p) return { mode: 'hover' }
        const tx = p.x + p.vx * 12
        const ty = p.y + p.vy * 12
        const ax = clamp(wrapDelta(tx - e.x) * 0.005, -0.05, 0.05)
        const ay = clamp((ty - e.y) * 0.005, -0.05, 0.05)
        return { mode: 'seek', ax, ay, maxV: 2.7 }
    }
    return { mode: 'hover' }
}

export function wrapDelta(d) {
    if (d > W / 2) d -= W
    if (d < -W / 2) d += W
    return d
}

function targetOf(gs) {
    for (const p of gs.players) {
        if (p.rider && p.rider.state === 'alive') return p.rider
    }
    return null
}

export const nextEggKind = (kind) => (kind === 'bounder' ? 'hunter' : kind === 'hunter' ? 'shadow' : null)

// ---------------------------------------------------------------- the tick ----
export function step(gs, input = {}) {
    gs.tick++

    for (const h of gs.hands) advanceHand(gs, h)

    if (gs.pending) {
        if (--gs.pending.t > 0) return harvest(gs)
        const { reason } = gs.pending
        gs.pending = null
        if (reason === 'dead') { gs.end = 'dead'; gs.events.push({ t: 'over' }); return harvest(gs) }
        if (reason === 'win') { gs.end = 'win'; gs.events.push({ t: 'win' }); return harvest(gs) }
        if (reason === 'wave') {
            if (gs.wave + 1 >= WAVES.length) { gs.pending = { reason: 'win', t: 1 }; return harvest(gs) }
            startWave(gs, gs.wave + 1)
            return harvest(gs)
        }
        return harvest(gs)
    }

    if (gs.phase === 'banner') {
        if (--gs.phaseT > 0) return harvest(gs)
        gs.phase = 'play'
        gs.events.push({ t: 'go' })
    }

    // ---- players ----
    const PIN = [
        { l: input.l, r: input.r, f: input.f },
        { l: input.l2, r: input.r2, f: input.f2 },
    ]
    for (const p of gs.players) {
        const rd = p.rider
        if (!rd) continue
        if (rd.state === 'dead') {
            if (--rd.deadT <= 0) {
                if (p.lives <= 0) { p.out = true; p.rider = null; checkAllOut(gs) }
                else {
                    const [sx, sy] = p.respawn
                    p.rider = makeRider(gs, sx, sy, true)
                }
            }
            continue
        }
        flyPlayer(gs, p, rd, PIN[p.id])
    }

    // ---- enemy riders ----
    for (const e of gs.riders) {
        if (e.state === 'dead') continue
        if (e.state === 'wait') { if (--e.delay <= 0) e.state = 'enter'; continue }
        if (e.state === 'enter') {
            e.y += e.entryVY
            if (e.y >= 40) e.state = 'hunt'
            e.x = wrapX(e.x)
            continue
        }
        const d = decide(gs, e)
        if (d.mode === 'sit') {
            e.vx = 0
            if (--e.sitT <= 0) {
                const p = targetOf(gs)
                e.vy = -1.5
                e.vx = p ? clamp(wrapDelta(p.x - e.x) * 0.05, -0.7, 0.7) : 0
                e.onGround = false
            }
        } else if (d.mode === 'fly') {
            e.vx = clamp((e.vx + d.ax) * CFG.dragX, -d.maxVX, d.maxVX)
            e.vy = clamp(e.vy + d.ay, CFG.maxRise, d.maxVY)
        } else if (d.mode === 'seek') {
            e.vx = clamp((e.vx + d.ax) * CFG.dragX, -d.maxV, d.maxV)
            e.vy = clamp((e.vy + d.ay) * CFG.dragX, -d.maxV, d.maxV)
            // never dive into the floor when the player stands on it
            const g = groundTopAt(gs, e.x)
            if (g && e.vy > 0 && e.y + CFG.ry > g.y - 4) e.vy = Math.min(e.vy, 0.1)
        }
        e.x = wrapX(e.x + e.vx)
        e.y += e.vy

        if (e.kind === 'bounder' && !e.onGround && e.vy >= 0) {
            const g = groundTopAt(gs, e.x)
            if (g && e.y + CFG.ry >= g.y && e.y + CFG.ry - e.vy < g.y + 1) {
                e.y = g.y - CFG.ry
                e.vy = 0
                e.onGround = true
                e.sitT = 40
                if (g.crumble) { /* bounders trust the crumble too — see README ledger */ }
            }
        } else if (e.onGround) {
            const g = groundTopAt(gs, e.x)
            if (!g || e.y + CFG.ry < g.y - 1) e.onGround = false
        }

        // lava and vanished ledges claim enemy riders too
        if ((inPit(gs, e.x) && e.y + CFG.foot >= LAVA_TOP) || e.y > H + 16) {
            killRider(gs, e, 'terrain')
        }
    }

    // ---- eggs ----
    for (const egg of gs.eggs) {
        egg.fall = Math.min(egg.fall + 0.05, CFG.eggV)
        egg.y += egg.fall
        egg.x = wrapX(egg.x)
        if (egg.fall >= CFG.eggV - 1e-9) {
            const g = groundTopAt(gs, egg.x)
            if (g && egg.y + 6 >= g.y) {
                egg.y = g.y - 6
                egg.fall = 0
                egg.rest = true
            }
        }
        if (egg.rest) {
            egg.timer--
            if (egg.timer <= 0) {
                egg.got = true
                const nk = nextEggKind(egg.kind)
                if (nk) {
                    const r = spawn(gs, nk, egg.x, egg.y - 18, 0.55, true, 0)
                    gs.riders.push(r)
                    gs.events.push({ t: 'hatch', kind: nk, x: egg.x, y: egg.y - 18 })
                }
            }
        }
        if (egg.y > H + 12) egg.got = true
        if (!egg.got) {
            for (const pl of gs.players) {
                const p = pl.rider
                if (!p || p.state !== 'alive') continue
                if (Math.abs(wrapDelta(p.x - egg.x)) < 12 && Math.abs(p.y - egg.y) < 14) {
                    egg.got = true
                    gs.eggsGot++
                    pl.score += CFG.score.egg
                    bumpLife(gs, pl)
                    gs.events.push({ t: 'eggget', x: egg.x, y: egg.y, by: pl.id })
                    break
                }
            }
        }
    }
    gs.eggs = gs.eggs.filter((e) => !e.got)

    // ---- joust rule: rider vs rider, the LOWER one loses ----
    for (const p of gs.players) {
        const rd = p.rider
        if (!rd || rd.state !== 'alive') continue
        for (const e of gs.riders) {
            if (e.state === 'dead' || e.state === 'wait' || e.state === 'enter') continue
            if (Math.abs(wrapDelta(rd.x - e.x)) > CFG.rx + CFG.rx) continue
            if (Math.abs(rd.y - e.y) > CFG.ry + CFG.ry) continue
            const diff = rd.y - e.y
            if (rd.invuln > 0) continue
            if (diff < -CFG.joustTol) {
                killRider(gs, e, 'joust', p)
                rd.vy = Math.min(rd.vy, -0.9)
                rd.onGround = false
                gs.events.push({ t: 'joustwin', x: e.x, y: e.y, kind: e.kind, by: p.id })
            } else if (diff > CFG.joustTol) {
                hurtPlayer(gs, p, e.kind)
            } else {
                killRider(gs, e, 'mutual', p)
                hurtPlayer(gs, p, 'mutual')
            }
        }
    }

    // ---- hands and lava claim the players ----
    for (const p of gs.players) {
        const rd = p.rider
        if (!rd || rd.state !== 'alive' || rd.invuln > 0) continue
        for (const h of gs.hands) {
            if (h.out && Math.abs(wrapDelta(rd.x - h.x)) < 9 && rd.y > h.y) { hurtPlayer(gs, p, 'hand'); break }
        }
        if (rd.state === 'alive' && rd.y + CFG.foot >= LAVA_TOP && inPit(gs, rd.x)) hurtPlayer(gs, p, 'lava')
    }

    // ---- wave end ----
    if (!gs.pending && gs.phase === 'play') {
        const foes = gs.riders.some((e) => e.state !== 'dead')
        const pendingEgg = gs.eggs.some((e) => e.rest)
        if (!foes && !pendingEgg) {
            let bonus = CFG.waveBonus * (gs.wave + 1)
            const perfect = gs.eggsGot === gs.eggDrops && gs.deaths === 0 && gs.eggDrops > 0
            if (perfect) bonus += CFG.perfectBonus
            const lead = gs.players.reduce((a, b) => (b.score > a.score ? b : a), gs.players[0])
            lead.score += bonus
            gs.events.push({ t: 'clear', wave: gs.wave, bonus, perfect })
            gs.pending = { reason: 'wave', t: 80 }
        }
    }

    recalcTotal(gs)
    return harvest(gs)
}

function flyPlayer(gs, p, rd, inp = {}) {
    if (rd.invuln > 0) rd.invuln--
    const flap = !!inp.f
    const rate = flap ? CFG.rotFast : CFG.rotSlow
    if (inp.l) rd.a -= rate
    else if (inp.r) rd.a += rate
    else if (Math.abs(rd.a) <= CFG.upright) rd.a = 0
    else rd.a -= Math.sign(rd.a) * CFG.upright
    if (!flap) rd.a = clamp(rd.a, -CFG.tiltIdle, CFG.tiltIdle)
    if (rd.a > Math.PI) rd.a -= Math.PI * 2
    if (rd.a < -Math.PI) rd.a += Math.PI * 2

    if (flap && rd.onGround) {
        rd.onGround = false
        rd.vy = -0.6
    }
    let ax = 0
    let ay = CFG.gravity
    if (flap) {
        ax += Math.sin(rd.a) * CFG.thrust * CFG.thrustX
        ay -= Math.cos(rd.a) * CFG.thrust
        rd.flapT++
    } else {
        // a leaning mount still slides down its tilt: gliding keeps some
        // lateral authority without the flap (otherwise steering during a
        // dive is imaginary, which is how the autopilot missed eggs)
        ax += Math.sin(rd.a) * CFG.gravity * 0.75
        rd.flapT = 0
    }
    rd.vx = clamp((rd.vx + ax) * CFG.dragX, -CFG.maxVX, CFG.maxVX)
    rd.vy = clamp(rd.vy + ay, CFG.maxRise, CFG.maxFall)
    rd.x = wrapX(rd.x + rd.vx)
    rd.y += rd.vy

    // ceiling
    if (rd.y < 12) { rd.y = 12; rd.vy = Math.max(rd.vy, 0) }

    // terrain: the foot may cross a surface at most maxFall px per tick, so
    // any solid top within 24 px ABOVE the feet that the rider's body is
    // not buried under is catchable — this also rescues the pit-edge crossing
    // where the previous-frame gate used to tunnel riders through the lip.
    if (rd.vy >= 0) {
        const feet = rd.y + CFG.foot
        let land = null
        for (const s of gs.segs) {
            if (s.gone) continue
            const xi = clamp(rd.x, 0, W - 1)
            if (xi < s.x0 || xi >= s.x1) continue
            if (feet < s.y || feet - s.y > 24) continue
            if (rd.y > s.y + CFG.ry) continue
            if (land === null || s.y < land.y) land = s
        }
        if (land) {
            if (Math.abs(rd.a) > CFG.safeTilt) {
                hurtPlayer(gs, p, 'crash')
            } else {
                rd.y = land.y - CFG.foot
                rd.vy = 0
                rd.onGround = true
                rd.a = 0
                if (land.crumble) {
                    land.rideT++
                    if (land.rideT >= CFG.crumbleT) {
                        land.gone = true
                        rd.onGround = false
                        gs.events.push({ t: 'crumble', x: (land.x0 + land.x1) / 2, y: land.y, seg: gs.segs.indexOf(land) })
                    }
                }
            }
        } else if (rd.onGround) {
            rd.onGround = false
        }
    }
    if (rd.y + CFG.foot >= LAVA_TOP && inPit(gs, rd.x)) hurtPlayer(gs, p, 'lava')
}

function killRider(gs, e, cause, owner) {
    if (e.state === 'dead') return
    e.state = 'dead'
    const pts = cause === 'terrain' ? CFG.score.terrain : CFG.score[e.kind] || 0
    const cred = cause === 'terrain'
        ? gs.players.find((pl) => pl.rider === targetOf(gs))
        : owner
    if (cred) {
        cred.score += pts
        bumpLife(gs, cred)
    }
    gs.killsThisWave++
    gs.events.push({ t: 'kill', kind: e.kind, x: e.x, y: e.y, cause, pts })
    const nk = nextEggKind(e.kind)
    if (nk && cause !== 'terrain') {
        gs.eggDrops++
        gs.eggs.push({ kind: e.kind, x: e.x, y: e.y + 6, fall: 0.6, rest: false, timer: CFG.eggHatch, got: false })
        gs.events.push({ t: 'eggdrop', x: e.x, y: e.y + 6, kind: e.kind })
    }
}

function hurtPlayer(gs, p, cause) {
    const rd = p.rider
    if (!rd || rd.state !== 'alive') return
    rd.state = 'dead'
    rd.deadT = CFG.deadT
    p.lives--
    gs.deaths++
    gs.events.push({ t: 'death', cause, x: rd.x, y: rd.y, by: p.id })
    if (p.lives <= 0) checkAllOut(gs)
}

function checkAllOut(gs) {
    if (gs.pending) return
    if (gs.players.every((p) => p.out)) gs.pending = { reason: 'dead', t: 60 }
}

function bumpLife(gs, p) {
    while (gs.total >= gs.nextLife) {
        gs.nextLife += CFG.oneUpEvery
        p.lives = Math.min(5, p.lives + 1)
        gs.events.push({ t: '1up', by: p.id })
    }
}

function recalcTotal(gs) {
    gs.total = gs.players.reduce((a, p) => a + p.score, 0)
}

const wrapX = (x) => {
    if (x < 0) return x + W
    if (x >= W) return x - W
    return x
}

const harvest = (gs) => { if (gs.events.length > 300) gs.events.splice(0, gs.events.length - 300); return gs }

const RSTATE = { wait: 0, enter: 1, hunt: 2, dead: 3 }

export function stateHash(gs) {
    const nums = [gs.tick, gs.wave, gs.total, gs.phase === 'play' ? 1 : 0, gs.end ? 1 : 0, gs.pending ? gs.pending.t : 0, gs.eggs.length]
    for (const p of gs.players) nums.push(p.score, p.lives, p.out ? 1 : 0, p.rider ? Math.round(p.rider.x * 8) : -1, p.rider ? Math.round(p.rider.y * 8) : -1, RSTATE[p.rider ? p.rider.state : 'dead'] || 0, p.rider ? Math.round(p.rider.a * 100) : 0, p.rider ? p.rider.invuln : 0)
    for (const e of gs.riders) nums.push(RSTATE[e.state], Math.round(e.x * 8), Math.round(e.y * 8))
    for (const egg of gs.eggs) nums.push(Math.round(egg.x * 8), Math.round(egg.y * 8), egg.rest ? egg.timer : -1)
    for (const h of gs.hands) nums.push(Math.round(h.y * 8), h.out ? 1 : 0)
    for (const s of gs.segs) nums.push(s.gone ? 1 : 0, s.rideT)
    let h = 2166136261
    for (const n of nums) {
        const v = Math.round(n * 1000)
        h ^= v
        h = Math.imul(h, 16777619)
    }
    return h >>> 0
}
