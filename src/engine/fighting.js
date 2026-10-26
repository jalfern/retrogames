// IRON RING shared fighting core (#1095). One engine, many fighters: the state
// machine, frame data resolution, hitboxes/hurtboxes, motion-input parser,
// round flow, projectiles and the tiered CPU live here so any 1v1 fighter
// (IRON RING now, the Mortal-Kombat-style title #1096 next) plugs in its roster
// as data and never re-implements the rules.
//
// #1096 options (VIPER PIT), all default-off so IRON RING's sims are
// bit-identical: `guardButton` (blocking needs the dedicated pad.bk verb,
// back-walking never blocks) and move-level `finisher`/`finishAt` (a signature
// finishing move that ends the round outright — in style — when it drops an
// already-wounded opponent). #1106 adds `juggle`: launched victims hang in a
// pocket instead of flinging away, exactly ONE aerial follow-up connects per
// launch, and the juggle lock clears when the victim's back touches the floor.
//
// Determinism law (#494/#495): createMatch(seed) + identical pad streams ⇒
// identical matchHash every tick. Every random the SIM consumes comes from the
// seed; renderer juice (particles, shake) may use Math.random, this file may
// not. Pure Node: no DOM, no timers — step() advances exactly one tick.
//
// Units: metres, +x = right, +y = up, floor y=0, facing ±1 (1 = facing right).

export const FIXED_DT = 1000 / 60
export const WALL = 9
export const GRAV = 0.00435
export const JUMP_VY = 0.098
export const WALK_F = 0.088
export const WALK_B = 0.068
export const BODY_HALF = 0.42
export const THROW_RANGE = 1.5
export const ROUND_TIME = 99
export const KO_FREEZE = 170
export const INTRO_FREEZE = 150

// ---- rng (mulberry32 — the repo's seeded stream) ------------------------------
export function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// ---- default frame data ---------------------------------------------------------
// box: [x0, y0, x1, y1] relative to the fighter, x forward-positive.
// low = must be crouch-blocked; overhead = cannot be crouch-blocked.
export const BASE_MOVES = {
    lp: { type: 'punch', startup: 4, active: 3, recovery: 7, dmg: 4, hitstun: 13, blockstun: 8, push: 0.05, box: [0.55, 1.15, 1.55, 1.55], cancel: ['hp', 'lk', 'hk', 'sp', 'super'] },
    hp: { type: 'punch', startup: 8, active: 4, recovery: 15, dmg: 9, hitstun: 19, blockstun: 11, push: 0.12, box: [0.6, 1.1, 2.0, 1.7], cancel: ['sp', 'super'] },
    lk: { type: 'kick', startup: 5, active: 3, recovery: 9, dmg: 5, hitstun: 14, blockstun: 9, push: 0.06, box: [0.6, 0.75, 1.75, 1.25], cancel: ['hk', 'sp', 'super'] },
    hk: { type: 'kick', startup: 9, active: 4, recovery: 16, dmg: 11, hitstun: 20, blockstun: 12, push: 0.16, launch: 0.05, box: [0.6, 0.6, 2.3, 1.3], cancel: ['sp', 'super'] },
    clp: { type: 'punch', startup: 4, active: 3, recovery: 8, dmg: 4, hitstun: 13, blockstun: 8, push: 0.05, box: [0.5, 0.7, 1.45, 1.1], cancel: ['chp', 'clk', 'chk', 'sp', 'super'] },
    chp: { type: 'punch', startup: 8, active: 4, recovery: 16, dmg: 9, hitstun: 19, blockstun: 11, push: 0.12, box: [0.5, 0.65, 1.9, 1.25], cancel: ['sp', 'super'] },
    clk: { type: 'kick', startup: 5, active: 3, recovery: 9, dmg: 5, hitstun: 14, blockstun: 9, push: 0.05, low: true, box: [0.5, 0.05, 1.6, 0.55], cancel: ['chk', 'sp', 'super'] },
    chk: { type: 'kick', startup: 9, active: 5, recovery: 18, dmg: 10, hitstun: 18, blockstun: 11, push: 0.1, low: true, box: [0.5, 0.02, 2.2, 0.6], cancel: ['sp', 'super'] },
    al: { type: 'kick', startup: 5, active: 6, recovery: 6, dmg: 7, hitstun: 16, blockstun: 10, push: 0.08, overhead: true, box: [0.35, 0.5, 1.7, 1.5] },
    throw: { type: 'throw', startup: 3, active: 2, recovery: 20, dmg: 12, hitstun: 30, push: 0.14, launch: 0.09, box: [0.4, 0.6, 1.45, 1.8] },
}

export function fighterMoves(def) {
    const mv = {}
    for (const k of Object.keys(BASE_MOVES)) mv[k] = { ...BASE_MOVES[k], ...(def.reach ? { reachMul: def.reach } : {}) }
    for (const k of Object.keys(def.moves || {})) mv[k] = { ...def.moves[k] }
    return mv
}

// ---- fighter --------------------------------------------------------------------
function createFighter(def, side) {
    return {
        def, side,
        x: side === 0 ? -2.6 : 2.6, y: 0, vx: 0, vy: 0,
        facing: side === 0 ? 1 : -1,
        hp: def.hp || 100, meter: 0,
        st: 'idle', sf: 0, move: null, phase: '', hitOnce: {},
        blockHeld: false, crouchBlock: false,
        buf: [], press: null,
        charge: 0,
        combo: 0, comboTimer: 0,
        juggled: 0,
        wins: 0,
        cpuScript: [], cpuCool: 0, cpuSeenAtk: -999,
        lastAnim: 'idle', animT: 0,
    }
}

export function createMatch(cfg) {
    const { seed, p1, p2, rounds = 2, time = ROUND_TIME } = cfg
    const m = {
        seed: seed >>> 0, rounds, maxRounds: 2 * rounds + 1,
        guardButton: !!cfg.guardButton,
        juggle: !!cfg.juggle,
        rng: mulberry32((seed >>> 0) ^ 0x1234abc9),
        tick: 0, phase: 'intro', phaseT: INTRO_FREEZE,
        timer: time * 60, hitstop: 0, round: 1,
        banner: 'ROUND 1', bannerT: INTRO_FREEZE,
        fx: [],
        fighters: [createFighter(p1, 0), createFighter(p2, 1)],
        projectiles: [],
        winner: null,
        events: [],
    }
    return m
}

export function resetRound(m) {
    for (const f of m.fighters) {
        f.x = f.side === 0 ? -2.6 : 2.6
        f.y = 0; f.vx = 0; f.vy = 0
        f.facing = f.side === 0 ? 1 : -1
        f.hp = f.def.hp || 100
        f.st = 'idle'; f.sf = 0; f.move = null; f.phase = ''; f.hitOnce = {}
        f.buf = []; f.press = null; f.charge = 0
        f.combo = 0; f.comboTimer = 0
        f.juggled = 0
        f.cpuScript = []; f.cpuCool = 40
    }
    m.projectiles = []
    m.timer = ROUND_TIME * 60
    m.phase = 'intro'; m.phaseT = INTRO_FREEZE
    m.banner = `ROUND ${m.round}`; m.bannerT = INTRO_FREEZE
    m.hitstop = 0
}

// ---- motion inputs ---------------------------------------------------------------
// Tokens are facing-relative so both sides read the same motions.
function dirToken(pad, facing) {
    const f = facing === 1 ? pad.right : pad.left
    const b = facing === 1 ? pad.left : pad.right
    const u = !!pad.up, d = !!pad.down
    if (u && f) return 'uf'
    if (u && b) return 'ub'
    if (d && f) return 'df'
    if (d && b) return 'db'
    if (f) return 'f'
    if (b) return 'b'
    if (d) return 'd'
    if (u) return 'u'
    return 'n'
}

// subsequence match over the direction history: pattern tokens must appear in
// order, each within gap of the previous, whole thing inside the window.
function matchMotion(hist, pattern, window = 16, gap = 9) {
    if (!hist.length) return false
    const now = hist[hist.length - 1].t
    let i = 0
    let last = -9999
    const set = (tok) => (tok === 'u' ? ['u', 'uf', 'ub'] : tok === 'd' ? ['d', 'df', 'db'] : tok === 'f' ? ['f', 'df', 'uf'] : tok === 'b' ? ['b', 'db', 'ub'] : [tok])
    for (const e of h_iter(hist)) {
        if (i >= pattern.length) break
        if (now - e.t > window) continue
        if (set(pattern[i]).includes(e.dir) && (i === 0 || e.t - last <= gap)) { i++; last = e.t }
    }
    return i >= pattern.length
}
function h_iter(hist) { return hist }

const MOTION = {
    qcf: ['d', 'f'],
    dp: ['f', 'd', 'u'],
    rdp: ['b', 'd', 'u'],
    qcb: ['d', 'b'],
    qcbf: ['d', 'b', 'd', 'f'],
}

function pushHistory(f, pad) {
    f.hf = (f.hf || 0) + 1
    const dir = dirToken(pad, f.facing)
    const top = f.buf[f.buf.length - 1]
    if (!top || top.dir !== dir) f.buf.push({ dir, t: f.hf })
    else top.t = f.hf
    if (f.buf.length > 24) f.buf.splice(0, f.buf.length - 24)
}

// ---- move start ------------------------------------------------------------------
function startMove(f, key) {
    f.st = 'attack'; f.sf = 0; f.move = key; f.phase = 'startup'; f.hitOnce = {}; f.cancelGate = false
}

function tryStartSpecial(f, strength) {
    const sp = f.def.specials || {}
    const hist = f.buf
    const fire = (name) => {
        if (name === 'charge') f.charge = 0
        if (f.meter >= 100 && sp[name].super) { f.meter = 0; return `${name}_S` }
        if (f.meter >= 50 && sp[name].ex) { f.meter -= 50; return `${name}x` }
        return name
    }
    // finisher (VIPER PIT): ↓←↓→ at a full bar — checked first so its `d,f`
    // tail can't be stolen by the plain qcf parse below.
    if (sp.qcbf && f.meter >= 100 && matchMotion(hist, MOTION.qcbf, 26, 10)) { f.meter = 0; return 'qcbf' }
    if (sp.rdp && strength !== 'k' && matchMotion(hist, MOTION.rdp)) return fire('rdp')
    if (sp.dp && strength !== 'k' && matchMotion(hist, MOTION.dp)) return fire('dp')
    if (sp.qcf && matchMotion(hist, MOTION.qcf)) return fire('qcf')
    if (sp.charge && f.charge >= 40 && strength !== 'k') return fire('charge')
    return null
}

// ---- attack intent from a pad ------------------------------------------------------
const BTN_NORMAL = { lp: 'lp', hp: 'hp', lk: 'lk', hk: 'hk' }
const BTN_CROUCH = { lp: 'clp', hp: 'chp', lk: 'clk', hk: 'chk' }
const BTN_ORDER = ['lp', 'lk', 'hp', 'hk']

function attackIntent(pad, prevPad) {
    for (const k of BTN_ORDER) {
        if (pad[k] && !(prevPad && prevPad[k])) return k
    }
    return null
}

// ---- per-fighter update -------------------------------------------------------------
function updateFighter(m, f, opp, pad) {
    const mv = f.def.moves
    const dir = dirToken(pad, f.facing)
    const fwd = dir === 'f' || dir === 'df' || dir === 'uf'
    const back = dir === 'b' || dir === 'db' || dir === 'ub'
    const groundedIdle = f.y === 0 && (f.st === 'idle' || f.st === 'crouch' || f.st === 'blockstun')
    if (m.guardButton) {
        f.blockHeld = !!pad.bk && groundedIdle
        f.crouchBlock = f.blockHeld && (pad.down || dir === 'd' || dir === 'db')
    } else {
        f.blockHeld = back && groundedIdle
        f.crouchBlock = f.blockHeld && (pad.down || dir === 'db' || dir === 'd')
    }

    if (f.charge >= 45) f.charge = 45
    else if (back) f.charge++
    else if (dir === 'n') f.charge = Math.max(0, f.charge - 1)

    f.sf++
    switch (f.st) {
        case 'idle':
        case 'crouch': {
            const wantCrouch = (pad.down || dir === 'd') && f.y === 0
            f.st = wantCrouch ? 'crouch' : 'idle'
            if (f.y === 0) {
                const wm = f.def.walkMul || 1
                if (fwd) f.vx = WALK_F * wm * f.facing
                else if (back) f.vx = -WALK_B * wm * f.facing
                else f.vx = 0
            }
            if (pad.up && f.y === 0) { f.vy = JUMP_VY * (f.def.jumpMul || 1); f.st = 'jump'; f.sf = 0; f.vx = fwd ? WALK_F * 0.9 * f.facing : back ? -WALK_B * 0.9 * f.facing : 0 }
            const btn = attackIntent(pad, f.padPrev)
            if (btn) {
                const strength = btn === 'hp' || btn === 'hk' ? 'p' : btn === 'lk' ? 'k' : 'p'
                const sp = tryStartSpecial(f, f.def.specials && (btn === 'hp' || btn === 'lp') ? 'p' : strength)
                const close = Math.abs(opp.x - f.x) < THROW_RANGE && f.y === 0 && opp.st !== 'down' && opp.st !== 'getup'
                const throwBtn = (btn === 'hp' || btn === 'hk') && fwd && mv.throw
                if (sp && mv[sp]) startMove(f, sp)
                else if (throwBtn && close) startMove(f, 'throw')
                else {
                    const key = f.st === 'crouch' && BTN_CROUCH[btn] ? BTN_CROUCH[btn] : BTN_NORMAL[btn]
                    if (mv[key]) startMove(f, key)
                }
            }
            break
        }
        case 'jump': {
            if (f.y <= 0 && f.vy <= 0) { f.y = 0; f.vy = 0; f.st = 'idle'; f.sf = 0 }
            const btn = attackIntent(pad, f.padPrev)
            if (btn && mv.al) startMove(f, 'al')
            break
        }
        case 'attack': {
            const move = mv[f.move]
            if (!move) { f.st = 'idle'; f.sf = 0; break }
            if (f.phase === 'startup' && f.sf >= move.startup) { f.phase = 'active'; f.sf = 0 }
            else if (f.phase === 'active' && f.sf >= move.active) { f.phase = 'recovery'; f.sf = 0 }
            else if (f.phase === 'recovery' && f.sf >= move.recovery) { f.st = f.y > 0 ? 'jump' : 'idle'; f.sf = 0; f.move = null }
            if (f.y === 0) f.vx *= 0.7
            if (f.move && f.move.startsWith('rdp') && f.phase === 'startup' && f.sf === move.startup - 1) { f.vy = 0.105 }
            if (f.move && f.move === 'qcf_S' && f.phase === 'startup') f.vx = 0.05 * f.facing
            // cancels: a landed/blocked hit opens the gate for a stronger move
            if (f.cancelGate && f.sf >= 1) {
                const btn = attackIntent(pad, f.padPrev)
                if (btn) {
                    const sp = tryStartSpecial(f, btn === 'hp' || btn === 'lp' ? 'p' : 'k')
                    const next = sp && mv[sp] ? sp : (BTN_NORMAL[btn] && (move.cancel || []).includes(BTN_NORMAL[btn]) ? BTN_NORMAL[btn] : null)
                    if (next && next !== f.move) startMove(f, next)
                }
            }
            break
        }
        case 'blockstun': {
            f.vx = 0
            if (f.sf >= f.stun) { f.st = (pad.down || dir === 'd') && f.y === 0 ? 'crouch' : 'idle'; f.sf = 0 }
            break
        }
        case 'hitstun': {
            if (f.y > 0) { f.vx *= 0.985 } else f.vx *= 0.8
            if (f.sf >= f.stun) {
                if (f.y > 0) { f.st = 'hitair'; f.sf = 0 }
                else { f.st = 'idle'; f.sf = 0 }
            }
            break
        }
        case 'hitair': {
            if (m.juggle) f.vx *= 0.8
            if (f.y <= 0 && f.vy <= 0) { f.y = 0; f.vy = 0; f.st = 'down'; f.sf = 0; f.juggled = 0 }
            break
        }
        case 'down': {
            f.vx = 0
            if (f.hp <= 0) break
            if (f.sf >= 46) { f.st = 'getup'; f.sf = 0 }
            break
        }
        case 'getup': {
            f.vx = 0
            if (f.sf >= 22) { f.st = 'idle'; f.sf = 0 }
            break
        }
        case 'win': f.vx = 0; break
        case 'lose': f.vx = 0; break
        default: break
    }

    // physics
    if (f.y > 0 || f.vy > 0) {
        f.vy -= GRAV
        f.y += f.vy
        if (f.y <= 0) {
            f.y = 0; f.vy = 0
            if (f.st === 'jump') { f.st = 'idle'; f.sf = 0 }
            if (f.st === 'attack' && mv[f.move] && mv[f.move].overhead) { f.st = 'idle'; f.sf = 0; f.move = null }
        }
    }
    f.x += f.vx
    f.x = Math.max(-WALL, Math.min(WALL, f.x))

    if (f.comboTimer > 0) { f.comboTimer--; if (f.comboTimer === 0) f.combo = 0 }
}

// ---- hitboxes -----------------------------------------------------------------------
export function moveBox(f) {
    const mv = f.def.moves[f.move]
    if (!mv || f.phase !== 'active' || !mv.box) return null
    const mul = mv.reachMul || 1
    const [x0, y0, x1, y1] = mv.box
    const fx = f.facing
    return {
        x0: f.x + (fx === 1 ? x0 * mul : -x1 * mul),
        x1: f.x + (fx === 1 ? x1 * mul : -x0 * mul),
        y0: f.y + y0,
        y1: f.y + y1,
    }
}

export function hurtBox(f) {
    const crouching = f.st === 'crouch' || f.st === 'blockstun' && f.crouchBlock
    const h = crouching ? 1.15 : 1.8
    const lean = f.st === 'down' || f.st === 'getup' ? 0.3 : 0
    return { x0: f.x - BODY_HALF, x1: f.x + BODY_HALF, y0: f.y + lean * 0, y1: f.y + h }
}

function overlap(a, b) {
    return a && b && a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
}

function resolveHit(m, atk, def, move, seq) {
    const blocked = def.blockHeld && def.y === 0 && move.type !== 'throw' &&
        def.st !== 'down' && def.st !== 'getup' && def.st !== 'hitstun' && def.st !== 'hitair' &&
        (!move.low || def.crouchBlock) && (!move.overhead || !def.crouchBlock)
    const raw = move.dmg
    if (blocked) {
        def.st = 'blockstun'; def.stun = move.blockstun; def.sf = 0
        def.vx = move.push * 0.5 * (def.facing === 1 ? -1 : 1)
        def.meter = Math.min(100, def.meter + raw * 0.35)
        atk.meter = Math.min(100, atk.meter + raw * 0.4)
        if (move.type !== 'throw' && move.dmg >= 9) def.hp = Math.max(1, def.hp - 1)
        if (atk.st === 'attack') { atk.cancelGate = true }
        m.events.push({ t: m.tick, kind: 'block', by: atk.side })
    } else {
        const airborne = def.y > 0 || def.st === 'hitair'
        if (m.juggle && airborne && def.juggled >= 1) {
            // juggle lock: one aerial follow-up per launch, then the body is
            // brittle — no third hit until the floor resets it.
            return
        }
        const inCombo = def.st === 'hitstun' || def.st === 'hitair'
        atk.combo = inCombo ? atk.combo + 1 : 1
        atk.comboTimer = 60
        def.hp = Math.max(0, def.hp - raw)
        def.st = 'hitstun'; def.stun = move.hitstun; def.sf = 0
        def.vx = move.push * atk.facing * (m.juggle && (airborne || move.launch) ? 0.3 : 1)
        if (move.launch) { def.vy = move.launch; def.y = Math.max(def.y, 0.01) }
        if (m.juggle && airborne) {
            def.juggled++
            def.vy = Math.max(def.vy, 0.06)
        }
        if (!airborne) def.juggled = 0
        atk.meter = Math.min(100, atk.meter + raw * 0.8)
        def.meter = Math.min(100, def.meter + raw * 0.5)
        if (atk.st === 'attack') { atk.cancelGate = true }
        m.hitstop = Math.max(m.hitstop, raw >= 9 ? 7 : 4)
        m.events.push({ t: m.tick, kind: 'hit', by: atk.side, dmg: raw, combo: atk.combo, mv: atk.move })
        if (move.finisher && def.hp <= (move.finishAt || 30)) {
            def.hp = 0
            m.hitstop = Math.max(m.hitstop, 12)
            m.events.push({ t: m.tick, kind: 'finish', by: atk.side })
            koRound(m, atk)
            m.banner = 'FINISH!'
        } else if (def.hp <= 0) koRound(m, atk)
    }
    if (atk.st === 'attack') atk.hitOnce[seq] = true
}

function koRound(m, winner) {
    m.phase = 'ko'; m.phaseT = KO_FREEZE
    m.banner = 'K.O.'; m.bannerT = KO_FREEZE
    winner.wins++
    winner.st = 'win'; winner.sf = 0; winner.move = null; winner.vx = 0
    const loser = m.fighters[winner.side === 0 ? 1 : 0]
    loser.st = 'down'; loser.sf = 0; loser.move = null
}

// forceKO ends a round immediately — a harness/debug seam, not a game mechanic.
export function forceKO(m, winnerIdx) {
    if (m.phase !== 'fight') return m
    const winner = m.fighters[winnerIdx]
    m.fighters[winnerIdx === 0 ? 1 : 0].hp = 0
    koRound(m, winner)
    return m
}

// ---- projectiles --------------------------------------------------------------------
function projectileSpawn(m, f, mv) {
    if (m.projectiles.some((p) => p.owner === f.side && p.kind === mv.name)) return false
    m.projectiles.push({
        owner: f.side, kind: mv.name || 'orb',
        x: f.x + f.facing * 1.1, y: 1.15 + (mv.y || 0),
        vx: (mv.speed || 0.16) * f.facing,
        vy: mv.vy || 0, grav: !!mv.grav,
        dmg: mv.dmg, hitstun: mv.hitstun, blockstun: mv.blockstun || 10,
        push: mv.push || 0.12, ttl: mv.ttl || 150, super: !!mv.super,
    })
    return true
}

function updateProjectiles(m) {
    const dead = []
    for (const p of m.projectiles) {
        p.x += p.vx
        if (p.grav) p.vy -= GRAV * 0.55
        p.y += p.vy
        p.ttl--
        if (p.x < -WALL - 2 || p.x > WALL + 2 || p.ttl <= 0 || (p.grav && p.y < 0.05)) { dead.push(p); continue }
        const def = m.fighters[p.owner === 0 ? 1 : 0]
        const pb = { x0: p.x - 0.35, x1: p.x + 0.35, y0: p.y - 0.3, y1: p.y + 0.3 }
        if (overlap(pb, hurtBox(def)) && def.st !== 'down' && def.st !== 'getup') {
            const mv = { dmg: p.dmg, hitstun: p.hitstun, blockstun: p.blockstun, push: p.push, type: 'special', low: false }
            resolveHit(m, m.fighters[p.owner], def, mv, 'proj')
            dead.push(p)
        }
    }
    m.projectiles = m.projectiles.filter((p) => !dead.includes(p))
}

// ---- CPU ----------------------------------------------------------------------------
// A tiered opponent that emits PAD FRAMES, not intentions — its scripts drive the
// same motion-input parser a human uses, so specials/throws are earned, never cheated.
const CPU_TIER = { easy: 0.32, normal: 0.55, hard: 0.72, brutal: 0.86, insane: 1 }

function cpuDecide(m, f, opp) {
    const tier = CPU_TIER[f.def.cpu] || 0.55
    const style = f.def.cpuStyle || {}
    const r = m.rng()
    const dist = Math.abs(opp.x - f.x)
    const toward = opp.x > f.x ? 'right' : 'left'
    const away = toward === 'right' ? 'left' : 'right'
    const sp = f.def.specials || {}
    const qcfKey = sp.qcf ? 'qcf' : null

    // threatened by an incoming projectile?
    const inc = m.projectiles.find((p) => p.owner !== f.side && Math.abs(p.x - f.x) < 3.4 && Math.sign(p.vx) === Math.sign(f.x - p.x))
    if (inc) {
        if (r < tier * 0.7) return [{ [away]: true, down: true, bk: true }, { [away]: true, down: true, bk: true }, { [away]: true, down: true, bk: true }, { [away]: true, down: true, bk: true }]
        if (r < tier * 0.85) return [{ up: true }]
    }
    // punish jump-ins from below
    if (opp.st === 'jump' && dist < 2.2 && r < tier * 0.5 && f.def.moves.dp && sp.dp) {
        return scriptMotion(sp.dp.kick ? "k" : "p", "dp", f)
    }
    if (dist > 3.2) {
        if (qcfKey && r < tier * (style.zone || 0.35)) {
            return scriptMotion(sp.qcf.kick ? "k" : "p", "qcf", f)
        }
        const n = 12 + Math.floor(m.rng() * 20)
        const s = []
        for (let i = 0; i < n; i++) s.push({ [toward]: true })
        if (m.rng() < (style.jump || 0.15) * tier) { s.push({ [toward]: true, up: true }); s.push({ [toward]: true, up: true }); s.push({ [toward]: true, hk: true }); s.push({ [toward]: true }) }
        return s
    }
    // close range
    if (m.rng() < 0.22 * tier) {
        const s = [{ [away]: true, bk: true }, { [away]: true, bk: true }, { [away]: true, bk: true }]
        if (m.rng() < 0.3) s.push({ [away]: true, down: true, bk: true })
        return s
    }
    if (f.def.moves.throw && dist < 1.35 && m.rng() < tier * 0.3 && opp.st !== 'down' && opp.st !== 'hitstun') {
        return [{ [toward]: true }, { [toward]: true, hp: true }, { [toward]: true }]
    }
    if (f.def.moves.qcbf && f.meter >= 100 && opp.hp <= (f.def.moves.qcbf.finishAt || 30) && dist < 2.6 && m.rng() < 0.35 + tier * 0.6) {
        return scriptMotion('p', 'qcbf', f)
    }
    if (sp.dp && m.rng() < tier * 0.14) return scriptMotion("p", "dp", f)
    if (qcfKey && m.rng() < tier * 0.2) return scriptMotion(sp.qcf.kick ? "k" : "p", "qcf", f)
    const pick = m.rng()
    const move = pick < 0.3 ? 'lp' : pick < 0.5 ? 'lk' : pick < 0.72 ? 'hp' : 'hk'
    const mv = f.def.moves[move]
    return [{ [move]: true }, ...Array(mv.startup + mv.active + 2).fill({}), { }]
}

function scriptMotion(strength, name, f) {
    const toward = f.facing === 1 ? 'right' : 'left'
    const away = toward === 'right' ? 'left' : 'right'
    const btn = strength === 'k' ? (name === 'dp' ? 'hk' : 'lk') : (name === 'dp' ? 'hp' : 'lp')
    if (name === 'qcf') return [{ down: true }, { down: true, [toward]: true }, { [toward]: true }, { [toward]: true, [btn]: true }, { [toward]: true }]
    if (name === 'qcbf') return [{ down: true }, { down: true, [away]: true }, { [away]: true }, { down: true }, { down: true, [toward]: true }, { [toward]: true }, { [toward]: true, [btn]: true }, { [toward]: true }]
    if (name === 'dp') return [{ [toward]: true }, { [toward]: true, down: true }, { down: true }, { up: true }, { up: true, [btn]: true }, {}]
    return [{}]
}
function cpuPad(m, f, opp) {
    if (f.cpuCool > 0) f.cpuCool--
    if (f.cpuScript.length) return f.cpuScript.shift()
    if (f.cpuCool <= 0) {
        f.cpuScript = cpuDecide(m, f, opp) || [{}]
        const tier = CPU_TIER[f.def.cpu] || 0.55
        f.cpuCool = Math.floor(4 + (1 - tier) * 14 + m.rng() * 8)
    }
    return {}
}

// ---- match step -----------------------------------------------------------------------
export function step(m, pads) {
    if (m.phase === 'intro') {
        m.phaseT--
        if (m.phaseT <= 0) { m.phase = 'fight'; m.banner = 'FIGHT!'; m.bannerT = 45 }
        else if (m.phaseT < INTRO_FREEZE - 40) { m.banner = 'READY' }
        for (const f of m.fighters) { f.padPrev = emptyPad() }
        m.tick++
        return m
    }
    if (m.bannerT > 0) m.bannerT--
    if (m.phase === 'ko' || m.phase === 'time') {
        m.phaseT--
        // let bodies settle during the freeze
        if (m.hitstop > 0) { m.hitstop--; }
        else {
            for (let i = 0; i < 2; i++) {
                const f = m.fighters[i]
                settleBody(f)
            }
        }
        if (m.phaseT <= 0) nextRound(m)
        m.tick++
        return m
    }

    if (m.hitstop > 0) { m.hitstop--; m.tick++; return m }

    m.timer--
    if (m.timer <= 0) {
        m.timer = 0
        const [a, b] = m.fighters
        const w = a.hp === b.hp ? (a.wins !== b.wins ? (a.wins > b.wins ? a : b) : a) : (a.hp > b.hp ? a : b)
        m.phase = 'time'; m.phaseT = KO_FREEZE
        m.banner = a.hp === b.hp ? 'DRAW' : 'TIME UP'
        m.bannerT = KO_FREEZE
        w.wins++
        w.st = 'win'; w.sf = 0; w.move = null; w.vx = 0
        const l = m.fighters[w.side === 0 ? 1 : 0]
        l.st = 'down'; l.sf = 0; l.move = null
        m.tick++
        return m
    }

    const padsIn = []
    for (let i = 0; i < 2; i++) {
        const f = m.fighters[i]
        const pad = f.def.cpu ? cpuPad(m, f, m.fighters[i === 0 ? 1 : 0]) : pads[i === 0 ? 0 : 1] || emptyPad()
        padsIn[i] = pad
        f.facing = m.fighters[i === 0 ? 1 : 0].x >= f.x ? 1 : -1
        if (f.st === 'attack' || f.st === 'hitstun' || f.st === 'blockstun' || f.st === 'down' || f.st === 'getup' || f.st === 'hitair') {
            // keep facing locked mid-commit for fairness
            if (f.st === 'attack') f.facing = f.commitFace || f.facing
        } else f.commitFace = f.facing
        pushHistory(f, pad)
    }
    for (let i = 0; i < 2; i++) {
        const f = m.fighters[i]
        if (f.st === 'attack' && f.move) {
            const mv = f.def.moves[f.move]
            if (mv && mv.projectile && f.phase === 'startup' && f.sf === mv.startup - 1) {
                if (projectileSpawn(m, f, mv.projectile)) { /* spawned */ }
            }
        }
        updateFighter(m, f, m.fighters[i === 0 ? 1 : 0], padsIn[i])
        f.padPrev = padsIn[i]
    }

    // pushboxes
    const [a, b] = m.fighters
    const gap = Math.abs(a.x - b.x)
    const minGap = BODY_HALF * 2
    if (gap < minGap && a.y < 1.2 && b.y < 1.2) {
        const push = (minGap - gap) / 2
        const dir = a.x <= b.x ? -1 : 1
        a.x = Math.max(-WALL, Math.min(WALL, a.x + dir * push))
        b.x = Math.max(-WALL, Math.min(WALL, b.x - dir * push))
    }

    // melee hits
    for (let i = 0; i < 2; i++) {
        const atk = m.fighters[i], def = m.fighters[1 - i]
        const box = moveBox(atk)
        if (!box) continue
        if (atk.move && atk.def.moves[atk.move].type === 'throw' && Math.abs(def.x - atk.x) > THROW_RANGE) continue
        const hb = hurtBox(def)
        if (overlap(box, hb) && !atk.hitOnce[i] && def.st !== 'down' && def.st !== 'win' && def.st !== 'lose' && def.st !== 'getup') {
            resolveHit(m, atk, def, atk.def.moves[atk.move], i)
        }
    }

    updateProjectiles(m)
    m.tick++
    return m
}

function settleBody(f) {
    if (f.y > 0 || f.vy > 0) {
        f.vy -= GRAV
        f.y += f.vy
        if (f.y <= 0) { f.y = 0; f.vy = 0 }
    }
    f.x += f.vx
    f.vx *= 0.9
    f.x = Math.max(-WALL, Math.min(WALL, f.x))
    f.sf++
}

function nextRound(m) {
    const [a, b] = m.fighters
    if (a.wins >= m.rounds || b.wins >= m.rounds || m.round >= m.maxRounds) {
        m.phase = 'done'
        m.winner = a.wins === b.wins ? (a.wins >= b.wins ? 0 : 1) : (a.wins > b.wins ? 0 : 1)
        m.banner = `${a.wins === b.wins ? 'DRAW GAME' : `${a.wins > b.wins ? a.def.name : b.def.name} WINS`}`
        m.bannerT = 999999
    } else {
        m.round++
        resetRound(m)
    }
}

export function emptyPad() {
    return { left: false, right: false, up: false, down: false, lp: false, hp: false, lk: false, hk: false, bk: false }
}

// ---- hash -------------------------------------------------------------------------
function q(n) { return Math.round(n * 1000) | 0 }

export function matchHash(m) {
    let h = 0x811c9dc5
    const mix = (n) => { h ^= n | 0; h = Math.imul(h, 0x01000193) }
    mix(m.tick); mix(m.phase === 'done' ? 7 : m.phase === 'ko' ? 5 : m.phase === 'fight' ? 3 : 1)
    mix(q(m.timer))
    mix(m.projectiles.length)
    for (const p of m.projectiles) { mix(p.owner); mix(q(p.x)); mix(q(p.y)) }
    for (const f of m.fighters) {
        mix(q(f.x)); mix(q(f.y)); mix(q(f.hp)); mix(q(f.meter))
        mix(f.wins); mix(hashStr(f.st + (f.move || '') + f.phase))
    }
    return h >>> 0
}

function hashStr(s) {
    let h = 0
    for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0 }
    return h
}

// ---- query helpers for renderers/harness ------------------------------------------------
export function fightersState(m) {
    return m.fighters.map((f) => ({
        id: f.def.id, name: f.def.name, x: f.x, y: f.y, vx: f.vx, hp: f.hp, meter: f.meter,
        facing: f.facing, st: f.st, sf: f.sf, move: f.move, phase: f.phase, wins: f.wins,
        combo: f.combo,
    }))
}

export { CPU_TIER }
