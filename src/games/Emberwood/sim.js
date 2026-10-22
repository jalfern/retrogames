// EMBERWOOD — pure deterministic simulation. No DOM, no THREE, no Math.random.
// All randomness flows from the seed (mulberry32). The renderer, the contract,
// the attract bot and the Node harness all drive THIS module.
//
// pad input (computed by the shell from keys/contract pad):
//   { lx, ly, aHeld, aPressed, aReleased, bPressed, cPressed }
// Units: world px; TS=16 tiles; screens 16x11 tiles.

import { SCREENS, TS, SW, SH, tileAt, isSolidTile, SHOP } from './world.js'

const FIXED = 1000 / 60

export function mulberry32(seed) {
    let a = seed >>> 0
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const ENEMY_SPEC = {
    cinderling: { hp: 2, w: 11, h: 11, dmg: 1 },
    bat: { hp: 1, w: 10, h: 8, dmg: 1 },
    spitter: { hp: 2, w: 12, h: 12, dmg: 1 },
    husk: { hp: 3, w: 13, h: 13, dmg: 1 },
    wisp: { hp: 1, w: 10, h: 10, dmg: 1, phase: true },
    sprig: { hp: 1, w: 10, h: 10, dmg: 1 },
    maw: { hp: 8, w: 26, h: 26, dmg: 1, boss: 1 },
    wyrm: { hp: 6, w: 22, h: 22, dmg: 1, boss: 2 },
}

const HERO = { w: 10, h: 8, speed: 1.45 }

const tileOf = (v) => Math.floor(v / TS)

export function createSim(seed = 1) {
    const sim = {
        tick: 0,
        seed: seed >>> 0,
        rng: mulberry32(seed >>> 0),
        screen: 'ow-11',
        hero: { x: 5 * TS + 8, y: 6 * TS + 6, dir: 'up', hp: 3, max: 3, inv: 0, hurt: 0 },
        items: { sword: true, bow: false, shield: false, bombs: 0, arrows: 0, potions: 0, keys: 0, bigkey: false },
        score: 0,
        swing: 0, swingDir: 'down', swingId: 0, cool: 0, holdT: 0, drawing: false,
        bombCool: 0,
        hitStop: 0,        // frozen frames after a kill / blast (hit-stop for weight)
        shop: { open: false, sel: 0 },
        paused: false,
        death: false, deathT: 0, win: false,
        enemies: [], projectiles: [], bombs: [], drops: [], blocks: [],
        fx: [],
        msg: null, msgT: 0,
        cut: {},           // 'scr:x,y' tall grass permanently cut
        flags: {
            cracked: {}, doorsOpen: {}, switchesOn: {}, chestsOpen: {},
            killed: {}, boss1: false, boss2: false,
        },
        roomName: '', nameT: 0,
        lastDungeonEntry: {}, // dungeon id -> overworld screen+pos
    }
    spawnRoom(sim, 'ow-11', null)
    return sim
}

const scr = (sim) => SCREENS[sim.screen]

function say(sim, text, t = 180) { sim.msg = text; sim.msgT = t }

function emit(sim, k, x, y, extra) { sim.fx.push({ k, x, y, ...(extra || {}) }) }

function blocked(sim, x, y, w, h, phase) {
    if (phase) return false
    const s = scr(sim)
    const x0 = tileOf(x - w / 2), x1 = tileOf(x + w / 2 - 0.001)
    const y0 = tileOf(y - h / 2), y1 = tileOf(y + h / 2 - 0.001)
    for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
            let ch = tileAt(s, tx, ty)
            if (ch === 'C') { if (!sim.flags.cracked[crackAt(s, tx, ty)?.id]) return true }
            else if (isSolidTile(ch)) return true
            else if (ch === '.') {
                const d = doorAt(s, tx, ty)
                if (d && !doorOpen(sim, d)) return true
                const c = chestAt(sim, tx, ty)
                if (c) return true
                if (sim.blocks.some(b => b.x === tx && b.y === ty)) return true
            }
        }
    }
    return false
}

const crackAt = (s, tx, ty) => (s.cracks || []).find(c => c.x === tx && c.y === ty)
const doorAt = (s, tx, ty) => (s.doors || []).find(d => d.x === tx && d.y === ty)
const chestAt = (sim, tx, ty) => (scr(sim).chests || []).find(c => c.x === tx && c.y === ty && !sim.flags.chestsOpen[c.id] && (!c.after || sim.flags[c.after]))
const plateAt = (s, tx, ty) => (s.plates || []).find(p => p.x === tx && p.y === ty)
const npcAt = (s, tx, ty) => (s.npcs || []).find(n => n.x === tx && n.y === ty)
const warpAt = (s, tx, ty) => (s.warps || []).find(w => w.x === tx && w.y === ty)

export function doorOpen(sim, d) {
    if (d.kind === 'switch') return !!sim.flags.switchesOn[d.switch] || !!sim.flags.doorsOpen[d.id]
    return !!sim.flags.doorsOpen[d.id]
}

export function spawnRoom(sim, id, entry) {
    const s = SCREENS[id]
    sim.screen = id
    sim.enemies = (s.enemies || []).map(e => makeEnemy(e))
    sim.projectiles = []
    sim.bombs = []
    sim.drops = []
    sim.blocks = (s.blocks || []).map(b => ({ id: b.id, x: b.x, y: b.y, cool: 0 }))
    // push blocks may be defined via meta blocks[]; default from 'x' tiles? blocks live in meta only.
    const sp = entry || s.spawn || [5, 6]
    sim.hero.x = sp[0] * TS + TS / 2
    sim.hero.y = sp[1] * TS + TS / 2 + 4
    sim.roomName = s.name
    sim.nameT = 140
    sim.swing = 0; sim.drawing = false; sim.holdT = 0
    sim.shop.open = false
}

function makeEnemy(e) {
    const spec = ENEMY_SPEC[e.type]
    return {
        type: e.type, i: e.i, drop: e.drop || null, boss: e.boss || 0,
        x: e.x * TS + TS / 2, y: e.y * TS + TS / 2 + 2,
        hp: spec.hp, w: spec.w, h: spec.h, dmg: spec.dmg,
        t: 0, st: 0, vx: 0, vy: 0, hitT: 0, open: 0, stagger: 0, hidden: e.type === 'sprig',
        fx: 0, fy: 1, seedOff: (e.i || 0) * 37 + 11, dead: false,
        seg: [],
    }
}

// deterministic per-enemy pseudo random from tick + id
function moveEnemy(sim, e, dx, dy, speed) {
    const len = Math.hypot(dx, dy) || 1
    const vx = (dx / len) * speed
    const vy = (dy / len) * speed
    e.fx = dx / len; e.fy = dy / len
    const spec = ENEMY_SPEC[e.type]
    if (!blocked(sim, e.x + vx, e.y, spec.w, spec.h, spec.phase)) e.x += vx
    if (!blocked(sim, e.x, e.y + vy, spec.w, spec.h, spec.phase)) e.y += vy
    e.x = Math.max(TS, Math.min(SW * TS - TS, e.x))
    e.y = Math.max(TS, Math.min(SH * TS - TS, e.y))
}

const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

export function stepSim(sim, inp) {
    sim.tick++
    if (sim.hitStop > 0) { sim.hitStop--; return sim }
    if (sim.msgT > 0) sim.msgT--
    if (sim.nameT > 0) sim.nameT--
    if (sim.fx.length > 400) sim.fx.splice(0, sim.fx.length - 400)

    if (sim.death) {
        sim.deathT++
        if (sim.deathT > 90 && inp.aPressed) revive(sim)
        drainFxKeeps(sim, ['text'])
        return sim
    }
    if (sim.win) return sim

    if (sim.shop.open) { stepShop(sim, inp); stepPickups(sim); return sim }

    const h = sim.hero
    if (h.inv > 0) h.inv--
    if (h.hurt > 0) h.hurt--
    if (sim.cool > 0) sim.cool--
    if (sim.bombCool > 0) sim.bombCool--

    // ---- movement ----
    let lx = inp.lx, ly = inp.ly
    if (Math.abs(lx) < 0.15) lx = 0
    if (Math.abs(ly) < 0.15) ly = 0
    const moving = lx !== 0 || ly !== 0
    sim.moving = moving
    if (moving) {
        const len = Math.hypot(lx, ly)
        const vx = (lx / len) * HERO.speed
        const vy = (ly / len) * HERO.speed
        if (!blocked(sim, h.x + vx, h.y, HERO.w, HERO.h)) h.x += vx
        if (!blocked(sim, h.x, h.y + vy, HERO.w, HERO.h)) h.y += vy
        if (Math.abs(lx) >= Math.abs(ly)) h.dir = lx > 0 ? 'right' : 'left'
        else h.dir = ly > 0 ? 'down' : 'up'
        tryPush(sim, lx, ly)
    }

    // ---- A: tap=sword/interact, hold=draw bow ----
    if (inp.aPressed) { sim.holdT = 1 } else if (inp.aHeld && sim.holdT > 0) {
        sim.holdT++
        if (sim.holdT === 12) {
            if (sim.items.bow && sim.items.arrows > 0) { sim.drawing = true; emit(sim, 'draw', h.x, h.y) }
            else say(sim, 'THE BOW NEEDS ARROWS', 90)
        }
    } else if (inp.aReleased) {
        if (sim.drawing) { fireArrow(sim) }
        else if (sim.cool === 0) { primaryAction(sim) }
        sim.holdT = 0; sim.drawing = false
    }

    // ---- sword active ----
    if (sim.swing > 0) {
        sim.swing--
        swordHits(sim)
    }

    // ---- B: bomb ----
    if (inp.bPressed && sim.items.bombs > 0 && sim.bombCool === 0) {
        sim.items.bombs--
        sim.bombCool = 30
        sim.bombs.push({ x: h.x, y: h.y + 4, fuse: 70 })
        emit(sim, 'placebomb', h.x, h.y)
    }

    // ---- C: potion ----
    if (inp.cPressed && sim.items.potions > 0 && h.hp < h.max) {
        sim.items.potions--; h.hp = h.max
        emit(sim, 'potion', h.x, h.y)
    }

    stepBombs(sim)
    stepProjectiles(sim)
    stepEnemies(sim)
    stepPickups(sim)
    checkTransitions(sim)

    if (h.hp <= 0) {
        h.hp = 0; sim.death = true; sim.deathT = 0
        emit(sim, 'heroDeath', h.x, h.y)
    }
    return sim
}

function drainFxKeeps(sim) { sim.fx.length = 0 }

function primaryAction(sim) {
    const h = sim.hero
    const [dvx, dvy] = DIRV[h.dir]
    const tx = tileOf(h.x + dvx * (TS * 0.9))
    const ty = tileOf(h.y + dvy * (TS * 0.9))
    const s = scr(sim)
    const npc = npcAt(s, tx, ty)
    if (npc) {
        if (npc.kind === 'shop') { sim.shop.open = true; sim.shop.sel = 0; emit(sim, 'ui', 0, 0) }
        else say(sim, npc.msg, 320)
        return
    }
    const chest = chestAt(sim, tx, ty) || chestAt(sim, tileOf(h.x), tileOf(h.y) + (dvy !== 0 ? dvy : 0))
    if (chest && Math.hypot(chest.x * TS + 8 - h.x, chest.y * TS + 8 - h.y) < TS * 1.8) { openChest(sim, chest); return }
    const d = doorAt(s, tx, ty)
    if (d && !doorOpen(sim, d)) { tryDoor(sim, d); return }
    // otherwise: swing sword
    if (sim.cool === 0) {
        sim.swing = 10; sim.cool = 16; sim.swingDir = h.dir; sim.swingId++
        emit(sim, 'sword', h.x, h.y, { dir: h.dir })
    }
}

function tryDoor(sim, d) {
    if (d.kind === 'key') {
        if (sim.items.keys > 0) {
            sim.items.keys--; sim.flags.doorsOpen[d.id] = true
            emit(sim, 'unlock', d.x * TS + 8, d.y * TS + 8)
        } else say(sim, 'A LOCKED DOOR — YOU NEED A KEY', 120)
    } else if (d.kind === 'bigkey') {
        if (sim.items.bigkey) {
            sim.flags.doorsOpen[d.id] = true
            emit(sim, 'unlock', d.x * TS + 8, d.y * TS + 8)
        } else say(sim, 'A MOSSY DOOR — A GREATER KEY LURKS NEARBY', 140)
    }
}

function openChest(sim, c) {
    sim.flags.chestsOpen[c.id] = true
    grant(sim, c.item)
    emit(sim, 'chest', c.x * TS + 8, c.y * TS + 8)
}

function grant(sim, item) {
    const h = sim.hero
    if (item === 'key') sim.items.keys++
    else if (item === 'bigkey') sim.items.bigkey = true
    else if (item === 'heart') { h.max++; h.hp = h.max; say(sim, 'HEART CONTAINER — HEART UP!', 160) }
    else if (item === 'emberheart') { h.max += 2; h.hp = h.max; sim.win = true; say(sim, 'THE EMBER HEART — THE WOOD IS SAFE', 600) }
    else if (item === 'bow') { sim.items.bow = true; sim.items.arrows += 10; say(sim, 'THE ELDER BOW! HOLD A TO DRAW, RELEASE TO LOOSE', 240) }
    else if (item === 'arrows') sim.items.arrows += 10
    else if (item === 'shield') sim.items.shield = true
    else if (item === 'potion') sim.items.potions++
    else if (item === 'bombs') sim.items.bombs += 1
    emit(sim, 'grant', h.x, h.y, { item })
}

function fireArrow(sim) {
    if (!(sim.items.bow && sim.items.arrows > 0)) return
    sim.items.arrows--
    const [dx, dy] = DIRV[sim.hero.dir]
    sim.projectiles.push({ kind: 'arrow', x: sim.hero.x + dx * 8, y: sim.hero.y + dy * 8, vx: dx * 3.2, vy: dy * 3.2 })
    emit(sim, 'shoot', sim.hero.x, sim.hero.y)
}

function swordHits(sim) {
    const [dx, dy] = DIRV[sim.swingDir]
    const hx = sim.hero.x + dx * 13, hy = sim.hero.y + dy * 13
    const hw = dx !== 0 ? 14 : 16, hh = dy !== 0 ? 14 : 16
    // cut tall grass under the arc
    const s = scr(sim)
    for (let ty = tileOf(hy - hh / 2); ty <= tileOf(hy + hh / 2); ty++) {
        for (let tx = tileOf(hx - hw / 2); tx <= tileOf(hx + hw / 2); tx++) {
            if (tileAt(s, tx, ty) === '"') {
                const key = `${sim.screen}:${tx},${ty}`
                if (!sim.cut[key]) {
                    sim.cut[key] = true
                    emit(sim, 'cut', tx * TS + 8, ty * TS + 8)
                    const r = sim.rng()
                    if (r < 0.3) spawnDrop(sim, tx * TS + 8, ty * TS + 8, 'ember')
                    else if (r < 0.38) spawnDrop(sim, tx * TS + 8, ty * TS + 8, 'heart')
                }
            }
        }
    }
    for (const e of sim.enemies) {
        if (e.dead || e.hidden || e.hitSwing === sim.swingId) continue
        if (Math.abs(e.x - hx) < (hw + e.w) / 2 && Math.abs(e.y - hy) < (hh + e.h) / 2) {
            e.hitSwing = sim.swingId
            hurtEnemy(sim, e, 1, dx, dy)
        }
    }
}

function hurtEnemy(sim, e, dmg, dx, dy) {
    if (e.type === 'husk') {
        // front armor: hit from the direction it faces is deflected
        const toward = (dx * -e.fx) + (dy * -e.fy) // attacker approaching from front?
        if (toward > 0.5) { emit(sim, 'clank', e.x, e.y); say(sim, 'THE HUSK\u2019S FRONT DEFLECTS STEEL', 90); return }
    }
    if (e.type === 'maw' && e.open <= 0) { emit(sim, 'clank', e.x, e.y); return }
    if (e.type === 'wyrm' && e.stagger <= 0) { emit(sim, 'clank', e.x, e.y); say(sim, 'THE SCALECLOAK SHRUGS IT OFF — USE ARROWS!', 120); return }
    e.hp -= dmg
    e.hitT = 8
    if (e.stagger > 0 && e.hp <= 0) e.stagger = 0
    e.x += dx * 5; e.y += dy * 5
    emit(sim, 'hit', e.x, e.y)
    if (e.hp <= 0) killEnemy(sim, e)
}

function killEnemy(sim, e) {
    e.dead = true
    sim.hitStop = Math.max(sim.hitStop, e.boss ? 6 : 3)
    emit(sim, 'die', e.x, e.y, { type: e.type, boss: e.boss })
    const wasKey = e.drop === 'key' && !sim.flags.killed[`${sim.screen}:${e.i}`]
    sim.flags.killed[`${sim.screen}:${e.i}`] = true
    if (wasKey) spawnDrop(sim, e.x, e.y, 'key')
    else if (e.boss) {
        if (e.boss === 1) { sim.flags.boss1 = true; say(sim, 'THE BRAMBLE MAW FALLS', 200) }
        if (e.boss === 2) { sim.flags.boss2 = true; say(sim, 'THE CINDER WYRM BREAKS INTO EMBERS', 240) }
        spawnDrop(sim, e.x, e.y, 'heart'); spawnDrop(sim, e.x + 8, e.y + 4, 'heart')
    } else {
        const r = sim.rng()
        if (r < 0.45) spawnDrop(sim, e.x, e.y, 'ember')
        else if (r < 0.6) spawnDrop(sim, e.x, e.y, 'heart')
    }
}

function spawnDrop(sim, x, y, kind) {
    sim.drops.push({ kind, x, y, t: 0 })
}

function stepPickups(sim) {
    const h = sim.hero
    for (let i = sim.drops.length - 1; i >= 0; i--) {
        const p = sim.drops[i]
        p.t++
        const dx = h.x - p.x, dy = h.y - p.y
        const d2 = dx * dx + dy * dy
        if (d2 < 20 * 20) { p.x += dx * 0.18; p.y += dy * 0.18 }
        if (d2 < 8 * 8) {
            if (p.kind === 'ember') { sim.score += 1; sim.items._e = (sim.items._e || 0) + 1; emit(sim, 'coin', p.x, p.y) }
            else if (p.kind === 'heart') { h.hp = Math.min(h.max, h.hp + 1); emit(sim, 'heart', p.x, p.y) }
            else if (p.kind === 'key') { sim.items.keys++; emit(sim, 'key', p.x, p.y) }
            sim.drops.splice(i, 1)
        }
    }
}

// embers double as currency: score IS embers.
export const embersOf = (sim) => sim.score

function stepProjectiles(sim) {
    const s = scr(sim)
    for (let i = sim.projectiles.length - 1; i >= 0; i--) {
        const p = sim.projectiles[i]
        p.x += p.vx; p.y += p.vy
        const tx = tileOf(p.x), ty = tileOf(p.y)
        const sw = (s.switches || []).find(w => w.x === tx && w.y === ty)
        if (sw) {
            if (!sim.flags.switchesOn[sw.id]) {
                sim.flags.switchesOn[sw.id] = true
                if (sw.opens) sim.flags.doorsOpen[sw.opens] = true
                emit(sim, 'switch', p.x, p.y)
                say(sim, 'A MECHANISM GRINDS OPEN', 120)
            }
            sim.projectiles.splice(i, 1); continue
        }
        if (tileAt(s, tx, ty) === '#' || tileAt(s, tx, ty) === 'C' || isSolidTile(tileAt(s, tx, ty))) {
            emit(sim, 'thunk', p.x, p.y)
            sim.projectiles.splice(i, 1); continue
        }
        if (p.kind === 'arrow') {
            let gone = false
            for (const e of sim.enemies) {
                if (e.dead || e.hidden) continue
                if (e.type === 'wyrm') {
                    if (e.open > 0 && Math.hypot(e.x - p.x, e.y - p.y) < 14) {
                        e.stagger = 110; e.open = 0
                        emit(sim, 'stagger', e.x, e.y)
                        say(sim, 'THE WYRM STAGGERS — ITS CORE IS BARE!', 140)
                        gone = true; break
                    }
                    continue
                }
                if (e.type === 'husk') {
                    const fromFront = (p.vx * e.fx + p.vy * e.fy) > 0
                    if (fromFront && Math.hypot(e.x - p.x, e.y - p.y) < 12) { emit(sim, 'clank', e.x, e.y); gone = true; break }
                }
                if (Math.abs(e.x - p.x) < (e.w + 4) / 2 && Math.abs(e.y - p.y) < (e.h + 4) / 2) {
                    const dx = Math.sign(p.vx) || 0, dy = Math.sign(p.vy) || 0
                    hurtEnemy(sim, e, 1, dx, dy)
                    gone = true; break
                }
            }
            if (gone) { sim.projectiles.splice(i, 1); continue }
        } else {
            // enemy orb — shield blocks from the front
            const h = sim.hero
            if (Math.hypot(h.x - p.x, h.y - p.y) < 9) {
                if (sim.items.shield) {
                    const [dx, dy] = DIRV[h.dir]
                    if (p.vx * -dx + p.vy * -dy < 0) { emit(sim, 'clank', p.x, p.y); sim.projectiles.splice(i, 1); continue }
                }
                hurtHero(sim, 1)
                sim.projectiles.splice(i, 1); continue
            }
        }
        if (p.x < 0 || p.y < 0 || p.x >= SW * TS || p.y >= SH * TS) sim.projectiles.splice(i, 1)
    }
}

function stepBombs(sim) {
    const s = scr(sim)
    for (let i = sim.bombs.length - 1; i >= 0; i--) {
        const b = sim.bombs[i]
        b.fuse--
        if (b.fuse > 0) continue
        sim.bombs.splice(i, 1)
        emit(sim, 'boom', b.x, b.y)
        sim.hitStop = Math.max(sim.hitStop, 4)
        for (let ty = tileOf(b.y - 24); ty <= tileOf(b.y + 24); ty++) {
            for (let tx = tileOf(b.x - 24); tx <= tileOf(b.x + 24); tx++) {
                if (Math.hypot(tx * TS + 8 - b.x, ty * TS + 8 - b.y) > 28) continue
                const c = crackAt(s, tx, ty)
                if (c && !sim.flags.cracked[c.id]) {
                    sim.flags.cracked[c.id] = true
                    emit(sim, 'crack', tx * TS + 8, ty * TS + 8)
                    if (c.reveal === 'embers') { for (let k = 0; k < c.amount; k++) spawnDrop(sim, tx * TS + 8, ty * TS + 8, 'ember') }
                    else if (c.reveal === 'bow') grant(sim, 'bow')
                    else if (c.reveal === 'heart') grant(sim, 'heart')
                    else if (c.reveal === 'arrows') grant(sim, 'arrows')
                }
            }
        }
        for (const e of sim.enemies) {
            if (e.dead || e.hidden) continue
            if (Math.hypot(e.x - b.x, e.y - b.y) < 30) {
                const dx = Math.sign(e.x - b.x) || 1, dy = Math.sign(e.y - b.y)
                hurtEnemy(sim, e, e.boss ? 2 : 3, dx, dy)
            }
        }
    }
}

function tryPush(sim, lx, ly) {
    const dx = Math.sign(lx), dy = Math.sign(ly)
    const hx = sim.hero.x + dx * 8, hy = sim.hero.y + dy * 8
    const tx = tileOf(hx + dx * 4), ty = tileOf(hy + dy * 4)
    for (const b of sim.blocks) {
        if (b.cool > 0) { b.cool--; continue }
        if (b.x === tx && b.y === ty) {
            const nx = b.x + dx, ny = b.y + dy
            const s = scr(sim)
            const ch = tileAt(s, nx, ny)
            const free = ch === '.' && !doorAt(s, nx, ny) && !chestAt(sim, nx, ny) && !blocked(sim, nx * TS + 8, ny * TS + 8 + 4, HERO.w, HERO.h)
            if (free) {
                b.x = nx; b.y = ny; b.cool = 8
                emit(sim, 'push', nx * TS + 8, ny * TS + 8)
                const plate = plateAt(s, nx, ny)
                if (plate && !sim.flags.switchesOn[plate.id]) {
                    sim.flags.switchesOn[plate.id] = true
                    if (plate.opens) sim.flags.doorsOpen[plate.opens] = true
                    emit(sim, 'switch', nx * TS + 8, ny * TS + 8)
                    say(sim, 'A MECHANISM GRINDS OPEN', 120)
                }
            }
        }
    }
    for (const b of sim.blocks) if (b.cool > 0) b.cool = Math.max(0, b.cool - 1)
}

function hurtHero(sim, dmg) {
    const h = sim.hero
    if (h.inv > 0) return
    h.inv = 45; h.hurt = 12
    h.hp -= dmg
    emit(sim, 'hurt', h.x, h.y)
}

function stepEnemies(sim) {
    const h = sim.hero
    for (const e of sim.enemies) {
        if (e.dead) continue
        e.t++
        if (e.hitT > 0) { e.hitT--; continue }
        const dx = h.x - e.x, dy = h.y - e.y
        const dist = Math.hypot(dx, dy)

        switch (e.type) {
            case 'cinderling':
                moveEnemy(sim, e, dx, dy, 0.55 + 0.15 * Math.sin((e.t + e.seedOff) * 0.12))
                break
            case 'bat': {
                const phase = (e.t + e.seedOff) % 75
                if (phase < 45) { e.vx = 0; e.vy = 0 }
                else if (phase === 45) { const l = dist || 1; e.vx = dx / l; e.vy = dy / l }
                else { e.x += e.vx * 1.15; e.y += e.vy * 1.15 + Math.sin(e.t * 0.5) * 0.6; if (blocked(sim, e.x, e.y, e.w, e.h)) { e.x -= e.vx * 1.15; e.vy = 0 } }
                break
            }
            case 'spitter':
                if (dist > 80) moveEnemy(sim, e, dx, dy, 0.5)
                else if (dist < 52) moveEnemy(sim, e, -dx, -dy, 0.55)
                if ((e.t + e.seedOff) % 100 === 0 && dist < 120) {
                    const ax = Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0
                    const ay = ax === 0 ? Math.sign(dy) : 0
                    sim.projectiles.push({ kind: 'orb', x: e.x, y: e.y, vx: ax * 1.35, vy: ay * 1.35 })
                    emit(sim, 'spit', e.x, e.y)
                }
                break
            case 'husk': {
                const l = dist || 1
                e.fx = dx / l; e.fy = dy / l
                if (dist > 20) moveEnemy(sim, e, dx, dy, 0.5)
                break
            }
            case 'wisp':
                moveEnemy(sim, e, dx, dy, 0.6 + 0.2 * Math.sin(e.t * 0.2))
                break
            case 'sprig':
                if (e.hidden) { if (dist < 34) { e.hidden = false; e.st = 14; emit(sim, 'pop', e.x, e.y) } }
                else if (e.st > 0) e.st--
                else if (e.st === 0 && e.t % 90 < 28) moveEnemy(sim, e, dx, dy, 1.7)
                else if (e.t % 90 >= 28 && dist < 34) { e.st = 10 }
                break
            case 'maw': {
                const cyc = (e.t + e.seedOff) % 220
                e.open = cyc < 80 ? 1 : 0
                const sp = e.open ? 0.35 : 1.25
                if (e.vx === 0 && e.vy === 0) { e.vx = 1; e.vy = 0.8 }
                let nx = e.x + e.vx * sp, ny = e.y + e.vy * sp
                if (blocked(sim, nx, e.y, e.w, e.h)) e.vx = -e.vx
                if (blocked(sim, e.x, ny, e.w, e.h)) e.vy = -e.vy
                if (!blocked(sim, e.x + e.vx * sp, e.y + e.vy * sp, e.w, e.h)) { e.x += e.vx * sp; e.y += e.vy * sp }
                break
            }
            case 'wyrm': {
                e.seg.unshift({ x: e.x, y: e.y })
                if (e.seg.length > 60) e.seg.pop()
                const cyc = (e.t + e.seedOff) % 300
                e.open = cyc >= 200 && e.stagger <= 0 ? 1 : 0
                if (e.stagger > 0) { e.stagger-- }
                else {
                    const chase = Math.sin(e.t * 0.02) * 0.5 + 0.5
                    const wob = Math.sin(e.t * 0.05)
                    const spd = 0.85
                    moveEnemy(sim, e, dx / (dist || 1) * chase + wob * 0.8, dy / (dist || 1) * chase + Math.cos(e.t * 0.05) * 0.8, spd)
                }
                break
            }
        }

        // contact damage
        if (!e.hidden && Math.abs(h.x - e.x) < (HERO.w + e.w) / 2 && Math.abs(h.y - e.y) < (HERO.h + e.h) / 2 + 2) {
            hurtHero(sim, e.dmg)
            const l = Math.hypot(dx, dy) || 1
            h.x += (dx / l) * 7; h.y += (dy / l) * 7
        }
    }
    if (sim.tick % 30 === 0) sim.enemies = sim.enemies.filter(e => !e.dead)
}

function checkTransitions(sim) {
    const s = scr(sim)
    const h = sim.hero
    // warp tiles (stairs / portals)
    const tx = tileOf(h.x), ty = tileOf(h.y)
    const w = warpAt(s, tx, ty)
    if (w) {
        const dId = w.to.startsWith('d') ? w.to.slice(0, 4) : null
        if (dId) sim.lastDungeonEntry[dId] = { screen: sim.screen, x: h.x, y: h.y }
        spawnRoom(sim, w.to, [w.sx, w.sy])
        emit(sim, 'warp', h.x, h.y)
        return
    }
    // edge exits
    const cx = tileOf(h.x), cy = tileOf(h.y)
    let ex = null
    if (cy < 0 || h.y < 2) ex = s.exits?.n
    else if (cy >= SH || h.y > SH * TS - 2) ex = s.exits?.s
    else if (cx < 0 || h.x < 2) ex = s.exits?.w
    else if (cx >= SW || h.x > SW * TS - 2) ex = s.exits?.e
    if (ex) {
        const to = SCREENS[ex.to]
        spawnRoom(sim, ex.to, null)
        sim.hero.x = ex.x * TS + TS / 2
        sim.hero.y = ex.y * TS + TS / 2 + 4
        // keep hero just inside the new screen
        if (ex.y === 0) sim.hero.y = TS + 6
        if (ex.y === SH - 1) sim.hero.y = (SH - 1) * TS - 4
        if (ex.x === 0) sim.hero.x = TS + 4
        if (ex.x === SW - 1) sim.hero.x = (SW - 1) * TS - 4
        emit(sim, 'warp', sim.hero.x, sim.hero.y)
        void to
    }
}

function revive(sim) {
    sim.death = false
    sim.hero.hp = Math.min(sim.hero.max, 3)
    const m = /^d2-/.test(sim.screen) ? 'd2-f0' : /^d1-/.test(sim.screen) ? 'd1-e0' : null
    if (m) spawnRoom(sim, m, SCREENS[m].spawn)
    else spawnRoom(sim, 'ow-11', null)
    emit(sim, 'revive', sim.hero.x, sim.hero.y)
}

function stepShop(sim, inp) {
    const menu = SHOP
    if (inp.aPressed) {
        const offer = menu[sim.shop.sel]
        if (offer.item === 'shield' && sim.items.shield) { say(sim, 'YE ALREADY CARRY A SHIELD', 100); return }
        if (sim.score >= offer.price) {
            sim.score -= offer.price
            grant(sim, offer.item === 'arrows' ? 'arrows' : offer.item === 'bombs' ? 'bombs' : offer.item)
            if (offer.item === 'bombs') sim.items.bombs += 3 // shop bundle 4 = +3 after grant
            emit(sim, 'buy', 0, 0)
        } else say(sim, 'NOT ENOUGH EMBERS', 90)
    }
    if (inp.bPressed || inp.startPressed) sim.shop.open = false
        if (inp.upPressed) sim.shop.sel = (sim.shop.sel + menu.length - 1) % menu.length
    if (inp.downPressed) sim.shop.sel = (sim.shop.sel + 1) % menu.length
}

// ---- state & hash ----

const ITEM_BITS = (sim) =>
    (sim.items.sword ? 1 : 0) | (sim.items.bow ? 2 : 0) | (sim.items.shield ? 4 : 0) |
    (sim.items.bigkey ? 8 : 0)

const FLAG_BITS = (sim) => {
    let f = 0
    const keys = Object.keys(sim.flags).filter(k => k !== 'killed' && k !== 'chestsOpen' && k !== 'cracked' && k !== 'doorsOpen' && k !== 'switchesOn')
    keys.forEach(k => { if (sim.flags[k]) f |= 1 << (k.charCodeAt(0) % 8) })
    f |= Object.keys(sim.flags.cracked).length << 8
    f |= Object.keys(sim.flags.doorsOpen).length << 12
    f |= Object.keys(sim.flags.switchesOn).length << 16
    f |= Object.keys(sim.flags.chestsOpen).length << 20
    f |= Object.keys(sim.cut).length << 24
    return f | (sim.items.keys << 4)
}

export function hashState(sim) {
    let h = 2166136261
    const mix = (v) => { h ^= v | 0; h = Math.imul(h, 16777619) }
    mix(sim.tick); mix(sim.score); mix(sim.hero.hp); mix(sim.hero.max)
    mix(sim.seed)
    mix(Math.round(sim.hero.x * 4)); mix(Math.round(sim.hero.y * 4))
    mix(sim.screen.split('').reduce((a, c) => a + c.charCodeAt(0), 0))
    mix(ITEM_BITS(sim)); mix(FLAG_BITS(sim))
    mix(sim.enemies.reduce((a, e) => a + (e.dead ? 1 : 0) * 7 + Math.round(e.x) + Math.round(e.y) * 3, 0))
    mix(sim.death ? 1 : 0); mix(sim.win ? 1 : 0)
    return h >>> 0
}

export function simState(sim) {
    return {
        tick: sim.tick,
        score: sim.score,
        done: !!sim.win,
        seed: sim.seed,
        hash: hashState(sim),
        hp: sim.hero.hp,
        maxHp: sim.hero.max,
        death: sim.death,
        win: !!sim.win,
        shop: sim.shop.open,
        screen: sim.screen,
        items: { ...sim.items },
        progress: {
            cracked: { ...sim.flags.cracked },
            doors: { ...sim.flags.doorsOpen },
            switches: { ...sim.flags.switchesOn },
            chests: { ...sim.flags.chestsOpen },
            boss1: sim.flags.boss1,
            boss2: sim.flags.boss2,
        },
    }
}

export const TICK_MS = FIXED
