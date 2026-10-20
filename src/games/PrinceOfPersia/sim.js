// PRINCE OF PERSIA — the pure deterministic engine, as the 1989 game plays.
// step(state, input) advances one 60 Hz tick. No lives: death restarts the
// level and the hour keeps running. You start unarmed; the sword lies in level
// one and outside a fight it is sheathed. The duel is timing, not heights —
// advance and retreat on the arrows, Strike (X) and Block (Up); a guard's
// telegraphed lunge is parried by blocking in time, and a parry opens a
// counter. Falls are measured in floors (one safe, two costs blood, three is
// death — unless the slow-fall flask softens the world). A ledge is caught only
// by holding Shift while falling. Rooms flip the screen at their doorways.
// Stage 3 adds the twelve levels' signatures: the magic mirror (step through
// the barred corridor), the princess's mouse (runs ahead and holds the raise
// button), the shadow (a black silhouette re-enacting your moves ~3.5 s late —
// its touch kills; steel passes through it; in the lair, a sheathed touch
// merges it back into you; and it will drink a phantom poison that you hop),
// the invisible bridge (feet find planks the eyes cannot see), and the feather
// that turns a certain drop into a survivable one. No Math.random, no DOM, no
// audio — the tab paints this and scripts/popcheck.mjs audits the very same
// module.

import {
    RW, T, FH, GROUND, LEVEL_COUNT, makeLevel, EMPTY, SOLID, PLATFORM, LOOSE, SPIKE, GATE,
    RAISE, DROP, EXITPLATE, EXIT, SWORD, POTION, MIRROR, BRIDGE, roomOf,
} from './levels.js'

export const CFG = {
    T,
    HW: 9, PH: 60, CH: 36,
    walk: 1.45, run: 2.6, accel: 0.11, runAfter: 26, skid: 0.45, friction: 0.2,
    g: 0.45, jumpV: 8.4, holdG: 0.22, holdMax: 12, levG: 0.14, maxFall: 12,
    climbT: 56, shimmy: 0.9,
    clock: 60 * 60 * 60, startHP: 2,
    reach: 44,
    strikeDur: 24, strikeHit0: 8, strikeHit1: 16, lunge: 1.6, lungeT: 10,
    guardWind: 18, guardHit0: 13, guardHit1: 19, guardCool: 44, parryStun: 28,
    looseT: 60,
    gateOpen: 0.7, gateRise: 0.12, gateFall: 0.004, gateSlam: 0.5,
    chompPeriod: 150, chompWait: 96, chompDrop: 30, chompRest: 8, chompWarnLead: 20,
    flipDur: 600, levDur: 600,
    drinkT: 26, drawT: 16, sheatheT: 16, startT: 12, skidT: 8, turnT: 10,
    // Stage 3: the twelve levels' signatures
    mirrorReach: 24,
    shadowDelay: 210, shadowWalk: 2.4, mergeRange: 26,
    mouseSpeed: 1.1,
    // Stage 4: the sound spine — one footfall per stride of travel, one
    // chain-rattle per few ticks of actual gate travel
    stride: 42, chainEvery: 6,
    // Stage 7: the escort feel — living bodies hold the corridor at blade
    // distance, and the escort dashes to actually run you down
    bodyGap: 40, escortDash: 0.65,
    slack: false,
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0)
const keyOf = (g, c, r) => r * g.level.W + c

// per-guard skill: how fast they footwork, how short their wind-up telegraph,
// how quickly they strike again. Turban colour lives in art.js.
export const GUARD_STYLE = {
    green: { speed: 1.4, windT: 18, coolT: 44 },
    red: { speed: 1.55, windT: 14, coolT: 34 },
    fat: { speed: 1.0, windT: 24, coolT: 52 },
    skeleton: { speed: 1.2, windT: 16, coolT: 40 },
    shadow: { speed: 1.45, windT: 16, coolT: 38 },
    jaffar: { speed: 1.7, windT: 13, coolT: 24 },
}

export function makeGame(levelIndex = 0) {
    const g = {
        tick: 0, clock: CFG.clock, levelIndex, status: 'play', statusT: 0,
        deathReason: '', events: [], sword: false, bonusMax: 0, cpReached: false,
        exitOpen: false, gateOpen: [], room: 0, shake: 0,
        p: null, guards: [], pots: [], chomps: [], level: null,
        loose: {}, fallen: {},
        hist: [], shadow: null, merged: false, mouse: null, mirrorUsed: false, bridgeSeen: {},
        prev: { left: false, right: false, up: false, down: false, jump: false, shift: false, atk: false },
    }
    loadLevel(g, levelIndex)
    return g
}

function princeAt(g, pos) {
    return {
        x: (pos.c + 0.5) * T, y: pos.r * T,
        vx: 0, vy: 0, facing: 1, dirTicks: 0,
        onGround: false, crouch: false, hang: null, climb: 0,
        anim: 'idle', animT: 0,
        hp: CFG.startHP, maxHP: CFG.startHP + g.bonusMax,
        invuln: 0, hurtT: 0, block: false,
        atk: 0, atkDir: 1, atkHitDone: false,
        lev: 0, flip: 0, dieT: 0, holdT: 0, fallFrom: null, noGrabUntil: 0,
        // Stage-2 pose timers (visual only — they never feed the physics)
        drinkT: 0, drawT: 0, sheatheT: 0, startT: 0, skidT: 0, turnT: 0, landT: 0,
        // Stage-4 gait timer (emits `foot` events only — never feeds the physics)
        stepPhase: 0, stepParity: 0,
        duelDrawn: false, careful: false, jumpStill: false,
    }
}

function loadLevel(g, i, fromCheckpoint = false) {
    g.levelIndex = i
    g.level = makeLevel(i)
    g.loose = {}
    g.fallen = {}
    g.exitOpen = false
    g.gateOpen = new Array(g.level.nRooms).fill(0)
    g.cpReached = false
    g.events.length = 0
    g.room = 0
    const start = (fromCheckpoint && g.level.checkpoint) ? g.level.checkpoint : g.level.start
    g.room = roomOf(Math.floor(start.c))
    g.p = princeAt(g, start)
    g.guards = g.level.guards.map((gd, gi) => ({
        id: gi,
        x: (gd.c + 0.5) * T, y: gd.r * T, vx: 0, dir: -1,
        hp: CFG.slack ? Math.max(1, gd.hp - 1) : gd.hp, maxHp: gd.hp,
        boss: gd.boss, type: gd.type || 'green', room: gd.room, patrol: gd.patrol,
        ...GUARD_STYLE[gd.type] || GUARD_STYLE.green,
        engaged: false, wind: 0, cool: 30, recoil: 0, anim: 'idle', hurtT: 0, dead: false,
        follow: false, followT: 0, homeRoom: gd.room,
    }))
    g.pots = g.level.pots.map((p) => ({ ...p, taken: false, shadowTaken: false }))
    g.chomps = g.level.chomps.map((c) => ({ ...c }))
    g.hist = []
    g.merged = false
    g.mirrorUsed = false
    g.bridgeSeen = {}
    // the shadow gathers 15 tiles behind the prince — off the left edge of the
    // world (a shadow seeps through the starting wall) and re-enacts from there.
    // Its touch only turns lethal once it has fully woken (one replay delay).
    g.shadow = g.level.shadow ? {
        x: (g.level.start.c + 0.5) * T - 18 * T, y: g.level.start.r * T,
        vx: 0, vy: 0, facing: 1, onGround: true, anim: 'idle', animT: 0,
        hp: 1, maxHp: 2, dead: false, dieT: 0, dieWhy: '', fallFrom: null, lev: 0,
        bornAt: g.tick,
    } : null
    g.mouse = g.level.mouse ? {
        x: (g.level.mouse.c + 0.5) * T, y: g.level.mouse.r * T, dir: 1,
        onButton: false, room: g.level.mouse.room,
    } : null
    g.status = 'play'
    g.statusT = 0
    g.prev = { left: false, right: false, up: false, down: false, jump: false, shift: false, atk: false }
}

const cell = (g, c, r) => {
    if (c < 0 || c >= g.level.W) return SOLID
    if (r < 0) return EMPTY
    if (r >= g.level.H) return SOLID
    return g.level.grid[r * g.level.W + c]
}

export const gateOpenHere = (g, code, c) => code === GATE ? g.gateOpen[roomOf(c)] >= CFG.gateOpen : false
// solid for standing / blocking movement, honouring open gates and doors
const blocks = (g, code, c) => {
    if (code === GATE) return g.gateOpen[roomOf(c)] < CFG.gateOpen
    if (code === EXIT) return !g.exitOpen
    if (code === SOLID || code === PLATFORM || code === LOOSE || code === SPIKE) return true
    if (code === RAISE || code === DROP || code === EXITPLATE || code === SWORD || code === POTION) return true
    if (code === BRIDGE) return true     // invisible, but solid underfoot
    return false
}

// horizontal wall-check: one-way floors (the '=' ledges, loose tiles and the
// invisible bridge) land you from above but never wall you off from the side —
// the original lets you walk straight under them at any body height
const blocksH = (g, code, c) => {
    if (code === PLATFORM || code === LOOSE || code === BRIDGE) return false
    return blocks(g, code, c)
}

function moveX(g, b, nx) {
    const d = sign(nx - b.x)
    if (!d) { b.x = nx; return false }
    const h = b === g.p && b.crouch ? CFG.CH : CFG.PH
    const col = Math.floor((nx + CFG.HW * d) / T)
    let blocked = false
    for (const yy of [b.y - 4, b.y - h * 0.45, b.y - h + 4]) {
        if (blocksH(g, cell(g, col, Math.floor(yy / T)), col)) { blocked = true; break }
    }
    if (blocked) { b.x = d > 0 ? col * T - CFG.HW - 0.01 : (col + 1) * T + CFG.HW + 0.01; b.vx = 0; return true }
    b.x = nx
    return false
}

function moveY(g, b) {
    const vyWas = b.vy
    b.vy = clamp(b.vy + (b.lev > 0 ? CFG.levG : CFG.g), -CFG.maxFall, CFG.maxFall)
    const ny = b.y + b.vy
    if (b.vy > 0) {
        const rf = Math.floor(ny / T)
        const c0 = Math.floor((b.x - CFG.HW + 1) / T)
        const c1 = Math.floor((b.x + CFG.HW - 1) / T)
        for (let c = c0; c <= c1; c++) {
            const code = cell(g, c, rf)
            const topEdge = rf * T
            const oneWay = code === PLATFORM || code === LOOSE || code === BRIDGE
            const landing = blocks(g, code, c) && (!oneWay || b.y - 1 <= topEdge + 2)
            if (landing) {
                if (code === BRIDGE) {
                    const k = keyOf(g, c, rf)
                    if (!(k in g.bridgeSeen)) {
                        g.bridgeSeen[k] = true
                        g.events.push({ t: g.tick, type: 'bridge' })
                    }
                }
                b.y = topEdge; b.vy = 0; land(g, b, vyWas); return
            }
        }
        b.y = ny; b.onGround = false
    } else if (b.vy < 0) {
        const h = b === g.p && b.crouch ? CFG.CH : CFG.PH
        const rh = Math.floor((ny - h) / T)
        const c0 = Math.floor((b.x - CFG.HW + 2) / T)
        const c1 = Math.floor((b.x + CFG.HW - 2) / T)
        let bump = false
        for (let c = c0; c <= c1; c++) if (blocks(g, cell(g, c, rh), c)) { bump = true; break }
        if (bump) { b.y = (rh + 1) * T + h; b.vy = 0 } else b.y = ny
    }
}

// Stage 7: living bodies hold the corridor. The prince cannot walk or run
// through a standing guard — a guard left between you and the far door is a
// wall you must answer with steel. Feet within a cell of the guard's floor are
// blocked; a clean running leap clears the head.
function bodyBlock(g, p) {
    for (const q of g.guards) {
        if (q.dead) continue
        if (p.y <= q.y - T || p.y >= q.y + 8) continue
        const d = p.x - q.x
        if (Math.abs(d) >= CFG.bodyGap) continue
        const side = d !== 0 ? sign(d) : (sign(p.vx) || 1)
        const pinX = q.x + CFG.bodyGap * side
        const pc = Math.floor(pinX / T)
        const pr = Math.floor(p.y / T)
        if (pc < 0 || pc >= g.level.W) continue
        // never let a body pin anyone onto teeth…
        if (cell(g, pc, pr) === SPIKE) continue
        if (g.chomps.some((ch) => ch.c === pc && ch.r === pr)) continue
        // …nor into a wall
        const h = p.crouch ? CFG.CH : CFG.PH
        let wall = false
        for (const yy of [p.y - 4, p.y - h * 0.45, p.y - h + 4]) {
            if (blocksH(g, cell(g, pc, Math.floor(yy / T)), pc)) { wall = true; break }
        }
        if (wall) continue
        p.x = pinX
        if (sign(p.vx) === side) p.vx = 0
    }
}

function land(g, b, vyWas) {
    b.onGround = true
    const floors = b.fallFrom === null ? 0 : (b.y - b.fallFrom) / FH
    if (b === g.p) b.crouch = false
    // the slow-fall flask softens what would otherwise be a killing drop
    const soft = b.lev > 0 && floors >= 2.5
    if (floors >= 2.5 && !soft) { b === g.p ? kill(g, 'fall') : shadowKill(g, 'fall'); return }
    const eff = soft ? 2 : floors
    if (eff >= 1.5) {
        b.hp -= 1; b.hurtT = 22; g.shake = 9
        if (b === g.p) {
            g.events.push({ t: g.tick, type: 'hurtoffall', floors: Math.round(floors) })
            if (b.hp <= 0) { kill(g, 'fall'); return }
        } else {
            g.events.push({ t: g.tick, type: 'shadowFall' })
            if (b.hp <= 0) { shadowKill(g, 'fall'); return }
        }
    } else if (b === g.p && floors >= 0.5 && vyWas > 2) {
        b.anim = 'land'; b.landT = 10
        g.events.push({ t: g.tick, type: 'land', floors: Math.round(floors) })
    }
    b.fallFrom = null
}

const DEATH_ANIM = { spikes: 'die_impale', chomper: 'die_slice', fall: 'die_crumple', sword: 'die_cut', poison: 'die_poison', shadow: 'die_shadow' }

function kill(g, why) {
    if (g.status !== 'play') return
    g.deathReason = why
    g.p.anim = DEATH_ANIM[why] || 'die_cut'
    g.status = 'dying'
    g.statusT = 0
    g.events.push({ t: g.tick, type: 'die', why })
}

function shadowKill(g, why) {
    const s = g.shadow
    if (!s || s.dead) return
    s.dead = true; s.dieT = 0; s.dieWhy = why
    g.events.push({ t: g.tick, type: 'shadowDown', why })
}

export function buttonsPressed(g) {
    const p = g.p
    const out = { raise: -1, drop: -1, plate: -1 }
    const fr = GROUND                 // buttons live on the ground floor; hopping over counts
    const fc = Math.floor(p.x / T)
    for (let dc = -1; dc <= 1; dc++) {
        const c = fc + dc
        const code = cell(g, c, fr)
        if (code === RAISE && Math.abs(p.x - (c + 0.5) * T) < T * 0.7) out.raise = roomOf(c)
        else if (code === DROP && Math.abs(p.x - (c + 0.5) * T) < T * 0.7) out.drop = roomOf(c)
        else if (code === EXITPLATE && Math.abs(p.x - (c + 0.5) * T) < T * 0.7) out.plate = 1
    }
    return out
}

export function step(g, inp = {}) {
    g.tick++
    if (g.shake > 0) g.shake--
    const p = g.p
    if (g.events.length > 500) g.events.splice(0, g.events.length - 500)

    if (g.status === 'dying') {
        p.dieT++
        if (g.statusT++ > 96) loadLevel(g, g.levelIndex, g.cpReached)   // clock keeps running
        return
    }
    if (g.status === 'clear') {
        if (g.statusT++ > 180) {
            const next = g.levelIndex + 1
            if (next >= LEVEL_COUNT) { g.status = 'win'; g.events.push({ t: g.tick, type: 'win' }) }
            else loadLevel(g, next)
        }
        return
    }
    if (g.status !== 'play') return

    g.clock -= 1
    // #326-4: the jaws whine in the last ~20 ticks before they reach down —
    // one deterministic telegraph per cycle per jaw, ahead of the strike check,
    // and only for jaws in the room on screen (no cross-room mud).
    for (const ch of g.chomps) {
        if (roomOf(ch.c) === g.room && (g.tick + ch.phase) % CFG.chompPeriod === CFG.chompWait - CFG.chompWarnLead) {
            g.events.push({ t: g.tick, type: 'chompWarn', c: ch.c, r: ch.r })
        }
    }
    if (g.clock <= 0) {
        g.clock = 0
        g.deathReason = 'time'
        g.status = 'lost'
        g.statusT = 0
        g.events.push({ t: g.tick, type: 'timeup' })
        return
    }

    const left = !!inp.left, right = !!inp.right, up = !!inp.up, down = !!inp.down
    const jump = !!inp.jump, shift = !!inp.shift, atk = !!inp.atk
    const dj = jump && !g.prev.jump
    const dAtk = atk && !g.prev.atk

    // ---- machinery: raise / drop / exit buttons for the room the prince is in -
    const btn = buttonsPressed(g)
    let gateUp = false, gateDown = false
    if (btn.raise >= 0) {
        const was = g.gateOpen[btn.raise]
        g.gateOpen[btn.raise] = Math.min(1, was + CFG.gateRise)
        if (g.gateOpen[btn.raise] > was) gateUp = true
    }
    if (btn.drop >= 0) {
        const was = g.gateOpen[btn.drop]
        g.gateOpen[btn.drop] = Math.max(0, was - CFG.gateSlam)
        if (g.gateOpen[btn.drop] < was) gateDown = true
    }
    stepMouse(g)                       // the princess's mouse holds a button too
    for (let k = 0; k < g.gateOpen.length; k++) {
        if (k === btn.raise || k === g.mouseHold) continue
        const fast = k === btn.drop ? CFG.gateSlam : CFG.gateFall
        const was = g.gateOpen[k]
        g.gateOpen[k] = Math.max(0, was - fast)
        if (was > 0 && g.gateOpen[k] < was) gateDown = true
    }
    const dir = gateUp ? 1 : gateDown ? -1 : 0
    if (dir !== 0 && (dir !== g.gateMotion || g.tick % CFG.chainEvery === 0)) {
        g.events.push({ t: g.tick, type: 'chain', up: dir === 1 })
    }
    g.gateMotion = dir
    if (btn.plate >= 0 && !g.exitOpen) { g.exitOpen = true; g.events.push({ t: g.tick, type: 'door' }) }

    const dueling = g.guards.some((gd) => !gd.dead && gd.room === g.room && Math.abs(gd.x - p.x) < 8 * T && Math.abs(gd.y - p.y) < FH)
    p.block = up && p.onGround && !p.hang && dueling
    if (g.sword && dueling && !p.duelDrawn) { p.duelDrawn = true; p.drawT = CFG.drawT }
    else if (p.duelDrawn && !dueling) { p.duelDrawn = false; p.sheatheT = CFG.sheatheT }

    // ---- checkpoint: passing it on its floor latches the restart point --------
    if (g.level.checkpoint && !g.cpReached && p.x >= g.level.checkpoint.c * T) {
        g.cpReached = true
        g.events.push({ t: g.tick, type: 'checkpoint' })
    }

    // ---- the magic mirror: step through the barred corridor, once per entry ---
    if (g.level.mirror && g.level.mirrorTo && !g.mirrorUsed && g.status === 'play') {
        const m = g.level.mirror
        if (Math.abs(p.x - (m.c + 0.5) * T) < CFG.mirrorReach && Math.abs(Math.floor(p.y / T) - m.r) <= 1) {
            g.mirrorUsed = true
            p.x = (g.level.mirrorTo.c + 0.5) * T
            p.y = g.level.mirrorTo.r * T
            p.vx = 0; p.vy = 0; p.hang = null; p.fallFrom = null
            g.events.push({ t: g.tick, type: 'mirror' })
        }
    }

    // ---- hanging on a ledge (climb / drop / shimmy / hang-jump) ---------------
    if (p.hang) {
        p.vx = 0; p.vy = 0; p.anim = 'hang'
        const hg = p.hang
        if (up) {
            p.climb++; p.anim = 'climb'
            if (p.climb > CFG.climbT) {
                p.hang = null; p.climb = 0
                p.y = hg.r * T
                p.x = clamp(p.x + hg.side * 6, CFG.HW, (g.level.W - 1) * T)
                p.onGround = false; p.vy = -0.01
                g.events.push({ t: g.tick, type: 'climb' }); p.noGrabUntil = g.tick + 30
                moveY(g, p)
            }
        } else if (down) { p.hang = null; p.climb = 0; p.fallFrom = p.y }
        else if (dj) { p.hang = null; p.climb = 0; p.vy = -CFG.jumpV; p.vx = hg.side * 1.4; p.fallFrom = p.y; g.events.push({ t: g.tick, type: 'hangjump' }) }
        else if (left || right) {
            const d = right ? 1 : -1
            const edgeCol = hg.side > 0 ? Math.floor((p.x + CFG.HW + 1) / T) : Math.floor((p.x - CFG.HW - 1) / T)
            const below = cell(g, edgeCol, hg.r)
            const stillWall = (below === SOLID || below === PLATFORM || below === LOOSE || below === GATE)
            const moveOk = (hg.side > 0 && d === 1) || (hg.side < 0 && d === -1)
            if (moveOk && stillWall) { moveX(g, p, p.x + d * CFG.shimmy); p.anim = 'shimmy' }
            else if (moveOk && !stillWall) { p.hang = null; p.fallFrom = p.y }
            else if (!moveOk) { p.hang = null; p.climb = 0; p.fallFrom = p.y }
        }
        syncRoom(g)
        g.prev = { left, right, up, down, jump, shift, atk }
        checkHazards(g)
        return
    }

    // ---- strike (only with the sword drawn) -------------------------------------
    if (dAtk && p.onGround && p.atk === 0 && g.sword) {
        p.atk = CFG.strikeDur; p.atkDir = p.facing; p.atkHitDone = false
        p.anim = 'attack'; p.animT = CFG.strikeDur
        g.events.push({ t: g.tick, type: 'swing' })
    }

    // ---- horizontal drive -------------------------------------------------------
    const dirIn = (right ? 1 : 0) - (left ? 1 : 0)
    if (p.atk > CFG.strikeDur - CFG.lungeT && !p.atkHitDone) p.vx = p.atkDir * CFG.lunge
    if (dirIn !== 0 && p.atk === 0) {
        const braking = sign(p.vx) !== 0 && sign(p.vx) !== dirIn
        if (braking) {
            if (Math.abs(p.vx) > 0.6) p.skidT = CFG.skidT
            else p.turnT = CFG.turnT
        }
        if (Math.abs(p.vx) < 0.3 && !braking) p.startT = CFG.startT
        if (p.facing !== dirIn && !braking) p.turnT = CFG.turnT
        p.facing = braking ? p.facing : dirIn
        p.dirTicks++
        const cap = shift ? CFG.walk : p.dirTicks > CFG.runAfter ? CFG.run : CFG.walk
        if (sign(p.vx) !== dirIn && Math.abs(p.vx) > 0.1) p.vx += CFG.skid * dirIn
        else if (Math.abs(p.vx) < cap) p.vx = clamp(p.vx + CFG.accel * dirIn, -CFG.run, CFG.run)
        else if (Math.abs(p.vx) > cap) p.vx = Math.sign(p.vx) * Math.max(cap, Math.abs(p.vx) - CFG.friction)
    } else if (p.atk === 0 || dirIn === 0) {
        p.dirTicks = 0
        if (p.onGround) p.vx = Math.abs(p.vx) < CFG.friction ? 0 : p.vx - CFG.friction * sign(p.vx)
    }
    if (p.atk > 0) p.atk--

    // ---- jump (hold to extend) --------------------------------------------------
    if (dj && p.onGround) {
        p.jumpStill = Math.abs(p.vx) < 0.6
        p.vy = -CFG.jumpV; p.onGround = false; p.holdT = CFG.holdMax; p.fallFrom = p.y; p.anim = 'jump'
        g.events.push({ t: g.tick, type: 'jump', speed: Math.abs(p.vx) })
    } else if (jump && !p.onGround && p.vy < 0 && p.holdT > 0) { p.vy -= CFG.holdG; p.holdT-- }

    // ---- crouch ---------------------------------------------------------------
    p.crouch = down && p.onGround && !dueling && p.atk === 0
    if (p.crouch) p.anim = 'crouch'

    // ---- integrate ------------------------------------------------------------
    moveX(g, p, p.x + p.vx)
    bodyBlock(g, p)
    p.onGround = false
    moveY(g, p)

    // ---- held grab: catch a ledge only while Shift is held, falling ----------
    if (!p.onGround && p.vy > 0 && shift && g.tick > (p.noGrabUntil || 0)) {
        const handR = Math.floor((p.y - 30) / T)
        for (const side of [1, -1]) {
            const col = Math.floor((p.x + (CFG.HW + 2) * side) / T)
            const code = cell(g, col, handR)
            const codeBelow = cell(g, col, handR + 1)
            const edge = (code === SOLID || code === PLATFORM || code === LOOSE)
            const under = blocks(g, codeBelow, col) || codeBelow === PLATFORM || codeBelow === LOOSE
            if ((edge || under) && p.y > handR * T + 12 && p.y < (handR + 2) * T) {
                p.hang = { side, c: col, r: handR }
                p.x = side > 0 ? col * T - CFG.HW - 0.01 : (col + 1) * T + CFG.HW + 0.01
                p.vy = 0; p.climb = 0; p.anim = 'hang'
                g.events.push({ t: g.tick, type: 'grab' })
                break
            }
        }
    }

    // ---- animation --------------------------------------------------------------
    // precedence: a story pose (drink, draw, sheathe, strike, block) outranks a
    // gait; a gait outranks the little transition accents (start/skid/turn/land);
    // careful stepping takes over whenever the next footfall would find no floor.
    const stand = Math.floor(p.y / T)
    const fc = Math.floor(p.x / T)
    p.careful = p.onGround && dirIn !== 0 && !p.crouch && p.atk === 0 && !p.block &&
        Math.abs(p.vx) <= CFG.walk + 0.3 && !blocks(g, cell(g, fc + dirIn, stand), fc + dirIn)
    if (g.status !== 'play') { p.animT++; syncRoom(g); g.prev = { left, right, up, down, jump, shift, atk }; stepShadow(g); return }
    if (p.onGround) {
        if (p.drinkT > 0) p.anim = 'drink'
        else if (p.drawT > 0) p.anim = 'draw'
        else if (p.sheatheT > 0) p.anim = 'sheathe'
        else if (p.atk > 0) p.anim = 'attack'
        else if (p.block) p.anim = 'block'
        else if (p.landT > 0) p.anim = 'land'
        else if (p.startT > 0 && Math.abs(p.vx) > 0.2) p.anim = 'start'
        else if (p.skidT > 0 && Math.abs(p.vx) > 0.2) p.anim = 'skid'
        else if (p.turnT > 0 && Math.abs(p.vx) <= 0.2) p.anim = 'turn'
        else if (p.careful) p.anim = 'careful'
        else if (Math.abs(p.vx) > CFG.walk + 0.4) p.anim = 'run'
        else if (Math.abs(p.vx) > 0.2) p.anim = 'walk'
        else p.anim = p.crouch ? 'crouch' : 'idle'
        p.animT++
        // Stage-4 gait: one footfall per stride of travel while the feet are
        // actually walking (a careful step is softer, a run hammers faster).
        if (Math.abs(p.vx) > 0.2 && (p.anim === 'walk' || p.anim === 'run' || p.anim === 'start' || p.anim === 'careful')) {
            p.stepPhase += Math.abs(p.vx)
            if (p.stepPhase >= CFG.stride) {
                p.stepPhase = 0
                g.events.push({ t: g.tick, type: 'foot', run: p.anim === 'run', soft: p.anim === 'careful', foot: p.stepParity })
                p.stepParity ^= 1
            }
        } else p.stepPhase = 0
    } else if (p.vy < 0) p.anim = 'jump'
    else if (!p.hang) p.anim = 'fall'

    // ---- loose floors -----------------------------------------------------------
    if (p.onGround && cell(g, fc, stand) === LOOSE) {
        const k = keyOf(g, fc, stand)
        if (!(k in g.loose)) g.loose[k] = g.tick
        else if (g.tick - g.loose[k] > CFG.looseT) { g.fallen[k] = true; g.shake = 12; g.events.push({ t: g.tick, type: 'loose' }) }
    }
    for (const k in g.loose) {
        if (g.fallen[k]) continue
        if (g.tick - g.loose[k] > CFG.looseT - 30 && g.tick % 10 === 0) g.shake = Math.max(g.shake, 3)
    }

    // ---- potions (the 1989 flasks) ---------------------------------------------
    for (const pot of g.pots) {
        if (pot.taken) continue
        if (Math.abs(p.x - (pot.c + 0.5) * T) < CFG.HW + 8 && Math.abs(stand - pot.r) <= 1) {
            pot.taken = true
            p.drinkT = CFG.drinkT
            g.events.push({ t: g.tick, type: 'potion', kind: pot.type })
            if (pot.type === 'r') p.hp = Math.min(p.maxHP, p.hp + 1)
            else if (pot.type === '+') { g.bonusMax += 1; p.maxHP += 1; p.hp += 1 }
            else if (pot.type === 'b') { p.hp -= 1; if (p.hp <= 0) { g.events.push({ t: g.tick, type: 'die', why: 'poison' }); kill(g, 'poison') } }
            else if (pot.type === 'f') p.lev = CFG.levDur
            else if (pot.type === 'u') p.flip = CFG.flipDur
        }
    }

    // ---- the sword: draw it once, keep it across rooms, deaths and levels -----
    if (!g.sword && g.level.sword) {
        const s = g.level.sword
        if (p.onGround && Math.abs(p.x - (s.c + 0.5) * T) < CFG.HW + 8 && Math.abs(stand - s.r) <= 1) {
            g.sword = true
            p.drawT = CFG.drawT
            g.events.push({ t: g.tick, type: 'sword' })
        }
    }

    // ---- hazards + duel + exit --------------------------------------------------
    checkHazards(g)
    stepGuards(g, dueling)
    checkExit(g)

    if (p.invuln > 0) p.invuln--
    if (p.hurtT > 0) p.hurtT--
    if (p.lev > 0) p.lev--
    if (p.flip > 0) p.flip--
    if (p.drinkT > 0) p.drinkT--
    if (p.drawT > 0) p.drawT--
    if (p.sheatheT > 0) p.sheatheT--
    if (p.startT > 0) p.startT--
    if (p.skidT > 0) p.skidT--
    if (p.turnT > 0) p.turnT--
    if (p.landT > 0) p.landT--
    syncRoom(g)
    g.prev = { left, right, up, down, jump, shift, atk }
    stepShadow(g)
}

// ---- the princess's mouse: runs ahead and holds the raise button ------------
function stepMouse(g) {
    g.mouseHold = -1
    const m = g.mouse
    if (!m) return
    if (!m.onButton) {
        m.x += m.dir * CFG.mouseSpeed
        const mc = Math.floor(m.x / T)
        if (cell(g, mc, Math.floor(m.y / T)) === RAISE) {
            m.onButton = true
            g.events.push({ t: g.tick, type: 'mouse' })
        }
        if (Math.floor(m.x / T) >= (m.room + 1) * RW - 1) m.dir = -1
        if (m.x <= m.room * RW * T) m.dir = 1
    }
    if (m.onButton) g.mouseHold = m.room
}

// the shadow seeps through the level's left wall (negative columns are open
// air for it), but obeys every other wall on the grid
function moveXShadow(g, s, nx) {
    const d = sign(nx - s.x)
    if (!d) { s.x = nx; return false }
    const col = Math.floor((nx + CFG.HW * d) / T)
    if (col > 0 && s.x >= 0) {   // the level's left wall (col 0) is no barrier for the shadow
        const h = CFG.PH
        let blocked = false
        for (const yy of [s.y - 4, s.y - h * 0.45, s.y - h + 4]) {
            if (blocksH(g, cell(g, col, Math.floor(yy / T)), col)) { blocked = true; break }
        }
        if (blocked) { s.x = d > 0 ? col * T - CFG.HW - 0.01 : (col + 1) * T + CFG.HW + 0.01; s.vx = 0; return true }
    }
    s.x = nx
    return false
}

// ---- the shadow ------------------------------------------------------------
// The shadow re-enacts the prince's moves late: it replays the movement inputs
// from CFG.shadowDelay ticks ago on the same grid. It never jumps (it is a
// coward), it walks into phantom flasks — L5's poison is its death, not yours —
// falls kill it, steel passes through it, and its touch kills you. In Jaffar's
// lair, a touch with the sword sheathed merges it back into the prince.
function stepShadow(g) {
    g.hist.push({ left: !!g.prev.left, right: !!g.prev.right, up: !!g.prev.up, down: !!g.prev.down })
    if (g.hist.length > CFG.shadowDelay + 400) g.hist.splice(0, g.hist.length - CFG.shadowDelay - 400)
    const s = g.shadow
    if (!s || g.status !== 'play') return
    if (s.dead) { s.dieT++; return }
    if (g.p.duelDrawn) {
        s.vx = 0; s.animT++; s.anim = 'idle'
        return
    }
    const inp = g.hist[g.hist.length - 1 - CFG.shadowDelay] || { left: false, right: false, up: false, down: false }

    const dirIn = (inp.right ? 1 : 0) - (inp.left ? 1 : 0)
    if (dirIn !== 0) {
        s.facing = dirIn
        if (Math.abs(s.vx) < CFG.shadowWalk) s.vx = clamp(s.vx + CFG.accel * dirIn, -CFG.shadowWalk, CFG.shadowWalk)
        else s.vx = sign(s.vx) * Math.max(CFG.shadowWalk, Math.abs(s.vx) - CFG.friction)
    } else if (s.onGround) {
        s.vx = Math.abs(s.vx) < CFG.friction ? 0 : s.vx - CFG.friction * sign(s.vx)
    }
    moveXShadow(g, s, s.x + s.vx)
    s.onGround = false
    moveY(g, s)

    // phantom flasks: the shadow drinks even the ones already taken
    const stand = Math.floor(s.y / T)
    for (const pot of g.pots) {
        if (pot.shadowTaken) continue
        if (Math.abs(s.x - (pot.c + 0.5) * T) < CFG.HW + 8 && Math.abs(stand - pot.r) <= 1) {
            pot.shadowTaken = true
            g.events.push({ t: g.tick, type: 'shadowDrink', kind: pot.type })
            if (pot.type === 'b') { s.hp -= 1; if (s.hp <= 0) { shadowKill(g, 'poison'); return } }
            else if (pot.type === 'r' || pot.type === '+') s.hp = Math.min(s.maxHp, s.hp + 1)
            else if (pot.type === 'f') s.lev = CFG.levDur
        }
    }

    // its own hazards
    if (s.onGround) {
        const fc = Math.floor(s.x / T)
        if (cell(g, fc, stand) === SPIKE) { shadowKill(g, 'spikes'); return }
        for (const ch of g.chomps) {
            if (fc === ch.c && stand === ch.r && chompDown(g, ch)) { shadowKill(g, 'chomper'); return }
        }
    }
    if (s.lev > 0) s.lev--
    s.animT++
    if (s.onGround) s.anim = Math.abs(s.vx) > 0.2 ? (Math.abs(s.vx) > CFG.walk + 0.2 ? 'run' : 'walk') : 'idle'
    else s.anim = s.vy < 0 ? 'jump' : 'fall'

    // the touch of the shadow: death — or, in the lair with the sword
    // sheathed, the merge that ends the story. At the exit threshold the
    // shadow peels off the replay and catches up with the sheathed prince.
    const p = g.p
    if (g.level.merge && !p.duelDrawn && g.level.exit && roomOf(Math.floor(p.x / T)) === g.level.exit.room) {
        s.x += sign(p.x - s.x) * 6
    }
    if (g.tick > s.bornAt + CFG.shadowDelay && Math.abs(s.x - p.x) < CFG.mergeRange && Math.abs(s.y - p.y) < FH) {
        if (g.level.merge && !p.duelDrawn) {
            s.dead = true; s.dieT = 0; s.dieWhy = 'merge'
            g.merged = true
            g.events.push({ t: g.tick, type: 'merge' })
        } else if (p.invuln === 0) {
            kill(g, 'shadow')
        }
    }
}

function checkExit(g) {
    const ex = g.level.exit
    if (!ex || !g.exitOpen) return
    const p = g.p
    if (roomOf(Math.floor(p.x / T)) === ex.room && p.x >= (ex.c - 1) * T) {
        g.status = 'clear'; g.statusT = 0
        g.events.push({ t: g.tick, type: 'clear', level: g.levelIndex })
    }
}

function checkHazards(g) {
    const p = g.p
    if (!p.onGround || g.status !== 'play') return
    const fr = Math.floor(p.y / T)
    const fc = Math.floor(p.x / T)
    if (cell(g, fc, fr) === SPIKE) { kill(g, 'spikes'); return }
    for (const ch of g.chomps) {
        if (fc === ch.c && fr === ch.r && chompDown(g, ch)) { kill(g, 'chomper'); return }
    }
}

export function chompDown(g, ch) {
    const ph = (g.tick + ch.phase) % CFG.chompPeriod
    return ph >= CFG.chompWait && ph < CFG.chompWait + CFG.chompDrop + CFG.chompRest
}

function stepGuards(g, dueling) {
    const p = g.p
    for (const gd of g.guards) {
        if (!gd.dead) gd.engaged = dueling && gd.room === g.room && Math.abs(gd.x - p.x) < 8 * T
    }
    // duel etiquette (as in the original): one blade at a time. The closest
    // engaged guard duels — the rest escort, stalk and wait their turn, so two
    // followers corner you without spearing you in the back simultaneously.
    let duelist = null
    {
        let bestD = 1e9
        for (const gd of g.guards) {
            if (gd.dead || !gd.engaged) continue
            const d = Math.abs(gd.x - p.x)
            if (d < bestD - 0.5 || (Math.abs(d - bestD) <= 0.5 && duelist !== null && gd.id < duelist.id)) { bestD = d; duelist = gd }
        }
    }
    for (const gd of g.guards) {
        if (gd.dead) continue
        if (gd.hurtT > 0) gd.hurtT--
        if (gd.recoil > 0) gd.recoil--
        gd.engaged = dueling && gd.room === g.room && Math.abs(gd.x - p.x) < 8 * T
        if (gd.recoil > 0) { gd.anim = 'recoil'; gd.x += sign(gd.x - p.x) * 1.2; gd.cool = Math.max(gd.cool, 20) }
        else if (gd.wind > 0) {
            gd.wind--
            const inHit = gd.wind <= gd.windT - CFG.guardHit0 && gd.wind >= gd.windT - CFG.guardHit1
            if (inHit && Math.abs(gd.x - p.x) <= CFG.reach + 4 && !p.hang) {
                if (p.block) { gd.recoil = CFG.parryStun; gd.wind = 0; g.events.push({ t: g.tick, type: 'parry' }); gd.anim = 'recoil' }
                else if (p.invuln === 0) {
                    p.hp -= 1; p.invuln = 48; p.hurtT = 24
                    p.vx = sign(p.x - gd.x) * 2.5; gd.vx = sign(gd.x - p.x) * 1.2; g.shake = 8
                    g.events.push({ t: g.tick, type: 'hitPlayer' })
                    if (p.hp <= 0) kill(g, 'sword')
                }
            }
            if (gd.wind > 0) gd.anim = 'strike'
            else gd.cool = gd.coolT
        } else if (gd.engaged) {
            gd.dir = sign(p.x - gd.x) || gd.dir
            const close = CFG.reach - 6
            if (gd === duelist && gd.cool <= 0 && !g.guards.some((o) => o !== gd && !o.dead && o.wind > 0)
                && Math.abs(gd.x - p.x) <= CFG.reach + 8 && gd.recoil <= 0) {
                gd.wind = gd.windT; gd.anim = 'wind'
                g.events.push({ t: g.tick, type: 'guardWind', boss: gd.boss })
            } else if (Math.abs(gd.x - p.x) > close) { gd.x += gd.dir * gd.speed; gd.anim = 'advance' }
            else gd.anim = 'ready'
            if (gd.cool > 0) gd.cool--
        } else if (gd.follow) {
            // the prince left its room while you fought — so it escorts you,
            // dashing toward him on its own floor, stopping at a wall or the lip
            // of a shaft (it has no legs for falling). It never leaves the world.
            const spd = Math.min(CFG.run, gd.speed + CFG.escortDash)
            const dirToward = sign(p.x - gd.x) || gd.dir
            const nx = gd.x + dirToward * spd
            const feetRow = Math.floor((gd.y + 2) / T)            // the floor it stands on
            const bodyLow = Math.floor((gd.y - 4) / T)             // lowest body row
            const bodyHigh = Math.floor((gd.y - CFG.PH + 2) / T)  // highest body row
            const edgeCol = Math.floor((nx + CFG.HW * dirToward) / T)
            const bodyBlocked = blocksH(g, cell(g, edgeCol, bodyLow), edgeCol) || blocksH(g, cell(g, edgeCol, bodyHigh), edgeCol)
            const floorAhead = cell(g, edgeCol, feetRow)
            const hasFloor = blocks(g, floorAhead, edgeCol) || floorAhead === PLATFORM || floorAhead === LOOSE || floorAhead === BRIDGE
            if (!bodyBlocked && hasFloor) gd.x = clamp(nx, CFG.HW, (g.level.W - 1) * T)
            gd.dir = dirToward
            gd.anim = 'advance'
            gd.followT++
            const nr = roomOf(Math.floor(gd.x / T))
            if (nr !== gd.room) {
                gd.room = nr
                // its feet cross the threshold behind you — you hear the stone
                g.events.push({ t: g.tick, type: 'doorCross', room: nr, guard: gd.id })
            }
            if (gd.followT > 600) { gd.follow = false; gd.room = gd.homeRoom }
        } else {
            gd.x += gd.dir * 0.5
            if (gd.x < gd.patrol[0] * T) gd.dir = 1
            if (gd.x > gd.patrol[1] * T) gd.dir = -1
            gd.anim = 'patrol'
            if (gd.cool > 0) gd.cool--
        }
        if (!gd.follow) gd.x = clamp(gd.x, gd.patrol[0] * T, gd.patrol[1] * T)

        // the jaws do not care whose feet they close on — a guard that chases
        // you across a trap dies in it, as they do in the original
        if (!gd.dead && Math.floor(gd.y / T) === GROUND) {
            const gc = Math.floor(gd.x / T)
            if (g.chomps.some((ch) => ch.c === gc && chompDown(g, ch))) {
                gd.dead = true; gd.hp = 0
                g.events.push({ t: g.tick, type: 'guardDown', boss: gd.boss })
                continue
            }
        }

        // the prince's strike lands when the sword is out and the guard is close
        if (g.sword && p.atk > 0 && !p.atkHitDone && p.atk <= CFG.strikeDur - CFG.strikeHit0 && p.atk >= CFG.strikeDur - CFG.strikeHit1) {
            if (Math.abs(gd.x - p.x) <= CFG.reach) {
                p.atkHitDone = true
                gd.hp -= 1; gd.hurtT = 24; gd.x += sign(gd.x - p.x) * 8; g.shake = 7
                g.events.push({ t: g.tick, type: 'hit' })
                if (gd.hp <= 0) { gd.dead = true; g.events.push({ t: g.tick, type: 'guardDown', boss: gd.boss }) }
            }
        }
    }
}

function syncRoom(g) {
    const r = clamp(Math.floor(Math.floor(g.p.x / T) / RW), 0, g.level.nRooms - 1)
    if (r !== g.room) {
        const prev = g.room
        g.room = r
        g.events.push({ t: g.tick, type: 'room', room: r })
        // a guard left standing in the room you just walked out of takes up the
        // chase through the doorway behind you (as in the original) — and the
        // chase announces itself: boots you never saw start moving
        for (const gd of g.guards) {
            if (!gd.dead && gd.room === prev && Math.floor(gd.y / T) === GROUND) {
                gd.follow = true; gd.followT = 0
                g.events.push({ t: g.tick, type: 'escort', room: prev, guard: gd.id })
            }
        }
    }
}

export function cloneGame(g) { return JSON.parse(JSON.stringify(g)) }

export function stateHash(g) {
    const p = g.p
    const r3 = (v) => Math.round(v * 1000) / 1000
    return JSON.stringify([
        g.tick, g.clock, g.status, g.levelIndex, g.sword, g.room,
        r3(p.x), r3(p.y), r3(p.vx), r3(p.vy), p.hp, p.maxHP, p.atk, !!p.hang, p.block,
        g.guards.map((gd) => [r3(gd.x), gd.hp, gd.wind, !!gd.recoil, gd.dead]),
        g.pots.map((pt) => [pt.taken, pt.shadowTaken]),
        g.exitOpen, g.gateOpen.map((v) => Math.round(v * 100)),
        Object.keys(g.fallen).sort().join(','),
        g.shadow ? [r3(g.shadow.x), r3(g.shadow.y), g.shadow.hp, g.shadow.dead, !!g.merged] : null,
        g.mouse ? r3(g.mouse.x) : null, g.mirrorUsed,
        Object.keys(g.bridgeSeen).sort().join(','),
    ])
}

export function clockText(g) {
    const s = Math.max(0, Math.ceil(g.clock / 60))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
