// THE SIM — Galaga in pure, deterministic ticks. No Math.random, no Date,
// no DOM: the same tick sequence in and out of a browser, which is what
// lets galactcheck audit the BEHAVIOUR (every path every tick) and lets
// the attract demo be the autopilot's own proven run.
//
// The behavior tree `decide(gs, e)` is the title's second muscle: a strict
// rule ladder, first match wins, every leaf naming a path from ./paths.js
// (an unknown name THROWS there, never falls through). Rule order is
// pinned by the harness: captives dive before anyone else; the tractor
// beam fires once per stage, never while a captive is already aboard.

import { resolvePath } from './paths.js'
import { W, H, MAX_STEP } from './paths.js'
import { buildStage, rowY, colX, WAVES } from './waves.js'

export { W, H }

export const CFG = {
    life: 3,
    banner: 70,
    pSpeed: 2.3,
    pTop: 204,
    pBottom: 274,
    pStartX: 112,
    pStartY: 268,
    bulletV: 4.6,
    enemyBulletV: 1.65,
    fireCool: 6,
    maxShots: 2,
    doubleShots: 4,
    invuln: 100,
    deadT: 90,
    swayAmp: 6,
    swayPeriod: 150,
    diveBase: 120,
    divePerKill: 2,
    divePerWave: 8,
    diveMin: 42,
    escortPeriod: 64,
    beamPeriod: 700,
    beamOff: false,
    rescueDouble: true,
    maxCaptive: 6,
    r: { bee: 7, boss: 9, flag: 10, captive: 7, player: 5 },
    hp: { bee: 1, boss: 2, flag: 4, captive: 1 },
    score: { bee: 50, boss: 150, flag: 400, captive: 100, rescue: 2000 },
    scoreDive: { bee: 100, boss: 300, flag: 800, captive: 200 },
}

const sway = (gs) => Math.sin(gs.pt / CFG.swayPeriod * Math.PI * 2) * CFG.swayAmp
const alive = (e) => e.state !== 'dead'

export function makeGame(wave = 0) {
    const gs = {
        tick: 0, pt: 0, wave, score: 0, lives: CFG.life,
        double: false, end: null, phase: 'banner', phaseT: CFG.banner,
        pending: null, events: [], shots: [], enemyShots: [], fallers: [],
        enemies: [], beamOwner: null, beamUsed: false, cap: null, escorts: [], kills: 0,
        nextDiveAt: 24, nextCol: 0,
        player: { x: CFG.pStartX, y: CFG.pStartY, state: 'alive', deadT: 0, cool: 0, invuln: 60, carryX: 0 },
    }
    startStage(gs, wave)
    return gs
}

function startStage(gs, w) {
    const stage = buildStage(w, gs.escorts)
    gs.enemies = stage.map((e) => {
        const p = resolvePath(e.entry, { x: colX(e.col), y: e.y, px: CFG.pStartX, py: CFG.pStartY, dir: 1 })
        return {
            ...e,
            hp: CFG.hp[e.kind],
            state: 'wait',
            x: p.fn(0)[0], y: p.fn(0)[1],
            path: p, uT: 0, base: null, fired: false, bandX: 0,
        }
    })
    gs.phase = 'banner'
    gs.phaseT = CFG.banner
    gs.pt = 0
    gs.timeLeft = WAVES[w].time
    gs.beamOwner = null
    gs.beamUsed = false
    gs.nextDiveAt = 24
    gs.nextCol = 0
    gs.enemyShots = []
    gs.fallers = []
    gs.shots = []
}

// ---------------------------------------------------------- the behavior tree ----
// One ladder, first rule that fires wins. decide() may ONLY look at gs —
// it is a pure function of the world snapshot, so the harness can lift it
// out of the running game and interrogate the exact moment of a decision.
export function decide(gs, e) {
    if (e.state !== 'hold' || gs.phase !== 'play' || gs.cap) return null
    const t = gs.pt

    // RULE 1 — the captive dives first. A captured fighter wants the
    // player dead worse than the hive does (and dives first so the
    // rescue window actually opens).
    if (e.kind === 'captive') {
        if (t % CFG.escortPeriod === (e.col * 9) % CFG.escortPeriod) {
            return { type: 'dive', path: 'zig', dir: e.col % 2 ? -1 : 1 }
        }
        return null
    }

    // RULE 2 — the Flagship's tractor beam: once per stage, never with a
    // captive already aboard, never while another beam owns the sky.
    if (e.kind === 'flag') {
        if (!CFG.beamOff && !gs.beamUsed && !gs.beamOwner && !hasCaptive(gs) && t >= CFG.beamPeriod && t % 30 === 0) {
            return { type: 'beam' }
        }
        // RULE 2b — with the stage collapsing, a Flagship goes down swinging.
        if (foesLeft(gs) <= 3) return { type: 'dive', path: 'swoop', dir: e.col % 2 ? -1 : 1 }
        return null
    }

    // RULE 3 — the dive roster: ONE committed diver at a time (the tree
    // hands out turns via gs.nextDiveAt — per-enemy modulo was a swarm
    // flood no pilot could read), and never while a captive leads the
    // formation (that is the rescue window Rule 1 opens).
    if (e.kind === 'flag' || e.kind === 'captive') return null
    if (hasCaptive(gs)) return null
    if (t >= gs.nextDiveAt) {
        // the hive commits AT MOST two fighters at a time (classic pairs):
        // three divers plus their bullets is a pincer with no readable
        // answer, and a pincer with no answer is not a game
        if (gs.enemies.filter((en) => en.state === 'dive').length >= 2) return null
        const cands = gs.enemies.filter((en) => en.state === 'hold' && en.kind !== 'flag' && en.kind !== 'captive')
        const rot = cands.filter((en) => en.col >= gs.nextCol)
        const pick = (rot.length ? rot : cands)[0]
        if (pick && pick.id === e.id) {
            const path = e.kind === 'boss' ? 'loop' : (e.col % 2 ? 'zig' : 'swoop')
            return { type: 'dive', path, dir: colX(e.col) < W / 2 ? 1 : -1 }
        }
    }
    return null
}

export const hasCaptive = (gs) => gs.enemies.some((e) => e.kind === 'captive' && alive(e))
export const foesLeft = (gs) => gs.enemies.filter((e) => alive(e) && e.kind !== 'flag').length

function commit(gs, e, act) {
    const sx = colX(e.col) + sway(gs)
    const ctx = { x: sx, y: e.y, px: gs.player.x, py: gs.player.y, dir: act.dir || 1, slot: { x: sx, y: e.y } }
    if (act.type === 'beam') {
        e.state = 'beam'
        e.path = resolvePath('beam', ctx)
        gs.beamOwner = e.id
        gs.beamUsed = true
        gs.events.push({ type: 'beam', id: e.id })
    } else {
        e.state = 'dive'
        e.path = resolvePath(act.path, ctx)
        e.fired = false
        gs.nextDiveAt = gs.pt + periodFor(gs)
        gs.nextCol = e.col + 1
        gs.events.push({ type: 'dive', id: e.id, kind: e.kind, path: act.path })
    }
    e.uT = 0
    e.base = { x: sx, y: e.y }
}

const periodFor = (gs) => Math.max(CFG.diveMin, CFG.diveBase - gs.kills * CFG.divePerKill - gs.wave * CFG.divePerWave)

function killEnemy(gs, e) {
    const diving = e.state === 'dive' || e.state === 'beam'
    e.state = 'dead'
    gs.kills++
    const pts = (e.kind === 'captive' ? CFG.score.captive * (e.aboard ? 2 : 1) : CFG.score[e.kind]) +
        (diving ? CFG.scoreDive[e.kind] || 0 : 0)
    gs.score += pts
    gs.events.push({ type: 'kill', id: e.id, kind: e.kind, x: e.x, y: e.y, pts })
    if (gs.beamOwner === e.id) gs.beamOwner = null
    if (e.kind === 'captive' && e.aboard) {
        gs.fallers.push({ x: e.x, y: e.y, vy: 1.3 })
        gs.events.push({ type: 'fighterloose', x: e.x, y: e.y })
    }
}

function hurtPlayer(gs, cause) {
    const p = gs.player
    if (p.state !== 'alive' || p.invuln > 0) return
    p.state = 'dead'
    p.deadT = CFG.deadT
    gs.lives--
    gs.double = false
    gs.enemyShots = []
    gs.events.push({ type: 'death', cause, x: p.x, y: p.y })
}

function endStage(gs, reason) {
    gs.pending = { reason, t: 50 }
    gs.phase = 'banner'
}

// ------------------------------------------------------------------ the tick ----
export function step(gs, input = {}) {
    gs.tick++

    if (gs.pending) {
        if (--gs.pending.t > 0) return harvest(gs)
        const { reason } = gs.pending
        gs.pending = null
        if (reason === 'dead' || gs.lives <= 0) { gs.end = 'dead'; return harvest(gs) }
        if (reason === 'clear') {
            if (gs.wave + 1 >= 3) { gs.end = 'win'; gs.events.push({ type: 'win' }); return harvest(gs) }
            gs.wave++
            startStage(gs, gs.wave)
            gs.events.push({ type: 'stage', wave: gs.wave })
            return harvest(gs)
        }
        if (reason === 'capture') {
            if (gs.escorts.length < CFG.maxCaptive) {
                gs.escorts.push({ aboard: true })
                gs.events.push({ type: 'takerest', n: gs.escorts.length })
            }
            startStage(gs, gs.wave)
            const p = gs.player
            p.state = 'alive'; p.x = CFG.pStartX; p.y = CFG.pStartY; p.invuln = CFG.invuln
            return harvest(gs)
        }
        return harvest(gs)
    }

    if (gs.phase === 'banner') {
        if (--gs.phaseT > 0) return harvest(gs)
        gs.phase = 'play'
        gs.events.push({ type: 'go' })
    }
    gs.pt++
    gs.timeLeft--

    // ---- player ----
    const p = gs.player
    if (p.invuln > 0) p.invuln--
    if (p.cool > 0) p.cool--
    if (p.state === 'alive') {
        const s = CFG.pSpeed
        if (input.l) p.x -= s
        if (input.r) p.x += s
        if (input.u) p.y -= s
        if (input.d) p.y += s
        p.x = Math.max(10, Math.min(W - 10, p.x))
        p.y = Math.max(CFG.pTop, Math.min(CFG.pBottom, p.y))
        const max = gs.double ? CFG.doubleShots : CFG.maxShots
        if (input.f && p.cool <= 0 && gs.shots.length < max) {
            gs.shots.push({ x: p.x, y: p.y - 10 })
            if (gs.double) gs.shots.push({ x: p.x, y: p.y - 4 })
            p.cool = CFG.fireCool
            gs.events.push({ type: 'fire', x: p.x, y: p.y })
        }
    } else if (p.state === 'dead') {
        if (--p.deadT <= 0) {
            if (gs.lives <= 0) { endStage(gs, 'dead'); return harvest(gs) }
            p.state = 'alive'; p.x = CFG.pStartX; p.y = CFG.pStartY; p.invuln = CFG.invuln
        }
    } else if (p.state === 'carried') {
        p.y -= 2.4
    }

    // ---- enemies: every state of every enemy, every tick ----
    for (const e of gs.enemies) {
        if (!alive(e)) continue
        const d = decide(gs, e)
        if (d) commit(gs, e, d)

        if (e.state === 'wait') {
            if (gs.pt >= e.startTick) e.state = 'entry'
            continue
        }
        if (e.state === 'entry') {
            e.uT++
            const u = e.uT / e.path.ticks
            if (u >= 1) { e.state = 'hold'; e.x = colX(e.col) + sway(gs); e.y = e.y0 || rowY(e.row) }
            else { const q = e.path.fn(u); e.x = q[0]; e.y = q[1] }
            continue
        }
        if (e.state === 'hold') { e.x = colX(e.col) + sway(gs); e.y = rowY(e.row); continue }
        if (e.state === 'return') {
            e.uT++
            const u = e.uT / e.path.ticks
            if (u >= 1) { e.state = 'hold'; e.x = colX(e.col) + sway(gs); e.y = rowY(e.row) }
            else { const q = e.path.fn(u); e.x = q[0]; e.y = q[1] }
            continue
        }

        // dive / beam / carry: advance the scripted path
        e.uT++
        const u = e.uT / e.path.ticks
        const inBand = e.path.band && u >= e.path.band[0] && u <= e.path.band[1]
        if (e.state === 'beam' && inBand) {
            const q = e.path.fn(u)
            e.bandX = q[0]
            // the band is a trapezoid: narrow at the hull, wide at the skirt
            const depth = (p.y - q[1] - 8) / 46
            const half = 6 + 11 * Math.max(0, Math.min(1, depth))
            if (p.state === 'alive' && p.y >= q[1] + 8 && p.y <= q[1] + 54 && Math.abs(p.x - q[0]) < half) {
                p.state = 'carried'; p.carryX = q[0]
                gs.lives--
                gs.cap = { id: e.id, t: 0 }
                gs.events.push({ type: 'captured', x: p.x, y: p.y })
            }
        }
        if (p.state === 'carried') { if (p.carryX) p.x = p.carryX; p.y -= 2.4 }
        if (u >= 1) {
            if (e.path.end === 'anchor') {
                e.state = 'hold'
            } else if (e.state === 'carry') {
                if (gs.cap) {
                    gs.cap = null
                    endStage(gs, gs.lives > 0 ? 'capture' : 'dead')
                }
                e.state = 'dead'
            } else {
                e.state = 'return'
                e.path = resolvePath('rejoin', { x: e.x, y: e.y, slot: { x: colX(e.col), y: rowY(e.row) }, dir: 1 })
                e.uT = 0
            }
            continue
        }
        const q = e.path.fn(u)
        e.x = q[0]; e.y = q[1]
        if (e.state === 'beam' && inBand && p.state === 'carried') { e.bandX = q[0]; p.carryX = q[0] }
        // divers lead the player — but never at point-blank range: the
        // bullet is dodgeable or it is not a game
        if ((e.state === 'dive' || (e.state === 'beam' && !inBand)) && !e.fired && u > 0.42 && u < 0.62 && e.y < p.y - 44 && e.kind !== 'flag') {
            e.fired = true
            // diver fire drops NEARLY straight — it threatens a lane, it
            // does not hunt. A tracking bullet plus a diving shooter is a
            // pincer no dodge window survives.
            const vx = Math.max(-0.55, Math.min(0.55, (p.x - e.x) * 0.01))
            const vy = Math.sqrt(Math.max(0.25, CFG.enemyBulletV * CFG.enemyBulletV - vx * vx))
            gs.enemyShots.push({ x: e.x, y: e.y + 6, vx, vy })
        }
        if (e.state === 'beam' && gs.cap && gs.cap.id === e.id && u > 0.82) {
            e.state = 'carry'
            e.path = resolvePath('carry', { x: e.x, y: e.y, dir: 1 })
            e.uT = 0
        }
    }

    // ---- fighter falling after its escort died ----
    for (const f of gs.fallers) {
        f.y += f.vy
        if (p.state === 'alive' && Math.hypot(p.x - f.x, p.y - f.y) < CFG.r.player + 7) {
            f.got = true
            gs.score += CFG.score.rescue
            gs.lives = Math.min(5, gs.lives + 1)
            if (CFG.rescueDouble) gs.double = true
            gs.events.push({ type: 'rescued', x: f.x, y: f.y })
        }
    }
    gs.fallers = gs.fallers.filter((f) => !f.got && f.y < H + 12)

    // ---- bullets ----
    for (const b of gs.shots) b.y -= CFG.bulletV
    gs.shots = gs.shots.filter((b) => b.y > -12)
    for (const b of gs.enemyShots) { b.x += b.vx; b.y += b.vy }
    gs.enemyShots = gs.enemyShots.filter((b) => b.y < H + 12 && b.y > -12 && b.x > -12 && b.x < W + 12)

    for (const b of gs.shots) {
        for (const f of gs.fallers) {
            if (Math.hypot(b.x - f.x, b.y - f.y) < 8) {
                b.hit = true; f.got = true
                gs.events.push({ type: 'lostfighter', x: f.x, y: f.y })
            }
        }
        for (const e of gs.enemies) {
            if (!alive(e) || e.state === 'wait') continue
            if (Math.hypot(b.x - e.x, b.y - e.y) < CFG.r[e.kind] + 2) {
                b.hit = true
                e.hp--
                if (e.hp <= 0) killEnemy(gs, e)
                else gs.events.push({ type: 'hit', id: e.id, x: b.x, y: b.y })
                break
            }
        }
    }
    gs.shots = gs.shots.filter((b) => !b.hit)

    // ---- player: enemy bodies and shots ----
    if (p.state === 'alive' && p.invuln <= 0) {
        for (const b of gs.enemyShots) {
            if (Math.hypot(p.x - b.x, p.y - b.y) < CFG.r.player + 2) { b.hit = true; hurtPlayer(gs, 'shot'); break }
        }
        gs.enemyShots = gs.enemyShots.filter((b) => !b.hit)
        if (p.state === 'alive') {
            for (const e of gs.enemies) {
                if (!alive(e) || e.state === 'wait' || e.state === 'hold' || e.state === 'carry') continue
                if (Math.hypot(p.x - e.x, p.y - e.y) < CFG.r.player + CFG.r[e.kind]) { hurtPlayer(gs, e.kind); break }
            }
        }
    }
    // ---- stage clear ----
    if (!gs.pending && gs.phase === 'play' && !gs.enemies.some(alive) && !gs.cap) {
        gs.events.push({ type: 'clear', wave: gs.wave })
        endStage(gs, 'clear')
    }
    if (!gs.pending && gs.timeLeft <= 0 && gs.phase === 'play' && !gs.cap) {
        // the stage clock ends the STAGE, not the player (classic Galaga):
        // the survivors self-destruct, 25 each, and the next wave begins
        for (const e of gs.enemies) {
            if (alive(e)) {
                e.state = 'dead'
                gs.kills++
                gs.score += 25
                gs.events.push({ type: 'kill', id: e.id, kind: e.kind, x: e.x, y: e.y, pts: 25, timeout: true })
            }
        }
        gs.events.push({ type: 'timeout' })
        endStage(gs, 'clear')
    }
    return harvest(gs)
}

const harvest = (gs) => { if (gs.events.length > 300) gs.events.splice(0, gs.events.length - 300); return gs }

const STATE_IDX = { wait: 0, entry: 1, hold: 2, dive: 3, beam: 4, return: 5, carry: 6, dead: 7 }
const PSTATE = { alive: 0, dead: 1, carried: 2 }

export function stateHash(gs) {
    const nums = [gs.tick, gs.pt, gs.wave, gs.score, gs.lives, gs.double ? 1 : 0, gs.phase === 'play' ? 1 : 0, gs.player.x, gs.player.y, PSTATE[gs.player.state]]
    for (const e of gs.enemies) nums.push(STATE_IDX[e.state], Math.round(e.x * 8), Math.round(e.y * 8), e.hp)
    for (const b of gs.shots) nums.push(Math.round(b.x * 8), Math.round(b.y * 8))
    for (const b of gs.enemyShots) nums.push(Math.round(b.x * 8), Math.round(b.y * 8))
    let h = 2166136261
    for (const n of nums) {
        const v = typeof n === 'string' ? n.length : Math.round(n * 1000)
        h ^= v
        h = Math.imul(h, 16777619)
    }
    return h >>> 0
}
