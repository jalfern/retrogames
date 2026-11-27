// MISSILE COMMAND — the whole-tick sim (#1637 batch 29) plus the PROVEN route.
//
// Seedpin batch 15 lifted only the spawn dice here; the physics still lived in
// index.jsx's useEffect closure and the wave break ran on setTimeout. This is
// the b27 lift (DonkeyKong shape): makeRun(seed) builds the whole world,
// tickMc(gs, cmd) advances exactly one fixed tick, no wall clock and no
// Math.random anywhere inside. ?seed=N now replays the ENTIRE raid — spawner,
// intercepts, splashes and all — which is what lets the sweep prove the driver
// before a live seat is honest.
//
// The proof (missilecmdcheck): every seed clears waves 1..5 with ALL SIX
// CITIES STANDING. Doctrine: INTERCEPT HIGH. Structure anchors sit at y 530
// and 550 and the blast maxes at radius 40, so a detonation centered at
// y <= 485 can never touch a friendly — altitude is life, exactly the arcade
// lesson. The driver re-simulates each warhead with the sim's own stepping,
// finds the earliest tick an ABM can meet it (arrive-and-detonate math with
// the engine's discrete step rules, not continuous approximations), fires at
// that future point from the engine's own nearest-silo choice, and covers each
// warhead until its shot detonates — retry the moment a cover lapses while
// the warhead still lives.

import { seedRng } from '../../utils/gameContract.js'

export const SCREEN_WIDTH = 800
export const SCREEN_HEIGHT = 600
export const GROUND_Y = 550
export const ABM_SPEED = 15
export const WARHEAD_SPEED_BASE = 1
export const BLAST_RADIUS_MAX = 40
export const BLAST_SPEED = 1
export const WAVE_BREAK_TICKS = 180 // the original 3 s pause, on the sim clock (#1525)

// Anything detonating at or above this line is out of every structure's reach:
// silo anchors 530 - 485 = 45 > 40, city anchors 550 - 485 = 65 > 40.
export const SAFE_Y = 485

export const START_WAVE = 1
export const PROVEN_WAVES = 5 // the sweep's bar: clear waves 1..PROVEN_WAVES untouched

// Cruise saucers (#3629) — the original introduces new weapons in later waves:
// satellite-shaped craft that cross the screen launching missiles of their own
// (Wikipedia, arcade article). The Atari 1981 manual fixes the rules: §2
// "Cruise missiles look like satellites, but they are just as deadly"; §6
// "After the 6th wave … the enemy may attack with cruise missiles"; Table 1
// scores an enemy cruise missile at 125 points. Starting at wave 6 keeps every
// wave 1..5 proof byte-identical — the RNG is never consulted below the gate.
export const SAUCER_FIRST_WAVE = 6
export const SAUCER_SCORE = 125
// Smart bombs (#3630) — the evasive warhead. Wikipedia (arcade article): "smart
// bombs that can evade a less-than-perfectly targeted missile", and the counter
// rule verbatim: "The missiles of the center battery fly to their targets at
// much greater speed than those fired from the other two; only these missiles
// can effectively destroy a smart bomb at a distance." Atari 1981 manual §6:
// the smart cruise missiles "can detect and evade your ABM explosions"; §7
// hint 3: aimed directly on them "the enemy cannot detect your ABMs" (blind
// spot). Same §6 line that put ferries at wave 6 gates the smart bomb one wave
// behind — the RNG stays untouched below the gate so waves 1..6 (and every
// saucer pin) replay byte-identical.
export const SMART_FIRST_WAVE = 7
export const SMART_SCORE = 25 // arcade bills it as an ICBM-class warhead; VCS Table 1's 125 cruise slot already belongs to the ferry craft
export const CENTER_SILO_X = 400 // the battery of the "much greater speed"
export const CENTER_ABM_SPEED = 28
export const SMART_DETECT_R = 60 // a live blast inside this line is sensed
export const SMART_SENSOR_R = 70 // an incoming ABM is only detected this close — the slow outer missile loiters in range, the fast center blips past before the bomb can run
export const SMART_PERFECT_R = 32 // blind spot (§7 hint 3): aim on the bomb and it never sees the shot. 32 px — not the head, but the lead window: it must swallow the bomb's own travel while the ABM flies, which is why fast center shots thread it where careful outer ones never can.
export const SMART_EV_TICKS = 12
export const SMART_EV_SPEED = 2.6
export const SMART_CORE_R = 4 // blast-meets-core envelope, the saucer rule at warhead scale

// The arcade's battery law (#3630): from the wave smart bombs are live, the
// center battery's ABMs fly much faster. Below the gate every ABM is still 15,
// so the waves 1..6 proofs replay untouched.
export function siloSpeed(gs, silo) {
    return gs.smartWave && silo.x === CENTER_SILO_X ? CENTER_ABM_SPEED : ABM_SPEED
}
export const SAUCER_Y_MIN = 120
export const SAUCER_Y_MAX = 200
export const SAUCER_SPEED_BASE = 1.6
export const SAUCER_HIT_R = 14 // blast-meets-hull envelope
export const SAUCER_EDGE = 30 // spawn/exit margin past the screen edge

export function chooseEnemySpawn(rand, targets, width = SCREEN_WIDTH) {
    const target = targets[Math.floor(rand() * targets.length)]
    return { target, x: rand() * width, startX: rand() * width }
}

const CITY_X = [120, 200, 280, 520, 600, 680]
const SILO_X = [40, 400, 760]

// ------------------------------------------------------------------ world ----
// #3630 slice 2 — two-player alternating play (Atari 1981 manual §6, games
// 18–34): players take the board one wave at a time, both scores are shown,
// cities and silos are SHARED (a city burned on your wave costs your partner
// too), and the wave bonus pays the player who played the wave. opts.twoPlayer
// opens the game; below it every field keeps its solo shape, the flip is
// dice-free, and gs.score stays player 1's ledger — solo replays byte-identical.
export function makeRun(seed, opts = {}) {
    const rng = seedRng(seed >>> 0 || 1)
    return {
        seed: seed >>> 0 || 1,
        rand: rng,
        tick: 0,
        score: 0, // player 1's ledger (solo runs live here, verbatim)
        // #3630 slice 2 — the alternating seat. turn is the player defending
        // the CURRENT wave; score2 is player 2's ledger; p2cpu marks the seat
        // the certified gunnerStep drives until a human joins on the keyboard.
        twoP: opts.twoPlayer === true,
        turn: 1,
        score2: 0,
        p2cpu: opts.p2cpu !== false,
        wave: START_WAVE,
        cities: CITY_X.map((x) => ({ x, y: GROUND_Y, alive: true })),
        silos: SILO_X.map((x) => ({ x, y: GROUND_Y - 20, ammo: 10, alive: true })),
        abms: [],
        warheads: [],
        blasts: [],
        saucers: [], // cruise craft (#3629), empty below SAUCER_FIRST_WAVE
        saucersLeftInWave: 0,
        saucerTimer: 0,
        debris: [], // #3638 kill sparks — cosmetic, never gates a wave clear
        flash: null, // #3638 white kill-flash ticks
        attractFerries: 0, // scripted ferry counter for the attract ad (#3638)
        smartLeftInWave: 0, // evasive warheads (#3630), empty below SMART_FIRST_WAVE
        smartTimer: 0,
        smartWave: false, // #3630: the wave-scoped battery-speed rule — startWave flips it from the gate; harnesses that grade other doctrine clear it
        crosshair: { x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 },
        state: 'playing', // playing | waveEnd | gameOver
        spawning: true,
        spawnTimer: 0,
        missilesLeftInWave: 10 + START_WAVE * 2,
        waveBreak: 0,
        over: false,
        watch: false,
        nextId: 1,
        events: [], // per-tick sound hooks the shell turns into tones
    }
}

export const citiesAlive = (gs) => gs.cities.filter((c) => c.alive).length

// #3630 slice 2: every credit belongs to the player whose wave is live
// (manual §6). In solo play the gate never opens, so gs.score moves exactly
// as before — the byte pins hold.
export function addScore(gs, n) {
    if (gs.twoP && gs.turn === 2) gs.score2 += n
    else gs.score += n
}

// The 2P board reads the winner at THE END (0 = draw).
export const winner = (gs) => (gs.score > gs.score2 ? 1 : gs.score2 > gs.score ? 2 : 0)

export function startWave(gs, opts = {}) {
    gs.missilesLeftInWave = 10 + gs.wave * 2
    // #3629: the cruise salvo rolls only at or past the gate — below
    // SAUCER_FIRST_WAVE the seeded stream is untouched, so every wave 1..5
    // proof replays byte-identical.
    if (gs.wave >= SAUCER_FIRST_WAVE) {
        gs.saucersLeftInWave = Math.min(2, 1 + Math.floor((gs.wave - SAUCER_FIRST_WAVE) / 3))
        gs.saucerTimer = 60 + Math.floor(gs.rand() * 200)
    } else {
        gs.saucersLeftInWave = 0
    }
    // #3630 smart bombs: one guaranteed per wave from the gate, +1 every four,
    // cap two. Rolls ride after the saucer rolls, below the gate never.
    // opts.noSmart is the doctrine-harness opt-out: not just the arrivals but
    // the DIE too, so a graded wave replays bit-exact against the pre-smart sim.
    gs.smartWave = gs.wave >= SMART_FIRST_WAVE && !opts.noSmart
    if (gs.smartWave) {
        gs.smartLeftInWave = Math.min(2, 1 + Math.floor((gs.wave - SMART_FIRST_WAVE) / 4))
        gs.smartTimer = 120 + Math.floor(gs.rand() * 240)
    } else {
        gs.smartLeftInWave = 0
    }
    gs.spawning = true
    gs.state = 'playing'
}

function nextWave(gs) {
    gs.wave++
    gs.state = 'waveEnd'
    let bonus = 0
    gs.cities.forEach((c) => { if (c.alive) bonus += 100 })
    gs.silos.forEach((s) => { if (s.alive) bonus += s.ammo * 50; s.ammo = 10 })
    addScore(gs, bonus)
    gs.waveBreak = WAVE_BREAK_TICKS // world seconds, never setTimeout (#1525)
    gs.events.push('wave')
    // #3630 slice 2 (manual §6): hand the board to the partner for the next
    // wave — P1 defends waves 1, 3, 5…; P2 waves 2, 4, 6… The flip consumes
    // no dice and never runs in solo, so byte parity is untouched. The bonus
    // above already paid the player who played THIS wave.
    if (gs.twoP) {
        gs.turn = gs.turn === 1 ? 2 : 1
        gs.events.push('turn')
    }
}

// The engine's own click law: nearest live silo by |dx| to the aim point.
export function nearestSilo(gs, x) {
    let best = null
    let min = Infinity
    gs.silos.forEach((s) => {
        if (s.alive && s.ammo > 0) {
            const d = Math.abs(s.x - x)
            if (d < min) { min = d; best = s }
        }
    })
    return best
}

export function fireAt(gs, x, y, wid = null) {
    if (gs.state !== 'playing') return false
    const silo = nearestSilo(gs, x)
    if (!silo) return false
    return fireFrom(gs, silo, x, y, wid)
}

// #3695 — the arcade's own three-button law, handed to the player: each button
// names its battery and launches at the crosshair from THERE, whichever sector
// the aim sits in (Wikipedia §Gameplay: "pressing one of three buttons to
// launch a counter-missile from the appropriate battery"). The WATCH already
// commands batteries this way (`cmd.silo` below); this is the same door, human
// side — key 2 calls the fast center battery from anywhere, the expert's
// answer to a smart bomb at distance (manual §6/§7). fireFrom keeps its
// alive/ammo gates: naming a dead or empty battery is a dud, not a reroute.
export function fireBattery(gs, idx, x, y) {
    if (gs.state !== 'playing') return false
    const silo = gs.silos[idx]
    if (!silo) return false
    return fireFrom(gs, silo, x, y, null)
}

function fireFrom(gs, silo, x, y, wid) {
    if (!silo || !silo.alive || silo.ammo <= 0) return false
    silo.ammo--
    // #3630: the center battery flies the arcade's "much greater speed" once
    // smart bombs are live. A shot aimed directly on a smart bomb (≤ 16 px,
    // manual §7 hint 3) is blind — the enemy cannot detect it.
    const blind = gs.warheads.some((m) => !m.dead && m.smart &&
        Math.hypot(m.x - x, m.y - y) <= SMART_PERFECT_R)
    gs.abms.push({
        x: silo.x, y: silo.y,
        startX: silo.x, startY: silo.y,
        targetX: x, targetY: y,
        speed: siloSpeed(gs, silo),
        center: silo.x === CENTER_SILO_X, // only center blasts can hurt a smart bomb
        blind,
        color: '#00ffff',
        wid,
        boom: null, // tick the shot detonates — the driver's cover window
    })
    gs.events.push('pew')
    return true
}

function spawnBlast(gs, x, y, center = false) {
    gs.blasts.push({
        x, y,
        radius: 1,
        growing: true,
        center, // #3630: only a center-battery fireball can kill a smart bomb
        color: gs.rand() > 0.5 ? '#ffffff' : '#ff0000',
    })
    gs.events.push('boom')
}

// ---------------------------------------------------------------- physics ----
// Step one warhead exactly as the update below does — the driver's predictions
// must share the engine's discrete feet, not approximations of them.
export function stepWarhead(m, steps) {
    let { x, y } = m
    for (let i = 0; i < steps; i++) {
        const dx = m.targetX - x
        const dy = m.targetY - y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < m.speed) { x = m.targetX; y = m.targetY }
        else {
            const a = Math.atan2(dy, dx)
            x += Math.cos(a) * m.speed
            y += Math.sin(a) * m.speed
        }
    }
    return { x, y }
}

// ABM arrival rule of the update below: launched before tick n moves, it
// detonates on floor(d/speed)+1 — the strict `dist < speed` test costs the
// extra tick on exact multiples; predictions that miss it hit early.
export function abmArrivalTicks(d, speed = ABM_SPEED) {
    return Math.floor(d / speed) + 1
}

// #3711 cluster doctrine — the arcade's firing economy. One explosion downs
// every warhead caught inside it and the original bills each one (25 a head),
// so when the raid outstrips the magazine the expert waits for the crossing
// descent lines and spends ONE shell at the knot. The blast envelope is the
// sim's own grow/shrink (radius 1→40→1, one px per tick):
export const BLAST_LIFE = 2 * BLAST_RADIUS_MAX - 1 // ticks a blast can still kill, from launch
export const blastRadiusAt = (t) => (t <= BLAST_RADIUS_MAX - 1 ? 1 + t : 2 * BLAST_RADIUS_MAX - 1 - t)

// Mirror of #3638's reserve rule: the reserve asks "is there a surplus for a
// bonus?"; this asks the harsher twin — "is there a deficit that demands a
// double-kill?" Demand is everything the magazine must still shoot down this
// wave: live warheads (smart bombs included) + the ICBM ladder left to spawn
// + the cruise launches the ferry fleet still owes. Where demand fits the
// shells, the earliest-intercept doctrine runs untouched — this is why the
// waves 1..8 proofs keep replaying byte-identical.
export function clusterMode(gs) {
    const ammo = gs.silos.reduce((a, s) => a + (s.alive ? s.ammo : 0), 0)
    const demand = gs.warheads.filter((m) => !m.dead).length + gs.missilesLeftInWave + gs.smartLeftInWave
    const crossingTicks = (SCREEN_WIDTH + 2 * SAUCER_EDGE) / (SAUCER_SPEED_BASE + gs.wave * 0.08)
    const cruises = gs.saucersLeftInWave * Math.max(1, Math.round(crossingTicks / 70)) +
        gs.saucers.reduce((a, s) => a + (s.dead ? 0 : Math.ceil(Math.max(0,
            (s.dir === 1 ? SCREEN_WIDTH + SAUCER_EDGE - s.x : s.x + SAUCER_EDGE) / s.speed) / 70)), 0)
    return demand + cruises > ammo
}

// One straight-line warhead step — the exact formula stepWarhead runs per
// iteration, exposed so the cluster scan can advance every candidate once per
// offset instead of re-simulating from scratch (O(t^2)) per query.
function advanceWarhead(m, x, y) {
    const dx = m.targetX - x
    const dy = m.targetY - y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < m.speed) return { x: m.targetX, y: m.targetY, landed: true }
    const a = Math.atan2(dy, dx)
    return { x: x + Math.cos(a) * m.speed, y: y + Math.sin(a) * m.speed, landed: false }
}

// One tick of a smart bomb (#3630). It senses live blasts within SMART_DETECT_R
// and incoming ABMs within SMART_SENSOR_R (§6 "detect and evade your ABM
// explosions") — blind shots (aim directly on it, §7 hint 3) are never seen.
// Threatened, it sidesteps away for a burst of ticks, curving back onto its
// target after; the bend is why the arcade said you'd know one when you saw it.
function stepSmartBomb(gs, m) {
    let tx = null
    let ty = null
    for (const e of gs.blasts) {
        if (Math.hypot(m.x - e.x, m.y - e.y) < SMART_DETECT_R) { tx = e.x; ty = e.y; break }
    }
    if (tx === null) {
        for (const a of gs.abms) {
            if (a.blind) continue // enemy cannot detect your ABMs — when it is directly on them
            if (Math.hypot(m.x - a.x, m.y - a.y) < SMART_SENSOR_R) { tx = a.targetX; ty = a.targetY; break }
        }
    }
    if (tx !== null) { m.evadeX = tx; m.evadeY = ty; m.evTicks = SMART_EV_TICKS }
    if (m.evTicks > 0) {
        m.evTicks--
        let nx = m.x - m.evadeX
        let ny = m.y - m.evadeY
        const nl = Math.hypot(nx, ny) || 1
        nx /= nl; ny /= nl
        if (ny < 0.35) { // it escapes across the sky, not up and away
            ny = 0.35
            const rl = Math.hypot(nx, ny)
            nx /= rl; ny /= rl
        }
        m.x += nx * SMART_EV_SPEED
        m.y += ny * SMART_EV_SPEED
        m.x = Math.max(4, Math.min(SCREEN_WIDTH - 4, m.x))
    } else {
        const dx = m.targetX - m.x
        const dy = m.targetY - m.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < m.speed) { spawnBlast(gs, m.targetX, m.targetY); m.dead = true; return }
        const a = Math.atan2(dy, dx)
        m.x += Math.cos(a) * m.speed
        m.y += Math.sin(a) * m.speed
    }
    m.trail.push([m.x, m.y])
    if (m.trail.length > 96) m.trail.shift()
}

// One fixed tick. `cmd` is { aimX, aimY, wid? } when something decides to
// shoot this tick (attract pilot, the proven gunner, or a human click/key).
export function tickMc(gs, cmd = null) {
    gs.tick++
    gs.events.length = 0
    if (gs.state === 'gameOver') return

    // cmd may name its battery (`silo`): the arcade had three buttons and any
    // base could be told to shoot anywhere — the watch uses that for smart
    // bombs (only the center battery's fireball can kill one). No silo named
    // means the engine's own nearest-silo click law.
    if (cmd && gs.state === 'playing') {
        if (cmd.silo != null) fireFrom(gs, gs.silos[cmd.silo], cmd.aimX, cmd.aimY, cmd.wid ?? null)
        else fireAt(gs, cmd.aimX, cmd.aimY, cmd.wid ?? null)
    }

    if (gs.state === 'waveEnd') {
        gs.waveBreak--
        if (gs.waveBreak <= 0) startWave(gs)
    }

    if (gs.state === 'playing') {
        // #3629 cruise salvo: seeded entry, once guaranteed per wave from the
        // gate (a second joins every three waves). Timer only ticks while a
        // saucer is still owed, so the wave can't clear with one pending.
        if (gs.saucersLeftInWave > 0) {
            gs.saucerTimer--
            if (gs.saucerTimer <= 0) {
                const dir = gs.rand() > 0.5 ? 1 : -1
                gs.saucers.push({
                    id: gs.nextId++,
                    x: dir === 1 ? -SAUCER_EDGE : SCREEN_WIDTH + SAUCER_EDGE,
                    y: SAUCER_Y_MIN + Math.floor(gs.rand() * (SAUCER_Y_MAX - SAUCER_Y_MIN)),
                    dir,
                    speed: SAUCER_SPEED_BASE + gs.wave * 0.08,
                    fireTimer: 40 + Math.floor(gs.rand() * 40),
                    frame: 0,
                })
                gs.saucersLeftInWave--
                gs.events.push('saucer')
                if (gs.saucersLeftInWave > 0) gs.saucerTimer = 120 + Math.floor(gs.rand() * 160)
            }
        }

        // #3630 smart bombs: seeded entry, one guaranteed per wave from the
        // gate (+1 every four, cap two). They ride the warhead spawn dice to a
        // live target, then read the sky on the way down.
        if (gs.smartLeftInWave > 0) {
            gs.smartTimer--
            if (gs.smartTimer <= 0) {
                const targets = [...gs.cities, ...gs.silos].filter((t) => t.alive)
                if (targets.length > 0) {
                    const pick = chooseEnemySpawn(gs.rand, targets)
                    gs.warheads.push({
                        id: gs.nextId++,
                        x: pick.x, y: 0, startX: pick.x, startY: 0,
                        targetX: pick.target.x,
                        targetY: pick.target.y,
                        speed: WARHEAD_SPEED_BASE + gs.wave * 0.1,
                        color: '#ff0000',
                        coverUntil: 0,
                        smart: true,
                        evTicks: 0,
                        evadeX: 0,
                        evadeY: 0,
                        trail: [],
                    })
                    gs.events.push('smart')
                    gs.smartLeftInWave--
                }
                if (gs.smartLeftInWave > 0) gs.smartTimer = 160 + Math.floor(gs.rand() * 220)
            }
        }

        if (gs.spawning) {
            gs.spawnTimer--
            if (gs.spawnTimer <= 0) {
                if (gs.missilesLeftInWave > 0) {
                    const targets = [...gs.cities, ...gs.silos].filter((t) => t.alive)
                    if (targets.length > 0) {
                        const pick = chooseEnemySpawn(gs.rand, targets)
                        gs.warheads.push({
                            id: gs.nextId++,
                            x: pick.x, y: 0,
                            startX: pick.startX, startY: 0,
                            targetX: pick.target.x,
                            targetY: pick.target.y,
                            speed: WARHEAD_SPEED_BASE + gs.wave * 0.1,
                            color: '#ff0000',
                            coverUntil: 0, // driver bookkeeping, inert without it
                        })
                        gs.missilesLeftInWave--
                        gs.spawnTimer = Math.max(10, 100 - gs.wave * 5)
                    }
                } else {
                    gs.spawning = false
                }
            }
        }

        // Wave clears only when the sky AND the fire are empty (verbatim law),
        // once every owed cruise craft has crossed or burned (#3629), and —
        // #3630 — once every owed smart bomb has fallen or been killed.
        if (!gs.spawning && gs.warheads.length === 0 && gs.blasts.length === 0 &&
            gs.saucers.length === 0 && gs.saucersLeftInWave === 0 &&
            gs.smartLeftInWave === 0) {
            nextWave(gs)
        }
    }

    gs.abms.forEach((m) => {
        const dx = m.targetX - m.x
        const dy = m.targetY - m.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < m.speed) {
            spawnBlast(gs, m.targetX, m.targetY, !!m.center)
            m.dead = true
        } else {
            const a = Math.atan2(dy, dx)
            m.x += Math.cos(a) * m.speed
            m.y += Math.sin(a) * m.speed
        }
    })
    gs.abms = gs.abms.filter((m) => !m.dead)

    const saucerWrecks = []
    const smartWrecks = []

    gs.warheads.forEach((m) => {
        if (m.smart) { stepSmartBomb(gs, m); return } // #3630 — it reads the sky, not just its target
        const dx = m.targetX - m.x
        const dy = m.targetY - m.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < m.speed) {
            spawnBlast(gs, m.targetX, m.targetY)
            m.dead = true
        } else {
            const a = Math.atan2(dy, dx)
            m.x += Math.cos(a) * m.speed
            m.y += Math.sin(a) * m.speed
        }
    })

    // #3629 saucers cross the sky and launch of their own accord. Their
    // missiles ride the exact warhead physics (speed, trails, blast rules), so
    // the gunner's lowest-warhead doctrine covers them with no seat change.
    gs.saucers.forEach((s) => {
        s.x += s.dir * s.speed
        s.frame = Math.floor(gs.tick / 8) % 4 // 4-frame hover cycle (#ART.md bar 2)
        s.fireTimer--
        if (s.fireTimer <= 0 && s.x > 40 && s.x < SCREEN_WIDTH - 40) {
            const targets = [...gs.cities, ...gs.silos].filter((t) => t.alive)
            if (targets.length > 0) {
                const pick = targets[Math.floor(gs.rand() * targets.length)]
                gs.warheads.push({
                    id: gs.nextId++,
                    x: s.x, y: s.y, startX: s.x, startY: s.y,
                    targetX: pick.x, targetY: pick.y,
                    speed: WARHEAD_SPEED_BASE + gs.wave * 0.1,
                    color: '#ff0000',
                    coverUntil: 0,
                    cruise: true, // fell from the saucer, not launched by a battery
                })
                gs.events.push('cruisefire')
                s.fireTimer = 50 + Math.floor(gs.rand() * 50)
            }
        }
        if ((s.dir === 1 && s.x > SCREEN_WIDTH + SAUCER_EDGE) ||
            (s.dir === -1 && s.x < -SAUCER_EDGE)) s.dead = true
    })
    gs.saucers = gs.saucers.filter((s) => !s.dead)

    gs.blasts.forEach((e) => {
        if (e.growing) {
            e.radius += BLAST_SPEED
            if (e.radius >= BLAST_RADIUS_MAX) e.growing = false
        } else {
            e.radius -= BLAST_SPEED
            if (e.radius <= 0) e.dead = true
        }
        gs.warheads.forEach((m) => {
            const dx = m.x - e.x
            const dy = m.y - e.y
            if (Math.sqrt(dx * dx + dy * dy) < e.radius + (m.smart ? SMART_CORE_R : 0)) {
                // #3630 hard counter-rule (Wikipedia, verbatim): "only these
                // [center battery] missiles can effectively destroy a smart
                // bomb" — an outer-battery fireball passes harmlessly through.
                if (m.smart && !e.center) return
                m.dead = true
                addScore(gs, 25) // #3630 slice 2: the kill pays the seat that took it
                // #3707 crowd-kill audio: the arcade billed 25 at once for every
                // missile a single explosion downed — our ring stayed silent
                // however many it swept. One 'multikill' per kill beyond the
                // first in this blast (over its whole life, not just one tick);
                // the draw stacks a rising note on the boom for each.
                e.kills = (e.kills || 0) + 1
                if (e.kills >= 2) gs.events.push('multikill')
                if (m.smart) {
                    gs.events.push('smartkill')
                    smartWrecks.push([m.x, m.y])
                }
            }
        })
        // #3629: any fireball that touches the hull burns the cruise craft —
        // 125 points, Atari 1981 manual Table 1 (enemy cruise missile).
        gs.saucers.forEach((s) => {
            if (s.dead) return
            const dx = s.x - e.x
            const dy = s.y - e.y
            if (Math.sqrt(dx * dx + dy * dy) < e.radius + SAUCER_HIT_R) {
                s.dead = true
                addScore(gs, SAUCER_SCORE) // #3630 slice 2: the 125 pays the live seat
                gs.events.push('saucerkill')
                saucerWrecks.push([s.x, s.y])
                // #3638 kill juice — a white flash plus six debris ticks, the
                // Atari-era spectacle the plain fireball lacked. The dice here
                // roll only on a kill, and kills exist only at/after the gate,
                // so the wave 1..5 byte pins stay untouched.
                gs.flash = { x: s.x, y: s.y, t: 4 }
                for (let i = 0; i < 6; i++) {
                    gs.debris.push({
                        x: s.x, y: s.y,
                        vx: gs.rand() * 4 - 2,
                        vy: gs.rand() * 2.4 - 1.7,
                        life: 26 + Math.floor(gs.rand() * 18),
                        color: i % 3 === 0 ? '#ffffff' : (i % 3 === 1 ? '#ffd23d' : '#ff9a3d'),
                    })
                }
            }
        })
        ;[...gs.cities, ...gs.silos].forEach((t) => {
            if (t.alive) {
                const dx = t.x - e.x
                const dy = t.y - e.y
                if (Math.sqrt(dx * dx + dy * dy) < e.radius) {
                    t.alive = false
                    if (gs.cities.every((c) => !c.alive)) {
                        gs.over = true
                        gs.state = 'gameOver'
                        gs.events.push('over')
                    }
                }
            }
        })
    })
    gs.blasts = gs.blasts.filter((e) => !e.dead)
    gs.warheads = gs.warheads.filter((m) => !m.dead)
    // #3638 cosmetic layers: the flash fades on the sim clock, sparks fall
    // with light gravity. Neither ever joins the wave-clear law.
    if (gs.flash && --gs.flash.t <= 0) gs.flash = null
    if (gs.debris.length > 0) {
        gs.debris.forEach((d) => { d.x += d.vx; d.y += d.vy; d.vy += 0.08; d.life-- })
        gs.debris = gs.debris.filter((d) => d.life > 0)
    }
    // Wreck fireballs spawn after the pass so a kill's blast starts its own
    // grow-shrink life next tick (no mid-iteration reentry into gs.blasts).
    for (const [wx, wy] of saucerWrecks) spawnBlast(gs, wx, wy)
    for (const [wx, wy] of smartWrecks) spawnBlast(gs, wx, wy, true)
    gs.saucers = gs.saucers.filter((s) => !s.dead)
}

// --------------------------------------------------------- attract ferry -----
// #3638: the attract screen advertises the wave-6 feature. Scripted by tick,
// NOT dice — every sighting is the same craft at the same places whatever the
// seed, which is both the proof it consults nothing and why the determinism
// story below the gate stays byte-clean. One ferry in the sky at a time; the
// attract pilot leads it like a warhead and the kill pays the real 125.
export const ATTRACT_FERRY_EVERY = 360
export function attractFerry(gs) {
    if (gs.state !== 'playing' || gs.saucers.length > 0) return
    if (gs.tick > 0 && gs.tick % ATTRACT_FERRY_EVERY === 0) {
        const n = gs.attractFerries
        gs.attractFerries++
        gs.saucers.push({
            id: gs.nextId++,
            x: n % 2 === 0 ? -SAUCER_EDGE : SCREEN_WIDTH + SAUCER_EDGE,
            y: 130 + (n % 3) * 26,
            dir: n % 2 === 0 ? 1 : -1,
            speed: 2.2,
            fireTimer: 90,
            frame: 0,
        })
        gs.events.push('saucer')
    }
}

// ---------------------------------------------------------- the gunner -------
// The proven route (#1637 b29). Reactive per tick — seat it from any position,
// hand it back mid-barrage. Priority is the LOWEST live warhead (the one
// closest to getting a city), and each warhead gets exactly one shot in
// flight; when its cover lapses and it still lives, the next tick re-solves.
// `opts.noBonus` (harness-only, #3638) strips the ferry opportunism so the
// A/B sweep can prove the bonus never costs a city.
export function gunnerStep(gs, opts = {}) {
    if (gs.state !== 'playing') return null
    const live = gs.warheads.filter((m) => !m.dead && !m.smart).sort((a, b) => b.y - a.y)
    // #3711 deep-wave doctrine, engaged only when the magazine cannot pay 1:1
    // (clusterMode is the measured deficit — the mirror of #3638's reserve
    // rule). Where it can, this loop is the untouched earliest-intercept
    // doctrine, so the waves 1..8 byte claims replay byte-identical.
    // Two expert habits apply under deficit, both measured, one kept:
    //  - KNOTS: one ring at the crossing point downs every warhead inside it.
    //    Rare at reachable waves (spawn spacing keeps siblings 50-150 px
    //    apart at any shared altitude; it closes to a knot only near wave
    //    18), but each knot found is a shell saved. Kept.
    //  - SILO-FIRST: measured at waves 7-9 every seed loses the outer silos
    //    first — and each dead silo forfeits the shells still loaded in it,
    //    shrinking the magazine by ~10 exactly when the wave outgrows it.
    //    Under deficit the gunner answers the silo streams before the city
    //    streams: a defended silo IS ammunition. (An earlier third habit —
    //    "sacrifice one city, let its stream through" — was measured and
    //    REVERTED: dead structures retarget the spawn dice, so nothing
    //    absorbs leaks; it cost cities at waves 8-12. Volume is volume.)
    const cluster = !opts.noCluster && clusterMode(gs)
    const isSiloTarget = (m) => gs.silos.some((s) => s.alive && Math.abs(m.targetX - s.x) < 1)
    if (cluster) live.sort((a, b) => (isSiloTarget(b) ? 1 : 0) - (isSiloTarget(a) ? 1 : 0) || b.y - a.y)
    // One future-position table per candidate warhead, built lazily with the
    // sim's own step formula: exact, because non-smart warheads are straight
    // lines at constant speed.
    const futures = cluster ? new Map() : null
    const positionsOf = (v) => {
        let arr = futures.get(v)
        if (arr) return arr
        arr = [{ x: v.x, y: v.y, landed: false }]
        let { x, y } = v
        for (let t = 1; t <= 500; t++) {
            const n = advanceWarhead(v, x, y)
            arr.push({ x: n.x, y: n.y, landed: n.landed })
            x = n.x; y = n.y
            if (n.landed) break
        }
        futures.set(v, arr)
        return arr
    }
    for (const w of live) {
        if (gs.tick < w.coverUntil) continue // a shot is already promised (or the knot hold, #3711)
        const open = (v) => gs.tick >= v.coverUntil || v.held === true
        const others = cluster ? live.filter((v) => v !== w && open(v)) : []
        let fired = null
        let arrive = 0 // offset tick at which the primary meets its ring
        let knot = null // [warhead, kill-offset] pairs predicted into the ring
        let bestF = 1 // best kill count over READY-now points
        let firstFire = null // earliest ready point — the old doctrine's answer
        let holdJ = 0, holdX = 0, holdK = 0 // a bigger knot is coming, j ticks out (hold)
        for (let j = 1; j <= 500; j++) {
            const p = stepWarhead(w, j)
            if (p.y > SAFE_Y) break // it only falls further; no safe meet ahead
            const silo = nearestSilo(gs, p.x)
            if (!silo) return null // batteries dry or dead — nothing to spend
            const d = Math.hypot(p.x - silo.x, p.y - silo.y)
            // #3630: predict with the launching silo's real speed — from the
            // smart gate the center flies 28, and a boom computed at 15
            // detonates early and misses. Below the gate this is ABM_SPEED.
            const k = abmArrivalTicks(d, siloSpeed(gs, silo))
            if (k > j) continue
            if (!cluster) {
                // Detonates at tick now+k with radius >= 1; the warhead is at
                // this exact point at now+j >= now+k — distance 0 < radius.
                fired = { aimX: p.x, aimY: p.y, wid: w.id, boom: gs.tick + k }
                arrive = j
                break
            }
            if (j - k < BLAST_LIFE) {
                // READY point (the ring can still be alive when the warhead
                // arrives). Score the ring exactly: every open warhead the
                // envelope provably sweeps WITH CUSHION (the ring must beat
                // the warhead's travel by a margin — a grazing claim is
                // one-tick noise between prediction and sim, and duds are
                // forbidden). Max kills wins; ties fall to the earliest point,
                // which is the old doctrine when no knot is ready this tick.
                let kills = 1
                let bag = []
                for (const v of others) {
                    const arr = positionsOf(v)
                    const tEnd = Math.min(arr.length - 1, k + BLAST_LIFE - 1)
                    for (let t = k; t <= tEnd; t++) {
                        const q = arr[t]
                        if (q.landed) break // it has already hit its target
                        if (Math.hypot(q.x - p.x, q.y - p.y) < blastRadiusAt(t - k) - 2) {
                            kills++
                            bag.push([v, t])
                            break
                        }
                    }
                }
                if (!firstFire) firstFire = { shot: { aimX: p.x, aimY: p.y, wid: w.id, boom: gs.tick + k }, j }
                if (kills > bestF) {
                    bestF = kills
                    fired = { aimX: p.x, aimY: p.y, wid: w.id, boom: gs.tick + k }
                    arrive = j
                    knot = bag
                    if (kills === others.length + 1) break // the whole open sky, one ring
                }
            } else if (others.length > 0) {
                // Not reachable yet — but is a crossing waiting down there?
                // Same-tick proximity (8 px): the ring cannot be pre-fired,
                // only held for, so this is the HOLD candidate.
                let x = 0
                for (const v of others) {
                    const arr = positionsOf(v)
                    if (j < arr.length && !arr[j].landed && Math.hypot(arr[j].x - p.x, arr[j].y - p.y) < 8) x++
                }
                if (x > holdX) { holdX = x; holdJ = j; holdK = k }
            }
        }
        if (!fired && cluster && holdX >= 1) {
            // Wait for the knot: cover the primary only until the crossing
            // enters the fire-ready window (a shell can't loiter — the ring
            // lives BLAST_LIFE ticks, so the shot becomes possible at
            // j − k − BLAST_LIFE). If the geometry dies meanwhile (a
            // co-warhead gets shot by something else, say), the tick-lapse
            // re-solve falls back to the plain earliest-intercept answer —
            // a held warhead can never be forgotten.
            w.held = true
            // #3707 knot tell: a hold needs a face. Record the predicted meet
            // point — where one shell will pay for many — so the draw can pulse
            // it while the hold is live. Pure render data (no dice, no score):
            // the eye learns the knot habit the arcade taught with its
            // multi-kill score popups.
            const meet = stepWarhead(w, holdJ)
            w.knotX = meet.x
            w.knotY = meet.y
            w.coverUntil = gs.tick + Math.max(1, holdJ - holdK - BLAST_LIFE + 2)
            continue
        }
        if (!fired && firstFire) { fired = firstFire.shot; arrive = firstFire.j }
        if (fired) {
            w.held = false
            w.coverUntil = cluster ? gs.tick + arrive + 4 : fired.boom + 4
            // Promise the ring to everything it predicts to kill. A co-kill
            // that some earlier blast beats to it simply dies covered; one
            // that somehow survives re-solves when its cover lapses — the
            // same net the solo doctrine has always landed on.
            if (knot) for (const [v, t] of knot) { v.coverUntil = gs.tick + t + 4; v.held = false }
            return fired
        }
        // No safe intercept exists for the lowest warhead — higher ones are
        // covered by their own shots already in the air or by the next tick.
    }
    // #3630 smart bombs — the arcade's own counter is the center battery
    // ("only these missiles can effectively destroy a smart bomb at a
    // distance"), so the watch never burns outer ammo on one: it solves the
    // straight-line meet from the center silo at center speed. The bomb's
    // sidestep is bounded (2.6 px/tick against 28 px/tick of ABM) — the fast
    // missile is exactly what made the expert's shot land. Warheads above,
    // ferry below: cities before bonus, doctrine before opportunism.
    const center = gs.silos.find((s) => s.alive && s.ammo > 0 && s.x === CENTER_SILO_X)
    if (center) {
        const centerIdx = gs.silos.indexOf(center)
        const bombs = gs.warheads.filter((m) => !m.dead && m.smart).sort((a, b) => b.y - a.y)
        for (const w of bombs) {
            if (gs.tick < w.coverUntil) continue
            let fired = null
            for (let j = 1; j <= 500; j++) {
                const p = stepWarhead(w, j)
                if (p.y > SAFE_Y) break
                // Only blind solutions (§7 hint 3): the aim must sit inside the
                // blind radius of the bomb at launch, else the seen shot gets
                // dodged and the ammo is just noise. The center battery's speed
                // is what makes such a point exist at range — the arcade proof.
                if (Math.hypot(w.x - p.x, w.y - p.y) > SMART_PERFECT_R) continue
                const d = Math.hypot(p.x - center.x, p.y - center.y)
                const k = abmArrivalTicks(d, CENTER_ABM_SPEED)
                if (k <= j) {
                    // arcade three-button law: any base may be told to shoot
                    // anywhere, so outer-sector bombs are still defended.
                    fired = { aimX: p.x, aimY: p.y, wid: w.id, boom: gs.tick + k, silo: centerIdx }
                    break
                }
            }
            if (fired) {
                w.coverUntil = fired.boom + 4
                return fired
            }
        }
    }
    // #3629 opportunism, doctrine-clean: spend on a saucer only when the
    // warhead sky is fully covered (or empty) AND the craft is well over the
    // board — never a cheap edge pop. This is how arcade experts took the
    // 125-point bonus: one eye on the cities, a free shot at the ferry.
    // #3638 reserve rule (measured, not vibes): "free" means the magazine can
    // still pay for it. The debt is every warhead the wave can still field —
    // the ICBM ladder left to spawn PLUS the cruise launches of ferries other
    // than the target (a crossing ferry drops one every 50–99 ticks, ~6 per
    // crossing at these speeds; owed ferries count their whole crossing).
    // Killing THIS ferry cancels its launches — the trade the rule rewards.
    // A/B sweep (missilecmdcheck §deep, 12 seeds × waves 6–10): with the rule
    // the bonus never costs a city, and every wave still clears.
    const anyLive = gs.warheads.some((w) => !w.dead && gs.tick >= w.coverUntil)
    const saucer = opts.noBonus ? undefined : gs.saucers.find((s) => !s.dead && gs.tick >= (s.coverUntil || 0) &&
        (s.dir === 1 ? s.x > SCREEN_WIDTH * 0.25 : s.x < SCREEN_WIDTH * 0.75))
    const ammoLeft = gs.silos.reduce((a, s) => a + (s.alive ? s.ammo : 0), 0)
    const launchLeft = (s) => Math.ceil(Math.max(0,
        (s.dir === 1 ? SCREEN_WIDTH + SAUCER_EDGE - s.x : s.x + SAUCER_EDGE) / s.speed) / 70)
    const crossingTicks = (SCREEN_WIDTH + 2 * SAUCER_EDGE) / (SAUCER_SPEED_BASE + gs.wave * 0.08)
    const reserve = gs.missilesLeftInWave +
        gs.saucersLeftInWave * Math.max(1, Math.round(crossingTicks / 70)) +
        gs.saucers.reduce((a, s) => a + (s === saucer || s.dead ? 0 : launchLeft(s)), 0)
    if (!anyLive && saucer && ammoLeft - 1 >= reserve) {
        for (let j = 1; j <= 500; j++) {
            const px = saucer.x + saucer.dir * saucer.speed * j
            if (px < -SAUCER_EDGE || px > SCREEN_WIDTH + SAUCER_EDGE) break
            const silo = nearestSilo(gs, px)
            if (!silo) break // batteries dry or dead — nothing to spend
            const d = Math.hypot(px - silo.x, saucer.y - silo.y)
            const k = abmArrivalTicks(d, siloSpeed(gs, silo)) // #3630 center flies 28
            if (k <= j) {
                saucer.coverUntil = gs.tick + k + 4
                return { aimX: px, aimY: saucer.y, wid: saucer.id, boom: gs.tick + k }
            }
        }
    }
    return null
}
