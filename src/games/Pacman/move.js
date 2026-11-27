// PAC-MAN player movement — the arcade input rules, pure and Node-testable.
//
// #472: the original decode read the one pad's axes in a fixed priority
// (up > down > left > right), so a held diagonal kept ONE axis: heading up or
// down, the horizontal pre-turn was lost, and a turn could only ever start
// exactly on a tile centre. The classic rules this module implements:
//
//   * a held DIAGONAL means "keep my heading, pre-turn the other axis" —
//     the along-axis keeps the heading, the other axis is the buffered turn,
//   * a tap or hold is BUFFERED until the first opening in that direction
//     (or until a newer input replaces it),
//   * a 180 is instant, anywhere in the tile,
//   * cornering: the buffered turn starts a few px (CORNER) BEFORE the tile
//     centre, not on it.
//
// The module owns the maze, the tile-lookup and one fixed tick of the player.
// Ghosts, sound and drawing stay in the component; it calls stepPlayer once
// per tick with the pad's held directions and plays the returned event.

export const CELL_SIZE = 16
export const TUNNEL_ROW = 14
// arcade cornering: the turn may start this many px before the tile centre
export const CORNER_PX = 4
export const CORNER = CORNER_PX / CELL_SIZE

// The power pellet is 600 ticks of scared ghosts. The arcade keeps them solid
// blue for the bulk of that and only flashes white in the final seconds to warn
// the power is expiring — a two-stage tell, not a constant strobe. Driven by the
// world timer (powerTimer), never wall-clock, so a clock-driven harness sees both
// stages at deterministic ticks (pacmancheck gates this). (#1508)
export const POWER_TICKS = 600
export const SCARED_FLASH_AT = 180
export const SCARED_BLINK = 20
export function scaredSkin(powerTimer) {
    if (powerTimer > SCARED_FLASH_AT) return 'blue'
    return Math.floor(powerTimer / SCARED_BLINK) % 2 === 0 ? 'blue' : 'white'
}

// 0: Path, 1: Wall Block, 2: Dot, 3: Power, 4: Ghost-house Door
export const MAP = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],
    [1, 3, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 3, 1],
    [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1],
    [1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 1],
    [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 1, 0, 0, 4, 4, 0, 0, 1, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],
    [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],
    [1, 3, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 0, 0, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 3, 1],
    [1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1],
    [1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1],
    [1, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1],
    [1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
]

export const ROWS = MAP.length
export const COLS = MAP[0].length

// ---------------------------------------------------------------------------
// PROGRESSION (#3661) — the arcade escalates as the player climbs. The LAWS are
// sourced (Wikipedia, "Pac-Man" gameplay: ghosts become faster as the game
// progresses; ghosts become slower entering/exiting the warp tunnels; the
// energizers' effect decreases in duration, eventually disappearing entirely;
// a fruit bonus appears after a number of dots; levels are marked by fruit
// icons). The exact rates, thresholds and the fruit value table are THIS REPO's
// pinned spec, in the centipede #3631 tradition: dice-free constants, so
// `?seed=N` replay determinism holds and round 1 below 700 points outside the
// tunnels is byte-identical to the pre-#3661 game. pacmancheck §progression
// gates the ladder, the monotone law, the tunnel span and the round-1 identity.
// ---------------------------------------------------------------------------

// Score stages (the classic 80/75 → 85/80 → 90/85 → 95/90 % table, mapped onto
// this repo's speeds: pac 0.15 = 80 %, ghost base = each ghost's own 75 %).
export const SPEED_STAGES = [
    { at: 0, pac: 0.15, ghost: 1.0 },     // stage 1 — today's baseline, unchanged
    { at: 700, pac: 0.16, ghost: 1.067 }, // 85 % / 80 %
    { at: 2000, pac: 0.169, ghost: 1.133 }, // 90 % / 85 %
    { at: 5000, pac: 0.178, ghost: 1.2 }, // 95 % / 90 %
]
export function speedStage(score) {
    const s = score || 0
    let stage = 0
    for (let i = 0; i < SPEED_STAGES.length; i++) if (s >= SPEED_STAGES[i].at) stage = i
    return stage
}
export function pacSpeedForScore(score) {
    return SPEED_STAGES[speedStage(score)].pac
}

// Ghosts crawl on the tunnel mouths — row 14 OUTSIDE the ghost-house walls
// (x ≤ 9 / x ≥ 18). The house interior (x 11–16) is not a tunnel.
export const TUNNEL_X_MAX = 9
export const TUNNEL_X_MIN = 18
export function ghostSlowsAt(x, y) {
    return y === TUNNEL_ROW && (x <= TUNNEL_X_MAX || x >= TUNNEL_X_MIN)
}

// #3677 item 1: tunnel-crawl audio. The half-speed law above is otherwise only
// visible; this pure tracker tells the component when to pulse a low rumble —
// on the tick a ghost ENTERS the crawl zone, then every RUMBLE_PULSE ticks
// while at least one ghost stays in (the bursts are ~0.5 s, so the crawl reads
// as a sustained rumble). Ghost state is untouched and no dice roll here: the
// round-1 identity pins and the seeded stream stay byte-identical.
export const RUMBLE_PULSE = 30 // 0.5 s at the fixed 60 Hz timestep
export function makeTunnelRumble() {
    return { crawling: false, cd: 0 }
}
export function stepTunnelRumble(tr, ghosts) {
    const now = ghosts.some(g => ghostSlowsAt(Math.round(g.x), Math.round(g.y)))
    if (tr.cd > 0) tr.cd--
    let fire = false
    if (now && (!tr.crawling || tr.cd <= 0)) {
        fire = true
        tr.cd = RUMBLE_PULSE
    }
    tr.crawling = now
    return fire
}

// Energizer duration decays with the round and vanishes entirely from round 14
// (the pellet still scores — the fright does not come back). Round 1 = the old
// POWER_TICKS exactly.
export function energizerTicks(round) {
    const r = Math.max(1, round || 1)
    if (r >= 14) return 0
    return Math.max(120, POWER_TICKS - (r - 1) * 100) // 600, 500, 400, 320…
}

// ---------------------------------------------------------------------------
// FRUIT (#1517, stage-keyed #3661) — the arcade drops bonus fruit twice per
// stage: it appears the moment Pac-Man eats the 70th and 170th pellet (of 240),
// sits just below the ghost house for ~10 s (600 fixed ticks), blinks near the
// end, then vanishes. The KIND and its value follow the round: cherry 100 (r1),
// strawberry 300 (r2), peach 500 (r3–4), galaxian 1000 (r5–6), bell 2000
// (r7–8), key 5000 (r9–10), then the bell/key pair cycles (the commonly
// published arcade table; the exact machine table is UNVERIFIED in-repo).
// The timer is WORLD ticks — never wall-clock — so the harness sees the blink
// phase and the lifetime exactly (AGENTS rule: waits/budgets are world seconds).
// Pure + Node-testable: pacmancheck gates thresholds, lifetime, eating and the
// maze placement.
// ---------------------------------------------------------------------------
export const FRUIT_TICKS = 600            // ~10 s at the fixed 60 Hz timestep
export const FRUIT_BLINK = 120          // blink for the last 2 s before expiry
export const FRUIT_AT = [70, 170]       // pellet counts that drop the fruit
// tile just below the ghost house, on the open corridor under it (arcade spot,
// mapped onto this maze; pacmancheck asserts it is open floor)
export const FRUIT_POS = { x: 13, y: 17 }

// first round that shows each kind (rounds between entries keep the previous
// kind — peach covers 3–4, galaxian 5–6, bell 7–8, key 9–10)
export const FRUIT_TABLE = [
    { at: 1, kind: 'cherry', points: 100 },
    { at: 2, kind: 'strawberry', points: 300 },
    { at: 3, kind: 'peach', points: 500 },
    { at: 5, kind: 'galaxian', points: 1000 },
    { at: 7, kind: 'bell', points: 2000 },
    { at: 9, kind: 'key', points: 5000 },
]
export function fruitForRound(round) {
    const r = Math.max(1, round || 1)
    if (r >= 11) {
        return Math.floor((r - 11) / 2) % 2 === 0
            ? { kind: 'bell', points: 2000 }
            : { kind: 'key', points: 5000 }
    }
    let pick = FRUIT_TABLE[0]
    for (const f of FRUIT_TABLE) if (r >= f.at) pick = f
    return pick
}

export function makeFruitTracker() {
    return { pellets: 0, dropped: 0, fruit: null }
}

// One tick of the fruit state machine.
// ate     : true when THIS tick consumed a pellet (dot or power)
// pacPos  : Pac-Man's current tile { x, y } (rounded)
// round   : stage number (default 1 — pre-#3661 callers keep cherry behaviour)
// returns fruit points scored this tick (0 when nothing happens).
export function stepFruit(tr, ate, pacPos, hooks = {}, round = 1) {
    if (ate) {
        tr.pellets++
        if (!tr.fruit && tr.dropped < FRUIT_AT.length && tr.pellets >= FRUIT_AT[tr.dropped]) {
            tr.dropped++
            const pick = fruitForRound(round)
            tr.fruit = { x: FRUIT_POS.x, y: FRUIT_POS.y, timer: FRUIT_TICKS, kind: pick.kind, points: pick.points }
            hooks.drop?.()
            return 0 // the drop tick does not also age the fruit
        }
    }
    if (!tr.fruit) return 0
    tr.fruit.timer--
    if (pacPos && Math.round(pacPos.x) === tr.fruit.x && Math.round(pacPos.y) === tr.fruit.y) {
        const paid = tr.fruit.points
        const kind = tr.fruit.kind
        tr.fruit = null
        hooks.eat?.(kind) // #3667 item 2: the cue follows the KIND, not one fixed jingle
        return paid
    }
    if (tr.fruit.timer <= 0) tr.fruit = null
    return 0
}

export const cloneMap = () => MAP.map(row => [...row])

// ---------------------------------------------------------------------------
// FRUIT EAT CUES (#3667 item 2) — the arcade's bonuses ring a rising arpeggio
// and the big ones ring longer. The round-1 cherry keeps the EXACT old two-tone
// (identity floor); every higher kind adds notes and climbs higher, so a 5000
// key can never sound like a 100 cherry. Monotone law (checked in pacmancheck):
// note count and top pitch never fall as the value rises.
// ---------------------------------------------------------------------------
export const FRUIT_TONES = {
    cherry: [1200, 1600],
    strawberry: [1200, 1600, 2000],
    peach: [1300, 1750, 2200, 2650],
    galaxian: [1400, 1900, 2400, 2900],
    bell: [1500, 2000, 2500, 3000, 3500],
    key: [1700, 2200, 2700, 3200, 3700, 4200],
}
export function fruitEatTones(kind) {
    return FRUIT_TONES[kind] || FRUIT_TONES.cherry
}

// ---------------------------------------------------------------------------
// ROUND CLEAR + INTERMISSION BRIEF (#3667 item 1) — when the last pellet and
// energizer go, the town FREEZES (a maze flash, the arcade's between-screen
// beat), and after rounds 1 and 2 it screens a wordless comic short first:
// our Pac runs down Blinky, hops the tripped ghost, and coasts off while the
// chaser rights himself and gives chase again. Everything is scripted by WORLD
// ticks — dice-free, so the seed stream rides through untouched and `?seed=N`
// replays include the brief. The actors are our own drawn glyphs; no original
// artwork is copied.
// ---------------------------------------------------------------------------
export const CLEAR_FREEZE = 90                 // maze flash before the lift (~1.5 s)
export const BRIEF_TICKS = 360                 // one intermission short (~6 s)
const BRIEF_AFTER_ROUND = 2                    // the shorts sit after r1 and r2 only

export function mazeCleared(map) {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (map[r][c] === 2 || map[r][c] === 3) return false
        }
    }
    return true
}

export function briefForRound(round) {
    return round <= BRIEF_AFTER_ROUND
}

// Scene frame — pure, deterministic, u clamped to 0..1. All coords are
// fractions of the draw box (the component maps them to the maze canvas).
// Beats: chase (Blinky outruns and fades), leap (Pac arcs over the tumbling
// ghost at hop=1), run (Pac ahead; Blinky up and chasing — an endless gag).
export function intermissionFrame(t) {
    const u = Math.min(1, Math.max(0, t / BRIEF_TICKS))
    let blinkyX
    if (u < 0.45) blinkyX = 0.18 + (u / 0.45) * 0.46
    else if (u < 0.68) blinkyX = 0.64
    else blinkyX = 0.64 + ((u - 0.68) / 0.32) * 0.30
    const blinkyTilt = u >= 0.45 && u < 0.68 ? 1 : 0
    let pacX
    if (u < 0.5) pacX = 0.04 + (u / 0.5) * 0.41
    else if (u < 0.68) pacX = 0.45 + ((u - 0.5) / 0.18) * 0.27
    else pacX = 0.72 + ((u - 0.68) / 0.32) * 0.23
    let hop = 0
    if (u >= 0.5 && u < 0.68) hop = Math.sin(((u - 0.5) / 0.18) * Math.PI)
    const phase = u < 0.5 ? 'chase' : u < 0.68 ? 'leap' : 'run'
    const stars = blinkyTilt === 1 && Math.floor(t / 8) % 2 === 0 // tick-twinkle, no dice
    return { pacX, hop, blinkyX, blinkyTilt, stars, phase }
}


// The spawn sits on the two-tile gap under the ghost house (the classic
// position), snapped to a tile centre so the tile+progress invariant holds —
// the old 13.5 start cost a half-cell hitch on the first step.
export function makePacman() {
    return {
        x: 14, y: 23,
        dir: { x: -1, y: 0 },
        nextDir: { x: -1, y: 0 },
        progress: 0,
        speed: 0.15,
        poweredUp: false,
        powerTimer: 0
    }
}

// Can a player leave tile (x, y) in direction d? The tunnel row wraps; the
// ghost-house door (4) is solid for the player. Dimensions come from the map
// (not the module maze) so pacmancheck's alternate mazes (CROSS / CORRIDOR)
// work too — a small grid must not be indexed against the big maze's rows.
export function tileOpen(map, x, y, d) {
    const rows = map.length, cols = map[0].length
    const nx = x + d.x, ny = y + d.y
    if (ny === TUNNEL_ROW && (nx < 0 || nx >= cols)) return true
    return nx >= 0 && nx < cols && ny >= 0 && ny < rows && map[ny][nx] !== 1 && map[ny][nx] !== 4
}

const same = (a, b) => a.x === b.x && a.y === b.y
const opposite = (a, b) => a.x === -b.x && a.y === -b.y

// One fixed tick of the player.
//
// gs    : { map, pacman, score } — mutated in place (score on a dot/power).
// held  : the pad's held directions as {x, y} vectors, in pad priority order
//         (up, down, left, right) — the component builds this from the one pad.
// returns 'dot' | 'power' | null for the component's audio.
export function stepPlayer(gs, held) {
    const P = gs.pacman
    // #3661: the score stage sets Pac-Man's speed every tick (stage 1 = the
    // classic 0.15; the ladder only bites past 700 points).
    P.speed = pacSpeedForScore(gs.score)
    if (held.length === 2 && opposite(held[0], held[1])) held.length = 1
    const moving = P.dir.x !== 0 || P.dir.y !== 0
    let reversed = false

    if (held.length && moving) {
        const rev = held.find(d => opposite(d, P.dir))
        if (rev) {
            // the classic 180: instant, anywhere in the tile. Keep the position:
            // x + dir*p is unchanged when the tile ref moves one ahead and the
            // progress mirrors. The reversal IS the whole tick — no turn, no
            // advance (advancing would break that invariant); the pre-turn rides
            // nextDir into the next tick.
            P.x += P.dir.x
            P.y += P.dir.y
            P.progress = 1 - P.progress
            if (P.x <= -1) P.x = COLS - 1
            else if (P.x >= COLS) P.x = 0
            P.dir = { x: -P.dir.x, y: -P.dir.y }
            const pre = held.find(d => d !== rev)
            if (pre) P.nextDir = pre
            reversed = true
        } else if (held.length > 1) {
            // diagonal: keep the heading, pre-turn the other axis
            const along = held.find(d => same(d, P.dir))
            P.nextDir = along ? held.find(d => !same(d, along)) : held[0]
        } else {
            P.nextDir = held[0]
        }
    } else if (!moving && held.length) {
        // stopped (wall guard): any held direction that is open restarts the run
        for (const d of held) if (tileOpen(gs.map, P.x, P.y, d)) { P.dir = d; break }
    }

    let eaten = null
    if (!reversed) {
        // Take the buffered turn at the first opening — cornering lets it start
        // CORNER px before the tile centre.
        if (P.dir.x !== 0 || P.dir.y !== 0) {
            const nd = P.nextDir
            if (nd && !same(nd, P.dir)) {
                if (P.progress === 0) {
                    if (tileOpen(gs.map, P.x, P.y, nd)) P.dir = nd
                } else if (P.progress >= 1 - CORNER) {
                    const tx = P.x + P.dir.x, ty = P.y + P.dir.y
                    if (tileOpen(gs.map, tx, ty, nd)) {
                        P.x = tx; P.y = ty
                        P.progress = 0
                        P.dir = nd
                    }
                }
            }
            if (P.progress === 0 && !tileOpen(gs.map, P.x, P.y, P.dir)) {
                P.dir = { x: 0, y: 0 }
            }
        }

        if (P.dir.x !== 0 || P.dir.y !== 0) {
            P.progress += P.speed
            if (P.progress >= 1) {
                P.x += P.dir.x
                P.y += P.dir.y
                P.progress = 0
                P.x = Math.round(P.x)
                P.y = Math.round(P.y)
                if (P.x <= -1) P.x = COLS - 1
                else if (P.x >= COLS) P.x = 0
                const mx = P.x, my = P.y
                if (mx >= 0 && mx < COLS && my >= 0 && my < ROWS) {
                    const tile = gs.map[my][mx]
                    if (tile === 2) {
                        gs.map[my][mx] = 0
                        gs.score += 10
                        eaten = 'dot'
                    } else if (tile === 3) {
                        gs.map[my][mx] = 0
                        gs.score += 50
                        // #3661: the fright window decays with the round and is
                        // gone entirely from round 14 — the pellet still scores.
                        const ticks = energizerTicks(gs.round)
                        if (ticks > 0) {
                            P.poweredUp = true
                            P.powerTimer = ticks
                        }
                        eaten = 'power'
                    }
                }
            }
        }
    }
    return eaten
}

// ---------------------------------------------------------------------------
// GHOST AI — #1473 seedpin batch 15. The whole ghost brain lives here as pure
// functions: the map, pacman and the ghosts arrive through gs, every die roll
// comes from the injected rand (seedRng(seed) upstream). stepGhost is exactly
// what the shipped loop runs per ghost per tick, so the Node harness proves the
// real thing: same seed → byte-identical wander; seeded worlds replay.
// ---------------------------------------------------------------------------

export function validMoves(map, x, y) {
    const moves = []
    if (y === 14) {
        if (x <= 1) { moves.push({ x: -1, y: 0 }); moves.push({ x: 1, y: 0 }); }
        else if (x >= COLS - 2) { moves.push({ x: 1, y: 0 }); moves.push({ x: -1, y: 0 }); }
    }
    if (x < COLS - 1 && map[y][x + 1] !== 1) moves.push({ x: 1, y: 0 })
    if (x > 0 && map[y][x - 1] !== 1) moves.push({ x: -1, y: 0 })
    if (y < ROWS - 1 && map[y + 1][x] !== 1 && map[y + 1][x] !== 4) moves.push({ x: 0, y: 1 })
    if (y > 0 && map[y - 1][x] !== 1) moves.push({ x: 0, y: -1 })
    return moves
}

export function bfsDir(map, startX, startY, targetType, targetPos = null, pacPos = null) {
    let queue = [{ x: startX, y: startY, path: [] }]
    let visited = new Set(`${startX},${startY}`)
    let iterations = 0
    const MAX_ITER = 600

    while (queue.length > 0 && iterations++ < MAX_ITER) {
        let curr = queue.shift()
        if (targetType === 'dot' && map[curr.y][curr.x] === 2) return curr.path[0]
        if (targetType === 'power' && map[curr.y][curr.x] === 3) return curr.path[0]
        if (targetType === 'pacman' && pacPos && curr.x === pacPos.x && curr.y === pacPos.y) return curr.path[0]
        if (targetType === 'home' && curr.x === 13 && curr.y === 14) return curr.path[0]
        if (targetType === 'pos' && curr.x === targetPos.x && curr.y === targetPos.y) return curr.path[0]

        const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
        for (let d of dirs) {
            let nx = curr.x + d.x, ny = curr.y + d.y
            if (ny === 14 && (nx < 0 || nx >= COLS)) continue
            if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS && map[ny][nx] !== 1 && !visited.has(`${nx},${ny}`)) {
                visited.add(`${nx},${ny}`)
                queue.push({ x: nx, y: ny, path: [...curr.path, d] })
            }
        }
    }
    return null
}

export function nearestGhostDist(ghosts, x, y) {
    let minDist = Infinity
    ghosts.forEach(g => {
        const dist = Math.sqrt(Math.pow(g.x - x, 2) + Math.pow(g.y - y, 2))
        if (dist < minDist) minDist = dist
    })
    return minDist
}

// attract autopilot panic: move away from the nearest ghost, no instant reverse
export function safeMove(map, pacman, ghosts, x, y) {
    const moves = validMoves(map, x, y)
    if (moves.length === 0) return { x: 0, y: 0 }
    let bestMove = null
    let maxScore = -Infinity
    moves.forEach(m => {
        const nx = x + m.x
        const ny = y + m.y
        const ghostDist = nearestGhostDist(ghosts, nx, ny)
        const isReverse = (m.x === -pacman.dir.x && m.y === -pacman.dir.y)
        const score = ghostDist - (isReverse ? 2 : 0)
        if (score > maxScore) { maxScore = score; bestMove = m }
    })
    return bestMove
}

// one ghost, one tick: pen timers, exit path, per-tile decision (all rand
// draws), grid movement, tunnel wrap, and the touch predicate — in the same
// order, with the same rand consumption as before the extraction (scared rolls
// its die even on an empty move list; the fallback roll only fires when the
// decision came up empty).
export function stepGhost(g, gs, rand, hooks = {}) {
    const { map, pacman } = gs
    if (g.state === 'pen') {
        g.penTimer--
        if (g.penTimer <= 0) {
            g.state = 'exiting'
        } else {
            if (g.progress === 0) {
                if (!g.penBounceDir) g.penBounceDir = -1
                const ny = Math.round(g.y) + g.penBounceDir
                if (ny < 13 || ny > 15 || map[ny][Math.round(g.x)] === 1) g.penBounceDir *= -1
                g.nextDir = { x: 0, y: g.penBounceDir }
            }
            g.progress += g.speed * 0.5
            if (g.progress >= 1) {
                g.y += g.nextDir.y
                g.y = Math.round(g.y)
                g.progress = 0
            }
            return
        }
    }

    if (g.state === 'exiting') {
        if (g.progress === 0) {
            const gx = Math.round(g.x)
            const gy = Math.round(g.y)
            if (gy <= 11) g.state = 'chase'
            else if (gx < 13) g.nextDir = { x: 1, y: 0 }
            else if (gx > 13) g.nextDir = { x: -1, y: 0 }
            else g.nextDir = { x: 0, y: -1 }
        }
        if (g.state === 'exiting') {
            g.progress += g.speed
            if (g.progress >= 1) {
                g.x += g.nextDir.x
                g.y += g.nextDir.y
                g.x = Math.round(g.x)
                g.y = Math.round(g.y)
                g.progress = 0
            }
            return
        }
    }

    if (g.progress === 0) {
        let move = null
        const rx = Math.round(g.x), ry = Math.round(g.y)
        const pacPos = { x: Math.round(pacman.x), y: Math.round(pacman.y) }
        if (g.state === 'dead') {
            move = bfsDir(map, rx, ry, 'home')
            if (!move) { g.state = 'pen'; g.penTimer = 120 }
        } else if (g.state === 'scared') {
            const moves = validMoves(map, rx, ry)
            move = moves[Math.floor(rand() * moves.length)]
        } else if (g.type === 'blinky') {
            move = bfsDir(map, rx, ry, 'pacman', null, pacPos)
        } else if (g.type === 'pinky') {
            const tx = Math.max(0, Math.min(COLS - 1, Math.round(pacman.x + pacman.dir.x * 4)))
            const ty = Math.max(0, Math.min(ROWS - 1, Math.round(pacman.y + pacman.dir.y * 4)))
            move = bfsDir(map, rx, ry, 'pos', { x: tx, y: ty }, pacPos)
            if (!move) move = bfsDir(map, rx, ry, 'pacman', null, pacPos)
        } else {
            if (rand() > 0.5) {
                move = bfsDir(map, rx, ry, 'pacman', null, pacPos)
            } else {
                const moves = validMoves(map, rx, ry)
                if (moves.length > 0) move = moves[Math.floor(rand() * moves.length)]
            }
        }
        if (move) g.nextDir = move
        else {
            const moves = validMoves(map, rx, ry)
            if (moves.length > 0) g.nextDir = moves[Math.floor(rand() * moves.length)]
        }
    }
    if (g.nextDir) {
        let currentSpeed = g.speed
        // #3661: the score stage lifts every ghost's base speed (stage 1 = 1×,
        // today's baseline); scared/dead multipliers and the tunnel crawl then
        // stack on top, in this fixed order.
        currentSpeed *= SPEED_STAGES[speedStage(gs.score)].ghost
        if (g.state === 'scared') currentSpeed *= 0.6
        if (g.state === 'dead') currentSpeed *= 3.0
        if (ghostSlowsAt(Math.round(g.x), Math.round(g.y))) currentSpeed *= 0.5
        g.progress += currentSpeed
        if (g.progress >= 1) {
            g.x += g.nextDir.x
            g.y += g.nextDir.y
            g.progress = 0
            g.x = Math.round(g.x)
            g.y = Math.round(g.y)
            if (g.x <= -1) g.x = COLS - 1
            if (g.x >= COLS) g.x = 0
        }
    }
    const dx = (g.x + (g.nextDir?.x || 0) * g.progress) - (pacman.x + pacman.dir.x * pacman.progress)
    const dy = (g.y + (g.nextDir?.y || 0) * g.progress) - (pacman.y + pacman.dir.y * pacman.progress)
    if (Math.sqrt(dx * dx + dy * dy) < 0.8) {
        if (g.state === 'scared') {
            g.state = 'dead'
            hooks.eat?.()
        } else if (g.state === 'chase') {
            hooks.hit?.()
        }
    }
}
