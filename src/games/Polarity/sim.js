// THE SIM — POLARITY in pure, deterministic ticks. No Math.random, no
// Date, no DOM: the same tick sequence in and out of a browser, which is
// what lets polarcheck freeze any live tick, replay the ENGINE'S OWN
// step() forward under all six (move x polarity) skeletons, and demand
// that at least one plan survives — the fairness audit is literally the
// simulator itself, never a second physics copy that could drift.
//
// The rule of the game, in one place:
//   every hostile thing is 'L' (light) or 'D' (dark).
//   - an incoming bullet of YOUR color is ABSORBED (+charge, no damage)
//   - an incoming bullet of the OPPOSITE color kills
//   - your shots kill only enemies of the OPPOSITE color
//   - a full charge spent on a flip = FLUX NOVA (clears bullets, kills
//     everything except the core behind its shell)
//   - the core's shell only takes shots opposite to the shell's color and
//     needs BOTH colors' quotas drained — a one-polarity pilot cannot win
// The volley gate volleyOK() is the engine's promise, not a suggestion:
// no opposite-colour volley may spawn within flipGap ticks of the last
// opposite volley, so the player always gets a beat to read and answer.

import { resolvePath, wrapPath } from './paths.js'
import { W, H, MAX_STEP } from './paths.js'
import { WAVES, buildStage, colX, rowY, WEAVER_Y, CORE } from './waves.js'

export { W, H, MAX_STEP }

export const L = 'L'
export const D = 'D'
export const other = (p) => (p === L ? D : L)

export const CFG = {
    life: 3,
    banner: 70,
    pSpeed: 2.3,
    pTop: 196,
    pBottom: 274,
    pStartX: 112,
    pStartY: 264,
    bulletV: 4.4,
    enemyV: 2.4,
    dropV: 2.5,
    wallV: 2.0,
    ringV: 1.7,
    fireCool: 7,
    maxShots: 2,
    invuln: 80,
    deadT: 80,
    flipGap: 26,
    chargeMax: 10,
    warnT: 34,
    stormT: 42,
    stormW: 17,
    coreRing: 210,
    coreFan: 110,
    shellPeriod: 75,
    coreNeed: 5,
    weaverShot: 96,
    swayAmp: 6,
    swayPeriod: 150,
    diveBase: 130,
    divePerKill: 2,
    divePerWave: 8,
    diveMin: 45,
    r: { dart: 7, weaver: 8, core: 15, player: 5 },
    hp: { dart: 1, weaver: 2 },
    score: { dart: 50, weaver: 90, core: 1200, absorb: 5, novaBall: 3 },
    scoreDive: { dart: 100 },
    // load-bearing switches (each has a mutant in polarcheck --mutate)
    flipAbsorb: true,       // same-color bullets are absorbed, not lethal
    shotColorMatters: true, // your shots only kill the opposite color
    novaClear: true,        // the nova sweeps every bullet off the board
}

const sway = (gs) => Math.sin(gs.pt / CFG.swayPeriod * Math.PI * 2) * CFG.swayAmp
const alive = (e) => e.state !== 'dead'
const ev = (gs, e) => { if (!gs.noscan) { e.tick = gs.tick; gs.events.push(e) } }

// the engine's promise: opposite-colour volleys need flipGap ticks of air
export function volleyOK(gs, color) {
    const lv = gs.lastVolley
    return !lv || lv.color === color || gs.tick - lv.tick >= CFG.flipGap
}

function fire(gs, x, y, vx, vy, color, kind) {
    gs.enemyShots.push({ x, y, vx, vy, color })
    gs.lastVolley = { color, tick: gs.tick }
    ev(gs, { type: 'efire', color, x, y, kind })
}

export function makeGame(wave = 0) {
    const gs = {
        tick: 0, pt: 0, wave, score: 0, lives: CFG.life, charge: 0,
        end: null, phase: 'banner', phaseT: CFG.banner, pending: null,
        events: [], shots: [], enemyShots: [], storms: [],
        enemies: [], lastVolley: null, kills: 0,
        nextDiveAt: 30, nextCol: 0, noscan: false,
        player: { x: CFG.pStartX, y: CFG.pStartY, pol: L, state: 'alive', deadT: 0, cool: 0, invuln: 60 },
    }
    startStage(gs, wave)
    return gs
}

function startStage(gs, w) {
    gs.epoch = (gs.epoch || 0) + 1
    const meta = WAVES[w]
    gs.core = meta.shell
        ? {
            id: `${w}-core`, kind: 'core', col: 0, row: 0, color: L,
            seq: `${gs.epoch}:core`, state: 'hold', x: CORE.x, y: CORE.y,
            hp: 1, quota: { L: 0, D: 0 }, shell: D, nextRing: 300, nextFan: 380,
            gap: 0, fired: false,
        }
        : null
    const stage = buildStage(w)
    gs.enemies = stage.map((e) => {
        const p = resolvePath(e.entry, { x: colX(e.col), y: e.y, px: CFG.pStartX, py: CFG.pStartY, dir: 1 })
        return {
            ...e,
            seq: `${gs.epoch}:${e.id}`,
            hp: CFG.hp[e.kind],
            state: 'wait',
            x: p.fn(0)[0], y: p.fn(0)[1],
            path: p, uT: 0, fired: false,
            nextShot: gs.pt + CFG.weaverShot - 24 + (e.col % 4) * 12,
            alt: e.color,
        }
    })
    if (gs.core) gs.enemies.push(gs.core)
    gs.walls = meta.walls.map((wl) => ({ ...wl }))
    gs.stormScript = meta.storms.map((s) => ({ ...s }))
    gs.wallIdx = 0
    gs.stormIdx = 0
    gs.storms = []
    gs.phase = 'banner'
    gs.phaseT = CFG.banner
    gs.pt = 0
    gs.timeLeft = meta.time
    gs.nextDiveAt = 30
    gs.nextCol = 0
    gs.enemyShots = []
    gs.shots = []
    gs.lastVolley = null
}

// ---------------------------------------------------------- the behavior tree ----
// One ladder per kind, first rule that fires wins. decide() may ONLY look
// at gs — a pure function of the world snapshot, so the harness can lift
// it out and interrogate the exact moment of a decision. A shot refused
// by the volley gate is DEFERRED (retried next tick, never cancelled —
// the diver keeps trying until its window closes).
export function decide(gs, e) {
    if (gs.phase !== 'play' || !alive(e)) return null
    if (e.kind === 'weaver') {
        if (e.state !== 'hold' || gs.pt < e.nextShot) return null
        if (!volleyOK(gs, e.alt)) return null
        return { type: 'rail', color: e.alt }
    }
    if (e.kind === 'core') {
        if (gs.pt >= e.nextRing && volleyOK(gs, e.shell)) return { type: 'ring', color: e.shell }
        if (gs.pt >= e.nextFan && volleyOK(gs, other(e.shell))) return { type: 'fan', color: other(e.shell) }
        return null
    }
    if (e.kind === 'dart' && e.state === 'dive') {
        const u = e.uT / e.path.ticks
        if (!e.fired && u > 0.42 && u < 0.62 && volleyOK(gs, e.color)) return { type: 'drop', color: e.color }
        return null
    }
    if (e.kind === 'dart' && e.state === 'hold') {
        if (gs.pt < gs.nextDiveAt) return null
        if (gs.enemies.filter((en) => en.state === 'dive').length >= 2) return null
        const cands = gs.enemies.filter((en) => en.kind === 'dart' && en.state === 'hold')
        const rot = cands.filter((en) => en.col >= gs.nextCol)
        const pick = (rot.length ? rot : cands)[0]
        if (pick && pick.id === e.id) {
            return { type: 'dive', path: e.col % 2 ? 'zig' : 'swoop', dir: colX(e.col) < W / 2 ? 1 : -1 }
        }
    }
    return null
}

function commit(gs, e, act) {
    const sx = e.kind === 'weaver' ? e.x : colX(e.col) + sway(gs)
    if (act.type === 'rail') {
        fire(gs, e.x, e.y + 9, 0, CFG.enemyV, act.color, 'weaver')
        e.nextShot = gs.pt + CFG.weaverShot
        e.alt = other(e.alt)
        return
    }
    if (act.type === 'drop') {
        fire(gs, e.x, e.y + 8, 0, CFG.dropV, act.color, 'dart')
        e.fired = true
        return
    }
    if (act.type === 'ring') {
        // k===2 is straight down: a ray permanently onto the core column would
        // rain on the one lane every wall-gap sprint crosses — the ring keeps
        // every other bearing and the rotating gap, so a reading always exists
        for (let k = 0; k < 8; k++) {
            if (k === e.gap || k === 2) continue
            const a = (k / 8) * Math.PI * 2
            fire(gs, e.x, e.y + 10, Math.cos(a) * CFG.ringV, Math.sin(a) * CFG.ringV, act.color, 'core')
        }
        e.gap = (e.gap + 3) % 8
        e.nextRing = gs.pt + CFG.coreRing
        ev(gs, { type: 'ring', gap: e.gap })
        return
    }
    if (act.type === 'fan') {
        for (const vx of [-0.6, 0, 0.6]) fire(gs, e.x, e.y + 12, vx, 2.0, act.color, 'core')
        e.nextFan = gs.pt + CFG.coreFan
        return
    }
    // dive
    const ctx = { x: sx, y: e.y, px: gs.player.x, py: gs.player.y, dir: act.dir || 1, slot: { x: colX(e.col), y: e.y } }
    e.state = 'dive'
    e.path = resolvePath(act.path, ctx)
    e.uT = 0
    e.fired = false
    gs.nextDiveAt = gs.pt + Math.max(CFG.diveMin, CFG.diveBase - gs.kills * CFG.divePerKill - gs.wave * CFG.divePerWave)
    gs.nextCol = e.col + 1
    ev(gs, { type: 'dive', id: e.id, kind: e.kind, color: e.color, path: act.path })
}

function killEnemy(gs, e, via) {
    const diving = e.state === 'dive'
    e.state = 'dead'
    gs.kills++
    const pts = CFG.score[e.kind] + (diving ? CFG.scoreDive[e.kind] || 0 : 0) + (via === 'nova' ? 20 : 0)
    gs.score += pts
    ev(gs, { type: 'kill', id: e.id, kind: e.kind, color: e.color, x: e.x, y: e.y, pts })
}

function hurtPlayer(gs, cause) {
    const p = gs.player
    if (p.state !== 'alive' || p.invuln > 0) return
    p.state = 'dead'
    p.deadT = CFG.deadT
    gs.lives--
    gs.charge = 0
    ev(gs, { type: 'death', cause, x: p.x, y: p.y })
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
            if (gs.wave + 1 >= WAVES.length) { gs.end = 'win'; ev(gs, { type: 'win' }); return harvest(gs) }
            gs.wave++
            startStage(gs, gs.wave)
            ev(gs, { type: 'stage', wave: gs.wave })
            return harvest(gs)
        }
        if (reason === 'retry') {
            startStage(gs, gs.wave)
            const p = gs.player
            p.state = 'alive'; p.x = CFG.pStartX; p.y = CFG.pStartY; p.invuln = CFG.invuln
            ev(gs, { type: 'retry' })
            return harvest(gs)
        }
        return harvest(gs)
    }

    if (gs.phase === 'banner') {
        if (--gs.phaseT > 0) return harvest(gs)
        gs.phase = 'play'
        ev(gs, { type: 'go' })
    }
    gs.pt++
    gs.timeLeft--

    // ---- scripted hazards: walls and storms, telegraphed warnT ahead ----
    while (gs.wallIdx < gs.walls.length && gs.pt >= gs.walls[gs.wallIdx].t - CFG.warnT && !gs.walls[gs.wallIdx].warned) {
        gs.walls[gs.wallIdx].warned = true
        ev(gs, { type: 'warn', hazard: 'wall', color: gs.walls[gs.wallIdx].color, gap: gs.walls[gs.wallIdx].gap })
    }
    while (gs.wallIdx < gs.walls.length && gs.pt >= gs.walls[gs.wallIdx].t) {
        const wl = gs.walls[gs.wallIdx++]
        for (let x = 8; x <= W - 8; x += 16) {
            if (Math.abs(x - wl.gap) <= 17) continue
            gs.enemyShots.push({ x, y: -6, vx: 0, vy: CFG.wallV, color: wl.color, wall: true })
        }
        gs.lastVolley = { color: wl.color, tick: gs.tick }
        ev(gs, { type: 'wall', color: wl.color, gap: wl.gap })
    }
    while (gs.stormIdx < gs.stormScript.length && gs.pt >= gs.stormScript[gs.stormIdx].t - CFG.warnT && !gs.stormScript[gs.stormIdx].warned) {
        gs.stormScript[gs.stormIdx].warned = true
        ev(gs, { type: 'warn', hazard: 'storm', x: gs.stormScript[gs.stormIdx].x })
    }
    while (gs.stormIdx < gs.stormScript.length && gs.pt >= gs.stormScript[gs.stormIdx].t) {
        const s = gs.stormScript[gs.stormIdx++]
        gs.storms.push({ x: s.x, until: gs.pt + CFG.stormT })
        ev(gs, { type: 'storm', x: s.x })
    }
    gs.storms = gs.storms.filter((s) => s.until > gs.pt)

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
        if (input.s) {
            p.pol = other(p.pol)
            ev(gs, { type: 'flip', pol: p.pol })
            if (gs.charge >= CFG.chargeMax) {
                gs.charge = 0
                ev(gs, { type: 'nova', pol: p.pol })
                if (CFG.novaClear) {
                    gs.score += CFG.score.novaBall * gs.enemyShots.length
                    gs.enemyShots = []
                }
                gs.storms = []
                for (const e of gs.enemies) {
                    if (!alive(e) || e.kind === 'core') continue
                    killEnemy(gs, e, 'nova')
                }
                // the shell holds against the nova — only opposite-color
                // shots drain it (this is why a one-polarity pilot dies)
            }
        }
        if (input.f && p.cool <= 0 && gs.shots.length < CFG.maxShots) {
            gs.shots.push({ x: p.x, y: p.y - 10, color: p.pol })
            p.cool = CFG.fireCool
            ev(gs, { type: 'fire', x: p.x, y: p.y, color: p.pol })
        }
    } else if (p.state === 'dead') {
        if (--p.deadT <= 0) {
            if (gs.lives <= 0) { endStage(gs, 'dead'); return harvest(gs) }
            p.state = 'alive'; p.x = CFG.pStartX; p.y = CFG.pStartY; p.invuln = CFG.invuln
        }
    }

    // ---- enemies ----
    for (const e of gs.enemies) {
        if (!alive(e)) continue
        const d = decide(gs, e)
        if (d) commit(gs, e, d)

        if (e.state === 'wait') {
            if (gs.pt >= e.startTick) e.state = 'entry'
            continue
        }
        if (e.state === 'entry' || e.state === 'dive' || e.state === 'return') {
            e.uT++
            const u = e.uT / e.path.ticks
            if (u >= 1) {
                if (e.path.end === 'slot') {
                    e.state = 'hold'
                    e.x = e.kind === 'weaver' ? e.x0 || colX(e.col) : colX(e.col) + sway(gs)
                    e.y = e.kind === 'weaver' ? WEAVER_Y : rowY(e.row)
                } else {
                    e.state = 'return'
                    e.path = resolvePath('rejoin', { x: e.x, y: e.y, slot: { x: colX(e.col), y: rowY(e.row) }, dir: 1 })
                    e.uT = 0
                }
                continue
            }
            const q = e.path.fn(u)
            e.x = q[0]; e.y = q[1]
            continue
        }
        if (e.state === 'hold' && e.kind === 'dart') {
            const tx = colX(e.col) + sway(gs), ty = rowY(e.row)
            const dd = Math.hypot(tx - e.x, ty - e.y)
            if (dd > 3.2) { const k = 3 / dd; e.x += (tx - e.x) * k; e.y += (ty - e.y) * k }
            else { e.x = tx; e.y = ty }
        }
    }

    // ---- core shell pulse (visible contract: BOTH colors always come) ----
    if (gs.core && alive(gs.core)) {
        if (gs.pt % CFG.shellPeriod === 0 && gs.pt > 0) {
            gs.core.shell = other(gs.core.shell)
            ev(gs, { type: 'shell', color: gs.core.shell })
        }
    }

    // ---- storms: colorless columns — position or nothing ----
    if (p.state === 'alive' && p.invuln <= 0) {
        for (const s of gs.storms) {
            if (Math.abs(p.x - s.x) <= CFG.stormW / 2 + 2) { hurtPlayer(gs, 'storm'); break }
        }
    }

    // ---- bullets ----
    for (const b of gs.shots) b.y -= CFG.bulletV
    gs.shots = gs.shots.filter((b) => b.y > -12)
    for (const b of gs.enemyShots) { b.x += b.vx; b.y += b.vy }
    gs.enemyShots = gs.enemyShots.filter((b) => b.y < H + 14 && b.y > -20 && b.x > -14 && b.x < W + 14)

    for (const b of gs.shots) {
        for (const e of gs.enemies) {
            if (!alive(e) || e.state === 'wait') continue
            // your shots pass through your own color — except at the core,
            // where the SHELL decides, not the body tint
            if (CFG.shotColorMatters && e.kind !== 'core' && b.color === e.color) continue
            if (Math.hypot(b.x - e.x, b.y - e.y) < CFG.r[e.kind] + 2) {
                b.hit = true
                if (e.kind === 'core') {
                    if (b.color === e.shell) ev(gs, { type: 'blocked', x: b.x, y: b.y })
                    else {
                        e.quota[b.color]++
                        ev(gs, { type: 'chit', color: b.color, x: b.x, y: b.y, need: CFG.coreNeed })
                        if (e.quota.L >= CFG.coreNeed && e.quota.D >= CFG.coreNeed) killEnemy(gs, e)
                    }
                } else {
                    e.hp--
                    if (e.hp <= 0) killEnemy(gs, e)
                    else ev(gs, { type: 'hit', id: e.id, x: b.x, y: b.y })
                }
                break
            }
        }
    }
    gs.shots = gs.shots.filter((b) => !b.hit)

    if (p.state === 'alive') {
        for (const b of gs.enemyShots) {
            if (Math.hypot(p.x - b.x, p.y - b.y) < CFG.r.player + 2) {
                if (b.color === p.pol && CFG.flipAbsorb) {
                    b.hit = true
                    gs.charge = Math.min(CFG.chargeMax, gs.charge + 1)
                    gs.score += CFG.score.absorb
                    ev(gs, { type: 'absorb', color: b.color, x: b.x, y: b.y })
                } else if (p.invuln <= 0) {
                    b.hit = true
                    hurtPlayer(gs, 'shot')
                    break
                }
            }
        }
        gs.enemyShots = gs.enemyShots.filter((b) => !b.hit)
        if (p.state === 'alive' && p.invuln <= 0) {
            for (const e of gs.enemies) {
                if (!alive(e) || e.state === 'wait' || e.state === 'hold') continue
                if (Math.hypot(p.x - e.x, p.y - e.y) < CFG.r.player + CFG.r[e.kind]) {
                    if (e.color !== p.pol) { hurtPlayer(gs, e.kind); break }
                }
            }
        }
    }

    // ---- stage clear / timeout ----
    if (!gs.pending && gs.phase === 'play' && !gs.enemies.some(alive)) {
        ev(gs, { type: 'clear', wave: gs.wave })
        endStage(gs, 'clear')
    }
    if (!gs.pending && gs.timeLeft <= 0 && gs.phase === 'play') {
        // the clock does NOT wipe the fleet — stalling is not a tactic.
        // A stranded pilot pays a life and re-faces the stage.
        gs.lives--
        ev(gs, { type: 'timeout', lives: gs.lives })
        endStage(gs, gs.lives > 0 ? 'retry' : 'dead')
    }
    return harvest(gs)
}

const harvest = (gs) => { if (gs.events.length > 300) gs.events.splice(0, gs.events.length - 300); return gs }

// ------------------------------------------------------------- freeze & scan ----
// The fairness audit and the autopilot BOTH replay the engine itself:
// freeze() copies every number a tick can change, and thaw() puts them
// back. No path rebuilds (paths are immutable), no object identity games
// — if the engine mutates anything new, freeze/thaw must know about it,
// and the determinism pin in polarcheck is what catches a lie here.
const PSTATE = { alive: 0, dead: 1 }
const SIDX = ['wait', 'entry', 'hold', 'dive', 'return', 'dead']

export function freeze(gs) {
    return {
        n: [gs.tick, gs.pt, gs.timeLeft, gs.score, gs.lives, gs.charge, gs.kills,
            gs.wallIdx, gs.stormIdx, gs.nextDiveAt, gs.nextCol,
            gs.lastVolley ? gs.lastVolley.tick : -1, gs.lastVolley ? (gs.lastVolley.color === L ? 0 : 1) : 2,
            gs.wave, gs.phase === 'play' ? 1 : 0],
        p: [gs.player.x, gs.player.y, gs.player.cool, PSTATE[gs.player.state], gs.player.invuln, gs.player.deadT, gs.player.pol === L ? 0 : 1],
        e: gs.enemies.map((e) => [e.x, e.y, e.uT, SIDX.indexOf(e.state), e.fired ? 1 : 0, e.nextShot || 0, e.alt === L ? 0 : 1, e.nextRing || 0, e.nextFan || 0, e.gap || 0, e.quota ? e.quota.L : 0, e.quota ? e.quota.D : 0, e.hp, e.shell === L ? 0 : 1]),
        s: gs.shots.map((b) => ({ ...b })),
        b: gs.enemyShots.map((b) => ({ ...b })),
        st: gs.storms.map((s) => ({ ...s })),
        ws: gs.walls.map((wl) => (wl.warned ? 1 : 0)),
        sws: gs.stormScript.map((s) => (s.warned ? 1 : 0)),
        ep: gs.enemies.map((e) => e.path || null),
    }
}

export function thaw(gs, f) {
    const [tick, pt, timeLeft, score, lives, charge, kills, wallIdx, stormIdx, nextDiveAt, nextCol, lvt, lvc, wave, wasPlay] = f.n
    gs.tick = tick; gs.pt = pt; gs.timeLeft = timeLeft; gs.score = score; gs.lives = lives
    gs.charge = charge; gs.kills = kills; gs.wallIdx = wallIdx; gs.stormIdx = stormIdx
    gs.nextDiveAt = nextDiveAt; gs.nextCol = nextCol
    gs.lastVolley = lvc === 2 ? null : { color: lvc === 0 ? L : D, tick: lvt }
    gs.wave = wave
    // a hypothetical stage clear must never leak into the real game:
    // phase and pending are the last two numbers, and they lie together
    gs.pending = null
    if (wasPlay) gs.phase = 'play'
    const [x, y, cool, stI, inv, deadT, polI] = f.p
    Object.assign(gs.player, { x, y, cool, state: stI === 0 ? 'alive' : 'dead', invuln: inv, deadT, pol: polI === 0 ? L : D })
    for (const [i, e] of gs.enemies.entries()) {
        const a = f.e[i]
        e.x = a[0]; e.y = a[1]; e.uT = a[2]; e.state = SIDX[a[3]]; e.fired = !!a[4]
        if (e.kind === 'weaver') e.nextShot = a[5]
        if (e.alt) e.alt = a[6] === 0 ? L : D
        e.hp = a[12]
        if (e.kind === 'core') {
            e.nextRing = a[7]; e.nextFan = a[8]; e.gap = a[9]
            e.quota.L = a[10]; e.quota.D = a[11]
            e.shell = a[13] === 0 ? L : D
        }
    }
    gs.shots = f.s.map((b) => ({ ...b }))
    gs.enemyShots = f.b.map((b) => ({ ...b }))
    gs.storms = f.st.map((s) => ({ ...s }))
    for (const [i, wl] of gs.walls.entries()) wl.warned = !!f.ws[i]
    for (const [i, s] of gs.stormScript.entries()) s.warned = !!f.sws[i]
    for (const [i, e] of gs.enemies.entries()) {
        if (f.ep[i] && e.path !== f.ep[i]) e.path = wrapPath(f.ep[i].pts, f.ep[i].ticks, f.ep[i].end)
        if (!f.ep[i]) e.path = undefined
    }
    gs.end = null
}

// One hypothetical tick: same step(), events muted, end flagged.
export function scanTick(gs, inp) {
    gs.noscan = true
    step(gs, inp)
    gs.noscan = false
    return !gs.end && gs.player.state === 'alive'
}

// Does plan {dx, pol} survive T ticks from here? dx is a CONSTANT thumb
// vector (the audit's exact language: stand / step left / step right x
// keep / flip), pol applies as a flip on the first tick when it differs.
// The scan runs the REAL step() on a frozen world — scripted walls,
// storms, gun volleys and diver drops all fire inside the window with
// the engine's own rules, so the audit cannot drift from the game.
export function survives(gs, dx, pol, T = 34) {
    if (gs.phase !== 'play' || gs.pending || gs.player.state !== 'alive') return false
    const f = freeze(gs)
    const p = gs.player
    const inp = { l: dx < 0, r: dx > 0, f: false, s: pol !== p.pol }
    let ok = true
    for (let t = 0; t < T && ok; t++) {
        ok = scanTick(gs, t === 0 ? inp : { l: inp.l, r: inp.r, f: false, s: false })
        if (gs.pending) break // stage ending is safe, not death
    }
    thaw(gs, f)
    return ok
}

export function stateHash(gs) {
    const nums = [gs.tick, gs.pt, gs.wave, gs.score, gs.lives, gs.charge,
        gs.phase === 'play' ? 1 : 0, gs.player.x, gs.player.y,
        PSTATE[gs.player.state], gs.player.pol === L ? 0 : 1,
        gs.lastVolley ? gs.lastVolley.tick : -1, gs.lastVolley ? (gs.lastVolley.color === L ? 0 : 1) : 2,
        gs.wallIdx, gs.stormIdx]
    for (const e of gs.enemies) {
        nums.push(SIDX.indexOf(e.state), Math.round(e.x * 8), Math.round(e.y * 8), e.hp,
            e.kind === 'core' ? e.quota.L * 8 + e.quota.D : 0, e.kind === 'core' ? (e.shell === L ? 1 : 0) : 0)
    }
    for (const b of gs.shots) nums.push(Math.round(b.x * 8), Math.round(b.y * 8), b.color === L ? 0 : 1)
    for (const b of gs.enemyShots) nums.push(Math.round(b.x * 8), Math.round(b.y * 8), b.color === L ? 0 : 1)
    for (const s of gs.storms) nums.push(s.x, s.until)
    let h = 2166136261
    for (const n of nums) {
        const v = typeof n === 'string' ? n.length : Math.round(n * 1000)
        h ^= v
        h = Math.imul(h, 16777619)
    }
    return h >>> 0
}
