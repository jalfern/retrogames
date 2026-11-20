// sim.js — DOUBLE DRAGON S1 "Walnuts Street" — the pure brawler engine.
// DOM-free: Node (ddragoncheck) and the browser shell share THIS truth.
// Determinism law: every sim random derives from the seed (mulberry32);
// Math.random() may only feed juice in the shell (particles, shake).
//
// The spec (issue #2807, the original: Technōs arcade 1987):
//  - belt-scroll brawl with a depth axis (8-way walk, y = depth, draw order)
//  - weighted strikes: punch / kick / jump kick; stagger, knockdown, get-up
//  - the signature spin back-heel when surrounded
//  - one hit costs Billy a life (arcade lethal); 3 lives, respawn i-frames
//  - stick pickup extends reach and damage
//  - waves: Williams goons -> Amons (one armed) -> Abobo mini-boss
// S2 (the weapons wall, #2807): thrown knives (reusable steel), the whip
// (long multi-hit lash), smashable barrels (solid props hiding a weapon),
// one weapon in hand — contextual PUNCH: bare jab / knife throw / whip lash.

export const W = 320
export const H = 224
export const DEEP_TOP = 132   // far edge of the street band (feet y)
export const DEEP_BOT = 206   // near edge of the street band
export const STAGE_W = 960     // three screens to the clear
export const PROPS_DEPTH = DEEP_BOT + 4 // foreground props sit nearer than the fight band

export const CFG = {
    walkSpeed: 1.2,
    deepSpeed: 0.9,
    jumpV: 4.7,
    jumpG: 0.23,
    punch: { startup: 4, active: 4, recover: 6, reach: 15, depth: 7, dmg: 1 },
    kick: { startup: 6, active: 5, recover: 8, reach: 21, depth: 7, dmg: 2 },
    stickPunchReach: 23,
    stickKickReach: 27,
    stickDmg: 2,
    spin: { total: 26, reach: 24, dmg: 2 },
    jumpKickDmg: 3,
    hitstun: 14,          // enemy stagger on a non-knockdown hit
    downTime: 44,         // ticks flat on the street
    getupTime: 22,        // then this many ticks of enemy i-frames
    respawnIFrames: 100,
    grabRange: 15,
    grabEscape: 3,        // presses to break free
    grabTimeout: 52,      // ticks held before the thug's knee lands (a life)
    attackersMax: 2,      // crowd law: never three at once
    lives: 3,
    clearHold: 150,       // STAGE CLEAR banner ticks before the loop re-runs
    // --- S2 weapons wall (#2807) ---
    throwK: { startup: 4, total: 14 },   // PUNCH with a knife: the delivery
    knifeSpeed: 3.6,
    knifeDmg: 4,          // a thrown blade kills a Williams outright
    whip: { startup: 8, active: 8, recover: 12, reach: 34, dmg: 2, depth: 9 },
    barrelHp: 3,
}

export const ENEMY_DEF = {
    williams: { hp: 4, speed: 0.85, score: 200, reach: 16, tall: 32, color: 'williams' },
    amon: { hp: 6, speed: 0.95, score: 300, reach: 17, tall: 36, color: 'amon' },
    abobo: { hp: 14, speed: 0.7, score: 1000, reach: 20, tall: 44, color: 'abobo' },
}

export const WAVES = [
    { triggerX: 90, spawns: [{ kind: 'williams', side: 'left' }, { kind: 'williams', side: 'right' }] },
    { triggerX: 340, spawns: [{ kind: 'amon', side: 'right', stick: true }, { kind: 'amon', side: 'left' }] },
    { triggerX: 560, spawns: [{ kind: 'abobo', side: 'right' }, { kind: 'williams', side: 'left' }, { kind: 'williams', side: 'right' }] },
]

// mulberry32 — the one seeded rng the sim consumes.
export function mulberry32(seed) {
    let a = seed >>> 0
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function makeBilly() {
    return {
        x: 40, y: (DEEP_TOP + DEEP_BOT) / 2 | 0, face: 1,
        z: 0, zv: 0,
        state: 'idle',    // idle|walk|jump|punch|kick|spin|grabbed|dying
        stateT: 0, anim: 0,
        attackHit: null,  // set of enemy ids hit by the current swing
        inv: CFG.respawnIFrames, // merciful flicker at the start
        weapon: null,     // null | 'stick'
        grabFrom: null,   // enemy id holding him
        presses: 0, pressCooldown: 0,
        lives: CFG.lives,
    }
}

export function makeGame(seed = 1) {
    // rng rides IN the state so snapshot/restore is byte-exact (#391):
    // a JSON deep-copy of gs carries the generator integer, not a closure.
    const gs = {
        seed: seed >>> 0, rngState: seed >>> 0, nextId: 1,
        tick: 0, mode: 'play',   // play | clear | gameover
        score: 0, hi: 0,
        cleared: false,
        camX: 0, camLock: false,
        billy: makeBilly(),
        enemies: [],
        pickups: [],
        barrels: makeBarrels(),
        projectiles: [],
        waveIdx: 0, waveActive: false, banner: 0,
        scoreFlash: null, // { v, t } — HUD score delta on a KO/pickup (juice, not scored state)
        events: [],   // one-shot cues drained by the shell (sound/juice only)
        k: 0,         // KO streak timer helper
    }
    return gs
}

function spawnEnemy(gs, kind, side, stick) {
    const def = ENEMY_DEF[kind]
    const e = {
        id: gs.nextId++, kind,
        // #2810 item 5: spawn well off-screen so the enter FSM is actually
        // SEEN marching in — the old ±20 px faded in at the very pixel edge.
        x: side === 'left' ? gs.camX - 44 : gs.camX + W + 44,
        y: DEEP_TOP + Math.floor(rng(gs) * (DEEP_BOT - DEEP_TOP)),
        face: side === 'left' ? 1 : -1,
        hp: def.hp, state: 'enter', stateT: 0, anim: Math.floor(rng(gs) * 8),
        hasStick: !!stick, stickDropped: false,
        attackCooldown: 30 + Math.floor(rng(gs) * 60),
        inv: 0, spinHit: false,
    }
    gs.enemies.push(e)
    return e
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

// --------------------------------------------------------- S2 solid props ---
// Three barrels squat on Walnuts Street. They are OBSTACLES: anything that
// moves asks blocked() (the lamppost law) — Billy walks around them or hops
// the waist-high ones; goons slide the depth axis to get round them. Three
// clean hits splinter one and it gives up the steel inside.
export function makeBarrels() {
    return [
        { id: 1, x: 250, y: DEEP_TOP + 8, hp: CFG.barrelHp, shake: 0 },
        { id: 2, x: 430, y: 168, hp: CFG.barrelHp, shake: 0 },
        { id: 3, x: 700, y: DEEP_BOT - 8, hp: CFG.barrelHp, shake: 0 },
    ]
}

export function blocked(gs, x, y, radius = 0) {
    return gs.barrels.some((bar) => Math.abs(bar.x - x) <= 10 + radius && Math.abs(bar.y - y) <= 11 + radius)
}

// axis-separated move so a snagged x never eats the y (and vice versa).
// If a wanted x-step is denied by a prop, k-slip depth to the nearest open
// lane — real thugs walk AROUND the barrels, they do not lean on them.
function moveEntity(gs, ent, dx, dy, radius = 0) {
    let movedX = false
    if (dx && !blocked(gs, ent.x + dx, ent.y, radius)) { ent.x += dx; movedX = true }
    if (dy && !blocked(gs, ent.x, ent.y + dy, radius)) ent.y += dy
    if (dx && !movedX) {
        for (let k = 2; k <= 32; k++) {
            const dn = clamp(ent.y + k, DEEP_TOP, DEEP_BOT), up = clamp(ent.y - k, DEEP_TOP, DEEP_BOT)
            if (dn !== ent.y && !blocked(gs, ent.x, dn, radius)) { ent.y = dn; return }
            if (up !== ent.y && !blocked(gs, ent.x, up, radius)) { ent.y = up; return }
        }
    }
}

// Corner deadlock: a body pressed into a footprint corner can have BOTH axes
// blocked (every single-step destination is still inside). Slide the depth
// axis outward to the nearest open lane — nobody freezes on a barrel.
function stuckFree(gs, ent, radius = 0) {
    if (!blocked(gs, ent.x, ent.y, radius)) return
    for (let k = 1; k <= 32; k++) {
        const dn = ent.y + k, up = ent.y - k
        if (dn <= DEEP_BOT && !blocked(gs, ent.x, dn, radius)) { ent.y = dn; return }
        if (up >= DEEP_TOP && !blocked(gs, ent.x, up, radius)) { ent.y = up; return }
    }
    ent.x += ent.x <= gs.camX + W / 2 ? -12 : 12
}

// The barrel-law shared by every walking branch: when a body wants to step
// but wood owns the destination, slide the DEPTH axis until the lane opens.
// Keep the chosen direction while the road stays shut (re-derived dirs
// ping-pong on the mid-line); flip when the clamp eats the step (the pocket
// at DEEP_BOT under barrel 3 — the Abobo freeze); k-slip out if ±0.9 can't
// clear the band at this x at all. Seeds 1..24 pin every shape of this.
function depthSlip(gs, ent, radius = 0) {
    if (gs.barrels.length === 0) return
    const bar = gs.barrels.reduce((a, q) => (Math.abs(q.x - ent.x) < Math.abs(a.x - ent.x) ? q : a), gs.barrels[0])
    let dir = ent.dodge || (ent.y >= bar.y ? CFG.deepSpeed : -CFG.deepSpeed)
    let ny = clamp(ent.y + dir, DEEP_TOP, DEEP_BOT)
    if (ny === ent.y || blocked(gs, ent.x, ny, radius)) {
        const f = -dir
        const fy = clamp(ent.y + f, DEEP_TOP, DEEP_BOT)
        if (fy !== ny && !blocked(gs, ent.x, fy, radius)) { dir = f; ny = fy }
    }
    ent.dodge = ny !== ent.y ? dir : 0
    if (ny !== ent.y && !blocked(gs, ent.x, ny, radius)) ent.y = ny
    if (ent.dodge === 0) {
        for (let k = 2; k <= 32; k++) {
            const dn = clamp(ent.y + k, DEEP_TOP, DEEP_BOT), up = clamp(ent.y - k, DEEP_TOP, DEEP_BOT)
            if (dn !== ent.y && !blocked(gs, ent.x, dn, radius)) { ent.y = dn; ent.dodge = CFG.deepSpeed; break }
            if (up !== ent.y && !blocked(gs, ent.x, up, radius)) { ent.y = up; ent.dodge = -CFG.deepSpeed; break }
        }
    }
}

function rollWeaponDrop(gs, x, y) {
    const roll = rng(gs)
    const kind = roll < 0.4 ? 'knife' : roll < 0.8 ? 'whip' : 'stick'
    gs.pickups.push({ x: clamp(x, 8, STAGE_W - 8), y, kind, bob: 0 })
}

// a swing/blade met a barrel — hp down, splinter when empty
function hurtBarrel(gs, bar) {
    bar.hp -= 1
    bar.shake = 6
    gs.events.push('barrel_hit')
    if (bar.hp <= 0) {
        gs.barrels = gs.barrels.filter((q) => q !== bar)
        gs.score += 100
        gs.hi = Math.max(gs.hi, gs.score)
        gs.events.push('barrel_break')
        rollWeaponDrop(gs, bar.x, bar.y)
    }
}

function throwKnife(gs) {
    const b = gs.billy
    gs.projectiles.push({ id: gs.nextId++, x: b.x + b.face * 10, y: b.y, vx: b.face * CFG.knifeSpeed, spin: 0 })
    gs.events.push('throw')
}

function billyDies(gs) {
    const b = gs.billy
    b.lives -= 1
    b.weapon = null
    gs.events.push('billy_die')
    if (b.lives <= 0) {
        gs.mode = 'gameover'
        b.state = 'dying'; b.stateT = 0
        return
    }
    b.state = 'idle'; b.stateT = 0; b.z = 0; b.zv = 0
    b.inv = CFG.respawnIFrames
    b.x = clamp(gs.camX + 30, 8, STAGE_W - 8)
    let nudge = 0
    while (blocked(gs, b.x, b.y) && nudge++ < 60) b.x = clamp(b.x + 8, 8, STAGE_W - 8)
    b.grabFrom = null
    gs.enemies.forEach((e) => { if (e.state === 'grab') { e.state = 'stagger'; e.stateT = CFG.hitstun } })
}

// hit an enemy; returns true if it died
function hurtEnemy(gs, e, dmg, knockdown, onDowned) {
    if (e.inv > 0 || e.state === 'dying' || e.state === 'getup') return false
    if (e.state === 'down' && !onDowned) return false
    e.hp -= dmg
    gs.events.push(knockdown ? 'hit_hard' : 'hit')
    if (e.hp <= 0) {
        e.state = 'dying'; e.stateT = 0
        gs.score += ENEMY_DEF[e.kind].score
        gs.hi = Math.max(gs.hi, gs.score)
        gs.scoreFlash = { v: ENEMY_DEF[e.kind].score, t: 48 } // #2810 item 6
        gs.events.push('ko')
        if (e.hasStick && !e.stickDropped) {
            e.hasStick = false
            gs.pickups.push({ x: e.x, y: e.y, kind: 'stick', bob: 0 })
        }
        return true
    }
    if (knockdown) { e.state = 'down'; e.stateT = 0 } else { e.state = 'stagger'; e.stateT = CFG.hitstun }
    return false
}

function billyAttack(gs, kind) {
    const b = gs.billy
    if (b.state === 'punch' || b.state === 'kick' || b.state === 'spin' || b.state === 'throw' || b.state === 'whip') return
    // the signature spin back-heel: a swing asked for while surrounded —
    // surround counts radially (the heel boots BOTH ways), unlike a aimed swing
    const grounded = gs.enemies.filter((e) => e.state !== 'dying' && e.state !== 'down' && e.inv <= 0)
    const near = grounded.filter((e) => Math.abs(e.x - b.x) <= CFG.spin.reach + 6 && Math.abs(e.y - b.y) <= 10)
    if (b.z === 0 && near.length >= 2) {
        b.state = 'spin'; b.stateT = 0; b.attackHit = new Set()
        gs.events.push('whoosh')
        return
    }
    // contextual PUNCH — the weapons wall (#2807): the knife is thrown, not
    // waved; the whip lashes. KICK stays a kick whatever you hold.
    if (kind === 'punch' && b.z === 0 && b.weapon === 'knife') {
        b.weapon = null
        b.state = 'throw'; b.stateT = 0
        return
    }
    if (kind === 'punch' && b.z === 0 && b.weapon === 'whip') {
        b.state = 'whip'; b.stateT = 0; b.attackHit = new Set()
        gs.events.push('whip')
        return
    }
    if (b.z > 0) { b.state = kind === 'punch' ? 'punch' : 'kick'; b.attackHit = new Set(); gs.events.push('whoosh'); return }
    b.state = kind
    b.stateT = 0
    b.attackHit = new Set()
    gs.events.push('whoosh')
}

function reachFor(b, kind) {
    if (kind === 'whip') return CFG.whip.reach
    const stick = b.weapon === 'stick'
    if (kind === 'punch') return stick ? CFG.stickPunchReach : CFG.punch.reach
    return stick ? CFG.stickKickReach : CFG.kick.reach
}

function applySwing(gs) {
    const b = gs.billy
    const cfg = CFG[b.state]
    if (!cfg) return
    if (b.stateT < cfg.startup || b.stateT >= cfg.startup + cfg.active) return
    const reach = reachFor(b, b.state)
    const stick = b.weapon === 'stick'
    const dmg = stick ? CFG.stickDmg : b.state === 'whip' ? CFG.whip.dmg : cfg.dmg
    const down = b.state === 'kick' || stick || b.state === 'whip'
    const tol = b.state === 'whip' ? CFG.whip.depth : CFG.punch.depth + 2
    for (const e of gs.enemies) {
        if (b.attackHit.has(e.id)) continue
        if (e.state === 'dying') continue
        if (e.state === 'down') continue   // standing swings do not stomp
        const dx = (e.x - b.x) * b.face
        if (dx > -6 && dx <= reach && Math.abs(e.y - b.y) <= tol) {
            b.attackHit.add(e.id)
            hurtEnemy(gs, e, dmg, down)
        }
    }
    // barrels take the blows too — that is how the steel comes out
    for (const bar of gs.barrels) {
        const key = 'b' + bar.id
        if (b.attackHit.has(key)) continue
        const dx = (bar.x - b.x) * b.face
        if (dx > -6 && dx <= reach && Math.abs(bar.y - b.y) <= tol) {
            b.attackHit.add(key)
            hurtBarrel(gs, bar)
        }
    }
}

function applyJumpKick(gs) {
    const b = gs.billy
    if (b.z <= 2) return
    for (const e of gs.enemies) {
        if (b.attackHit.has(e.id) || e.state === 'dying' || e.state === 'down') continue
        if (Math.abs(e.x - b.x) <= 18 && Math.abs(e.y - b.y) <= CFG.punch.depth) {
            b.attackHit.add(e.id)
            hurtEnemy(gs, e, CFG.jumpKickDmg, true)
        }
    }
}

function applySpin(gs) {
    const b = gs.billy
    for (const e of gs.enemies) {
        if (b.attackHit.has(e.id) || e.state === 'dying' || e.state === 'down') continue
        const dx = Math.abs(e.x - b.x)
        if (dx <= CFG.spin.reach && Math.abs(e.y - b.y) <= 10) {
            b.attackHit.add(e.id)
            hurtEnemy(gs, e, CFG.spin.dmg, true)
        }
    }
    for (const bar of gs.barrels) {
        const key = 'b' + bar.id
        if (b.attackHit.has(key)) continue
        if (Math.abs(bar.x - b.x) <= CFG.spin.reach && Math.abs(bar.y - b.y) <= 10) {
            b.attackHit.add(key)
            hurtBarrel(gs, bar)
        }
    }
}

function applyStomp(gs) {
    const b = gs.billy
    if (b.z > 0) return
    for (const e of gs.enemies) {
        if (e.state !== 'down' || b.attackHit.has(e.id)) continue
        if (Math.abs(e.x - b.x) <= reachFor(b, 'kick') && Math.abs(e.y - b.y) <= 9) {
            b.attackHit.add(e.id)
            e.inv = 0
            hurtEnemy(gs, e, 1, false, true)
            if (e.hp > 0) { e.state = 'down'; e.stateT = Math.floor(CFG.downTime / 2) }
            gs.events.push('stomp')
        }
    }
}

function updateBilly(gs, pad) {
    const b = gs.billy
    if (b.state === 'dying') { b.stateT += 1; return }
    if (b.inv > 0) b.inv -= 1
    if (b.pressCooldown > 0) b.pressCooldown -= 1

    // grabbed: mash B (kick) to break free
    if (b.state === 'grabbed') {
        b.stateT += 1
        if (pad.b && b.pressCooldown <= 0) { b.presses += 1; b.pressCooldown = 6; gs.events.push('struggle') }
        const holder = gs.enemies.find((e) => e.id === b.grabFrom)
        if (b.presses >= CFG.grabEscape) {
            b.state = 'idle'; b.stateT = 0; b.presses = 0; b.grabFrom = null
            if (holder) { holder.state = 'stagger'; holder.stateT = CFG.hitstun; holder.attackCooldown = 80 }
            gs.events.push('escape')
        } else if (b.stateT >= CFG.grabTimeout) {
            b.state = 'idle'; b.presses = 0; b.grabFrom = null
            billyDies(gs)
        }
        return
    }

    // attack state machines
    if (b.state === 'punch' || b.state === 'kick' || b.state === 'whip') {
        b.stateT += 1
        const cfg = CFG[b.state]
        applySwing(gs)
        if (b.state !== 'whip') { applyJumpKick(gs); applyStomp(gs) }
        if (b.stateT >= cfg.startup + cfg.active + cfg.recover) { b.state = b.z > 0 ? 'jump' : 'idle'; b.stateT = 0 }
    } else if (b.state === 'throw') {
        b.stateT += 1
        if (b.stateT === CFG.throwK.startup) throwKnife(gs)
        if (b.stateT >= CFG.throwK.total) { b.state = 'idle'; b.stateT = 0 }
    } else if (b.state === 'spin') {
        b.stateT += 1
        applySpin(gs)
        if (b.stateT >= CFG.spin.total) { b.state = 'idle'; b.stateT = 0 }
    }

    // new attack inputs
    if (pad.b) billyAttack(gs, 'kick')
    else if (pad.punch) billyAttack(gs, 'punch')

    // jump: the A verb (Space / pad.a). ArrowUp/Down are the DEPTH axis —
    // in a belt-scroller the stick walks the street, the buttons do the tricks.
    if ((pad.a || pad.jump) && b.z === 0 && b.state !== 'punch' && b.state !== 'kick' && b.state !== 'spin' && b.state !== 'throw' && b.state !== 'whip') {
        b.z = 0.001; b.zv = CFG.jumpV
        b.state = 'jump'; b.stateT = 0
        gs.events.push('jump')
    }
    if (b.z > 0 || b.zv > 0) {
        b.z += b.zv
        b.zv -= CFG.jumpG
        if (b.z <= 0) {
            b.z = 0; b.zv = 0
            if (b.state === 'jump') { b.state = 'idle'; b.stateT = 0 }
            gs.events.push('land')
        }
    }

    // walking (locked out mid-swing on the ground; air keeps drift).
    // Barrels are solid to grounded bodies — walk round them, hop over them.
    let moving = false
    const canWalk = b.z > 0 || b.state === 'idle' || b.state === 'walk'
    const solid = b.z <= 8
    if (canWalk) {
        if (pad.left) { b.face = -1; if (!(solid && blocked(gs, b.x - CFG.walkSpeed, b.y))) { b.x -= CFG.walkSpeed; moving = true } }
        if (pad.right) { b.face = 1; if (!(solid && blocked(gs, b.x + CFG.walkSpeed, b.y))) { b.x += CFG.walkSpeed; moving = true } }
        if (pad.up && b.z === 0 && !(blocked(gs, b.x, b.y - CFG.deepSpeed))) { b.y -= CFG.deepSpeed; moving = true }
        if (pad.down && b.z === 0 && !(blocked(gs, b.x, b.y + CFG.deepSpeed))) { b.y += CFG.deepSpeed; moving = true }
    }
    b.x = clamp(b.x, 8, STAGE_W - 8)
    b.y = clamp(b.y, DEEP_TOP, DEEP_BOT)
    if (b.z <= 8) stuckFree(gs, b)
    if (b.z === 0) b.state = moving ? 'walk' : (b.state === 'walk' ? 'idle' : b.state)
    if (moving || b.state !== 'idle') b.anim += 1

    // weapon pickups — one in hand, the original carries no armoury
    for (let i = gs.pickups.length - 1; i >= 0; i--) {
        const p = gs.pickups[i]
        p.bob += 1
        if (Math.abs(p.x - b.x) <= 10 && Math.abs(p.y - b.y) <= 8 && !b.weapon) {
            gs.pickups.splice(i, 1)
            b.weapon = p.kind
            gs.score += 100
            gs.scoreFlash = { v: 100, t: 48 }
            gs.events.push('pickup')
        }
    }
}

function attackerCount(gs) {
    return gs.enemies.filter((e) => e.state === 'attack' || e.state === 'windup').length
}

function enemyNearest(gs) {
    const b = gs.billy
    let best = null, bd = 1e9
    for (const e of gs.enemies) {
        if (e.state === 'dying' || e.state === 'enter') continue
        const d = Math.abs(e.x - b.x) + Math.abs(e.y - b.y) * 0.6
        if (d < bd) { bd = d; best = e }
    }
    return best
}

function updateEnemy(gs, e) {
    const b = gs.billy
    const def = ENEMY_DEF[e.kind]
    // Solidity is center-line: a body-radius INFLATES the footprint until the
    // pocket between barrel and street-edge has no open step — bodies re-pin
    // (seeds 7/8/10/19/21/23 all froze this way). Center-line + k-slip keeps
    // the street flowing; a few px of sprite overlap at the rim is the honest
    // arcade abstraction.
    const rad = e.kind === 'abobo' ? 8 : e.kind === 'amon' ? 5 : 4
    if (e.inv > 0) e.inv -= 1
    e.anim += 1

    switch (e.state) {
    case 'enter': {
        // walk onto the street from the spawn side (#2810 item 5: the walk-in
        // runs deep into the frame — 70 px of visible march, not a edge-fade)
        const tx = e.x < b.x ? gs.camX + 26 : gs.camX + W - 26
        const dx = Math.sign(tx - e.x)
        const sp = def.speed + 0.5
        if (dx > 0 && !blocked(gs, e.x + sp, e.y, rad)) { e.x += sp; e.dodge = 0 }
        else if (dx < 0 && !blocked(gs, e.x - sp, e.y, rad)) { e.x -= sp; e.dodge = 0 }
        else {
            // slip AWAY from the blocking barrel lane, and keep the direction
            // while the road stays shut. Three traps, all pinned by seeds 1..24:
            // re-deriving dir from the current y ping-pongs on the mid-line; a
            // clamp at the depth edge returns ny === e.y (a vacuous dodge - the
            // Abobo freeze at barrel 3 near lip); and at rad 8 the barrel band
            // can cover the whole pocket, so the only open lane may be the
            // barrels own side - hence try both directions, keep the first one
            // that actually moves.
            const bar = gs.barrels.reduce((a, q) => (Math.abs(q.x - e.x) < Math.abs(a.x - e.x) ? q : a), gs.barrels[0])
            let dir = e.dodge || (e.y >= bar.y ? CFG.deepSpeed : -CFG.deepSpeed)
            let ny = clamp(e.y + dir, DEEP_TOP, DEEP_BOT)
            if (ny === e.y || blocked(gs, e.x, ny, rad)) {
                const f = -dir
                const fy = clamp(e.y + f, DEEP_TOP, DEEP_BOT)
                if (fy !== ny && !blocked(gs, e.x, fy, rad)) { dir = f; ny = fy }
            }
            e.dodge = ny !== e.y ? dir : 0
            if (ny !== e.y && !blocked(gs, e.x, ny, rad)) e.y = ny
            // still pinned (deep body in a shallow pocket: floor + barrel):
            // k-slip depth to the nearest lane that truly opens
            if (e.dodge === 0) {
                for (let k = 2; k <= 32; k++) {
                    const dn = clamp(e.y + k, DEEP_TOP, DEEP_BOT), up = clamp(e.y - k, DEEP_TOP, DEEP_BOT)
                    if (dn !== e.y && !blocked(gs, e.x, dn, rad)) { e.y = dn; e.dodge = CFG.deepSpeed; break }
                    if (up !== e.y && !blocked(gs, e.x, up, rad)) { e.y = up; e.dodge = -CFG.deepSpeed; break }
                }
            }
        }
        e.face = Math.sign(b.x - e.x) || 1
        if ((dx > 0 && e.x >= gs.camX + 26 && !blocked(gs, e.x, e.y, rad)) || (dx < 0 && e.x <= gs.camX + W - 26 && !blocked(gs, e.x, e.y, rad))) { e.state = 'walk'; e.stateT = 0 }
        break
    }
    case 'walk': {
        if (b.state === 'dying' || gs.mode === 'gameover') break
        e.face = Math.sign(b.x - e.x) || 1
        const dx = b.x - e.x
        const dy = b.y - e.y
        const adx = Math.abs(dx)
        if (e.attackCooldown > 0) e.attackCooldown -= 1

        // Abobo's shoulder charge (#2810 item 3): from mid-distance the giant
        // telegraphs two beats of run-up, then body-checks the lane. Telegraph
        // first, depth still decides (a lane over, it whooses past).
        if (e.kind === 'abobo' && adx >= 40 && adx <= 150 && Math.abs(dy) <= 14
            && e.attackCooldown <= 0 && attackerCount(gs) < CFG.attackersMax) {
            e.state = 'chargewind'; e.stateT = 0
            gs.events.push('chargewind')
            break
        }

        // grab attempt (grounded, uninvited Billy)
        const grabOk = (e.kind === 'amon' || e.kind === 'abobo')
        if (grabOk && b.z === 0 && b.inv <= 0 && b.state !== 'grabbed'
            && b.state !== 'dying' && adx <= CFG.grabRange && Math.abs(dy) <= 5 && e.attackCooldown <= 0
            && attackerCount(gs) < CFG.attackersMax) {
            e.state = 'grab'; e.stateT = 0
            b.state = 'grabbed'; b.stateT = 0; b.presses = 0; b.grabFrom = e.id
            gs.events.push('grabbed')
            break
        }

        // attack decision
        const inRange = adx <= def.reach && Math.abs(dy) <= 6 && b.state !== 'dying'
        if (inRange && e.attackCooldown <= 0 && attackerCount(gs) < CFG.attackersMax) {
            e.state = 'windup'; e.stateT = 0
            break
        }
        // approach: close x and match depth; back-row thugs hang slightly off
        const slot = gs.enemies.filter((o) => o !== e && o.state !== 'dying' && Math.sign(o.x - b.x) === Math.sign(e.x - b.x) && Math.abs(o.x - b.x) < 26).length
        const wantX = b.x - Math.sign(dx || 1) * (def.reach - 4 + slot * 14)
        const stepX = Math.abs(wantX - e.x) > 3 ? clamp(wantX - e.x, -def.speed, def.speed) : 0
        const stepY = Math.abs(dy) > 2 ? clamp(dy, -def.speed * 0.8, def.speed * 0.8) : 0
        const px = e.x, py = e.y
        moveEntity(gs, e, stepX, stepY, rad)
        if ((stepX !== 0 && e.x === px) || (stepY !== 0 && e.y === py)) depthSlip(gs, e, rad)
        else if (stepX !== 0) e.dodge = 0
        break
    }
    case 'windup': {
        e.stateT += 1
        e.face = Math.sign(b.x - e.x) || e.face
        if (e.stateT >= 12) { e.state = 'attack'; e.stateT = 0 }
        break
    }
    case 'chargewind': {
        // two running frames + a dip — the read before the body-check lands
        e.stateT += 1
        e.face = Math.sign(b.x - e.x) || e.face
        if (Math.abs(b.y - e.y) > 2) e.y += clamp(b.y - e.y, -def.speed * 0.6, def.speed * 0.6)
        e.y = clamp(e.y, DEEP_TOP, DEEP_BOT)
        stuckFree(gs, e, rad)
        if (e.stateT >= 16) { e.state = 'charge'; e.stateT = 0; gs.events.push('charge') }
        break
    }
    case 'charge': {
        e.stateT += 1
        const dash = e.face * 2.8
        if (blocked(gs, e.x + dash, e.y, rad)) {
            // the shoulder meets wood — Abobo splinters it (#2807 props law)
            const bar = gs.barrels.find((q) => Math.abs(q.x - (e.x + dash)) <= 10 + rad && Math.abs(q.y - e.y) <= 11 + rad)
            if (bar) hurtBarrel(gs, bar)
        } else e.x += dash
        if (e.stateT > 2) {
            const hit = b.z <= 6 && Math.abs(e.x - b.x) <= 16 && Math.abs(e.y - b.y) <= 8 && b.state !== 'grabbed'
            if (hit && b.inv <= 0 && b.state !== 'dying' && gs.mode === 'play') {
                billyDies(gs)
                e.state = 'back'; e.stateT = 0; e.attackCooldown = 90
                break
            }
        }
        const off = e.x < gs.camX - 10 || e.x > gs.camX + W + 10
        if (e.stateT >= 60 || off) { e.state = 'back'; e.stateT = 0; e.attackCooldown = 70 + Math.floor(rng(gs) * 40) }
        break
    }
    case 'attack': {
        e.stateT += 1
        if (e.stateT === 3) {
            const hit = b.z <= 8 && Math.abs(e.x - b.x) <= def.reach + 4 && Math.abs(e.y - b.y) <= 8 && b.state !== 'grabbed'
            if (hit && b.inv <= 0 && b.state !== 'dying' && gs.mode === 'play') {
                billyDies(gs)
            }
        }
        if (e.stateT >= 14) { e.state = 'back'; e.stateT = 0; e.attackCooldown = 50 + Math.floor(rng(gs) * 50) }
        break
    }
    case 'back': {
        e.stateT += 1
        moveEntity(gs, e, -e.face * def.speed * 0.7, 0, rad)
        if (e.stateT >= 24) { e.state = 'walk'; e.stateT = 0 }
        break
    }
    case 'grab': {
        // holding Billy; the escape/timeout is resolved in updateBilly
        e.face = Math.sign(b.x - e.x) || e.face
        const drag = clamp(b.x - e.face * 10 - e.x, -1, 1)
        if (!blocked(gs, e.x + drag, e.y, rad)) e.x += drag
        break
    }
    case 'stagger': {
        e.stateT -= 1
        moveEntity(gs, e, -e.face * 0.4, 0, rad)
        if (e.stateT <= 0) { e.state = 'walk'; e.stateT = 0 }
        break
    }
    case 'down': {
        e.stateT += 1
        if (e.stateT >= CFG.downTime) { e.state = 'getup'; e.stateT = 0; e.inv = CFG.getupTime }
        break
    }
    case 'getup': {
        e.stateT += 1
        if (e.stateT >= CFG.getupTime) { e.state = 'walk'; e.stateT = 0; e.attackCooldown = 20 }
        break
    }
    case 'dying': {
        e.stateT += 1
        break
    }
    }
    e.y = clamp(e.y, DEEP_TOP, DEEP_BOT)
    if (e.state !== 'dying' && e.state !== 'down' && e.state !== 'getup') stuckFree(gs, e, rad)
}

export function step(gs, pad = {}) {
    gs.tick += 1
    if (gs.scoreFlash && --gs.scoreFlash.t <= 0) gs.scoreFlash = null

    if (gs.mode === 'clear') {
        gs.banner -= 1
        if (gs.banner <= 0) {
            // the loop re-runs Walnuts Street, score carried (arcade law)
            gs.mode = 'play'
            gs.cleared = true
            gs.waveIdx = 0
            gs.waveActive = false
            gs.enemies = []
            gs.pickups = []
            gs.barrels = makeBarrels()
            gs.projectiles = []
            gs.camX = 0
            const b = gs.billy
            b.x = 40; b.inv = CFG.respawnIFrames
        }
        return gs
    }
    if (gs.mode === 'gameover') {
        updateBilly(gs, {})
        gs.enemies.forEach((e) => updateEnemy(gs, e))
        return gs
    }

    const b = gs.billy
    updateBilly(gs, pad)

    // camera: follow, then lock while a wave lives
    if (!gs.camLock) {
        const target = clamp(b.x - Math.floor(W * 0.45), 0, STAGE_W - W)
        gs.camX += clamp(target - gs.camX, -3, 3)
    }
    b.x = clamp(b.x, gs.camX + 8, gs.camX + W - 8)

    // wave triggers
    if (!gs.waveActive && gs.waveIdx < WAVES.length && b.x >= WAVES[gs.waveIdx].triggerX) {
        const w = WAVES[gs.waveIdx]
        gs.waveActive = true
        gs.camLock = true
        w.spawns.forEach((s) => spawnEnemy(gs, s.kind, s.side, s.stick))
        gs.events.push('wave')
    }

    gs.enemies.forEach((e) => updateEnemy(gs, e))
    gs.enemies = gs.enemies.filter((e) => !(e.state === 'dying' && e.stateT > 30))

    // thrown blades: flat flight down the lane; steel is reusable — a knife
    // that hits (or reaches the end of the street) lands as a pickup again.
    for (let i = gs.projectiles.length - 1; i >= 0; i--) {
        const pr = gs.projectiles[i]
        pr.x += pr.vx
        pr.spin += 1
        let done = false
        for (const e of gs.enemies) {
            if (e.state === 'dying' || e.state === 'down' || e.inv > 0) continue
            if (Math.abs(pr.x - e.x) <= 10 && Math.abs(pr.y - e.y) <= 7) {
                hurtEnemy(gs, e, CFG.knifeDmg, true)
                gs.events.push('knife_hit')
                done = true
                break
            }
        }
        if (!done && (pr.x < 8 || pr.x > STAGE_W - 8)) done = true
        if (done) {
            gs.projectiles.splice(i, 1)
            gs.pickups.push({ x: clamp(pr.x, 8, STAGE_W - 8), y: pr.y, kind: 'knife', bob: 0 })
        }
    }
    gs.barrels.forEach((bar) => { if (bar.shake > 0) bar.shake -= 1 })

    // wave cleared?
    if (gs.waveActive && gs.enemies.length === 0 && gs.mode === 'play') {
        gs.waveActive = false
        gs.camLock = false
        gs.waveIdx += 1
        if (gs.waveIdx >= WAVES.length) {
            gs.mode = 'clear'
            gs.banner = CFG.clearHold
            gs.score += 500
            gs.hi = Math.max(gs.hi, gs.score)
            gs.events.push('clear')
        }
    }
    return gs
}

// The honest-percept autopilot: reads the same truth the screen shows.
// Used by the attract demo AND the harness WINNABLE proof.
export function autopilot(gs) {
    const b = gs.billy
    const pad = { left: false, right: false, up: false, down: false, a: false, b: false }
    if (gs.mode !== 'play' || b.state === 'grabbed') {
        if (b.state === 'grabbed' && gs.tick % 4 === 0) pad.b = true // mash free
        return pad
    }
    const target = enemyNearest(gs)
    if (!target) {
        pad.right = true
        return laneChange(gs, pad)
    }
    const dx = target.x - b.x
    const dy = target.y - b.y
    const adx = Math.abs(dx)
    // bail out of a windup about to land near us — Abobo's charge telegraph
    // reads from further off, so the sidestep window is wider (#2810 item 3)
    const threat = gs.enemies.find((e) => (
        ((e.state === 'windup' || e.state === 'attack') && Math.abs(e.x - b.x) < 30 && Math.abs(e.y - b.y) <= 7)
        || ((e.state === 'chargewind' || e.state === 'charge') && Math.abs(e.x - b.x) < 60 && Math.abs(e.y - b.y) <= 14)))
    if (threat && b.z === 0) {
        if (threat.state === 'chargewind' || threat.state === 'charge') {
            // a shouldering giant outruns boots — slip off the lane, don't flee down it
            let dir = b.y > threat.y ? 1 : b.y < threat.y ? -1 : 1
            const ny = b.y + dir * 16
            if (ny < DEEP_TOP || ny > DEEP_BOT) dir = -dir
            pad[dir < 0 ? 'up' : 'down'] = true
            return pad
        }
        if (gs.tick % 3 === 0) pad.up = gs.tick % 6 === 0
        pad.left = threat.x > b.x
        pad.right = threat.x < b.x
        return laneChange(gs, pad)
    }
    if (Math.abs(dy) > 3) { pad.up = dy < 0; pad.down = dy > 0 }
    if (adx > 16) { pad.right = dx > 0; pad.left = dx < 0 }
    else {
        const surrounded = gs.enemies.filter((e) => e.state !== 'dying' && e.state !== 'down' && Math.abs(e.x - b.x) <= CFG.spin.reach + 6 && Math.abs(e.y - b.y) <= 10).length >= 2
        if (!surrounded && gs.tick % 9 < 2) pad.b = true // kick (kicks knock down)
        else if (surrounded && gs.tick % 7 < 2) pad.b = true // spin back-heel
    }
    return laneChange(gs, pad)
}

// The weapons wall final pass (#2807): if the direction being pressed runs
// into a barrel on our own lane, change lanes instead — solid props are
// part of the road.
function laneChange(gs, pad) {
    const b = gs.billy
    const pressX = pad.right ? 1 : pad.left ? -1 : 0
    if (!pressX || b.z !== 0 || pad.b) return pad
    const bar = gs.barrels.find((q) => Math.abs(q.y - b.y) <= 12 && (q.x - b.x) * pressX > 0 && Math.abs(q.x - b.x) < 24)
    if (!bar) return pad
    pad.right = pad.left = false
    let dir = b.y > bar.y ? 1 : b.y < bar.y ? -1 : (bar.y > (DEEP_TOP + DEEP_BOT) / 2 ? -1 : 1)
    if (b.y + dir * 14 < DEEP_TOP || b.y + dir * 14 > DEEP_BOT) dir = -dir
    if (dir < 0) pad.down = false
    else pad.up = false
    pad[dir < 0 ? 'up' : 'down'] = true
    return pad
}

export function rng(gs) {
    gs.rngState = (gs.rngState + 0x6D2B79F5) | 0
    let t = Math.imul(gs.rngState ^ (gs.rngState >>> 15), 1 | gs.rngState)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function stateHash(gs) {
    let h = 2166136261
    const mix = (v) => { h ^= Math.round(v * 1000) & 0xffffffff; h = Math.imul(h, 16777619) }
    mix(gs.tick)
    mix(gs.score)
    mix(gs.mode === 'play' ? 1 : gs.mode === 'clear' ? 2 : 3)
    mix(gs.camX)
    mix(gs.waveIdx)
    const b = gs.billy
    mix(b.x); mix(b.y); mix(b.z); mix(b.lives)
    mix(b.state.length); mix(b.face); mix(b.weapon ? 1 : 0)
    mix(gs.enemies.length)
    for (const e of gs.enemies) {
        mix(e.id); mix(e.x); mix(e.y); mix(e.hp); mix(e.state.length); mix(e.inv)
    }
    return h >>> 0
}
