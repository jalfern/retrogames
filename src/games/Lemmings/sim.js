// LEMMINGS-LITE — the simulation. No DOM, no React, no canvas: plain Node can
// import this file, and `scripts/lemcheck.mjs` does exactly that — it proves
// every level is solvable (a greedy lookahead solver over THIS forward model)
// before a browser is ever opened, in the spirit of heistcheck/zorkcheck/beecheck.
//
// Geometry, so the tile math is readable: a lemming's foot y is a ROW BOUNDARY
// when standing — feet at y=k means cell ROW k is the ground under it. Its
// body is the one cell at row k-1. Walking right at foot k, the cells ahead are
//   (cx, k)   foot level  → solid = a one-tile step (mount it if there is headroom)
//   (cx, k-1) chest       → solid = a wall 2+ tall (only a climber, and only
//                           with free air above — an overhang refuses a climb)
//   both air  → the floor ends: one row below is a step-down (#3908 — walk it,
//   the mirror of the mount), two or more is a fall. Fatal falls kill; the
//   digger is the only descent THROUGH rock, because it tunnels one tile at a
//   time from the inside.
//
// The rules that matter, and why each is the shape it is:
//
// - Agent-per-entity is the issue's request: every lemming is an independent
//   little state machine (walk / fall / climb / dig / block / bomb / corpse),
//   stepped in id order, so the whole game is a pure function of
//   (level, grid, command list). That is what makes "deterministic replay"
//   true rather than aspirational: attract mode IS a replayed solver script,
//   and lemcheck replays the solver's own script and demands an identical hash.
// - Commands are {tick, id, skill} — exactly what the shell records from the
//   player's one-click assignment. The solver has no privileged peeks; if it
//   cannot clear a level with the level's skill supply, the level is broken.
// - A climber needs a DIRT handhold and climbs only up: a steel wall refuses
//   it, and a steel overhang over dirt refuses it one move later. That asymmetry
//   is what levels are built from.
// - The digger TUNNELS: it chews the dirt cell at chest height and walks
//   through. (A digger that only dug straight down stranded itself in a shaft
//   bottom with the crowd still on the surface — a tunnel carries the swarm.)
// - Bombs clear dirt and bodies, never steel; a bomb chains other bombers;
//   corpses block walkers (the classic body-pile). Dirt is the only
//   destructible matter.
// - #3864 the block is ONE-SHOT, like the original: a climber treats a blocker
//   as a handhold and crosses his head, and any body that crosses the head line
//   spends the block — the blocker wakes and resumes walking where he faced.
// - The FLOATER carries a parachute: descent is capped at floatSp and no
//   landing height is fatal. Like climber/digger it is a flag for life — every
//   later fall auto-opens the canopy, which is why re-granting refuses (#422).
//   (The original's dig-while-floating does NOT port: this engine's digger is
//   a horizontal tunneler that carries the swarm, per sim comment above — a
//   vertical air-dig would contradict the dig model. Honest gap in README.)

export const W = 48
export const H = 27
export const FIXED_DT = 1 / 60

export const AIR = 0
export const DIRT = 1
export const STEEL = 2
// WATER (#3828): the original's signature hazard — any lemming that touches it
// drowns, from any height, no skill saves it. Water is NOT ground: walkers walk
// into it and sink. Only DIRT yields to digging and blasting; water stays.
export const WATER = 3
// PLANK (#3863): placed matter — the BUILDER's wood. Planks read as ground
// (support walkers, mountable one-tile steps, land fallers), but they are not
// dirt: the digger chews only dirt, and climbers need dirt handholds, so wood
// refuses both. Bombs clear planks, as in the original. The grid stays one
// byte per cell, so determinism and stateHash ride planks for free.
export const PLANK = 4

export const CFG = {
    walkSp: 2.3,
    fallSp: 8.5,
    floatSp: 2.6,
    // #3849: the original kills past ~3 tiles of fall; 7 swallowed the spire's
    // descents and made every drop free. Tightened to the original's rule —
    // fallers must step down, climb, or float. THE SPIRE's east stair was
    // re-carved to match (a >3-tile final drop is unsolvable by design).
    maxFall: 3,
    climbSp: 2.6,
    digSp: 2.2,
    // #3879 WIND: a vent's gust speed, cells/s — faster than a walk (2.3) so
    // a caught canopy visibly outruns the crowd, but a drift is survivable
    // with timing (floatSp 2.6 sets how fast it sinks through the band).
    windSp: 3.4,
    // #3879 TRAMPOLINE (terrain gadget 2 of 3): the mat's launch speed, cells/s.
    // The apex is v²/2g = 2.5 cells under this engine's g=20 — high enough to
    // read on screen and to clear the trench rim's row, low enough that the
    // drop back lands under maxFall (3): a bounce is never a splat. The launch
    // is FIXED — arriving fast or slow, the mat throws the same height — and
    // it absorbs the fall (fallDist resets), which is what makes the pad a
    // rescue as much as a toy. padHold (world ticks) is the body's cooldown:
    // ~60 ticks of flight + ~52 ticks to walk off a two-cell mat + margin,
    // so a body NEVER re-bounces a mat it is still standing on — mats ping
    // the crowd once per arrival, forever is not on the menu.
    padJump: 10,
    padHold: 140,
    fuse: 1.6,
    blast: 1.8,
    blockRange: 1.0,
    flash: 36,
}

export const SKILLS = ['block', 'bomb', 'climb', 'dig', 'float', 'build']
// The skill a level opens SELECTED (the tutorial reach of the board). Levels
// may declare it explicitly (#3864: THE SPIRE ships one BLOCKER, but its
// tutorial arm is still CLIMB); otherwise it is the first skill in SKILLS
// order with supply. The mount path AND `recmethods` read this single source —
// a derivation duplicated in the harness silently drifts when a supply dict
// changes (the SPIRE block:1 collapsed the pointer replay to one tap).
export const defaultSkill = (level) => (level.defaultSkill && (level.skills[level.defaultSkill] | 0) > 0)
    ? level.defaultSkill
    : (SKILLS.find((s) => (level.skills[s] | 0) > 0) || 'climb')
export const SKILL_KEY = { Digit1: 'block', Digit2: 'bomb', Digit3: 'climb', Digit4: 'dig', Digit5: 'float', Digit6: 'build' }
export const SKILL_NAME = { block: 'BLOCKER', bomb: 'BOMBER', climb: 'CLIMBER', dig: 'DIGGER', float: 'FLOATER', build: 'BUILDER' }

export const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const cell = (g, cx, cy) => {
    if (cx < 0 || cx >= W || cy < 0 || cy >= H) return STEEL   // world edges are steel
    return g.grid[cy * W + cx]
}
// PLANK counts as solid (#3863): wood supports walkers and landings exactly
// like terrain — that is the whole point of a plank road.
export const solid = (g, cx, cy) => { const c = cell(g, cx, cy); return c === DIRT || c === STEEL || c === PLANK }
const groundRow = (y) => Math.floor(y + 1e-6)
const bodyRow = (y) => Math.floor(y - 0.5)

// #3879 WIND VENTS — the original's mid-game difficulty engine, first gadget
// of the terrain-variety family. A level declares `vents: [{x, y, dir, reach}]`:
// the mouth cell (x,y) blows horizontally `dir` for `reach` cells, an airstream
// two rows tall (rows y−1 and y). Wind moves CANOPIES ONLY: a FLOATER in the
// stream is pushed at CFG.windSp while airborne. Walkers, diggers, climbers,
// blockers and bombers hold their line — the original's wind is the parachute's
// problem, and this keeps every solver proof riding unchanged: candidates()
// never offers FLOATER (#3827 law), so no recorded script, hash pin or level
// proof ever crosses a gust. For the player it cuts both ways: THE SPIRE's
// vent tails floaters onto the exit plinth (and into the bay if you overshoot),
// THE MASSIF's shoves them back off the plinth into the trench's mouth.
// The stream never pushes through matter: a body whose chest or feet column
// ahead is solid stays put — gusts carry you to a wall, never into one.
export function windAt(g, L) {
    const vents = g.level.vents
    if (!vents) return 0
    const br = bodyRow(L.y), gr = groundRow(L.y)
    for (const v of vents) {
        const d = v.dir || 1
        const k = (L.x - v.x) * d
        if (k >= 0 && k <= v.reach && (br === v.y || br === v.y - 1 || gr === v.y || gr === v.y - 1)) return d
    }
    return 0
}

// #3879 TRAMPOLINES — gadget 2 of 3 of the terrain-variety family (after the
// vents). A level declares `trampolines: [{x, y}]`: a mat on the face of cell
// (x,y), sprung at that cell's top boundary. ANY body that arrives on a mat —
// a faller's landing, or a walker's footstep along the floor — is launched at
// the fixed CFG.padJump with its fall wiped (the mat absorbs the drop). The
// launch is vertical: the original's pads toss you UP, momentum stays yours.
// Two guards keep the toy honest: a body that left a mat less than padHold
// ticks ago stands on it instead of bouncing (no endless ping-pong), and a mat
// whose two rows of sky are not clear is dead steel (a walled mat must not
// shove a head through rock). Like the vents, the mats never touch the
// solver's proven line: the level that hosts them keeps its plank road as the
// only crossing its proofs ride.
export function padAt(g, L) {
    const pads = g.level.trampolines
    if (!pads) return null
    const k = groundRow(L.y)
    for (const p of pads) {
        if (Math.floor(L.x) === p.x && k === p.y
            && cell(g, p.x, p.y - 1) === AIR && cell(g, p.x, p.y - 2) === AIR) return p
    }
    return null
}

function padLaunch(g, L) {
    L.state = 'fall'
    L.vy = -CFG.padJump
    L.fallDist = 0
    L.padCd = g.tick + CFG.padHold
    g.events.push({ type: 'pad', id: L.id, x: L.x, y: L.y })
}

export const hash = (s) => {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return (h >>> 0).toString(16)
}

export function stateHash(g) {
    let s = `${g.tick}|${g.exited}|${g.dead}|${g.score}`
    for (const L of g.lemmings) s += `|${L.id}:${L.state[0]}${L.dir}${L.x.toFixed(3)}${L.y.toFixed(3)}`
    for (let i = 0; i < g.grid.length; i++) s += String.fromCharCode(48 + g.grid[i])
    return hash(s)
}

export function makeGame(level, grid) {
    return {
        level,
        grid: Uint8Array.from(grid),
        tick: 0,
        t: 0,
        end: null,                        // null | 'clear' | 'dead'
        win: false,
        score: 0,
        spawned: 0,
        exited: 0,
        dead: 0,
        drowned: 0,                       // #3828 deaths by water, for HUD/harness honesty
        cursor: { x: 6.5, y: 18 },
        selected: defaultSkill(level),
        skills: { ...level.skills },
        lemmings: [],
        cmds: [],                         // command log: {tick,id,skill} — replay fuel
        events: [],
    }
}

export function spawnLemming(g) {
    g.lemmings.push({
        id: g.lemmings.length,
        x: g.level.spawn.x + (g.spawned % 2 ? 0.25 : -0.25),
        y: g.level.spawn.y,
        vy: 0,
        dir: g.level.spawn.dir || 1,
        state: 'fall',
        fallDist: 0,
        digT: 0,
        fuseT: -1,
        climber: false,
        digger: false,
        floater: false,
        builder: false,
        padCd: -1,
        flashT: 0,
        turnCd: -1,
        live: true,
    })
    g.spawned++
    g.events.push({ type: 'spawn', id: g.lemmings.length - 1 })
}

export function nearestLemming(g, x, y, maxD = 1.6) {
    let best = null, bd = maxD + 1e-9
    for (const L of g.lemmings) {
        if (!L.live) continue
        const d = Math.hypot(L.x - x, L.y - y)
        if (d < bd) { bd = d; best = L }
    }
    return best
}

export function assign(g, id, skill) {
    const L = g.lemmings[id]
    if (!L || !L.live) return false
    if ((g.skills[skill] | 0) <= 0) return false
    const st = L.state
    if (skill === 'block' && st !== 'walk' && st !== 'dig') return false
    // A climber / digger keeps its skill for life. Refuse to hand it a second
    // copy: the state checks alone are not enough, because a climber that has
    // crested a wall (or a digger that has tunneled through) is back in 'walk'
    // but already carries the flag — pressing its skill again would silently
    // burn a supply, and on THE SPIRE one such clump drains every CLIMBER and
    // the level becomes mathematically lost. (issue #422 item 2, the original
    // Lemmings refuses to give a climber the climber skill twice.)
    if (skill === 'climb' && (st === 'climb' || L.climber)) return false
    if (skill === 'dig' && (st !== 'walk' || L.digger)) return false
    if (skill === 'bomb' && st === 'bomb') return false
    // A floater carries its parachute for life (same law as climber/digger,
    // #422): a second grant would only burn supply. Assigning while standing
    // is fine — the canopy rides on show and auto-opens on the next fall.
    // A blocker mid-block cannot reach for a parachute (the line depends on it
    // standing) and a bomb's fuse does not un-light. A WOKEN blocker (#3864)
    // is just a walker again and may take either.
    if (skill === 'float' && (L.floater || st === 'block' || st === 'bomb')) return false
    // #3863 BUILDER: the plank carrier flag is for life like climber/digger
    // (#422 law — a re-grant would only beg), and the line/bomb jobs refuse it.
    // Assigning is FREE by design: g.skills.build is the plank cargo, and the
    // original's panel decrements when wood is LAID, not when the skill is
    // handed out — the charge model differs from the five per-lemming skills.
    if (skill === 'build' && (L.builder || st === 'block' || st === 'bomb')) return false
    if (skill !== 'build') g.skills[skill]--
    g.cmds.push({ tick: g.tick, id, skill })
    if (skill === 'climb') L.climber = true
    else if (skill === 'block') L.state = 'block'
    else if (skill === 'dig') { L.digger = true; L.state = 'dig'; L.digT = 0 }
    else if (skill === 'bomb') { L.state = 'bomb'; L.fuseT = 0 }
    else if (skill === 'float') L.floater = true
    else if (skill === 'build') L.builder = true
    L.flashT = CFG.flash
    g.events.push({ type: 'assign', id, skill })
    return true
}

export function step(g, cursorTarget = null) {
    g.events.length = 0
    if (g.end) return g
    g.tick++
    g.t = g.tick / 60
    const lv = g.level

    if (cursorTarget) g.cursor = { x: cursorTarget.x, y: cursorTarget.y }
    if (g.spawned < lv.spawnCount && g.tick % lv.spawnEvery === 0) spawnLemming(g)

    for (const L of g.lemmings) {
        if (!L.live) continue
        if (L.flashT > 0) L.flashT--
        if (exitTouch(g, L)) continue
        // #3828 water: a live body whose chest or feet cell is water drowns,
        // whatever height it arrived from and whatever state it was in. Checked
        // before the state machine so a faller over a pond sinks instead of
        // splatting, and a walker that wades in dies at the surface.
        if (inWater(g, L)) { kill(g, L, 'drown'); continue }
        switch (L.state) {
            case 'walk': case 'bomb': case 'block': walker(g, L); break
            case 'fall': faller(g, L); break
            case 'climb': climber(g, L); break
            case 'dig': digger(g, L); break
        }
        if (L.live && L.state === 'walk' && L.padCd <= g.tick && padAt(g, L)) {
            // #3879: footsteps on a mat take the same launch a landing does —
            // the trench floor is walkable rock, and the mats sit on it.
            padLaunch(g, L)
        }
        if (L.live && L.state !== 'climb' && L.state !== 'fall'
            && !solid(g, Math.floor(L.x), groundRow(L.y))) {
            L.state = 'fall'; L.fallDist = 0; L.vy = 0
        }
        if (L.live) exitTouch(g, L)
    }

    const active = g.lemmings.reduce((n, L) => n + (L.live ? 1 : 0), 0)
    if (g.exited >= lv.need) {                 // save enough and the ledge is over: end on the count,
        g.end = 'clear'                        // never wait for the stragglers to die or the clock to run out
        g.win = true
        g.score += skillBonus(g) + Math.max(0, Math.round(lv.time - g.t)) * 2
        g.events.push({ type: 'win' })
    } else if (active === 0 && g.spawned >= lv.spawnCount) {
        g.end = 'clear'
        g.win = g.exited >= lv.need
        g.score += g.win ? skillBonus(g) + Math.max(0, Math.round(lv.time - g.t)) * 2 : 0
        g.events.push({ type: g.win ? 'win' : 'lose' })
    } else if (g.tick >= lv.time * 60) {
        g.end = 'clear'
        g.win = g.exited >= lv.need
        g.score += g.win ? skillBonus(g) : 0
        g.events.push({ type: g.win ? 'win' : 'time' })
    }
    return g
}

const skillBonus = (g) => SKILLS.reduce((s, k) => s + (g.skills[k] | 0), 0) * 25

function exitTouch(g, L) {
    const e = g.level.exit
    if (Math.floor(L.x) === e.x && bodyRow(L.y) === e.y) {
        L.live = false; L.state = 'exited'
        g.exited++
        g.score += 100
        g.events.push({ type: 'exit', id: L.id })
        return true
    }
    return false
}

function kill(g, L, cause) {
    L.live = false; L.state = 'dead'
    g.dead++
    if (cause === 'drown') g.drowned = (g.drowned | 0) + 1
    // #3844: the death event carries WHERE the lemming died (the shape `blast`
    // already carries), so the shell can pop its OH NO! sprite on the corpse.
    g.events.push({ type: cause === 'fall' ? 'splat' : cause === 'drown' ? 'drown' : 'boom', id: L.id, x: L.x, y: L.y })
}

// chest or feet in a water cell = drowned (#3828). Out-of-bounds reads as
// STEEL, so only real WATER tiles ever answer true.
const inWater = (g, L) => cell(g, Math.floor(L.x), bodyRow(L.y)) === WATER
    || cell(g, Math.floor(L.x), groundRow(L.y)) === WATER

function walker(g, L) {
    if (L.state === 'bomb') {
        L.fuseT += FIXED_DT
        if (L.fuseT >= CFG.fuse) { blast(g, L); return }
    }
    // #3864 the original's one-shot law: a block is SPENT once another lemming
    // crosses his head — wakeCheck releases him and he resumes walking the
    // direction he faced when he blocked (often straight into the hazard he
    // was guarding, exactly as in the game).
    if (L.state === 'block') { wakeCheck(g, L); return }

    const sp = CFG.walkSp * FIXED_DT
    const wasDir = L.dir
    traffic(g, L)
    if (L.dir !== wasDir) return                 // turned: stands this tick
    const nx = L.x + L.dir * sp
    const cx = Math.floor(nx + L.dir * 0.45)
    const k = groundRow(L.y)
    // Three cells matter ahead: a1 = body level (an obstacle here is a step
    // or a wall), a2 = the standing room above a step / wall continuation,
    // a0 = the next floor. Flat ground has a0 solid and a1 air.
    const a1 = cell(g, cx, k - 1)
    const a2 = cell(g, cx, k - 2)
    let a0 = cell(g, cx, k)
    // #3863 BUILDER: at a one-tile descent — floor gone at foot level, a
    // shelf directly below — a builder who still carries wood lays a plank
    // into the gap and keeps walking on it at the level it stood. The wood
    // becomes a step for everyone behind: mountable from the shelf below,
    // crossable at the top, and the road follows a staircase down one
    // plank per step (the original's plank-road trick in square tiles).
    // It refuses a pond (no shelf under the surface) and, since #3908, a
    // drop that runs deeper than the plank's two-row reach — the original's
    // planks need ground.
    if (L.builder && a1 === AIR && a0 === AIR && (g.skills.build | 0) > 0) {
        if (solid(g, cx, k + 1)) {
            g.grid[k * W + cx] = PLANK
            g.skills.build--
            g.events.push({ type: 'plank', id: L.id, x: cx + 0.5, y: k })
            a0 = PLANK                                  // the wood it just laid catches it
        } else if (cell(g, cx, k + 1) === AIR && solid(g, cx, k + 2)) {
            // #3908 SLOPED SPAN: a two-cell descent is bridged at the LOWER
            // level — the board spans the stair at the angle the LOOK (#3879)
            // already draws, and the step-down below carries the crowd onto it.
            // Three rows stays out of reach (wood may not hover over a cave
            // mouth), and water is not ground — `solid` never matched it, and
            // the cell test refuses even the water-surface lay, so the pond
            // law stands over deeper ponds too.
            g.grid[(k + 1) * W + cx] = PLANK
            g.skills.build--
            g.events.push({ type: 'plank', id: L.id, x: cx + 0.5, y: k + 1 })
        }
    }
    if (a1 === DIRT && L.digger) {
        L.state = 'dig'
    } else if (a1 !== AIR) {
        if (a2 === AIR) {                       // one-tile ledge: mount it
            L.x = cx + 0.5 - L.dir * 0.02
            L.y = k - 1
            g.events.push({ type: 'step', id: L.id })
        } else if (L.climber && a1 === DIRT) {   // wall: a dirt handhold takes climbers up
            L.state = 'climb'
        } else {
            L.dir = -L.dir
            g.events.push({ type: 'turn', id: L.id })
        }
    } else if (a0 !== AIR) {
        L.x = nx                                 // ordinary flat step
    } else if (solid(g, cx, k + 1)) {
        // #3908 STEP-DOWN — the mirror of the one-tile mount above: where the
        // original's boards rode the stair at an angle, this grid now WALKS
        // the stair at an angle. If the floor ends at foot level and a shelf
        // waits exactly one row below, the lemming steps down instead of
        // falling: feet land on the shelf, the walk and its speed continue,
        // and no fallDist accumulates — a staircase can be descended forever,
        // while real drops still fall below it and >maxFall still kills. The
        // body stays clear by construction: the cell it drops into is the
        // a0 that just read AIR, and the new body row is that same row.
        L.x = cx + 0.5 - L.dir * 0.02
        L.y = k + 1
        g.events.push({ type: 'stepdown', id: L.id })
    } else {
        L.x = nx
        L.state = 'fall'; L.fallDist = 0; L.vy = 0
    }
}

// Traffic, the way bodies actually resolve it: a walker turns when its nose
// touches a STATIC body (blocker, corpse) or an ONCOMING walker. Same-direction
// overlap is allowed (single file passes through — bodies are 1 tile of fluff),
// and a walker that just turned ignores traffic for a few ticks, or two pairs
// that passed through each other would flip back forever (a corridor that
// vibrates without moving is the deadlock this rule exists to prevent).
// A blocker that can be shoved past is not a blocker, so static bodies turn
// walkers even during that cooldown.
// #3864, the original's first-rung combo: a CLIMBER does not turn at a blocker,
// it climbs him. The blocker's body is the first handhold of whatever is behind
// (or beside) him; the climber crosses his head and lands on the far side —
// ground if there is ground, the pond if that is what the far side is. Crossing
// spends the block: the blocker wakes (the wakeCheck side of the same law).
function traffic(g, L) {
    if (L.state !== 'walk') return
    for (const o of g.lemmings) {
        if (o === L || !o.live) continue
        if (Math.abs(o.y - L.y) > 1.1) continue
        const dx = o.x - L.x
        if (dx * L.dir < 0 || Math.abs(dx) > 0.55) continue
        const staticBody = o.state === 'block' || o.state === 'dead'
        const oncoming = o.state === 'walk' && o.dir === -L.dir
        if (!staticBody && !oncoming) continue
        if (staticBody && o.state === 'block' && L.climber) {
            // mount the blocker: feet one row up, body past his far edge. The
            // standing check in step() drops him from there — onto the far
            // side's ground, or into whatever hazard waits there.
            L.x = o.x + L.dir * 1.05
            L.y = groundRow(L.y) - 1
            g.events.push({ type: 'climbblock', id: L.id })
            releaseBlocker(g, o)
            return
        }
        if (!staticBody && L.turnCd > g.tick) continue
        L.dir = -L.dir
        L.turnCd = g.tick + 14
        g.events.push({ type: 'turn', id: L.id })
        return
    }
}

// #3864 release: the blocker is furniture no longer. He resumes walking in the
// direction he faced when he blocked — into the crowd, or off the edge he was
// holding the line at; the original judges that the player's problem.
function releaseBlocker(g, B) {
    if (B.state !== 'block' || !B.live) return
    B.state = 'walk'
    B.flashT = CFG.flash
    g.events.push({ type: 'wake', id: B.id })
}

// The other side of the wake law: any live body whose feet are at or above a
// blocker's head line, over his column, has crossed him — a climber mounting
// (traffic releases directly), a body landing on his shoulders, a floater
// drifting off his canopy. The block is spent either way.
function wakeCheck(g, L) {
    const k = groundRow(L.y)
    for (const o of g.lemmings) {
        if (o === L || !o.live) continue
        if (Math.abs(o.x - L.x) > 0.7) continue
        if (groundRow(o.y) <= k - 1) { releaseBlocker(g, L); return }
    }
}

function faller(g, L) {
    const cap = L.floater ? CFG.floatSp : CFG.fallSp
    L.vy = Math.min(cap, L.vy + 20 * FIXED_DT)
    const d = L.vy * FIXED_DT
    L.y += d; L.fallDist += d
    // #3879: the gust acts before the landing test — the drift decides WHERE
    // the canopy lands, not just where it wobbles. Never squeeze through a
    // wall: both body columns ahead must stay open.
    if (L.floater) {
        const w = windAt(g, L)
        if (w) {
            const nx = L.x + w * CFG.windSp * FIXED_DT
            const br = bodyRow(L.y), gr = groundRow(L.y)
            if (!solid(g, Math.floor(nx + w * 0.5), br) && !solid(g, Math.floor(nx + w * 0.5), gr)) L.x = nx
        }
    }
    if (solid(g, Math.floor(L.x), groundRow(L.y))) {
        L.y = Math.floor(L.y + 1e-6)
        // #3879: the mat answers before the fall is judged — it catches the
        // drop the solver's scripts never take AND the lethal ones, so the
        // test runs ahead of the splat check on purpose.
        const p = padAt(g, L)
        if (p && L.padCd <= g.tick) { padLaunch(g, L); return }
        if (L.fallDist > CFG.maxFall && !L.floater) { kill(g, L, 'fall'); return }
        L.state = 'walk'
        g.events.push({ type: L.floater ? 'landsoft' : 'land', id: L.id })
    } else if (L.climber && cell(g, Math.floor(L.x + L.dir * 0.5), bodyRow(L.y)) === DIRT) {
        L.state = 'climb'
    }
    if (L.y > H + 2) kill(g, L, 'fall')
}

function climber(g, L) {
    const wx = Math.floor(L.x + L.dir * 0.5)
    const ny = L.y - CFG.climbSp * FIXED_DT
    const cur = bodyRow(L.y)
    const nb = bodyRow(ny)
    if (nb !== cur) {
        const c = cell(g, wx, nb)                    // the next handhold up the wall
        if (c === DIRT) { L.y = ny; return }
        if (c === AIR) {                             // crested: mount the top (row `cur`)
            L.y = cur
            L.x = wx + 0.5 + L.dir * 0.05
            L.state = 'walk'
            g.events.push({ type: 'crest', id: L.id })
            return
        }
        L.state = 'fall'; L.vy = 0; L.fallDist = 0   // steel above the dirt: no handhold
        return
    }
    L.y = ny
    if (L.y < 1) { L.state = 'fall'; L.vy = 0; L.fallDist = 0 }
}

// the digger tunnels: it chews the dirt at chest height and walks through.
// A tunnel is flat, so the whole crowd can follow one digger single file.
function digger(g, L) {
    const cx = Math.floor(L.x + L.dir * 1.45)
    const chest = cell(g, cx, bodyRow(L.y))
    if (chest === DIRT) {
        L.digT += CFG.digSp * FIXED_DT
        if (L.digT >= 1) {
            L.digT -= 1
            g.grid[bodyRow(L.y) * W + cx] = AIR
            g.events.push({ type: 'dig', id: L.id })
        }
        return
    }
    L.state = 'walk'
    // water, like steel, refuses the digger (#3828 — only dirt yields).
    // Wood needs no clause here (#3863): the walker's mount/turn checks read
    // the same row the chest would chew, so a plank face is met as a wall
    // first — the digger climbs the wood or turns, and the plank survives.
    g.events.push({ type: chest === STEEL || chest === WATER ? 'digstop' : 'digthru', id: L.id })
}

function blast(g, L) {
    const bx = L.x, by = L.y - 0.5
    kill(g, L, 'bomb')
    const r = CFG.blast
    for (let cy = Math.floor(by - r); cy <= Math.floor(by + r); cy++) {
        for (let cx = Math.floor(bx - r); cx <= Math.floor(bx + r); cx++) {
            if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue
            const dx = cx + 0.5 - bx, dy = cy + 0.5 - by
            if (dx * dx + dy * dy <= r * r && (g.grid[cy * W + cx] === DIRT || g.grid[cy * W + cx] === PLANK)) {
                g.grid[cy * W + cx] = AIR         // #3863: blasts splinter planks too
            }
        }
    }
    g.events.push({ type: 'blast', id: L.id, x: bx, y: by })
    for (const o of g.lemmings) {
        if (!o.live || o === L) continue
        if (Math.hypot(o.x - bx, o.y - 0.5 - by) < r + 0.3) {
            if (o.state === 'bomb') o.fuseT = Math.min(o.fuseT, 0.02)
            else kill(g, o, 'bomb')
        }
    }
    for (const o of g.lemmings) {
        if (o.live && o.state !== 'climb' && o.state !== 'fall'
            && !solid(g, Math.floor(o.x), groundRow(o.y))) {
            o.state = 'fall'; o.fallDist = 0; o.vy = 0
        }
    }
}

// -------------------------------------------------------------- solvability ----
// The gate. A greedy planner that speaks only like a player: at decision ticks
// it clones the true forward model, applies one real command, rolls H ticks,
// and commits the best-scoring move. No walkthrough, no hints, no privileged
// peeks — if this cannot clear a level with the level's own skill supply,
// lemcheck goes red. The committed script is returned so attract mode replays
// it and lemcheck demands bit-identical determinism of the replay.

function scoreState(g) {
    let s = g.exited * 900 - g.dead * 140
    // #3866 a plank road IS progress: wood standing in the world means the
    // crowd's next crossing costs no risk and no skill, so a laid road scores
    // before the first walker reaches the far side. Sized small — one plank
    // ≈ one walker's distance gain — so it tips ties toward bridging without
    // buying cargo burn: unspent supply pays +25 per unit at the level end,
    // so wood spent for scenery still loses the ledger in the end.
    for (let i = 0; i < g.grid.length; i++) if (g.grid[i] === PLANK) s += 2
    const e = g.level.exit
    for (const L of g.lemmings) {
        if (!L.live) continue
        s += 60 - Math.hypot(e.x - L.x, e.y - L.y) * 2
    }
    return s
}

export function candidates(g) {
    // Act only where the world refuses to move: a walker stopped by a wall, or
    // one about to shuffle off an edge. Everything else is already progressing.
    // (Exported so lemcheck can pin the OFFER boundary — what the solver may
    // even consider — not only what it happens to commit.)
    const out = []
    const seen = new Set()
    const push = (id, skill) => {
        const key = `${skill}:${id}`
        if ((g.skills[skill] | 0) <= 0 || seen.has(key)) return
        seen.add(key); out.push({ id, skill })
    }
    for (const L of g.lemmings) {
        if (!L.live || L.state !== 'walk') continue
        const k = groundRow(L.y)
        const cx = Math.floor(L.x + L.dir * 0.65)
        const a1 = cell(g, cx, k - 1)
        const a2 = cell(g, cx, k - 2)
        const a0 = cell(g, cx, k)
        const wall = a1 !== AIR && a2 !== AIR          // 2+ tall: a skill is needed
        if (wall && a1 === DIRT) {
            if (!L.digger) push(L.id, 'dig')
            if (!L.climber) push(L.id, 'climb')
        }
        // #3859: a pond rim is an edge too. Water reads as walkable to the
        // walker (it wades in and drowns), so if the solver only sees AIR
        // floor-ends it can never block a crowd short of open water — the
        // stock original play at every pond. A climber gets nothing across
        // water (no wall on the far side of a rim), so CLIMB stays AIR-only.
        if ((a0 === AIR || a0 === WATER) && a1 === AIR) {   // the floor ends
            // a blocker needs solid ground under its own feet — a would-be
            // blocker standing over the void (or the pond) just becomes
            // another corpse
            if (solid(g, Math.floor(L.x), k)) push(L.id, 'block')
            if (a0 === AIR && !L.climber) push(L.id, 'climb')
        }
        // #3866 BUILDER enters the search space: at a one-tile descent with a
        // shelf below — the exact cells walker() lays wood into (stage 1's
        // placement rule mirrored, so the solver can never ask the world for
        // a plank it would refuse — pond rims and deep holes stay out) — a
        // free walker is offered the bridge. Like every move it is judged on
        // the roll: where stepping down survives and still delivers, the
        // cargo stays in the pack; where the drop is a trap, wood is the
        // only crossing and the rollout says so.
        // #3908: the mirror widened with the span — a two-cell descent whose
        // LOWER row is solid is a laying site too (wood lands at the lower
        // level); three rows down stays out of reach, and water is never a
        // shelf at either level.
        if (a1 === AIR && a0 === AIR && !L.builder
            && (solid(g, cx, k + 1) || (cell(g, cx, k + 1) === AIR && solid(g, cx, k + 2)))) push(L.id, 'build')
        // A bomb is a TIMER: assigned at the wall it has already bounced and
        // explodes a tile short. Offer it while the walker still has runway
        // to touch the obstacle when the fuse runs out (~3.7 tiles / 1.6 s).
        if (L.fuseT < 0 && !L.digger) {
            let d = -1
            for (let c = Math.floor(L.x); ; c += L.dir) {
                const cc = c + (L.dir > 0 ? 1 : 0)
                if (cell(g, cc, k - 1) !== AIR && cell(g, cc, k - 2) !== AIR) { d = Math.abs(cc + 0.5 - L.x); break }
                if (Math.abs(cc + 0.5 - L.x) > 6) break
            }
            if (d >= 2 && d <= 4.2 && g.skills.bomb > 0) push(L.id, 'bomb')
        }
    }
    return out.slice(0, 8)
}

const roll = (g0, act, horizon) => {
    const g = structuredClone(g0)
    g.events.length = 0
    if (act) assign(g, act.id, act.skill)
    let h = horizon
    while (!g.end && h-- > 0) step(g)
    return g
}

export function solve(g, horizon = 1500) {
    // #3876: hygiene replays run from the board the solve started on, and only
    // certify a script this solve wrote. A mid-game clone (DebugKit PROGNOSIS
    // hands one) has a mutated grid and a command log already riding in it —
    // replaying that history onto the mutated board would verify a fiction.
    const pristine = g.tick === 0 && g.cmds.length === 0 ? Uint8Array.from(g.grid) : null
    let cooldown = 0
    while (!g.end && g.tick < g.level.time * 60) {
        if (cooldown <= 0) {
            const cands = candidates(g)
            if (cands.length) {
                let best = null
                let bestScore = scoreState(roll(g, null, horizon))
                for (const a of cands) {
                    const s = scoreState(roll(g, a, horizon))
                    if (s > bestScore + 1) { bestScore = s; best = a }
                }
                if (best) { assign(g, best.id, best.skill); cooldown = 30 }
                else cooldown = 20
            }
        } else cooldown--
        step(g)
    }
    return { cmds: pristine ? stripPhantomBuilds(g.level, pristine, g.cmds) : g.cmds.map(c => ({ ...c })), exited: g.exited, dead: g.dead, win: g.win, end: g.end, score: g.score }
}

/** Apply a recorded script to a fresh game. Used by attract mode (a replay of
 *  the solver's script) and by lemcheck's determinism proof.
 *  #3892 THE PHASE: a command stamped T is assigned when g.tick === T, i.e.
 *  between the steps — its effect is processed by the step that advances to
 *  T+1. That is exactly when solve() applied it (assign at g.tick===T, then
 *  step) and exactly when a human keypress applies it (assign lands on the
 *  live tick, the next step moves the body), so replay must fetch by the
 *  CURRENT tick. The pre-fix fetch `byTick.get(g.tick + 1)` fired every
 *  command one tick early — bodies sat a tick of motion off when boundaries
 *  arrived, and THE DOOR's pond cascade drowned two walkers the oracle never
 *  claimed (6/1 solve, 6/3 replay). BoulderDash/Sonar/ArenaArchery already
 *  fetch by the current tick; Lemmings was the shelf's only offender. */
export function replay(level, grid, cmds, opts = {}) {
    const g = makeGame(level, grid)
    const byTick = new Map()
    for (const c of cmds) {
        if (!byTick.has(c.tick)) byTick.set(c.tick, [])
        byTick.get(c.tick).push(c)
    }
    while (!g.end && g.tick < (opts.maxTicks || level.time * 60 + 60)) {
        const todo = byTick.get(g.tick)
        if (todo) for (const c of todo) assign(g, c.id, c.skill)
        step(g)
        if (opts.onTick) opts.onTick(g)
    }
    return g
}

/** #3876 — script hygiene: the autopilot must never flash a skill it never uses.
 *  A recorded BUILDER commit is real only if the flagged walker actually lays
 *  wood IN THE REPLAY WORLD — the truth attract mode shows the player. The
 *  rollout can commit a build for the wrong reasons (the cooldown reset is
 *  itself a move worth scoring, and the pre-existing one-tick stamp offset can
 *  put the walker in a different place when its descent arrives — the README's
 *  planner-tuning gap): either way no plank ever appears, and the demo spends a
 *  visible skill-grant on scenery. Stripping is provably world-neutral:
 *  assign('build') decrements no supply, moves no body, and the builder flag
 *  lays wood only at descents this walker demonstrably never reached. But the
 *  proof is demanded, not assumed — the stripped script must replay with quota
 *  intact and no extra deaths, else the full script stands. Honesty never
 *  breaks a board. Exported so lemcheck can plant a phantom and watch this
 *  remove it. */
export function stripPhantomBuilds(level, grid0, cmds) {
    const base = cmds.map(c => ({ ...c }))
    const builds = base.filter(c => c.skill === 'build')
    if (!builds.length) return base
    const laid = new Set()                       // ids that laid wood in replay
    const full = replay(level, grid0, base, {
        onTick: (g) => { for (const e of g.events) if (e.type === 'plank') laid.add(e.id) },
    })
    if (builds.every(c => laid.has(c.id))) return base
    const stripped = base.filter(c => c.skill !== 'build' || laid.has(c.id))
    const s = replay(level, grid0, stripped)
    return (s.win && s.exited >= full.exited && s.dead <= full.dead) ? stripped : base
}
