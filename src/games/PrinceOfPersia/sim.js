// PRINCE OF PERSIA — the pure deterministic engine. step(state, input) advances
// one 60 Hz tick: weighted run/skid, careful step, speed-scaled jumps, ledge
// hang/climb/shimmy, loose tiles, spike ports + plates, the guillotine, the
// three-height sword duel, potions, hearts, lives and the 60-minute clock.
// No Math.random, no DOM, no audio — the tab paints this, scripts/popcheck.mjs
// audits the very same module.
//
// Coordinates: feet position (x, y) in px; y is the ground line under the
// prince; the body is PH tall, HW wide.

import { makeLevel, W, H, SOLID, PLATFORM, LOOSE, SPIKE, SPIKE_PORTED, GATE, PLATE, EXIT } from './levels.js'

export const CFG = {
    T: 32,
    HW: 9, PH: 44, CH: 26,
    walk: 1.45, run: 2.6, accel: 0.11, runAfter: 26, skid: 0.45, friction: 0.2,
    precise: 0.55,
    g: 0.45, jumpV: 8.6, holdG: 0.22, holdMax: 12, levG: 0.2,
    maxFall: 12, killFallV: 11.3,
    hangHand: 30, climbT: 36, shimmy: 0.9,
    clock: 60 * 60 * 60,
    lives: 3, hearts: 3,
    reach: 46, reachStrong: 58,
    swingTele: 8, swingHit0: 9, swingHit1: 15, swingDur: 24, lunge: 1.7, lungeT: 10,
    guardWind: 16, guardHit0: 12, guardHit1: 18, guardDur: 30, guardCool: 46,
    looseT: 70,
    guillPeriod: 158, guillWait: 92, guillDrop: 34, guillUp: 24,
    slack: false,
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0)
const key = (c, r) => r * W + c

export function makeGame(levelIndex = 0) {
    const g = {
        tick: 0,
        clock: CFG.clock,
        lives: CFG.lives,
        levelIndex,
        status: 'play',
        statusT: 0,
        deathReason: '',
        events: [],
        p: null,
        guards: [],
        pots: [],
        level: null,
        loose: {},
        fallen: {},
        shake: 0,
        prev: { atk: false, jump: false, up: false, down: false },
    }
    loadLevel(g, levelIndex, true)
    return g
}

function freshPrince(g) {
    const s = g.level.start
    return {
        x: (s.c + 0.5) * CFG.T,
        y: (s.r + 1) * CFG.T,
        vx: 0, vy: 0,
        facing: 1,
        dirTicks: 0,
        onGround: false,
        crouch: false,
        hang: null,          // { side: +1 wall on right, c, r }
        climb: 0,
        anim: 'idle', animT: 0,
        hp: CFG.hearts,
        invuln: 0,
        hurtT: 0,
        stance: 1,          // 0 low, 1 middle, 2 high
        atk: 0, atkDir: 1, atkHitDone: false,
        strength: false,
        lev: 0,
        fallFrom: null,
        dieT: 0,
        holdT: 0,
    }
}

function loadLevel(g, i, fresh) {
    g.levelIndex = i
    g.level = makeLevel(i)
    g.loose = {}
    g.fallen = {}
    g.portLatch = false
    g.p = freshPrince(g)
    if (fresh) { g.status = 'play'; g.statusT = 0 }
    g.guards = g.level.guards.map((gd, gi) => ({
        id: gi,
        x: (gd.c + 0.5) * CFG.T,
        y: (gd.r + 1) * CFG.T,
        vx: 0,
        dir: 1,
        hp: CFG.slack ? Math.max(1, gd.hp - 1) : gd.hp,
        maxHp: gd.hp,
        boss: gd.boss,
        patrol: gd.patrol,
        engaged: false,
        stance: 1,
        pat: 0,
        cool: 30,
        wind: 0,
        anim: 'idle', animT: 0,
        hurtT: 0,
        dead: false,
    }))
    g.pots = g.level.pots.map((p) => ({ ...p, taken: false }))
    g.prev = { atk: false, jump: false, up: false, down: false }
}

const cell = (g, c, r) => {
    if (c < 0 || c >= W) return SOLID
    if (r < 0) return 0
    if (r >= H) return SOLID
    return g.level.grid[key(c, r)]
}

export function portOpen(g) {
    if (g.portLatch) return true
    const p = g.p
    const fr = Math.floor((p.y - 1) / CFG.T)
    const pc = Math.floor(p.x / CFG.T)
    const pressed = g.level.plates.some((pl) => pl.c === pc && pl.r === fr)
    if (pressed) g.portLatch = true
    return pressed
}

const solidHere = (g, code) => code === SOLID || (code === GATE && !portOpen(g))

// horizontal move with wall clamp; returns true when blocked on `dir`
function moveX(g, nx) {
    const p = g.p
    const d = sign(nx - p.x)
    if (!d) { p.x = nx; return false }
    const h = p.crouch ? CFG.CH : CFG.PH
    const col = Math.floor((nx + CFG.HW * d) / CFG.T)
    let blocked = false
    for (const yy of [p.y - 4, p.y - h * 0.45, p.y - h + 4]) {
        const r = Math.floor(yy / CFG.T)
        if (solidHere(g, cell(g, col, r))) { blocked = true; break }
    }
    if (blocked) {
        p.x = d > 0 ? col * CFG.T - CFG.HW - 0.01 : (col + 1) * CFG.T + CFG.HW + 0.01
        p.vx = 0
        return true
    }
    p.x = nx
    return false
}

function moveY(g) {
    const p = g.p
    const vyWas = p.vy
    p.vy = clamp(p.vy + (p.lev > 0 ? CFG.levG : CFG.g), -CFG.maxFall, CFG.maxFall)
    const ny = p.y + p.vy
    if (p.vy > 0) {
        const rf = Math.floor(ny / CFG.T)
        const c0 = Math.floor((p.x - CFG.HW + 1) / CFG.T)
        const c1 = Math.floor((p.x + CFG.HW - 1) / CFG.T)
        for (let c = c0; c <= c1; c++) {
            const code = cell(g, c, rf)
            const topEdge = rf * CFG.T
            const solidTop = code === SOLID || code === GATE && !portOpen(g)
            const platTop = (code === PLATFORM || code === LOOSE) && p.y - 1 <= topEdge + 2
            if (solidTop || platTop) {
                p.y = topEdge
                p.vy = 0
                land(g, vyWas)
                return
            }
        }
        p.y = ny
        p.onGround = false
    } else if (p.vy < 0) {
        const h = p.crouch ? CFG.CH : CFG.PH
        const rh = Math.floor((ny - h) / CFG.T)
        const c0 = Math.floor((p.x - CFG.HW + 2) / CFG.T)
        const c1 = Math.floor((p.x + CFG.HW - 2) / CFG.T)
        let bump = false
        for (let c = c0; c <= c1; c++) if (solidHere(g, cell(g, c, rh))) { bump = true; break }
        if (bump) { p.y = (rh + 1) * CFG.T + h; p.vy = 0 } else p.y = ny
    }
}

function land(g, vyWas) {
    const p = g.p
    p.onGround = true
    p.crouch = false
    if (vyWas > CFG.killFallV && p.fallFrom !== null && p.y - p.fallFrom > 4 * CFG.T) {
        kill(g, 'fall')
        return
    }
    if (vyWas > 2 && p.anim !== 'crouch') { p.anim = 'land'; p.animT = 8 }
    p.fallFrom = null
}

function kill(g, why) {
    if (g.status !== 'play') return
    g.lives -= 1
    g.deathReason = why
    g.status = 'dying'
    g.statusT = 0
    g.events.push({ t: g.tick, type: 'die', why })
}

export function step(g, inp = {}) {
    g.tick++
    if (g.shake > 0) g.shake--
    const p = g.p
    if (g.events.length > 400) g.events.splice(0, g.events.length - 400)

    if (g.status === 'dying') {
        p.dieT++
        if (g.statusT++ > 110) {
            if (g.lives <= 0) { g.status = 'lost'; g.events.push({ t: g.tick, type: 'lost' }) }
            else loadLevel(g, g.levelIndex, true)
        }
        return
    }
    if (g.status === 'clear') {
        if (g.statusT++ > 70) {
            const next = g.levelIndex + 1
            if (next >= 5) { g.status = 'win'; g.events.push({ t: g.tick, type: 'win' }) }
            else loadLevel(g, next, true)
        }
        return
    }
    if (g.status !== 'play') return

    g.clock -= 1
    if (g.clock <= 0) { g.clock = 0; kill(g, 'time'); return }

    const left = !!inp.left, right = !!inp.right, up = !!inp.up, down = !!inp.down
    const jump = !!inp.jump, shift = !!inp.shift, atk = !!inp.atk
    const dj = jump && !g.prev.jump
    const dAtk = atk && !g.prev.atk

    const dueling = g.guards.some((gd) => !gd.dead && Math.abs(gd.x - p.x) < 8 * CFG.T && Math.abs(gd.y - p.y) < CFG.T * 2)

    // ---- stance / crouch / climb intent --------------------------------------
    if (p.atk === 0 && !p.hang && !dueling) p.stance = 1
    else if (!p.hang) p.stance = up ? 2 : down ? 0 : p.atk > 0 ? p.stance : 1

    // ---- hanging on a ledge --------------------------------------------------
    if (p.hang) {
        p.vx = 0
        p.vy = 0
        p.anim = 'hang'
        const h = p.hang
        if (up) {
            p.climb++
            p.anim = 'climb'
            if (p.climb > CFG.climbT) {
                p.hang = null; p.climb = 0
                p.y = h.r * CFG.T
                const nx = p.x + h.side * 6
                p.x = clamp(nx, CFG.HW, (W - 1) * CFG.T)
                p.onGround = false
                p.vy = -0.01
                g.events.push({ t: g.tick, type: 'climb' })
                p.noGrabUntil = g.tick + 34
                moveY(g)
            }
        } else if (down) {
            p.hang = null; p.climb = 0
            p.fallFrom = p.y
        } else if (dj) {
            p.hang = null; p.climb = 0
            p.vy = -CFG.jumpV
            p.vx = h.side * 1.4
            p.fallFrom = p.y
            g.events.push({ t: g.tick, type: 'hangjump' })
        } else if (left || right) {
            const d = right ? 1 : -1
            const edgeCol = h.side > 0 ? Math.floor((p.x + CFG.HW + 1) / CFG.T) : Math.floor((p.x - CFG.HW - 1) / CFG.T)
            const below = cell(g, edgeCol, h.r)
            const stillWall = (below === SOLID || below === PLATFORM || below === LOOSE || below === GATE)
            const moveOk = (h.side > 0 && d === 1) || (h.side < 0 && d === -1)
            if (moveOk && stillWall) {
                moveX(g, p.x + d * CFG.shimmy)
                p.anim = 'shimmy'
            } else if (moveOk && !stillWall) {
                p.hang = null; p.fallFrom = p.y
            }
        }
        g.prev = { atk, jump, up, down }
        checkHazards(g)
        return
    }

    // ---- climbing up a low step above the head while grounded --------------
    if (p.climb > 0) {
        p.climb++
        p.anim = 'climb'
        if (p.climb > CFG.climbT) { p.climb = 0; p.onGround = false; p.vy = -0.01 }
        g.prev = { atk, jump, up, down }
        moveY(g)
        return
    }

    // ---- attack ------------------------------------------------------------
    if (dAtk && p.onGround && p.atk === 0) {
        p.atk = CFG.swingDur
        p.atkDir = p.facing
        p.atkHitDone = false
        p.anim = ['attackLow', 'attackMid', 'attackHigh'][p.stance]
        p.animT = CFG.swingDur
        g.events.push({ t: g.tick, type: 'swing', stance: p.stance })
    }

    // ---- horizontal drive ----------------------------------------------------
    const dirIn = (right ? 1 : 0) - (left ? 1 : 0)
    if (p.atk > CFG.swingDur - CFG.lungeT && !p.atkHitDone) p.vx = p.atkDir * CFG.lunge
    if (dirIn !== 0 && p.atk === 0) {
        const braking = sign(p.vx) !== 0 && sign(p.vx) !== dirIn
        p.facing = braking ? p.facing : dirIn
        p.dirTicks++
        const cap = shift ? CFG.precise : p.dirTicks > CFG.runAfter ? CFG.run : CFG.walk
        if (sign(p.vx) !== dirIn && Math.abs(p.vx) > 0.1) p.vx += CFG.skid * dirIn
        else if (Math.abs(p.vx) < cap) p.vx = clamp(p.vx + CFG.accel * dirIn, -CFG.run, CFG.run)
        else if (Math.abs(p.vx) > cap) p.vx = Math.sign(p.vx) * Math.max(cap, Math.abs(p.vx) - CFG.friction)
        // careful step: refuse to walk off an open edge while Shift is held
        if (shift && p.onGround) {
            const ahead = Math.floor((p.x + CFG.HW * 1.2 * dirIn) / CFG.T)
            const fr = Math.floor((p.y - 1) / CFG.T)
            const footAhead = cell(g, ahead, fr)
            const below = cell(g, ahead, fr + 1)
            const openEdge = !solidHere(g, footAhead) && footAhead !== LOOSE && !solidHere(g, below) && below !== LOOSE && below !== PLATFORM
            if (openEdge) p.vx = 0
        }
    } else if (p.atk === 0 || dirIn === 0) {
        p.dirTicks = 0
        if (p.onGround) p.vx = Math.abs(p.vx) < CFG.friction ? 0 : p.vx - CFG.friction * sign(p.vx)
    }
    if (p.atk > 0) p.atk--

    // ---- jump ---------------------------------------------------------------
    if (dj && p.onGround) {
        p.vy = -CFG.jumpV
        p.onGround = false
        p.holdT = CFG.holdMax
        p.fallFrom = p.y
        p.anim = 'jump'
        g.events.push({ t: g.tick, type: 'jump', speed: Math.abs(p.vx) })
    } else if (jump && !p.onGround && p.vy < 0 && p.holdT > 0) {
        p.vy -= CFG.holdG
        p.holdT--
    }

    // ---- crouch while grounded (only when not dueling) ---------------------
    p.crouch = down && p.onGround && !dueling && p.atk === 0
    if (p.crouch) p.anim = 'crouch'

    // ---- integrate -----------------------------------------------------------
    moveX(g, p.x + p.vx)
    p.onGround = false
    moveY(g)

    // ---- grab a ledge while falling -------------------------------------------
    if (!p.onGround && p.vy > 0 && g.tick > (p.noGrabUntil || 0)) {
        const handR = Math.floor((p.y - CFG.hangHand) / CFG.T)
        for (const side of [1, -1]) {
            const col = Math.floor((p.x + (CFG.HW + 2) * side) / CFG.T)
            const code = cell(g, col, handR)
            const codeBelow = cell(g, col, handR + 1)
            const edge = code === SOLID || code === PLATFORM || code === LOOSE
            const under = solidHere(g, codeBelow) || codeBelow === PLATFORM || codeBelow === LOOSE
            if ((edge || under) && p.y > handR * CFG.T + 14 && p.y < (handR + 2) * CFG.T) {
                p.hang = { side, c: col, r: handR }
                p.x = side > 0 ? col * CFG.T - CFG.HW - 0.01 : (col + 1) * CFG.T + CFG.HW + 0.01
                p.vy = 0
                p.climb = 0
                p.anim = 'hang'
                g.events.push({ t: g.tick, type: 'grab' })
                break
            }
        }
    }

    if (p.onGround) {
        if (Math.abs(p.vx) > CFG.walk + 0.4 && p.anim !== 'land') p.anim = 'run'
        else if (Math.abs(p.vx) > 0.2 && p.anim !== 'land') p.anim = 'walk'
        else if (p.anim !== 'land' && p.atk === 0) p.anim = p.crouch ? 'crouch' : 'idle'
        p.animT++
    } else if (p.vy < 0) p.anim = 'jump'
    else if (!p.hang) p.anim = 'fall'

    // ---- loose tiles ----------------------------------------------------------
    const fr = Math.floor((p.y - 1) / CFG.T)
    const fc = Math.floor(p.x / CFG.T)
    if (p.onGround && cell(g, fc, fr + 1) === LOOSE) {
        const k = key(fc, fr + 1)
        if (!(k in g.loose)) g.loose[k] = g.tick
        else if (g.tick - g.loose[k] > CFG.looseT) {
            g.fallen[k] = true
            g.shake = 12
            g.events.push({ t: g.tick, type: 'loose', c: fc, r: fr + 1 })
        }
    }
    for (const k in g.loose) {
        if (g.fallen[k]) continue
        const c = Number(k % W), r = Number((k - c) / W)
        if (g.tick - g.loose[k] > CFG.looseT - 30 && g.tick % 10 === 0) g.shake = Math.max(g.shake, 3)
        if (cell(g, c, r) !== LOOSE) delete g.loose[k]
    }

    // ---- potions --------------------------------------------------------------
    for (const pot of g.pots) {
        if (pot.taken) continue
        if (Math.abs(p.x - (pot.c + 0.5) * CFG.T) < CFG.HW + 8 && fr === pot.r) {
            pot.taken = true
            g.events.push({ t: g.tick, type: 'potion', kind: pot.type })
            if (pot.type === 'L') g.lives = Math.min(5, g.lives + 1)
            else if (pot.type === 'S') p.strength = true
            else if (pot.type === 'V') p.lev = 900
            else if (pot.type === 'X') { kill(g, 'poison'); g.prev = { atk, jump, up, down }; return }
        }
    }

    // ---- pressure plates latch their port open (spikes retract, gates lift) --
    portOpen(g)

    // ---- spikes --------------------------------------------------------------
    checkHazards(g)

    // ---- guillotines -----------------------------------------------------------
    for (const gu of g.level.guills) {
        const ph = g.tick % CFG.guillPeriod
        let topY
        if (ph < CFG.guillWait) topY = gu.rTop * CFG.T
        else if (ph < CFG.guillWait + CFG.guillDrop) topY = gu.rTop * CFG.T + ((ph - CFG.guillWait) / CFG.guillDrop) * (gu.rBot * CFG.T - gu.rTop * CFG.T)
        else if (ph < CFG.guillWait + CFG.guillDrop + 8) topY = gu.rBot * CFG.T
        else topY = gu.rBot * CFG.T - ((ph - CFG.guillWait - CFG.guillDrop - 8) / CFG.guillUp) * (gu.rBot * CFG.T - gu.rTop * CFG.T)
        gu.y = topY
        if (Math.abs(p.x - (gu.c + 0.5) * CFG.T) < CFG.T * 0.7 && p.y > topY && p.y - CFG.PH < topY + CFG.T * 2) kill(g, 'gate')
    }

    // ---- the duel --------------------------------------------------------------
    stepGuards(g, dueling)

    // ---- exit -------------------------------------------------------------------
    if (g.level.exit) {
        const ex = Math.abs(p.x - (g.level.exit.c + 0.5) * CFG.T) < CFG.T * 0.75
        const er = Math.abs(fr - g.level.exit.r) <= 1
        if (ex && er) {
            const bossAlive = g.level.needBoss && g.guards.some((gd) => gd.boss && !gd.dead)
            if (!bossAlive) {
                g.status = 'clear'
                g.statusT = 0
                g.events.push({ t: g.tick, type: 'clear', level: g.levelIndex })
            }
        }
    }

    if (p.invuln > 0) p.invuln--
    if (p.hurtT > 0) p.hurtT--
    if (p.lev > 0) p.lev--
    g.prev = { atk, jump, up, down }
}

function checkHazards(g) {
    const p = g.p
    if (!p.onGround || g.status !== 'play') return
    const fr = Math.floor((p.y - 1) / CFG.T)
    const fc = Math.floor(p.x / CFG.T)
    const code = cell(g, fc, fr)
    if (code === SPIKE) kill(g, 'spikes')
    else if (code === SPIKE_PORTED && !portOpen(g)) kill(g, 'spikes')
}

function stepGuards(g, dueling) {
    const p = g.p
    for (const gd of g.guards) {
        if (gd.dead) continue
        if (gd.hurtT > 0) gd.hurtT--
        gd.engaged = dueling && Math.abs(gd.x - p.x) < 8 * CFG.T
        if (gd.wind > 0) {
            gd.wind--
            if (gd.wind <= 0) gd.cool = gd.boss ? 28 : CFG.guardCool
            const inHit = gd.wind <= CFG.guardDur - CFG.guardHit0 && gd.wind >= CFG.guardDur - CFG.guardHit1
            if (inHit) {
                const reach = gd.boss ? CFG.reach + 6 : CFG.reach
                if (Math.abs(gd.x - p.x) <= reach && !p.hang) {
                    if (p.stance !== gd.stance && p.invuln === 0) {
                        p.hp -= 1
                        p.invuln = 45
                        p.hurtT = 24
                        p.vx = sign(p.x - gd.x) * 2.5
                        gd.vx = sign(gd.x - p.x) * 1.2
                        g.shake = 8
                        g.events.push({ t: g.tick, type: 'hitPlayer', stance: gd.stance })
                        if (p.hp <= 0) { g.lives -= 1; g.deathReason = 'sword'; g.status = 'dying'; g.statusT = 0; g.events.push({ t: g.tick, type: 'die', why: 'sword' }) }
                    } else if (p.stance === gd.stance) {
                        gd.hurtT = 12
                        g.events.push({ t: g.tick, type: 'parry' })
                    }
                }
            }
            gd.anim = 'strike'
        } else if (gd.engaged) {
            gd.dir = sign(p.x - gd.x) || gd.dir
            const reach = gd.boss ? CFG.reach + 6 : CFG.reach
            if (gd.cool <= 0 && Math.abs(gd.x - p.x) <= reach + 10 && !p.hang) {
                gd.pat = (gd.pat + 1) % 3
                gd.stance = [1, 2, 0][gd.pat]
                gd.wind = gd.boss ? CFG.guardWind - 4 : CFG.guardWind
                gd.anim = 'wind'
                g.events.push({ t: g.tick, type: 'guardWind', stance: gd.stance, boss: gd.boss })
            } else if (Math.abs(gd.x - p.x) > reach - 8) {
                gd.x += gd.dir * (gd.boss ? 1.7 : 1.5)
                gd.anim = 'advance'
            } else gd.anim = 'ready'
            gd.cool--
        } else {
            gd.x += gd.dir * 0.55
            if (gd.x < gd.patrol[0] * CFG.T) gd.dir = 1
            if (gd.x > (gd.patrol[1] + 1) * CFG.T) gd.dir = -1
            gd.anim = 'patrol'
            if (gd.cool > 0) gd.cool--
        }
        gd.x = clamp(gd.x, CFG.HW, (W - 1) * CFG.T)

        // player swing resolution
        if (p.atk > 0 && !p.atkHitDone && p.atk <= CFG.swingDur - CFG.swingHit0 && p.atk >= CFG.swingDur - CFG.swingHit1) {
            const reach = p.strength ? CFG.reachStrong : CFG.reach
            if (Math.abs(gd.x - p.x) <= reach) {
                p.atkHitDone = true
                if (gd.stance !== p.stance) {
                    gd.hp -= 1
                    gd.hurtT = 26
                    gd.vx = sign(gd.x - p.x) * 2
                    gd.x += sign(gd.x - p.x) * 10
                    g.shake = 7
                    g.events.push({ t: g.tick, type: 'hit', stance: p.stance })
                    if (gd.hp <= 0) {
                        gd.dead = true
                        g.events.push({ t: g.tick, type: 'guardDown', boss: gd.boss })
                    }
                } else {
                    gd.hurtT = 12
                    g.events.push({ t: g.tick, type: 'parry' })
                }
            }
        }
    }
}

export function cloneGame(g) {
    return JSON.parse(JSON.stringify(g))
}

export function stateHash(g) {
    const p = g.p
    const r3 = (v) => Math.round(v * 1000) / 1000
    return JSON.stringify([
        g.tick, g.clock, g.status, g.levelIndex, g.lives,
        r3(p.x), r3(p.y), r3(p.vx), r3(p.vy), p.hp, p.stance, p.atk, !!p.hang,
        g.guards.map((gd) => [r3(gd.x), gd.hp, gd.stance, gd.wind, gd.dead]),
        Object.keys(g.fallen).sort().join(','),
        g.pots.map((pt) => pt.taken),
    ])
}

// seconds remaining as m:ss
export function clockText(g) {
    const s = Math.max(0, Math.ceil(g.clock / 60))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
