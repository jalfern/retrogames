// SIM — Hyrule as a pure step(state, input). No DOM, no Math.random, ever:
// every enemy is a deterministic script reacting to Link, the same way the
// NES AI reacts with no RNG. The Node harness imports this file UNCHANGED and
// the attract demo replays the planner's own proven tick stream through it.
//
// Coordinates are pixels in the 256x176 play field; tiles are 16px.

import { TILE, COLS, ROWS, W, PLAY_H, screenOf, at, isWall } from './world.js'

export const CFG = {
    spd: 1.05, dmgBig: 2, dmgSmall: 1, iframe: 45, swingDur: 16,
    bombFuse: 70, bombR: 26, shopPrice: 15, invulnPickup: 0,
}
export { W, PLAY_H }

const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const ENEMY = {
    octorok: { hp: 1, spd: 0.55, big: false }, blueoc: { hp: 2, spd: 0.62, big: true },
    moblin: { hp: 1, spd: 0.65, big: false }, bluemob: { hp: 2, spd: 0.7, big: true },
    tektite: { hp: 1, spd: 0, big: false }, keese: { hp: 1, spd: 0.5, big: false },
    zol: { hp: 2, spd: 0, big: false }, gel: { hp: 1, spd: 0.9, big: false },
    stalfos: { hp: 2, spd: 0.75, big: true }, dog: { hp: 1, spd: 1.9, big: false },
    aquamentus: { hp: 6, spd: 0, big: true },
}

const fnv = (h, s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 } return h }

export function stateHash(s) {
    let h = 2166136261
    h = fnv(h, `${s.scr}|${Math.round(s.px * 4)},${Math.round(s.py * 4)}|${s.dir}|${s.hearts}|${s.rupees}|${s.bombs}|${s.end}|${[s.flags.sword, s.flags.crack, s.flags.switch, s.flags.bossDead, s.flags.triforce].join(',')}|${s.tick}`)
    for (const e of s.enemies) h = fnv(h, `${e.type}${Math.round(e.x * 4)},${Math.round(e.y * 4)},${e.hp},${e.t}`)
    for (const q of s.shots) h = fnv(h, `q${Math.round(q.x * 4)},${Math.round(q.y * 4)}`)
    return h >>> 0
}

function findBlocks(scr) {
    const out = []
    if (scr.kind !== 'dungeon') return out
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (at(scr, c, r) === 'B') out.push({ c, r, id: out.length })
    }
    return out
}
function findPots(scr) {
    const out = []
    if (scr.kind !== 'dungeon') return out
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (at(scr, c, r) === 'p') out.push({ c, r, smashed: false, loot: null })
    }
    return out
}
// pot loot: fixed, per room, in scan order (no rolls anywhere in this game)
const POT_LOOT = { D0: ['rupee5', 'heart', 'rupee1'], D1: ['heart', 'rupee5', 'rupee1'], D2: ['rupee5', 'heart'] }

function doorsOf(id) {
    const scr = screenOf(id)
    const out = []
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (at(scr, c, r) !== 'O') continue
        let dir = r === 0 ? 'up' : r === ROWS - 1 ? 'down' : c === 0 ? 'west' : 'east'
        const e = scr[dir]
        out.push({ c, r, to: e.to, dir, locked: !!e.locked })
    }
    return out
}

function makeEnemy(d, i) {
    const E = ENEMY[d.type]
    return {
        type: d.type, i, x: d.x * TILE, y: d.y * TILE, hp: E.hp, t: i * 13,
        dir: ['left', 'up', 'right', 'down'][i % 4], kx: 0, ky: 0, state: 0, t0: 0,
    }
}

export function makeGame(opts = {}) {
    const st = {
        tick: 0, scr: '1,1', px: 7 * TILE, py: 5 * TILE, dir: 'up', anim: 0, walk: 0,
        hearts: 6, maxHearts: 6, rupees: 0, bombs: 0,
        inv: 0, swing: 0, swingDir: 'up', prevA: false, prevB: false, hit: [], pushDir: null, pushN: 0, kx: 0,
        trans: null, talk: null, bomb: null, dieT: 0, end: null,
        enemies: [], items: [], shots: [], parts: [],
        blocks: [], pots: [],
        flags: { sword: false, crack: false, switch: false, swordTaken: false, bombsTaken: false, bought: false, bossDead: false, triforce: false, container: {} },
        visited: { '1,1': true },
        ledger: { kills: {}, dmgTaken: 0, blocked: 0, rupeeGot: 0, rupeeSpent: 0, bombsUsed: 0, bossHits: 0, pots: 0, swings: 0 },
        events: [], slack: !!opts.slack, price: opts.slack ? 20 : CFG.shopPrice,
    }
    const scr = screenOf(st.scr)
    st.enemies = (scr.enemies || []).filter((d) => ENEMY[d.type]).map(makeEnemy)
    return st
}

// room entry: rebuild the per-visit cast (respawn, like the original), keep
// the persistent flags (cracked wall, pushed block, triforce, purchases)
function enterRoom(s, id, spawnC, spawnR, dir) {
    s.scr = id
    const scr = screenOf(id)
    s.enemies = (scr.enemies || []).filter((d) => ENEMY[d.type]).map(makeEnemy)
    s.shots.length = 0
    s.bomb = null
    s.talk = null
    if (scr.kind === 'dungeon') {
        s.pots = findPots(scr).map((p, i) => ({ ...p, loot: (POT_LOOT[id] || [])[i] || null }))
        if (!s.blocks.length) s.blocks = findBlocks(screenOf('D1'))
    }
    s.items = []
    for (const d of (scr.enemies || [])) {
        if (d.type === 'rupee' || d.type === 'heart') {
            if (s.slack && d.type === 'heart' && id === '1,0') continue
            s.items.push({ kind: d.type, worth: d.worth || 2, x: d.x * TILE, y: d.y * TILE, t: 0 })
        }
    }
    if (scr.container && !s.flags.container[id]) {
        if (!s.slack) s.items.push({ kind: 'container', x: scr.container[0] * TILE, y: scr.container[1] * TILE, t: 0 })
    }
    if (!s.visited[id]) { s.visited[id] = true; s.events.push({ e: 'discover', scr: id }) }
    s.events.push({ e: 'enter', scr: id })
    // solid-spawn: slide inward until not inside geometry
    let c = Math.max(1, Math.min(COLS - 2, spawnC)); let r = Math.max(1, Math.min(ROWS - 2, spawnR))
    const trySpots = [[c, r], [c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]
    for (const [tc, tr] of trySpots) {
        if (!solid(s, tc * TILE + 8, tr * TILE + 10)) { c = tc; r = tr; break }
    }
    void dir
    s.px = c * TILE; s.py = r * TILE - 2
    if (id === 'D2') s.events.push({ e: 'bossroom' })
}

const startWipe = (s, to, c, r, dir, kind = 'wipe') => {
    s.trans = { t: 0, kind, to, c, r, dir }
    s.events.push({ e: kind === 'cave' ? 'caveOut' : 'wipe' })
}

function solid(s, x, y) {
    const scr = screenOf(s.scr)
    const kind = scr.kind
    const c = Math.floor(x / TILE); const r = Math.floor(y / TILE)
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true
    const ch = at(scr, c, r)
    if (ch === 'B') return true
    if (s.blocks.some((b) => b.c === c && b.r === r)) return true
    if (s.pots.some((p) => p.c === c && p.r === r && !p.smashed)) return true
    if (ch === 'T' && !s.flags.crack) return true
    if (ch === 'O') {
        const d = doorsOf(s.scr).find((q) => q.c === c && q.r === r)
        if (d && d.locked && !s.flags.switch) return true
    }
    return isWall(ch, kind)
}

function boxSolid(s, cx, cy) {
    const HW = 5; const HH = 6
    return solid(s, cx - HW, cy - HH) || solid(s, cx + HW, cy - HH) || solid(s, cx - HW, cy + HH) || solid(s, cx + HW, cy + HH)
}

function tryMove(s, dx, dy) {
    let cx = s.px + 8; let cy = s.py + 10
    if (dx && !boxSolid(s, cx + dx, cy)) s.px += dx
    if (dy && !boxSolid(s, cx, cy + dy)) s.py += dy
}

const nearEnemyLine = (s, e) => Math.abs(e.x - s.px) < 14 && Math.abs(e.y - s.py) < 14

function hurt(s, amt, fromX) {
    if (s.inv > 0 || s.end || s.trans || s.dieT) return
    s.hearts -= amt
    s.ledger.dmgTaken += amt
    s.inv = CFG.iframe
    s.kx = (s.px + 8 < fromX ? -1 : 1) * 3
    s.events.push({ e: 'hurt' })
    if (s.hearts <= 0) { s.hearts = 0; s.dieT = 80; s.events.push({ e: 'die' }) }
}

function killEnemy(s, e, idx) {
    s.ledger.kills[e.type] = (s.ledger.kills[e.type] || 0) + 1
    s.events.push({ e: 'kill', type: e.type, x: e.x, y: e.y })
    if (e.type === 'zol') {
        for (const [ox] of [[-6], [6]]) s.enemies.push({ type: 'gel', i: e.i + 9, x: e.x + ox, y: e.y, hp: 1, t: 0, dir: 'down', kx: 0, ky: 0, state: 0, t0: 0 })
    }
    if (e.type === 'blueoc') s.items.push({ kind: 'rupee', worth: 1, x: e.x, y: e.y, t: 0 })
    if (e.type === 'aquamentus') { s.flags.bossDead = true; s.events.push({ e: 'bossdown' }) }
    s.enemies.splice(idx, 1)
}

function swordBox(s) {
    const [dx, dy] = DIRV[s.swingDir]
    const cx = s.px + 8 + dx * 18; const cy = s.py + 10 + dy * 18
    return { x: cx - 9, y: cy - 9, w: 18, h: 18 }
}
const inBox = (e, b) => e.x + 12 > b.x && e.x + 4 < b.x + b.w && e.y + 13 > b.y && e.y + 4 < b.y + b.h

export function step(s, inp) {
    s.tick++
    if (s.inv > 0) s.inv--

    if (s.trans) {
        s.trans.t++
        if (s.trans.t === 18) {
            const tr = s.trans
            if (tr.to === null) { s.end = s.end || 'dead' } // (death handled elsewhere)
            else enterRoom(s, tr.to, tr.c, tr.r, tr.dir)
        }
        if (s.trans.t >= 36) s.trans = null
        return drain(s)
    }

    if (s.dieT > 0) {
        s.dieT--
        if (s.dieT === 0) s.end = 'dead'
        return drain(s)
    }
    if (s.end) return drain(s)

    // ---- talk -----------------------------------------------------------
    if (s.talk) {
        const pressed = inp.a && !s.prevA
        if (pressed) {
            s.talk.i++
            s.events.push({ e: 'talk' })
            if (s.talk.i >= s.talk.lines.length) {
                const g = s.talk.gives
                if (g === 'sword' && !s.flags.swordTaken) { s.flags.sword = s.flags.swordTaken = true; s.events.push({ e: 'give', what: 'sword' }) }
                if (g === 'bombs5' && !s.flags.bombsTaken) {
                    s.flags.bombsTaken = true; s.bombs += s.slack ? 4 : 5; s.events.push({ e: 'give', what: 'bombs' })
                }
                if (g === 'buy') {
                    if (s.rupees >= s.price) { s.rupees -= s.price; s.ledger.rupeeSpent += s.price; s.bombs += 4; s.flags.bought = true; s.events.push({ e: 'buy' }) }
                    else s.events.push({ e: 'buyfail' })
                }
                s.talk = null
            }
        }
        s.prevA = inp.a
        return drain(s)
    }

    const scr = screenOf(s.scr)

    // shop/cave touch talks
    const doneTalk = (g) => (g === 'sword' && s.flags.swordTaken) || (g === 'bombs5' && s.flags.bombsTaken)
    if (scr.kind === 'shop' && scr.talk && !doneTalk(scr.talk.gives)) {
        const [tc, tr] = scr.talk.at
        if (Math.abs(s.px + 8 - (tc * TILE + 8)) < 16 && Math.abs(s.py + 10 - (tr * TILE + 8)) < 24) {
            s.talk = { ...scr.talk, i: 0 }
            s.events.push({ e: 'talkStart', who: scr.talk.who })
            s.prevA = inp.a
            return drain(s)
        }
    }

    // ---- movement -------------------------------------------------------
    let mx = (inp.r ? 1 : 0) - (inp.l ? 1 : 0)
    let my = (inp.d ? 1 : 0) - (inp.u ? 1 : 0)
    if (mx || my) {
        s.walk++
        s.dir = mx > 0 ? (my > 0 ? 'down' : my < 0 ? 'up' : 'right') : mx < 0 ? (my > 0 ? 'down' : my < 0 ? 'up' : 'left') : my > 0 ? 'down' : my < 0 ? 'up' : s.dir
    } else s.walk = 0
    const sp = CFG.spd
    if (mx && my) { const d = sp * 0.78; tryMove(s, mx * d, my * d) }
    else if (mx) tryMove(s, mx * sp, 0)
    else if (my) tryMove(s, 0, my * sp)

    // knockback
    if (s.kx) { tryMove(s, s.kx, 0); s.kx *= 0.6; if (Math.abs(s.kx) < 0.3) s.kx = 0 }

    // ---- push blocks ----------------------------------------------------
    if ((mx || my) && s.walk > 0) {
        const dx = Math.sign(mx); const dy = Math.sign(my)
        const dir = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up'
        const fx = s.px + 8 + dx * 9; const fy = s.py + 10 + dy * 9
        const fc = Math.floor(fx / TILE); const fr = Math.floor(fy / TILE)
        const blk = s.blocks.find((b) => b.c === fc && b.r === fr)
        if (blk && dir === (dx ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'))) {
            if (s.pushDir === dir) s.pushN++
            else { s.pushDir = dir; s.pushN = 1 }
            if (s.pushN >= 10 && s.pushN % 10 === 0) {
                const nc = fc + dx; const nr = fr + dy
                const ch = at(scr, nc, nr)
                if (!solid(s, nc * TILE + 8, nr * TILE + 8) && ch !== 'O' && ch !== 's') {
                    blk.c = nc; blk.r = nr; s.events.push({ e: 'push' })
                } else if (ch === 's') {
                    blk.c = nc; blk.r = nr; s.flags.switch = true
                    s.events.push({ e: 'switch' })
                }
            }
        } else { s.pushDir = null; s.pushN = 0 }
    } else { s.pushDir = null; s.pushN = 0 }

    // ---- sword ----------------------------------------------------------
    const aPress = inp.a && !s.prevA
    if (aPress && !s.swing) {
        if (scr.kind !== 'shop') { s.swing = CFG.swingDur; s.swingDir = s.dir; s.hit = []; s.ledger.swings++ ; s.events.push({ e: 'swing' }) }
    }
    if (s.swing) {
        s.swing--
        if (s.swing <= CFG.swingDur - 4 && s.swing >= 4) {
            const b = swordBox(s)
            for (let i = s.enemies.length - 1; i >= 0; i--) {
                const e = s.enemies[i]
                if (s.hit.includes(i) || !inBox(e, b)) continue
                s.hit.push(i)
                e.hp--
                if (e.type === 'aquamentus') s.ledger.bossHits++
                s.events.push({ e: 'ehit', x: e.x, y: e.y })
                if (e.hp <= 0) killEnemy(s, e, i)
            }
            for (const p of s.pots) {
                if (!p.smashed && p.c === Math.floor((b.x + b.w / 2) / TILE) && p.r === Math.floor((b.y + b.h / 2) / TILE)) {
                    p.smashed = true; s.ledger.pots++
                    s.events.push({ e: 'pot', x: p.c, y: p.r })
                    if (p.loot) {
                        const kind = p.loot === 'heart' ? 'heart' : 'rupee'
                        s.items.push({ kind, worth: p.loot === 'rupee5' ? 5 : 1, x: p.c * TILE, y: p.r * TILE, t: 0 })
                    }
                }
            }
        }
        if (s.swing === 0) s.hit = []
    }
    s.prevA = inp.a

    // ---- bombs ----------------------------------------------------------
    if (inp.b && !s.prevB && s.bombs > 0 && !s.bomb && scr.kind !== 'shop') {
        s.bombs--; s.ledger.bombsUsed++
        s.bomb = { x: s.px + 8 + DIRV[s.dir][0] * 14, y: s.py + 10 + DIRV[s.dir][1] * 14, t: 0 }
        s.events.push({ e: 'bomb' })
    }
    s.prevB = inp.b
    if (s.bomb) {
        s.bomb.t++
        if (s.bomb.t >= CFG.bombFuse) {
            const { x, y } = s.bomb
            s.events.push({ e: 'boom', x, y })
            s.bomb = null
            for (let i = s.enemies.length - 1; i >= 0; i--) {
                const e = s.enemies[i]
                if ((e.x + 8 - x) ** 2 + (e.y + 8 - y) ** 2 < CFG.bombR ** 2) {
                    e.hp -= 2
                    if (e.type === 'aquamentus') s.ledger.bossHits++
                    if (e.hp <= 0) killEnemy(s, e, i)
                }
            }
            const tc = Math.floor(x / TILE); const tr = Math.floor(y / TILE)
            for (const [c, r] of [[tc, tr], [tc + 1, tr], [tc - 1, tr], [tc, tr + 1], [tc, tr - 1]]) {
                if (at(scr, c, r) === 'T' && !s.flags.crack) { s.flags.crack = true; s.events.push({ e: 'secret' }) }
            }
            if ((s.px + 8 - x) ** 2 + (s.py + 10 - y) ** 2 < CFG.bombR ** 2) hurt(s, 2, x)
        }
    }

    // ---- pickups --------------------------------------------------------
    for (let i = s.items.length - 1; i >= 0; i--) {
        const it = s.items[i]; it.t++
        if (Math.abs(it.x - s.px) < 14 && Math.abs(it.y - s.py) < 16) {
            if (it.kind === 'rupee') { s.rupees += it.worth; s.ledger.rupeeGot += it.worth; s.events.push({ e: 'rupee', v: it.worth }) }
            if (it.kind === 'heart') { s.hearts = Math.min(s.maxHearts, s.hearts + 2); s.events.push({ e: 'heart' }) }
            if (it.kind === 'container') { s.maxHearts += 2; s.hearts = s.maxHearts; s.flags.container[s.scr] = true; s.events.push({ e: 'container' }) }
            s.items.splice(i, 1)
        }
    }

    // ---- triforce / doors / edges ----------------------------------------
    const cc = Math.floor((s.px + 8) / TILE); const cr = Math.floor((s.py + 10) / TILE)
    if (scr.kind === 'dungeon' && at(scr, cc, cr) === 'F' && !s.flags.triforce) {
        s.flags.triforce = true; s.end = 'win'; s.events.push({ e: 'triforce' })
        return drain(s)
    }
    if (at(scr, cc, cr) === 'C' && scr.cave) { startWipe(s, scr.cave.to, 6, 8, 'down', 'cave'); return drain(s) }
    if (at(scr, cc, cr) === 'D') { startWipe(s, scr.door.to, cc, 1, 'up'); return drain(s) }
    if (at(scr, cc, cr) === 'S') { startWipe(s, scr.shop.to, 5, 2, 'down', 'cave'); return drain(s) }
    if (at(scr, cc, cr) === 'O') {
        const d = doorsOf(s.scr).find((q) => q.c === cc && q.r === cr)
        if (d && (!d.locked || s.flags.switch)) {
            const sc = d.dir === 'up' ? [cc, 9] : d.dir === 'down' ? [cc, 1] : d.dir === 'west' ? [1, cr] : [13, cr]
            startWipe(s, d.to, sc[0], sc[1], d.dir === 'east' ? 'right' : d.dir === 'west' ? 'left' : d.dir)
            return drain(s)
        }
    }
    if (scr.kind === 'shop') {
        if (s.py >= PLAY_H - TILE - 6) {
            const host = screenOf(scr.exit.to)
            let hc = scr.exit.c
            for (const t of [hc, hc - 1, hc + 1]) if (!isWall(at(host, t, scr.exit.r), host.kind)) { hc = t; break }
            startWipe(s, scr.exit.to, hc, scr.exit.r, 'down', 'cave')
            return drain(s)
        }
    } else if (scr.kind === 'over') {
        const out = crossEdge(s, cc, cr)
        if (out) return drain(s)
    }

    // ---- enemies --------------------------------------------------------
    for (let i = s.enemies.length - 1; i >= 0; i--) updateEnemy(s, s.enemies[i], i)

    // ---- shots ----------------------------------------------------------
    for (let i = s.shots.length - 1; i >= 0; i--) {
        const q = s.shots[i]
        q.x += q.vx; q.y += q.vy
        if (solid(s, q.x, q.y) || q.x < -8 || q.x > W + 8 || q.y < -8 || q.y > PLAY_H + 8) { s.shots.splice(i, 1); continue }
        if (Math.abs(q.x - (s.px + 8)) < 10 && Math.abs(q.y - (s.py + 10)) < 12) {
            const facing = (q.vx < 0 && s.dir === 'right') || (q.vx > 0 && s.dir === 'left') || (q.vy < 0 && s.dir === 'down') || (q.vy > 0 && s.dir === 'up')
            if (facing && q.kind !== 'magic') { s.ledger.blocked++; s.events.push({ e: 'ding', x: q.x, y: q.y }); s.shots.splice(i, 1); continue }
            hurt(s, q.big ? CFG.dmgBig : CFG.dmgSmall, q.x)
            s.shots.splice(i, 1)
        }
    }

    return drain(s)
}

function crossEdge(s, cc, cr) {
    const scr = screenOf(s.scr)
    const cx = s.px + 8; const cy = s.py + 10
    let dir = null
    if (s.py >= PLAY_H - TILE - 6 && !boxSolid(s, cx, PLAY_H - TILE - 1)) dir = 'down'
    else if (s.py <= 6) dir = 'up'
    else if (s.px <= 6) dir = 'left'
    else if (s.px >= W - TILE - 6) dir = 'right'
    if (!dir) return false
    void cx; void cy
    const e = scr[dir]
    if (!e) return clampBack(s, dir)
    const span = e.cols || e.rows
    const v = dir === 'up' || dir === 'down' ? cc : cr
    if (v < span[0] || v > span[1]) return clampBack(s, dir)
    let c = cc; let r = cr
    if (dir === 'up') r = ROWS - 1
    if (dir === 'down') r = 0
    if (dir === 'left') c = COLS - 1
    if (dir === 'right') c = 0
    startWipe(s, e.to, c, r, dir)
    return true
}
function clampBack(s, dir) {
    if (dir === 'left') s.px = 0; if (dir === 'right') s.px = W - TILE
    if (dir === 'up') s.py = 0; if (dir === 'down') s.py = PLAY_H - TILE - 1
    return false
}

const OCTDIRS = ['left', 'right', 'up', 'down']
function freeLine(s, x, y, vx, vy) {
    for (let k = 1; k < 16; k++) {
        const px = x + vx * k * 16; const py = y + vy * k * 16
        if (px < 0 || px >= W || py < 0 || py >= PLAY_H) return k
        if (solid(s, px, py)) return k - 1
        if (Math.abs(px - (s.px + 8)) < 12 && Math.abs(py - (s.py + 10)) < 12) return k
    }
    return 16
}

function updateEnemy(s, e, idx) {
    const E = ENEMY[e.type]
    e.t++
    if (e.kx || e.ky) {
        const ox = e.x; e.x += e.kx; e.y += e.ky; e.kx *= 0.7; e.ky *= 0.7
        if (solid(s, e.x + 8, e.y + 12)) { e.x = ox }
        if (Math.abs(e.kx) < 0.3) e.kx = 0
        if (Math.abs(e.ky) < 0.3) e.ky = 0
    }
    const pcx = s.px + 8; const pcy = s.py + 10
    const ecx = e.x + 8; const ecy = e.y + 8
    const hitP = (amt) => { if (Math.abs(ecx - pcx) < 13 && Math.abs(ecy - pcy) < 14) hurt(s, amt, ecx) }

    if (e.type === 'aquamentus') {
        e.y = 88 + Math.sin((s.tick + e.i * 7) * 0.016) * 52
        if (e.t % 110 === 60) {
            const base = Math.atan2(pcy - ecy, pcx - ecx)
            for (const off of [-0.42, 0, 0.42]) {
                s.shots.push({ kind: 'fire', x: ecx, y: ecy, vx: Math.cos(base + off) * 1.15, vy: Math.sin(base + off) * 1.15, big: true })
            }
            s.events.push({ e: 'fireball' })
        }
        hitP(CFG.dmgBig)
        return
    }
    if (e.type === 'keese') {
        const ph = (s.tick * 0.09 + e.i * 2.3)
        e.vx = Math.sin(ph) * 0.9 + Math.cos(ph * 0.37) * 0.5
        e.vy = Math.cos(ph * 0.71 + 1) * 0.9
        const nx = e.x + e.vx; const ny = e.y + e.vy
        if (!solid(s, nx + 4, e.y + 4) && !solid(s, nx + 12, e.y + 12)) e.x = nx
        if (!solid(s, e.x + 4, ny + 4) && !solid(s, e.x + 12, ny + 12)) e.y = ny
        hitP(CFG.dmgSmall)
        return
    }
    if (e.type === 'tektite') {
        const P = 46
        const k = e.t % P
        if (k === 0) {
            e.dx = Math.sign(pcx - e.x) * (0.7 + (e.i % 3) * 0.25) || 1
            e.dy = Math.sign(pcy - e.y) * (0.35 + (e.i % 2) * 0.35)
        }
        const hop = Math.sin((k / P) * Math.PI)
        if (k < P) { const nx = e.x + e.dx * hop * 1.4; const ny = e.y + e.dy * hop * 1.6; if (!solid(s, nx + 8, ny + 12)) { e.x = nx; e.y = ny } }
        e.hop = hop
        hitP(CFG.dmgSmall)
        return
    }
    if (e.type === 'zol' || e.type === 'gel') {
        const P = e.type === 'zol' ? 56 : 26
        const k = e.t % P
        if (k === 0) { e.dx = Math.sign(pcx - e.x) || 1; e.dy = Math.sign(pcy - e.y) }
        const hop = Math.sin((k / P) * Math.PI)
        const step = (e.type === 'zol' ? 1.1 : 1.6) * hop
        const nx = e.x + e.dx * step; const ny = e.y + e.dy * step
        if (!solid(s, nx + 4, ny + 13) && !solid(s, nx + 12, ny + 13)) e.x = nx
        if (!solid(s, e.x + 4, ny + 13) && !solid(s, e.x + 12, ny + 4)) e.y = ny
        hitP(CFG.dmgSmall)
        return
    }
    if (e.type === 'dog') {
        const P = 160
        const k = e.t % P
        if (k > 60 && k < 130) {
            const ang = Math.atan2(pcy - ecy, pcx - ecx)
            const nx = e.x + Math.cos(ang) * E.spd; const ny = e.y + Math.sin(ang) * E.spd
            if (!solid(s, nx + 8, e.y + 12)) e.x = nx
            if (!solid(s, e.x + 8, ny + 12)) e.y = ny
            e.run = true
        } else e.run = false
        hitP(CFG.dmgBig)
        return
    }
    if (e.type === 'stalfos') {
        if (e.t % 2 === 0) {
            const dx = Math.sign(pcx - ecx); const dy = Math.sign(pcy - ecy)
            const step = (ox, oy) => { const nx = e.x + ox; const ny = e.y + oy; return !solid(s, nx + 4, ny + 13) && !solid(s, nx + 12, ny + 13) && !solid(s, nx + 4, ny + 4) && !solid(s, nx + 12, ny + 4) ? (e.x = nx, e.y = ny, true) : false }
            if (Math.abs(pcx - ecx) > Math.abs(pcy - ecy)) { if (!step(dx * E.spd, 0)) step(0, dy * E.spd) }
            else { if (!step(0, dy * E.spd)) step(dx * E.spd, 0) }
            if (dx) e.dir = dx > 0 ? 'right' : 'left'; else if (dy) e.dir = dy > 0 ? 'down' : 'up'
        }
        hitP(CFG.dmgBig)
        return
    }
    // octorok / moblin: patrol + aimed shot
    const turn = e.type.startsWith('mob') ? 38 : 32
    if (e.t % turn === 0) {
        const opt = OCTDIRS[(OCTDIRS.indexOf(e.dir) + 1 + (e.i % 2) * 2 + Math.floor(e.t / turn)) % 4]
        e.dir = opt
    }
    const [ux, uy] = DIRV[e.dir]
    const nx = e.x + ux * E.spd; const ny = e.y + uy * E.spd
    if (solid(s, nx + 4 + (ux > 0 ? 4 : 0), ny + 12) || solid(s, nx + 12 + (ux < 0 ? -4 : 0), ny + 12) || (uy && solid(s, nx + 8, ny + (uy > 0 ? 14 : 3)))) {
        e.dir = OCTDIRS[(OCTDIRS.indexOf(e.dir) + 1 + e.i) % 4]
    } else { e.x = nx; e.y = ny }
    const shootP = e.type.startsWith('mob') ? 95 : 80
    const phase = e.t % shootP
    if (phase === (e.i % 2 ? 30 : 55) && !s.trans) {
        const row = Math.abs(ecy - pcy) < 8; const col = Math.abs(ecx - pcx) < 8
        let vx = 0; let vy = 0
        if (row && freeLine(s, ecx, ecy, Math.sign(pcx - ecx), 0) > 1) vx = Math.sign(pcx - ecx) * (e.type.startsWith('mob') ? 1.5 : 1.15)
        else if (col && freeLine(s, ecx, ecy, 0, Math.sign(pcy - ecy)) > 1) vy = Math.sign(pcy - ecy) * (e.type.startsWith('mob') ? 1.5 : 1.15)
        if (vx || vy) {
            s.shots.push({ kind: e.type.startsWith('mob') ? 'spear' : 'rock', x: ecx + (vx ? Math.sign(vx) * 10 : 0), y: ecy + (vy ? Math.sign(vy) * 10 : 0), vx, vy, big: !!E.big })
            s.events.push({ e: 'shoot', type: e.type })
        }
    }
    hitP(CFG.dmgBig)
}

function drain(s) {
    // fx decay for the renderer (does not affect logic)
    if (s.parts.length > 60) s.parts.splice(0, s.parts.length - 60)
    return s.events.splice(0)
}
