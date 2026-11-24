// STOMPTOWN — the pure simulation. Zero DOM, zero Math.random: every random the
// sim consumes comes from the seed, so seed + pads ⇒ identical hashes (the #494
// determinism law). Physics, layout and scoring are promoted from Jon's prototype
// (branch prototype/stomptown, issue #3094) — times converted from seconds to
// fixed 60 Hz ticks. It re-implements the 1986 giant-monster city-breaker
// genre with STOMPTOWN's own roster (GROG / ZARRA / FENRIS), its
// own title, and none of any original's characters, names, credits or audio.
//
// The shell (index.jsx) owns juice: particles, shake, popups, camera-shake and
// sound, all replayed from gs.events. The sim owns rules: movement, climbing,
// punching, windows, the military, eating, revert-and-rescue, the day ledger.
//
// Verify with `npm run stompcheck` (Node, no browser).

export const W = 1280
export const H = 720
export const GROUND = H - 96
export const FIXED_DT = 1000 / 60

// One tick = 1/60 s. Speeds are px/tick, accelerations px/tick².
const GRAV = 2600 / 3600
const MOVE = 330 / 60
const JUMP_V = -1080 / 60
const CLIMB_V = 195 / 60
const PUSH_VX = 310 / 60
const PUSH_VY = -560 / 60

export const ATTACK_T = 16      // punch animation window (~0.26 s)
export const EAT_T = 24
export const INVULN_T = 48      // mercy flicker after a hit (0.8 s)
export const RESPAWN_T = 132    // mercy after the blimp drops you back (2.2 s)
export const LAND_T = 8
export const STUN_T = 78        // bomb-in-the-window stun (1.3 s)
export const CLEAR_T = 144      // CITY CLEARED banner (2.4 s)
export const CRUMBLE_T = 63     // a building falls flat in ~1.05 s
export const WALK_T = 90        // human phase before the blimp arrives (1.5 s)
export const CARRY_T = 18
export const COMBO_DECAY = 300  // 5 s at ×N after the last meal
export const BULLET_DMG = 9
export const HP_MAX = 100
export const EAT_HEAL = 16
export const FOOD_HEAL = 18
export const START_LIVES = 3
export const LIFE_CAP = 6
export const DAYS = 12          // clear the twelfth city and the tour is won
export const COMBO_CAP = 8

// Our own monster cast (#3094: no names, characters or credits from the 1986 original).
export const MONSTERS = {
    grog: { name: 'GROG', sub: 'THE BREAKER', ac: '#4dff7a', glow: '#8dffb3', dark: '#123a1f', body: 'ape' },
    zarra: { name: 'ZARRA', sub: 'THE RIPSAW', ac: '#35e0d4', glow: '#9ffff4', dark: '#0b3a38', body: 'reptile' },
    fenris: { name: 'FENRIS', sub: 'THE MOONFANG', ac: '#c98cff', glow: '#e2bdff', dark: '#2c1744', body: 'wolf' },
}
export const MONSTER_KEYS = Object.keys(MONSTERS)

// A US tour of real cities (geography, not anyone's IP) — the prototype's list.
export const CITIES = ['PEORIA, IL', 'CHICAGO, IL', 'DULUTH, MN', 'KANSAS CITY, MO', 'ST. LOUIS, MO', 'JACKSONVILLE, FL', 'ATLANTA, GA', 'TAMPA, FL', 'MIAMI, FL', 'NEW ORLEANS, LA', 'HOUSTON, TX', 'DALLAS, TX', 'AUSTIN, TX', 'EL PASO, TX', 'SAN ANTONIO, TX', 'OKLAHOMA CITY, OK', 'TULSA, OK', 'SPRINGFIELD, MO', 'COLUMBIA, MO', 'WICHITA, KS', 'TOPEKA, KS', 'DENVER, CO', 'SALT LAKE CITY, UT', 'LAS VEGAS, NV', 'PHOENIX, AZ', 'LOS ANGELES, CA', 'SAN DIEGO, CA', 'SAN FRANCISCO, CA', 'SEATTLE, WA', 'PORTLAND, OR', 'VANCOUVER, BC', 'TORONTO, ON', 'MONTREAL, QC', 'OTTAWA, ON']

export const cityName = (idx) => CITIES[Math.min(idx, CITIES.length - 1)]

// ------------------------------------------------------------- rng ----
export function mulberry32(seed) {
    let a = seed >>> 0
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// ---------------------------------------------------------- factory ----
export function makeGame(opts = {}) {
    const seed = (opts.seed ?? 1) >>> 0 || 1
    const gs = {
        seed,
        rng: mulberry32(seed),
        tick: 0,
        monster: MONSTERS[opts.monster] ? opts.monster : 'grog',
        day: 1,
        cityIndex: 0,
        score: 0,
        combo: 1,
        comboT: 0,
        lives: opts.lives ?? START_LIVES,
        state: 'play',        // play | clear
        clearT: 0,
        dayStartScore: 0,
        end: null,            // 'over' | 'won'
        won: false,
        camX: 0,
        events: [],
        prev: {},
        buildings: [],
        rubbles: [],
        civilians: [],
        tanks: [],
        cars: [],
        helicopters: [],
        bullets: [],
        blimpOut: null,
        cityLen: 0,
        player: null,
    }
    gs.player = newPlayer()
    buildCity(gs)
    return gs
}

function newPlayer() {
    return {
        x: 140, y: GROUND, vx: 0, vy: 0, w: 52, h: 104,
        hp: HP_MAX, facing: 1,
        attackT: 0, eatT: 0, hurtT: 0, landT: 0, invuln: 0, stunT: 0,
        walk: 0, onGround: true,
        climb: null, climbSide: 0, punchAim: 'straight',
        reverting: false, revertPhase: null, revertT: 0, revertDir: 0,
        humanX: 140, humanY: GROUND, humanDir: 0, blimp: null,
    }
}

const rnd = (gs, a, b) => a + gs.rng() * (b - a)

export function buildCity(gs) {
    gs.cityLen = 4800 + gs.day * 260
    gs.dayStartScore = gs.score
    gs.blimpOut = null
    gs.buildings = []
    gs.rubbles = []
    gs.civilians = []
    gs.tanks = []
    gs.cars = []
    gs.helicopters = []
    gs.bullets = []
    const n = Math.min(9 + Math.floor(gs.day / 2), 14)
    const margin = 260
    for (let i = 0; i < n; i++) {
        const x = margin + (gs.cityLen - 2 * margin - 220) * (i / (n - 1)) + rnd(gs, -40, 40)
        const w = rnd(gs, 140, 230)
        const h = rnd(gs, 170, 380)
        const cols = Math.floor(w / 34)
        const rows = Math.floor(h / 46)
        const wins = []
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                wins.push({ lit: gs.rng() < 0.5, warm: gs.rng() < 0.75, ph: gs.rng() * 6.28, shattered: false })
            }
        }
        gs.buildings.push({ x, w, h, hp: Math.ceil(h / 34), maxhp: Math.ceil(h / 34), wins, cols, rows, alive: true, crumbling: 0, crumblingTop: 0 })
    }
    const CIV_COLORS = ['#d98a8a', '#7aa8d9', '#d9b27a', '#8ad97a', '#d97ad1']
    for (let i = 0; i < 7 + gs.day; i++) {
        gs.civilians.push({
            x: rnd(gs, 80, gs.cityLen - 80), y: GROUND, vx: 0, wob: gs.rng() * 6.28,
            waving: gs.rng() < 0.5, corpse: false, eaten: false,
            color: CIV_COLORS[Math.floor(gs.rng() * 5)], hat: gs.rng() < 0.4,
        })
    }
    for (let i = 0; i < Math.min(1 + Math.floor(gs.day / 2), 4); i++) {
        gs.tanks.push({ x: rnd(gs, gs.cityLen * 0.3, gs.cityLen * 0.95), y: GROUND, vx: 0, hp: 4, reload: rnd(gs, 1, 2.5), wob: gs.rng() * 6.28 })
    }
    for (let i = 0; i < 2 + (gs.day % 3); i++) {
        gs.cars.push({ x: rnd(gs, 100, gs.cityLen - 100), y: GROUND, vx: (gs.rng() < 0.5 ? -1 : 1) * rnd(gs, 90, 160) / 60, hp: 2, reload: rnd(gs, 1.4, 3) * 60, wob: gs.rng() * 6.28 })
    }
    for (let i = 0; i < Math.min(1 + Math.floor(gs.day / 3), 3); i++) {
        gs.helicopters.push({ x: rnd(gs, 200, gs.cityLen - 200), y: rnd(gs, 70, 160), vx: (gs.rng() < 0.5 ? -1 : 1) * rnd(gs, 60, 110) / 60, hp: 3, reload: rnd(gs, 1.2, 2.6) * 60, wob: gs.rng() * 6.28 })
    }
}

// ----------------------------------------------------------- scoring ----
function addScore(gs, n, x, y) {
    const pts = Math.round(n * gs.combo)
    gs.score += pts
    gs.events.push({ t: 'points', pts, x, y })
    return pts
}

// -------------------------------------------------- buildings & windows ----
export function windowRect(b, r, c) {
    const cw = b.w / (b.cols + 1)
    const ch = b.h / (b.rows + 1)
    return { x: b.x + cw * (c + 1) - cw * 0.28, y: (GROUND - b.h) + ch * (r + 1) - ch * 0.26, w: cw * 0.56, h: ch * 0.5 }
}

function damageBuilding(gs, b) {
    if (!b.alive || b.crumbling) return
    b.hp--
    gs.events.push({ t: 'punch', x: b.x + b.w / 2, y: GROUND - b.h })
    if (b.hp <= 0) {
        b.crumbling = 0.0001
        b.crumblingTop = GROUND - b.h
        gs.events.push({ t: 'crumble', x: b.x + b.w / 2 })
        addScore(gs, 300, b.x + b.w / 2, GROUND - b.h - 20)
    }
}

function smashWindow(gs, b, r, c, wr) {
    const win = b.wins[r * b.cols + c]
    if (win.shattered) return
    win.shattered = true
    win.lit = false
    gs.events.push({ t: 'shatter', x: wr.x + wr.w / 2, y: wr.y })
    const roll = gs.rng()
    if (roll < 0.45) {
        gs.player.hp = Math.min(HP_MAX, gs.player.hp + FOOD_HEAL)
        addScore(gs, 60, wr.x, wr.y - 10)
        gs.events.push({ t: 'popup', msg: '+FOOD', x: wr.x + wr.w / 2, y: wr.y - 34 })
        gs.events.push({ t: 'pickup' })
    } else if (roll < 0.8) {
        addScore(gs, 120, wr.x, wr.y - 10)
        gs.events.push({ t: 'popup', msg: '+$', x: wr.x + wr.w / 2, y: wr.y - 34 })
        gs.events.push({ t: 'pickup' })
    } else if (roll < 0.92) {
        gs.events.push({ t: 'popup', msg: 'BOMB!', x: wr.x + wr.w / 2, y: wr.y - 34 })
        gs.events.push({ t: 'bomb', x: wr.x })
        for (const t of gs.tanks) if (Math.abs(t.x - wr.x) < 260) { t.hp -= 2; if (t.hp <= 0) { t.dead = true; gs.events.push({ t: 'boom', x: t.x, y: t.y - 40, s: 1.1 }); addScore(gs, 400, t.x, t.y - 90) } }
        for (const c2 of gs.cars) if (Math.abs(c2.x - wr.x) < 260) { c2.hp -= 2; if (c2.hp <= 0) { c2.dead = true; gs.events.push({ t: 'boom', x: c2.x, y: c2.y - 25, s: 0.8 }); addScore(gs, 300, c2.x, c2.y - 70) } }
        for (const h of gs.helicopters) if (Math.abs(h.x - wr.x) < 260) { h.hp -= 2; if (h.hp <= 0) { h.dead = true; gs.events.push({ t: 'boom', x: h.x, y: h.y + 20, s: 1.2 }); addScore(gs, 500, h.x, h.y) } }
        for (const cv of gs.civilians) if (Math.abs(cv.x - wr.x) < 200 && !cv.corpse) killCivilian(gs, cv, false)
    } else {
        gs.player.stunT = STUN_T
        gs.events.push({ t: 'popup', msg: 'STUNNED!', x: wr.x + wr.w / 2, y: wr.y - 34 })
        gs.events.push({ t: 'stun' })
    }
}

function killCivilian(gs, c, byPunch) {
    if (c.corpse) return
    c.corpse = true
    addScore(gs, byPunch ? 100 : 50, c.x, c.y - 60)
    if (c.waving) {
        addScore(gs, 150, c.x, c.y - 90)
        gs.combo = Math.min(gs.combo + 0.5, COMBO_CAP)
        gs.comboT = COMBO_DECAY
    }
    gs.events.push({ t: 'kill', x: c.x })
}

function eatCivilian(gs, c) {
    c.corpse = true
    c.eaten = true
    gs.player.hp = Math.min(HP_MAX, gs.player.hp + EAT_HEAL)
    addScore(gs, 250, c.x, c.y - 70)
    gs.combo = Math.min(gs.combo + 0.5, COMBO_CAP)
    gs.comboT = COMBO_DECAY
    gs.events.push({ t: 'eat', x: c.x + gs.player.facing * 30, y: gs.player.y - 100 })
}

// exported for stompcheck: the harness must be able to deal the exact hit the
// military deals, at a known tick, without praying that a bullet finds the target.
export function damagePlayer(gs, n) {
    const p = gs.player
    if (p.invuln > 0 || p.reverting || gs.end) return
    p.hp -= n
    p.invuln = INVULN_T
    p.hurtT = 15
    gs.combo = 1
    gs.comboT = 0
    gs.events.push({ t: 'hit' })
    if (p.hp <= 0) {
        p.hp = 0
        gs.lives -= 1
        if (gs.lives <= 0) {
            gs.end = 'over'
            gs.events.push({ t: 'over' })
            return
        }
        p.reverting = true
        p.revertPhase = 'walk'
        p.revertT = 0
        p.revertDir = p.x < gs.cityLen / 2 ? -1 : 1
        p.humanX = p.x
        p.humanY = GROUND
        p.humanDir = p.revertDir
        p.stunT = 0
        gs.events.push({ t: 'revert' })
    }
}

// ------------------------------------------------------------- punch ----
function nearestClimbBuilding(gs) {
    const p = gs.player
    for (const b of gs.buildings) {
        if (!b.alive || b.crumbling) continue
        const top = GROUND - b.h
        const side = p.x + p.w / 2 <= b.x ? -1 : (p.x - p.w / 2 >= b.x + b.w ? 1 : 0)
        if (side === 0) continue
        const dist = side === -1 ? b.x - (p.x + p.w / 2) : (p.x - p.w / 2) - (b.x + b.w)
        if (dist > 26) continue
        if (p.y < top + 20) continue
        return { b, side }
    }
    return null
}

function doPunch(gs) {
    const p = gs.player
    const aim = p.punchAim
    const hx = p.x + p.facing * 74
    const hy = p.y - 60 + (aim === 'up' ? -50 : aim === 'down' ? 52 : 0)
    const R = 46
    for (const b of gs.buildings) {
        if (!b.alive) continue
        const top = GROUND - b.h
        const cx = Math.max(b.x, Math.min(hx, b.x + b.w))
        const cy = Math.max(top, Math.min(hy, GROUND))
        if (Math.hypot(hx - cx, hy - cy) < R + 30) damageBuilding(gs, b)
    }
    for (const b of gs.buildings) {
        if (!b.alive || b.crumbling) continue
        for (let r = 0; r < b.rows; r++) {
            for (let c = 0; c < b.cols; c++) {
                const win = b.wins[r * b.cols + c]
                if (win.shattered) continue
                const wr = windowRect(b, r, c)
                const wx = Math.max(wr.x, Math.min(hx, wr.x + wr.w))
                const wy = Math.max(wr.y, Math.min(hy, wr.y + wr.h))
                if (Math.hypot(hx - wx, hy - wy) < R) smashWindow(gs, b, r, c, wr)
            }
        }
    }
    for (const c of gs.civilians) {
        if (c.corpse) continue
        if (Math.hypot(c.x - hx, (c.y - 40) - hy) < R + 26) killCivilian(gs, c, true)
    }
    for (const t of gs.tanks) {
        if (Math.hypot(t.x - hx, (t.y - 40) - hy) < R + 34) { t.hp--; if (t.hp <= 0) { t.dead = true; gs.events.push({ t: 'boom', x: t.x, y: t.y - 40, s: 1.1 }); addScore(gs, 400, t.x, t.y - 90) } }
    }
    for (const c of gs.cars) {
        if (Math.hypot(c.x - hx, (c.y - 28) - hy) < R + 30) { c.hp--; if (c.hp <= 0) { c.dead = true; gs.events.push({ t: 'boom', x: c.x, y: c.y - 25, s: 0.8 }); addScore(gs, 300, c.x, c.y - 70) } }
    }
    for (const h of gs.helicopters) {
        if (Math.hypot(h.x - hx, (h.y + 18) - hy) < R + 36) { h.hp--; if (h.hp <= 0) { h.dead = true; gs.events.push({ t: 'boom', x: h.x, y: h.y + 20, s: 1.2 }); addScore(gs, 500, h.x, h.y) } }
    }
}

function fireBullet(gs, x, y, tx, ty, speed, col) {
    const dx = tx - x, dy = ty - y
    const d = Math.hypot(dx, dy) || 1
    gs.bullets.push({ x, y, vx: dx / d * speed / 60, vy: dy / d * speed / 60, life: 180, col })
}

// ----------------------------------------------- revert + blimp rescue ----
function updateRevert(gs) {
    const p = gs.player
    p.revertT++
    if (gs.blimpOut) {
        gs.blimpOut.x += gs.blimpOut.dir * 230 / 60
        if (gs.blimpOut.x < -200 || gs.blimpOut.x > gs.cityLen + 200) gs.blimpOut = null
    }
    if (p.revertPhase === 'walk') {
        p.humanX += p.humanDir * 78 / 60
        p.humanX = Math.max(24, Math.min(gs.cityLen - 24, p.humanX))
        if (p.revertT > WALK_T || p.humanX <= 24 || p.humanX >= gs.cityLen - 24) {
            p.revertPhase = 'blimp_in'
            p.revertT = 0
            p.blimp = { x: Math.max(160, Math.min(gs.cityLen - 160, 140)), y: 92 }
            gs.events.push({ t: 'blimp_in' })
        }
    } else if (p.revertPhase === 'blimp_in') {
        p.humanX += p.humanDir * 36 / 60
        p.humanX = Math.max(24, Math.min(gs.cityLen - 24, p.humanX))
        const targetX = Math.max(160, Math.min(gs.cityLen - 160, 140))
        const d = Math.sign(targetX - p.blimp.x) || 1
        p.blimp.x += d * 265 / 60
        if ((d > 0 && p.blimp.x >= targetX) || (d < 0 && p.blimp.x <= targetX)) { p.revertPhase = 'descend'; p.revertT = 0 }
    } else if (p.revertPhase === 'descend') {
        p.blimp.y += 215 / 60
        if (p.blimp.y >= GROUND - 175) { p.blimp.y = GROUND - 175; p.revertPhase = 'carry'; p.revertT = 0; gs.events.push({ t: 'lift', x: p.blimp.x, y: p.blimp.y + 84 }) }
    } else if (p.revertPhase === 'carry') {
        if (p.revertT > CARRY_T) {
            p.reverting = false
            p.revertPhase = null
            const bx = p.blimp.x
            p.blimp = null
            gs.blimpOut = { x: bx, y: GROUND - 175, dir: gs.rng() < 0.5 ? -1 : 1 }
            p.x = Math.max(40, Math.min(gs.cityLen - 40, bx))
            p.y = GROUND
            p.vx = 0; p.vy = 0; p.onGround = true
            p.humanX = p.x; p.humanY = p.y
            p.hp = HP_MAX
            p.invuln = RESPAWN_T
            p.hurtT = 0; p.stunT = 0; p.attackT = 0; p.eatT = 0; p.climb = null
            p.revertDir = 0; p.humanDir = 0
            gs.score = gs.dayStartScore
            gs.combo = 1; gs.comboT = 0
            gs.events.push({ t: 'back', x: p.x, y: p.y - 140 })
        }
    }
    const focus = p.revertPhase === 'walk' ? p.humanX : (p.blimp ? p.blimp.x : p.humanX)
    const targetCam = Math.max(0, Math.min(gs.cityLen - W, focus - W * 0.5))
    gs.camX += (targetCam - gs.camX) * Math.min(1, 5 / 60)
}

// ------------------------------------------------------------ the day ----
function nextCity(gs) {
    gs.cityIndex++
    gs.day++
    if (gs.day > DAYS) {
        gs.end = 'won'
        gs.won = true
        gs.state = 'play'
        gs.events.push({ t: 'win' })
        return
    }
    buildCity(gs)
    gs.player.x = 140
    gs.player.y = GROUND
    gs.player.vx = 0; gs.player.vy = 0; gs.player.onGround = true
    gs.camX = 0
    gs.combo = 1
    gs.lives = Math.min(gs.lives + 1, LIFE_CAP)   // the morning papers print a fresh giant
    gs.state = 'play'
    gs.events.push({ t: 'newday', day: gs.day, city: cityName(gs.cityIndex) })
}

// --------------------------------------------------------------- step ----
export function step(gs, pad) {
    pad = pad || {}
    if (gs.end) { gs.tick++; return }
    gs.tick++
    const p = gs.player
    const prev = gs.prev            // capture BEFORE overwriting: the just() closure
    gs.prev = { ...pad }           // must compare against LAST tick's pads, not this one's
    const just = (k) => !!pad[k] && !prev[k]

    if (gs.state === 'clear') {
        gs.clearT--
        if (gs.clearT <= 0) nextCity(gs)
        return
    }

    // combo decay
    if (gs.comboT > 0) { gs.comboT--; if (gs.comboT <= 0) gs.combo = 1 }

    for (const k of ['invuln', 'attackT', 'eatT', 'landT', 'hurtT', 'stunT']) if (p[k] > 0) p[k]--

    // blimpOut drifts even mid-revert
    if (p.reverting) { updateRevert(gs); return }

    let left = !!pad.left, right = !!pad.right, heldUp = !!pad.up, heldDown = !!pad.down
    let jump = just('up'), punch = just('a'), eat = just('b')
    if (p.stunT > 0) {
        left = right = heldUp = heldDown = jump = punch = eat = false
    }

    // ---- climbing ----
    if (p.climb) {
        const b = p.climb
        if (!b.alive || b.crumbling) p.climb = null
        else {
            const top = GROUND - b.h
            const side = p.climbSide
            p.x = side === -1 ? b.x - p.w / 2 - 1 : b.x + b.w + p.w / 2 + 1
            p.facing = side === -1 ? 1 : -1
            p.vx = 0; p.vy = 0
            if (heldUp) p.y -= CLIMB_V
            if (heldDown) p.y += CLIMB_V
            if (left || right) {
                const away = side === -1 ? -1 : 1
                p.climb = null; p.onGround = false
                p.vx = away * PUSH_VX; p.vy = PUSH_VY; p.facing = away
                gs.events.push({ t: 'jump' })
            }
            if (p.climb) {
                if (p.y <= top) {
                    p.y = top; p.onGround = true; p.climb = null; p.vx = 0
                    p.x = Math.max(b.x + 24, Math.min(b.x + b.w - 24, p.x))
                    gs.events.push({ t: 'jump' })
                } else if (heldDown && p.y >= GROUND) {
                    p.y = GROUND; p.onGround = true; p.climb = null; p.vy = 0
                }
            }
        }
    }

    if (!p.climb) {
        const wasAirborne = !p.onGround
        const target = (right ? 1 : 0) - (left ? 1 : 0)
        p.vx = target * MOVE
        if (target !== 0) p.facing = target
        if (jump) {
            const climb = nearestClimbBuilding(gs)
            if (climb) {
                p.climb = climb.b; p.climbSide = climb.side
                p.vx = 0; p.vy = 0; p.onGround = false
                p.facing = climb.side === -1 ? 1 : -1
                gs.events.push({ t: 'jump' })
            } else if (p.onGround) {
                p.vy = JUMP_V; p.onGround = false
                gs.events.push({ t: 'jump' })
            }
        }
        if (!p.climb) {
            p.vy += GRAV
            p.x += p.vx
            p.y += p.vy
            if (p.vy >= 0) {
                for (const b of gs.buildings) {
                    if (!b.alive || b.crumbling) continue
                    const top = GROUND - b.h
                    const overlaps = p.x + p.w / 2 > b.x && p.x - p.w / 2 < b.x + b.w
                    if (overlaps && p.y >= top && p.y <= top + 44) { p.y = top; p.vy = 0; p.onGround = true; break }
                }
            }
            if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.onGround = true }
            if (wasAirborne && p.onGround) { p.landT = LAND_T; gs.events.push({ t: 'land', x: p.x, y: p.y }) }
            p.x = Math.max(40, Math.min(gs.cityLen - 40, p.x))

            // buildings block the street: push-out
            for (const b of gs.buildings) {
                if (!b.alive || b.crumbling) continue
                const top = GROUND - b.h
                if (p.x + p.w / 2 > b.x && p.x - p.w / 2 < b.x + b.w && p.y - 30 > top + 40) {
                    if (p.x < b.x + b.w / 2) p.x = b.x - p.w / 2 - 1
                    else p.x = b.x + b.w + p.w / 2 + 1
                    p.vx = 0
                }
            }
        }
    }
    p.walk += Math.abs(p.vx) * 0.045

    // ---- punch ----
    const onRoof = p.onGround && p.y < GROUND - 2
    p.punchAim = heldDown ? 'down' : heldUp ? 'up' : (onRoof ? 'down' : 'straight')
    if (punch) {
        p.attackT = ATTACK_T
        gs.events.push({ t: 'punchswipe', x: p.x + p.facing * 34, y: p.y - 100 })
        doPunch(gs)
    }

    if (eat) {
        let best = null, bd = 1e9
        for (const c of gs.civilians) {
            if (c.eaten) continue
            const d = Math.abs(c.x - p.x)
            if (d < 95 && d < bd) { best = c; bd = d }
        }
        if (best) { eatCivilian(gs, best); p.eatT = EAT_T }
    }

    // ---- civilians ----
    for (const c of gs.civilians) {
        if (c.corpse) continue
        c.wob += 1 / 60
        const dir = Math.sign(p.x - c.x) || 1
        c.vx = Math.abs(p.x - c.x) < 420 ? dir * 55 / 60 : Math.sin(c.wob * 0.7) * 22 / 60
        c.x += c.vx
        c.x = Math.max(50, Math.min(gs.cityLen - 50, c.x))
    }

    // ---- the military ----
    for (const t of gs.tanks) {
        const dir = Math.sign(p.x - t.x) || 1
        const dist = Math.abs(p.x - t.x)
        t.vx = dist < 620 ? dir * 42 / 60 : 0
        t.x += t.vx
        t.reload--
        if (t.reload <= 0 && dist < 780) {
            t.reload = rnd(gs, 2.2, 3.4) * 60
            fireBullet(gs, t.x, t.y - 46, p.x + rnd(gs, -30, 30), p.y - 50, 430, '#ff8a5c')
            gs.events.push({ t: 'shoot' })
        }
    }
    for (const c of gs.cars) {
        c.x += c.vx
        if (c.x < 60) { c.x = 60; c.vx = Math.abs(c.vx) }
        if (c.x > gs.cityLen - 60) { c.x = gs.cityLen - 60; c.vx = -Math.abs(c.vx) }
        c.reload--
        const dist = Math.abs(c.x - p.x)
        if (c.reload <= 0 && dist < 520 && Math.abs(c.y - p.y) < 140) {
            c.reload = rnd(gs, 1.8, 3) * 60
            fireBullet(gs, c.x, c.y - 30, p.x, p.y - 50, 520, '#ffd166')
            gs.events.push({ t: 'shoot' })
        }
    }
    for (const h of gs.helicopters) {
        h.x += h.vx
        h.wob += 1 / 60
        if (h.x < 100) h.vx = Math.abs(h.vx)
        if (h.x > gs.cityLen - 100) h.vx = -Math.abs(h.vx)
        h.reload--
        const dist = Math.abs(h.x - p.x)
        if (h.reload <= 0 && dist < 640) {
            h.reload = rnd(gs, 1.5, 2.8) * 60
            fireBullet(gs, h.x, h.y + 30, p.x, p.y - 40, 380, '#ff6b8a')
            gs.events.push({ t: 'shoot' })
        }
    }
    for (const b of gs.bullets) {
        b.x += b.vx; b.y += b.vy; b.life--
        if (b.y >= GROUND - 4 || b.life <= 0) { b.dead = true; continue }
        if (Math.abs(b.x - p.x) < 34 && b.y > p.y - 96 && b.y < p.y - 4) { b.dead = true; damagePlayer(gs, BULLET_DMG) }
    }
    gs.bullets = gs.bullets.filter((b) => !b.dead)
    gs.civilians = gs.civilians.filter((c) => !c.eaten)
    gs.tanks = gs.tanks.filter((t) => !t.dead)
    gs.cars = gs.cars.filter((c) => !c.dead)
    gs.helicopters = gs.helicopters.filter((h) => !h.dead)

    if (gs.end) return   // the last hit was the last life

    // ---- building collapse animation ----
    for (const b of gs.buildings) {
        if (!b.crumbling) continue
        b.crumbling += 1 / CRUMBLE_T
        const prog = Math.min(1, b.crumbling)
        b.crumblingTop = GROUND - b.h * (1 - prog)
        if (prog >= 1) {
            b.crumbling = 0
            b.alive = false
            gs.rubbles.push({ x: b.x, w: b.w, h: rnd(gs, 20, 40) })
            gs.events.push({ t: 'landed', x: b.x + b.w / 2 })
        }
    }

    // ---- city clear ----
    const remaining = gs.buildings.filter((b) => b.alive || b.crumbling).length
    if (remaining === 0 && gs.state === 'play' && !gs.end) {
        gs.state = 'clear'
        gs.clearT = CLEAR_T
        addScore(gs, 1000, p.x, p.y - 140)
        gs.events.push({ t: 'clear', day: gs.day, city: cityName(gs.cityIndex) })
    }

    // ---- camera ----
    const camTarget = Math.max(0, Math.min(gs.cityLen - W, p.x - W * 0.42 + p.facing * 60))
    gs.camX += (camTarget - gs.camX) * Math.min(1, 5 / 60)
}

export function buildingsLeft(gs) {
    return gs.buildings.filter((b) => b.alive || b.crumbling).length
}

// --------------------------------------------------------- state hash ----
const q = (v) => Math.round(v * 8)
export function stateHash(gs) {
    const p = gs.player
    const rows = [
        'st', gs.seed, gs.tick, gs.day, gs.cityIndex, gs.score, gs.lives,
        gs.won ? 1 : 0, gs.end || '-', gs.state, q(gs.combo),
        q(p.x), q(p.y), q(p.vx), q(p.vy), p.facing, p.hp | 0,
        p.attackT, p.eatT, p.stunT, p.invuln, p.onGround ? 1 : 0,
        p.climb ? 1 : 0, p.climbSide, p.reverting ? 1 : 0, p.revertPhase || '-',
        q(gs.camX), q(gs.cityLen),
    ]
    for (const b of gs.buildings) rows.push(q(b.x), q(b.h), b.alive ? 1 : 0, b.hp, b.crumbling ? q(b.crumbling) : 0, b.wins.filter((w) => w.shattered).length)
    for (const c of gs.civilians) rows.push(q(c.x), c.corpse ? 1 : 0)
    for (const t of gs.tanks) rows.push(q(t.x), t.hp)
    for (const c of gs.cars) rows.push(q(c.x), c.hp)
    for (const h of gs.helicopters) rows.push(q(h.x), q(h.y), h.hp)
    for (const b of gs.bullets) rows.push(q(b.x), q(b.y))
    let h = 0x811c9dc5
    for (const v of rows) {
        const s = String(v)
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    }
    return h >>> 0
}
