// sim.js — the seeded engine of ADVENTURE (#1473 batch 18).
//
// Pre-port, the Feb shell's gameplay dice — dragon wander and the bat's
// course-change — rolled off the raw unseeded Math.random, and the title
// carried no seed, no report and no QA contract. This module extracts the
// whole simulation into one pure, seeded engine so Node audits can replay a
// world and the key/gate/dragon/win laws without a browser, and so `?seed=N`
// replays the exact world (mulberry32 via seedRng, #1473).
//
// Fidelity (Atari 2600 cartridge, Warren Robinett, 1993): an 18-room world —
// three color-coded castles with portcullis gates (drop the matching key in
// front of its gate to open it), blue and red labyrinths, walk-transitions;
// sword, bridge (partial wall-pass), magnet, the chalice; three dragons that
// wander their rooms, chase on sight, bite at close range and are slain by
// the sword within reach; the purple bat roams rooms and swaps items; win by
// carrying the chalice to the Gold Castle.
//
//
// HONESTY (score): the original cart has NO score counter and nothing here
// changes on-screen. `score` is a report-only progress metric — distinct
// items picked up this run (0..8) — so a filed report can pinpoint a run
// (Britannia's moons-visited precedent, #1473 batch 12). Restored in the
// #1545 polish pass: the magnet attracts nearby loose items (MAGNET_RANGE /
// MAGNET_PULL) and a slain dragon respawns to its lair (DRAGON_RESPAWN_TICKS).
// Restored in the #1551 polish pass: the bridge is PLACED on the wall it
// spans (a permanent, re-pickable crossing — the original bridge law, so the
// single bridge can no longer strand itself), and the gray dot + sealed-door
// rite opens the creator's room (see README "Honest gaps"). Remaining gap:
// collisions ignore exact room-warp edges.

export const GW = 160  // Atari 2600 resolution (approx)
export const GH = 192
export const PLAYER_SPEED = 1.8
export const MAX_ITEMS = 8   // sword, goldKey, blackKey, whiteKey, chalice, bridge, magnet, gray dot

// Wall geometry shared by makeWalls() and the secret-door barrier rect.
export const WALL_T = 4      // wall thickness
export const SIDE_GAP_Y = 70 // side gap position
export const SIDE_GAP_H = 50 // side gap height

// Original-fidelity constants, restored in the #1545 polish pass. The magnet
// pulls nearby loose items toward the player while it is carried (in the 1993
// cart it is active loot-magnetism, not decoration), and a slain dragon returns
// to its lair after a delay (the original keeps the dragons in play rather than
// removing them for the whole run).
export const MAGNET_RANGE = 40          // attract radius (world units)
export const MAGNET_PULL = 1.5          // pull distance per tick
export const DRAGON_RESPAWN_TICKS = 300 // slain → back in play (~5 s at 60 fps)

// Room IDs
export const R = {
    GOLD_CASTLE: 0,
    GOLD_FOYER: 1,
    OVERWORLD_1: 2,
    OVERWORLD_2: 3,
    OVERWORLD_3: 4,
    OVERWORLD_4: 5,
    OVERWORLD_5: 6,
    BLUE_LAB_1: 7,
    BLUE_LAB_2: 8,
    BLUE_LAB_3: 9,
    BLACK_CASTLE: 10,
    BLACK_FOYER: 11,
    RED_LAB_1: 12,
    RED_LAB_2: 13,
    WHITE_CASTLE: 14,
    WHITE_FOYER: 15,
    DRAGON_LAIR: 16,
    SECRET: 17,
}

// =============================================
// WALLS / ROOM DEFINITIONS
// =============================================
const makeWalls = (openTop, openBot, openLeft, openRight) => {
    const walls = []
    const T = WALL_T
    const gapL = 60  // gap position/size for top/bottom
    const gapW = 40
    const sideGapY = SIDE_GAP_Y
    const sideGapH = SIDE_GAP_H

    // Top wall
    if (!openTop) {
        walls.push({ x: 0, y: 0, w: GW, h: T })
    } else {
        walls.push({ x: 0, y: 0, w: gapL, h: T })
        walls.push({ x: gapL + gapW, y: 0, w: GW - gapL - gapW, h: T })
    }
    // Bottom wall
    if (!openBot) {
        walls.push({ x: 0, y: GH - T, w: GW, h: T })
    } else {
        walls.push({ x: 0, y: GH - T, w: gapL, h: T })
        walls.push({ x: 0, y: GH - T, w: GW - gapL - gapW, h: T })
    }
    // Left wall
    if (!openLeft) {
        walls.push({ x: 0, y: 0, w: T, h: GH })
    } else {
        walls.push({ x: 0, y: 0, w: T, h: sideGapY })
        walls.push({ x: 0, y: sideGapY + sideGapH, w: T, h: GH - sideGapY - sideGapH })
    }
    // Right wall
    if (!openRight) {
        walls.push({ x: GW - T, y: 0, w: T, h: GH })
    } else {
        walls.push({ x: GW - T, y: 0, w: T, h: sideGapY })
        walls.push({ x: GW - T, y: sideGapY + sideGapH, w: T, h: GH - sideGapY - sideGapH })
    }
    return walls
}

const makeLabyrinthWalls = (variant) => {
    const base = makeWalls(true, true, false, false)
    // Add internal maze walls
    if (variant === 1) {
        base.push({ x: 30, y: 30, w: 4, h: 80 })
        base.push({ x: 30, y: 30, w: 60, h: 4 })
        base.push({ x: 90, y: 30, w: 4, h: 50 })
        base.push({ x: 60, y: 80, w: 70, h: 4 })
        base.push({ x: 126, y: 30, w: 4, h: 54 })
        base.push({ x: 30, y: 130, w: 100, h: 4 })
        base.push({ x: 60, y: 110, w: 4, h: 20 })
        base.push({ x: 90, y: 100, w: 4, h: 30 })
        base.push({ x: 30, y: 155, w: 40, h: 4 })
        base.push({ x: 100, y: 150, w: 30, h: 4 })
    } else if (variant === 2) {
        base.push({ x: 20, y: 40, w: 4, h: 110 })
        base.push({ x: 20, y: 40, w: 50, h: 4 })
        base.push({ x: 70, y: 40, w: 4, h: 40 })
        base.push({ x: 40, y: 80, w: 30, h: 4 })
        base.push({ x: 40, y: 80, w: 4, h: 50 })
        base.push({ x: 90, y: 30, w: 4, h: 130 })
        base.push({ x: 90, y: 60, w: 50, h: 4 })
        base.push({ x: 110, y: 90, w: 4, h: 60 })
        base.push({ x: 110, y: 90, w: 30, h: 4 })
        base.push({ x: 60, y: 130, w: 30, h: 4 })
        base.push({ x: 120, y: 140, w: 4, h: 40 })
    } else {
        base.push({ x: 30, y: 50, w: 100, h: 4 })
        base.push({ x: 30, y: 50, w: 4, h: 60 })
        base.push({ x: 126, y: 50, w: 4, h: 60 })
        base.push({ x: 50, y: 80, w: 60, h: 4 })
        base.push({ x: 50, y: 80, w: 4, h: 40 })
        base.push({ x: 106, y: 80, w: 4, h: 40 })
        base.push({ x: 70, y: 100, w: 20, h: 4 })
        base.push({ x: 30, y: 130, w: 100, h: 4 })
        base.push({ x: 60, y: 150, w: 4, h: 30 })
        base.push({ x: 96, y: 150, w: 4, h: 30 })
    }
    return base
}

// Colors (Atari 2600 palette) — shared with the shell's drawing.
export const COLORS = {
    black: '#000000',
    yellow: '#ffff00',    // gold castle / chalice
    gold: '#c8a000',
    tan: '#e8a060',
    green: '#00a800',
    darkGreen: '#005800',
    red: '#d03030',
    darkRed: '#881818',
    blue: '#3030d0',
    darkBlue: '#181888',
    purple: '#a848a8',
    orange: '#e87000',
    grey: '#888888',
    white: '#ffffff',
    cyan: '#00e8e8',
}

export const ROOMS = [
    // 0: Gold Castle (exterior/gate). Gate rooms get a top GAP that the
    // gate rect (56,0,48,30) blocks while closed (#1473 b18 fix: a full-width
    // solid top made every foyer permanently unreachable — the single bridge
    // cannot be in two places, so the chalice could never come home).
    { id: R.GOLD_CASTLE, name: 'Gold Castle', bg: COLORS.gold, walls: makeWalls(true, true, false, false), gate: true, gateColor: COLORS.yellow, gateKey: 'goldKey' },
    // 1: Gold Foyer (inside gold castle)
    { id: R.GOLD_FOYER, name: 'Gold Foyer', bg: '#484800', walls: makeWalls(true, false, false, false) },
    // 2-6: Overworld rooms (open areas)
    { id: R.OVERWORLD_1, name: 'Overworld', bg: COLORS.darkGreen, walls: makeWalls(true, true, true, true) },
    { id: R.OVERWORLD_2, name: 'Overworld', bg: COLORS.green, walls: makeWalls(true, true, true, true) },
    { id: R.OVERWORLD_3, name: 'Overworld', bg: COLORS.darkGreen, walls: makeWalls(true, true, true, true) },
    { id: R.OVERWORLD_4, name: 'Overworld', bg: COLORS.green, walls: makeWalls(true, true, false, true) },
    { id: R.OVERWORLD_5, name: 'Overworld', bg: COLORS.darkGreen, walls: makeWalls(true, true, true, false) },
    // 7-9: Blue Labyrinth
    { id: R.BLUE_LAB_1, name: 'Blue Labyrinth', bg: COLORS.darkBlue, walls: makeLabyrinthWalls(1) },
    { id: R.BLUE_LAB_2, name: 'Blue Labyrinth', bg: '#101060', walls: makeLabyrinthWalls(2) },
    { id: R.BLUE_LAB_3, name: 'Blue Labyrinth', bg: COLORS.darkBlue, walls: makeLabyrinthWalls(3) },
    // 10: Black Castle
    { id: R.BLACK_CASTLE, name: 'Black Castle', bg: '#282828', walls: makeWalls(true, true, false, false), gate: true, gateColor: '#555555', gateKey: 'blackKey' },
    // 11: Black Foyer
    { id: R.BLACK_FOYER, name: 'Black Foyer', bg: '#181818', walls: makeWalls(true, false, false, false) },
    // 12-13: Red Labyrinth (inside black castle area)
    { id: R.RED_LAB_1, name: 'Red Maze', bg: COLORS.darkRed, walls: makeLabyrinthWalls(1) },
    { id: R.RED_LAB_2, name: 'Red Maze', bg: '#601010', walls: makeLabyrinthWalls(2) },
    // 14: White Castle
    { id: R.WHITE_CASTLE, name: 'White Castle', bg: '#c0c0c0', walls: makeWalls(true, true, false, false), gate: true, gateColor: '#ffffff', gateKey: 'whiteKey' },
    // 15: White Foyer
    { id: R.WHITE_FOYER, name: 'White Foyer', bg: '#a0a0a0', walls: makeWalls(true, false, false, false) },
    // 16: Dragon Lair
    { id: R.DRAGON_LAIR, name: 'Dragon Lair', bg: '#300030', walls: makeWalls(true, false, true, false) },
    // 17: Secret room — the creator's room behind the sealed door
    // (the original easter egg; the door opens via the dot rite)
    { id: R.SECRET, name: '???', bg: '#000000', walls: makeWalls(false, false, true, false) },
]

// Room connectivity: exits[roomId] = { up, down, left, right }
export const EXITS = {}
EXITS[R.GOLD_CASTLE] =  { up: -1, down: R.OVERWORLD_1, left: -1, right: -1 }
EXITS[R.GOLD_FOYER] =   { up: -1, down: -1, left: -1, right: -1 }  // only accessible through gate
EXITS[R.OVERWORLD_1] =  { up: R.GOLD_CASTLE, down: R.OVERWORLD_2, left: R.OVERWORLD_5, right: R.OVERWORLD_4 }
EXITS[R.OVERWORLD_2] =  { up: R.OVERWORLD_1, down: R.OVERWORLD_3, left: R.BLUE_LAB_1, right: R.OVERWORLD_4 }
EXITS[R.OVERWORLD_3] =  { up: R.OVERWORLD_2, down: R.BLACK_CASTLE, left: R.BLUE_LAB_3, right: R.OVERWORLD_4 }
EXITS[R.OVERWORLD_4] =  { up: R.OVERWORLD_1, down: R.OVERWORLD_3, left: R.OVERWORLD_2, right: R.WHITE_CASTLE }
EXITS[R.OVERWORLD_5] =  { up: R.OVERWORLD_1, down: R.DRAGON_LAIR, left: R.BLUE_LAB_1, right: R.OVERWORLD_1 }
EXITS[R.BLUE_LAB_1] =   { up: R.OVERWORLD_2, down: R.BLUE_LAB_2, left: -1, right: -1 }
EXITS[R.BLUE_LAB_2] =   { up: R.BLUE_LAB_1, down: R.BLUE_LAB_3, left: -1, right: -1 }
EXITS[R.BLUE_LAB_3] =   { up: R.BLUE_LAB_2, down: R.OVERWORLD_3, left: -1, right: -1 }
EXITS[R.BLACK_CASTLE] = { up: -1, down: R.OVERWORLD_3, left: -1, right: -1 }
EXITS[R.BLACK_FOYER] =  { up: -1, down: R.RED_LAB_1, left: -1, right: -1 }
EXITS[R.RED_LAB_1] =    { up: R.BLACK_FOYER, down: R.RED_LAB_2, left: -1, right: -1 }
EXITS[R.RED_LAB_2] =    { up: R.RED_LAB_1, down: R.BLACK_FOYER, left: -1, right: -1 }
EXITS[R.WHITE_CASTLE] = { up: -1, down: R.OVERWORLD_4, left: -1, right: -1 }
EXITS[R.WHITE_FOYER] =  { up: R.WHITE_CASTLE, down: -1, left: -1, right: -1 }
EXITS[R.DRAGON_LAIR] =  { up: R.OVERWORLD_5, down: -1, left: R.SECRET, right: -1 }
EXITS[R.SECRET] =       { up: -1, down: -1, left: -1, right: R.DRAGON_LAIR }

// Castle inside connections (through gate)
export const CASTLE_INSIDES = {
    [R.GOLD_CASTLE]: R.GOLD_FOYER,
    [R.BLACK_CASTLE]: R.BLACK_FOYER,
    [R.WHITE_CASTLE]: R.WHITE_FOYER,
}
// Foyer connectivity (declared inline above for readability):
EXITS[R.GOLD_FOYER].up = R.GOLD_CASTLE
EXITS[R.BLACK_FOYER].up = R.BLACK_CASTLE
EXITS[R.BLACK_FOYER].down = R.RED_LAB_1
EXITS[R.WHITE_FOYER].up = R.WHITE_CASTLE

// Fresh per-run entity tables (the run never mutates these templates).
const ITEM_TEMPLATES = [
    { id: 'sword', name: 'Sword', room: R.GOLD_FOYER, x: 80, y: 100, w: 6, h: 20, color: COLORS.yellow },
    { id: 'goldKey', name: 'Gold Key', room: R.OVERWORLD_4, x: 120, y: 90, w: 8, h: 14, color: COLORS.yellow },
    { id: 'blackKey', name: 'Black Key', room: R.BLUE_LAB_2, x: 70, y: 100, w: 8, h: 14, color: '#555555' },
    { id: 'whiteKey', name: 'White Key', room: R.RED_LAB_1, x: 60, y: 80, w: 8, h: 14, color: COLORS.white },
    { id: 'chalice', name: 'Chalice', room: R.WHITE_FOYER, x: 80, y: 100, w: 10, h: 16, color: COLORS.gold },
    { id: 'bridge', name: 'Bridge', room: R.OVERWORLD_2, x: 100, y: 80, w: 28, h: 6, color: COLORS.purple },
    { id: 'magnet', name: 'Magnet', room: R.BLACK_FOYER, x: 80, y: 90, w: 10, h: 12, color: COLORS.white },
    // The gray dot (original easter egg): a one-pixel object sealed along the
    // south wall of the bridge-only room — in the original, the Black
    // Castle's sealed catacombs chamber. It is not attracted by the magnet,
    // unlike all other inanimate objects (noMagnet).
    { id: 'dot', name: 'Gray Dot', room: R.RED_LAB_1, x: 30, y: GH - 5, w: 1, h: 1, color: COLORS.grey, noMagnet: true },
]

const DRAGON_TEMPLATES = [
    { id: 'yorgle', name: 'Yorgle', room: R.BLUE_LAB_1, x: 80, y: 60, color: COLORS.yellow, speed: 0.6, fleesFrom: 'goldKey' },
    { id: 'grundle', name: 'Grundle', room: R.RED_LAB_2, x: 80, y: 90, color: COLORS.green, speed: 0.8, fleesFrom: null },
    { id: 'rhindle', name: 'Rhindle', room: R.DRAGON_LAIR, x: 80, y: 80, color: COLORS.red, speed: 1.0, fleesFrom: null },
]

const rectsOverlap = (ax, ay, aw, ah, bx, by, bw, bh) => {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

// rand is a () => [0,1) stream; the shell injects seedRng(seed) at the human
// start site (#1473). This module stays import-free so Node audits can load it
// directly (Rogue/Defender sim precedent) — pass seedRng from gameContract.
// =============================================
export function createSim(rand) {
    if (typeof rand !== 'function') throw new Error('createSim needs a [0,1) rand stream')

    const sim = {
        tick: 0,
        score: 0,               // distinct items picked up this run (0..7), report-only
        won: false,
        dead: false,
        deathTimer: 0,
        room: R.GOLD_CASTLE,
        carrying: null,
        player: { x: 80, y: 150, w: 6, h: 10 },
        gateOpen: { goldKey: false, blackKey: false, whiteKey: false },
        items: ITEM_TEMPLATES.map((t) => ({ ...t, carried: false })),
        dragons: DRAGON_TEMPLATES.map((t) => ({
            ...t, alive: true, mouthOpen: false,
            homeRoom: t.room, homeX: t.x, homeY: t.y, respawnAt: Infinity,
        })),
        bat: { room: R.OVERWORLD_3, x: 90, y: 50, vx: 1.5, vy: 0.8, carrying: null, swapTimer: 0 },
        pickedUp: {},
        events: [],            // one-tick sound events, drained by the shell
        // Placed-bridge crossings ("roomId:side"), permanent for the run:
        // the original bridge stays on the wall it spans and keeps the
        // crossing open (re-pickable, never stranded — #1551).
        bridged: new Set(),
        // The secret door (Dragon Lair <-> ???) is sealed until the dot rite.
        secretOpen: false,
    }

    // Which side of the room a wall rect belongs to (null for interior maze
    // walls). A side is passable for the whole run once a bridge is placed
    // there (the coarse port spans the full side, like its wall-pass).
    const wallSide = (wall) => (wall.y === 0 ? 'up'
        : wall.y + wall.h === GH ? 'down'
        : wall.x === 0 ? 'left'
        : wall.x + wall.w === GW ? 'right' : null)

    const collidesWithWalls = (room, x, y, w, h) => {
        for (const wall of room.walls) {
            if (sim.bridged.has(`${room.id}:${wallSide(wall)}`)) continue
            if (rectsOverlap(x, y, w, h, wall.x, wall.y, wall.w, wall.h)) {
                return true
            }
        }
        // Check gate
        if (room.gate && !sim.gateOpen[room.gateKey]) {
            // Gate blocks the top opening
            if (rectsOverlap(x, y, w, h, 56, 0, 48, 30)) {
                return true
            }
        }
        // The secret door: the sealed barrier the original easter egg
        // requires — it holds until the dot rite opens it.
        if (!sim.secretOpen) {
            if (room.id === R.DRAGON_LAIR && rectsOverlap(x, y, w, h, 0, SIDE_GAP_Y, WALL_T, SIDE_GAP_H)) {
                return true
            }
            if (room.id === R.SECRET && rectsOverlap(x, y, w, h, GW - WALL_T, SIDE_GAP_Y, WALL_T, SIDE_GAP_H)) {
                return true
            }
        }
        return false
    }

    const REV = { up: 'down', down: 'up', left: 'right', right: 'left' }
    const sideIsSolid = (room, dir) => room.walls.some((wl) => dir === 'up'
        ? wl.y === 0 && wl.w === GW
        : dir === 'down' ? wl.y + wl.h === GH && wl.w === GW
        : dir === 'left' ? wl.x === 0 && wl.h === GH
        : wl.x + wl.w === GW && wl.h === GH)

    // The original bridge law (cartridge record): the bridge stays on the
    // wall it is pushed into and the crossing stays open for the rest of the
    // run. Without this, the single bridge strands itself past the wall it
    // just crossed (#1551). Called BEFORE the room changes, so `sim.room` is
    // still the wall's own room.
    const placeBridgeAt = (dir, toRoom) => {
        if (sim.carrying !== 'bridge' || !sideIsSolid(ROOMS[sim.room], dir)) return
        const from = sim.room
        const item = sim.items.find((i) => i.id === 'bridge')
        item.carried = false
        sim.carrying = null
        item.room = from
        if (dir === 'up') { item.x = sim.player.x - 14; item.y = WALL_T }
        else if (dir === 'down') { item.x = sim.player.x - 14; item.y = GH - WALL_T - 6 }
        else if (dir === 'left') { item.x = WALL_T; item.y = sim.player.y - 14 }
        else { item.x = GW - WALL_T - 6; item.y = sim.player.y - 14 }
        sim.bridged.add(`${from}:${dir}`)
        if (toRoom >= 0) sim.bridged.add(`${toRoom}:${REV[dir]}`)
        sim.events.push('bridge')
    }

    // #1556 soft-lock fix: room warps land without collision checks, and the
    // Black Castle approach from OW3 drops the player at y=8 — inside the
    // closed gate's rect (56,0,48,30), where every direction collides and the
    // run is pinned forever (repro: OW3 x=80 walk down, blackKey still in the
    // lab). The original never traps the dot: nudge a wedged landing down
    // until it is clear of the obstruction, so the player can walk back out.
    const dewedge = () => {
        const rm = ROOMS[sim.room]
        for (let i = 0; i < 24 && collidesWithWalls(rm, sim.player.x, sim.player.y, sim.player.w, sim.player.h); i++) {
            sim.player.y += 2
        }
    }

    const tryTransition = () => {
        const room = ROOMS[sim.room]
        const ex = EXITS[sim.room]
        if (!ex) return

        // Top exit
        if (sim.player.y < 0) {
            // Castle: going up through gate enters foyer
            if (room.gate && sim.gateOpen[room.gateKey] && CASTLE_INSIDES[sim.room] !== undefined) {
                placeBridgeAt('up', CASTLE_INSIDES[sim.room])
                sim.room = CASTLE_INSIDES[sim.room]
                sim.player.y = GH - sim.player.h - 8
                dewedge()
                return
            }
            if (ex.up >= 0) {
                placeBridgeAt('up', ex.up)
                sim.room = ex.up
                sim.player.y = GH - sim.player.h - 8
                dewedge()
            } else {
                sim.player.y = 0
            }
        }
        // Bottom exit
        if (sim.player.y + sim.player.h > GH) {
            if (ex.down >= 0) {
                placeBridgeAt('down', ex.down)
                sim.room = ex.down
                sim.player.y = 8
                dewedge()
            } else {
                sim.player.y = GH - sim.player.h
            }
        }
        // Left exit
        if (sim.player.x < 0) {
            if (ex.left >= 0) {
                placeBridgeAt('left', ex.left)
                sim.room = ex.left
                sim.player.x = GW - sim.player.w - 8
                dewedge()
            } else {
                sim.player.x = 0
            }
        }
        // Right exit
        if (sim.player.x + sim.player.w > GW) {
            if (ex.right >= 0) {
                placeBridgeAt('right', ex.right)
                sim.room = ex.right
                sim.player.x = 8
                dewedge()
            } else {
                sim.player.x = GW - sim.player.w
            }
        }
    }

    // Advance exactly one tick. input = { dx, dy, drop } — dx/dy are the
    // analog velocity request (keys give ±PLAYER_SPEED; the attract AI gives
    // slower floats), drop is the Space edge.
    sim.step = (input) => {
        const dx = input && input.dx ? input.dx : 0
        const dy = input && input.dy ? input.dy : 0
        if (sim.won || (sim.dead && sim.deathTimer <= 0)) return
        sim.tick++

        if (sim.dead) {
            sim.deathTimer--
            return
        }

        const { player } = sim

        // ---- PLAYER MOVEMENT ----
        const room = ROOMS[sim.room]

        // Try X movement
        const newX = player.x + dx
        if (!collidesWithWalls(room, newX, player.y, player.w, player.h)) {
            player.x = newX
        }
        // Try Y movement
        const newY = player.y + dy
        if (!collidesWithWalls(room, player.x, newY, player.w, player.h)) {
            player.y = newY
        }

        // Bridge: allows passing through walls
        if (sim.carrying === 'bridge') {
            player.x += dx * 0.3  // partial wall pass
            player.y += dy * 0.3
        }

        // Room transitions
        tryTransition()

        // ---- ITEM DROP (Space) ----
        if (input && input.drop && sim.carrying) {
            const item = sim.items.find((i) => i.id === sim.carrying)
            if (item) {
                item.carried = false
                item.room = sim.room
                item.x = player.x
                item.y = player.y + player.h + 2
            }
            sim.carrying = null
        }

        // Carried item follows player
        if (sim.carrying) {
            const item = sim.items.find((i) => i.id === sim.carrying)
            if (item) {
                item.room = sim.room
                item.x = player.x
                item.y = player.y + player.h
            }
        }

        // ---- MAGNET ATTRACT (original: pulls nearby loose items to the player) ----
        // The magnet is carried like any item, but while it is held every loose
        // item in the same room within range drifts toward the player (the slot
        // is full, so nothing is auto-picked up until the magnet is dropped).
        if (sim.carrying === 'magnet') {
            for (const item of sim.items) {
                // The original: the dot is not attracted to the magnet,
                // unlike all other inanimate objects.
                if (item.room === sim.room && !item.carried && !item.noMagnet) {
                    const adx = player.x - item.x
                    const ady = player.y - item.y
                    const adist = Math.sqrt(adx * adx + ady * ady)
                    if (adist > 0.5 && adist < MAGNET_RANGE) {
                        item.x += (adx / adist) * MAGNET_PULL
                        item.y += (ady / adist) * MAGNET_PULL
                    }
                }
            }
        }

        // ---- ITEM PICKUP ----
        if (!sim.carrying) {
            for (const item of sim.items) {
                if (item.room === sim.room && !item.carried) {
                    if (rectsOverlap(player.x, player.y, player.w, player.h,
                        item.x, item.y, item.w, item.h)) {
                        sim.carrying = item.id
                        item.carried = true
                        sim.events.push('pickup')
                        if (!sim.pickedUp[item.id]) {
                            sim.pickedUp[item.id] = 1
                            sim.score++
                        }
                        break
                    }
                }
            }
        }

        // ---- GATE LOGIC ----
        for (const rm of ROOMS) {
            if (rm.gate) {
                const key = sim.items.find((i) => i.id === rm.gateKey)
                if (key && key.room === rm.id && !key.carried && !sim.gateOpen[rm.gateKey]) {
                    // Key is in the castle room — check if near gate area
                    if (key.y < 60 && key.x > 40 && key.x < 120) {
                        sim.gateOpen[rm.gateKey] = true
                        sim.events.push('gate')
                    }
                }
            }
        }

        // ---- SECRET DOOR RITE (original easter egg) ----
        // The original: bring the gray dot — with two or more other objects
        // in the room (carried one at a time, dropped in place) — to the end
        // of the corridor by the sealed door; the barrier blinks and the
        // player pushes through to the creator's room. Here the sealed door
        // is the Dragon Lair's left wall; the door stays open for the run.
        if (!sim.secretOpen && sim.room === R.DRAGON_LAIR && sim.carrying === 'dot' && player.x < 24) {
            const others = sim.items.filter((i) => i.id !== 'dot' && i.room === sim.room && !i.carried).length
            if (others >= 2) {
                sim.secretOpen = true
                sim.events.push('secret')
            }
        }

        // ---- DRAGON AI ----
        for (const dragon of sim.dragons) {
            if (!dragon.alive) {
                // Original: a slain dragon returns to its lair after a delay.
                if (sim.tick >= dragon.respawnAt) {
                    dragon.alive = true
                    dragon.room = dragon.homeRoom
                    dragon.x = dragon.homeX
                    dragon.y = dragon.homeY
                    dragon.mouthOpen = false
                } else continue
            }

            if (dragon.room === sim.room) {
                // Chase player
                const ddx = player.x - dragon.x
                const ddy = player.y - dragon.y
                const dist = Math.sqrt(ddx * ddx + ddy * ddy)

                // Check if player has sword
                if (sim.carrying === 'sword' && dist < 14) {
                    // Slay the dragon! (it respawns to its lair after the delay)
                    dragon.alive = false
                    dragon.respawnAt = sim.tick + DRAGON_RESPAWN_TICKS
                    sim.events.push('slay')
                    continue
                }

                // Flee from certain items
                if (dragon.fleesFrom && sim.carrying === dragon.fleesFrom) {
                    dragon.x -= (ddx / (dist || 1)) * dragon.speed
                    dragon.y -= (ddy / (dist || 1)) * dragon.speed
                } else if (dist > 8) {
                    dragon.x += (ddx / (dist || 1)) * dragon.speed
                    dragon.y += (ddy / (dist || 1)) * dragon.speed

                    // Open mouth when close
                    dragon.mouthOpen = dist < 30
                }

                // Bite! — kill player
                if (dist < 8 && dragon.mouthOpen) {
                    sim.dead = true
                    sim.deathTimer = 120
                    sim.events.push('death')
                }
            } else {
                // Dragon wanders in its room (seeded dice, #1473)
                dragon.x += (rand() - 0.5) * dragon.speed
                dragon.y += (rand() - 0.5) * dragon.speed
                dragon.mouthOpen = false
            }

            // Clamp dragons to room bounds
            dragon.x = Math.max(10, Math.min(GW - 20, dragon.x))
            dragon.y = Math.max(10, Math.min(GH - 20, dragon.y))
        }

        // ---- BAT AI ----
        const { bat } = sim
        bat.x += bat.vx
        bat.y += bat.vy

        // Bat randomly changes direction (seeded dice, #1473)
        if (rand() < 0.02) {
            bat.vx = (rand() - 0.5) * 3
            bat.vy = (rand() - 0.5) * 3
        }

        // The bat roams between rooms (#1560): the edge blocks own the walls
        // (flip when the wall has no opening — the inner bounce used to fire
        // first and made the room-change thresholds unreachable, trapping the
        // bat in one room for the whole run). The bat obeys the same barriers
        // as the player: the sealed secret door AND the closed portcullis
        // (the gate sits at the courtyard's top gap; the foyer is only ever
        // reached through an open gate, so the foyer side passes freely).
        const doorSealed = (from, to) => !sim.secretOpen
            && ((from === R.DRAGON_LAIR && to === R.SECRET) || (from === R.SECRET && to === R.DRAGON_LAIR))
        const batPass = (dir) => {
            if (dir === 'up' && ROOMS[bat.room].gate && CASTLE_INSIDES[bat.room] !== undefined) {
                return sim.gateOpen[ROOMS[bat.room].gateKey] ? CASTLE_INSIDES[bat.room] : -1
            }
            const ex = EXITS[bat.room]
            if (!ex) return -1
            const to = ex[dir]
            if (to === undefined || to < 0) return -1
            if (doorSealed(bat.room, to)) return -1
            return to
        }
        if (bat.x < 2) { const to = batPass('left'); if (to >= 0) { bat.room = to; bat.x = GW - 20 } else bat.vx *= -1 }
        if (bat.x > GW - 8) { const to = batPass('right'); if (to >= 0) { bat.room = to; bat.x = 10 } else bat.vx *= -1 }
        if (bat.y < 2) { const to = batPass('up'); if (to >= 0) { bat.room = to; bat.y = GH - 20 } else bat.vy *= -1 }
        if (bat.y > GH - 8) { const to = batPass('down'); if (to >= 0) { bat.room = to; bat.y = 10 } else bat.vy *= -1 }

        bat.swapTimer--

        // Bat steals/swaps items
        if (bat.room === sim.room && bat.swapTimer <= 0) {
            for (const item of sim.items) {
                if (item.room === sim.room && !item.carried && item.id !== bat.carrying) {
                    if (rectsOverlap(bat.x, bat.y, 10, 10, item.x, item.y, item.w, item.h)) {
                        // Drop what bat is carrying
                        if (bat.carrying) {
                            const dropped = sim.items.find((i) => i.id === bat.carrying)
                            if (dropped) {
                                dropped.room = sim.room
                                dropped.x = item.x
                                dropped.y = item.y
                                dropped.carried = false
                            }
                        }
                        bat.carrying = item.id
                        item.carried = true
                        bat.swapTimer = 180
                        sim.events.push('steal')
                        break
                    }
                }
            }
        }

        // Bat carries its item
        if (bat.carrying) {
            const item = sim.items.find((i) => i.id === bat.carrying)
            if (item) {
                item.room = bat.room
                item.x = bat.x
                item.y = bat.y + 10
            }
        }

        // ---- WIN CONDITION ----
        // Bring the chalice to the Gold Castle
        if (sim.room === R.GOLD_CASTLE && sim.carrying === 'chalice') {
            sim.won = true
            sim.events.push('win')
        }
    }

    return sim
}
