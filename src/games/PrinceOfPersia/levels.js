// PRINCE OF PERSIA — the dungeon, as data. The 1989 game is a chain of rooms,
// each 10 tiles wide by three floors high; the screen flips (hard cut, no
// scroll) when you walk through a doorway onto the next room's floor. Every
// level here is such a chain. Pure data: the same wide grid the tab paints is
// what scripts/popcheck.mjs audits. No Math.random.
//
// A room is 10 columns (RW) by 9 authored rows; two pit rows live below the
// ground floor (H=11) so a drop from the top floor is really lethal. The
// ground floor sits at r=8; the three floors sit at r=8, r=5 and r=2, three
// rows (one floor = 3*T px) apart. Rooms are laid left-to-right into one wide
// grid; a doorway is the ground floor at a room's edge column with clear
// headroom above it, so walking off the right edge flips you onto the next room.
//
// Legend (single chars):
//   '#' solid brick        '=' one-way ledge     '~' loose floor (falls, stays rubble)
//   '^' spikes (solid but lethal — jump the run)  'G' gate/portcullis (closed until its room opens)
//   'B' raise button (open the room's gate while stood on; it then closes slowly)
//   'p' exit floor-plate (opens the level's exit door, stays open)
//   '<' exit door (locked until the plate; walk up the stairs into it)
//   'w' the sword          'x' chomper jaws (scheduled blade between pillars)
//   'c' mid-level checkpoint tile
//   'o' torch (decor)      'g' green guard  'R' red guard  's' skeleton  'F' fat  'J' Jaffar
//   'r' small red (+1)     '+' large red (+1 max)   'b' blue poison (-1)
//   'f' slow-fall          'u' upside-down
//   'm' magic mirror       'M' the far side of the mirror (its teleport target)
//   'i' invisible bridge (solid you cannot see until your feet find it)
//   'h' the princess's mouse (runs to the raise button and holds it)
//   '_' shaft — a deliberate pit in the ground row (everything else on the
//     ground row auto-fills to continuous brick)
// Ground row is continuous brick except at shafts, so a feature char always
// sits on floor.

export const RW = 10
export const H = 11
export const GROUND = 8                   // the authored ground row; r 9..10 are pit
export const T = 32
export const FLOOR_ROWS = [8, 5, 2]           // ground, middle, top
export const FH = 3 * T                        // one floor = 3 rows of px

export const EMPTY = 0, SOLID = 1, PLATFORM = 2, LOOSE = 3, SPIKE = 4,
    GATE = 5, RAISE = 6, DROP = 7, EXITPLATE = 8, TORCH = 9, EXIT = 10,
    SWORD = 11, CHOMP = 12, POTION = 13, MIRROR = 14, BRIDGE = 15

export const SOLIDISH = new Set([SOLID, PLATFORM, LOOSE, SPIKE, GATE, RAISE, DROP, EXITPLATE, EXIT, SWORD, POTION, BRIDGE])

export const CODE = {
    '.': EMPTY, '#': SOLID, '=': PLATFORM, '~': LOOSE, '^': SPIKE, 'G': GATE,
    'B': RAISE, 'D': DROP, 'p': EXITPLATE, 'o': TORCH, '<': EXIT, 'w': SWORD, 'x': SOLID, 'c': SOLID,
    'g': SOLID, 'R': SOLID, 'F': SOLID, 's': SOLID, 'J': SOLID, 'r': SOLID, '+': SOLID, 'b': SOLID, 'f': SOLID, 'u': SOLID,
    'm': EMPTY, 'M': EMPTY, 'h': EMPTY, 'i': BRIDGE, '_': EMPTY,
}

const EXIT_ROOM = [
    '..........'
        , '.o......o.'
        , '..........'
        , '..........'
        , '..........'
        , '........#<'
        , '.......###'
        , '......####'
        , '##p#######',
]

const L1 = [
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '#w########'],
    ['..........', '.o......o.', '..........', '..........', '..........', '....==....', '..........', '..........', '###B###GD#'],
    ['..........', '.o......o.', '..........', '..........', '..........', '....~~....', '..........', '..........', '###...x..#'],
    EXIT_ROOM,
]

const L2 = [
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '#+###g###u'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '####R##^r#'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '##B###G###'],
    EXIT_ROOM,
]

const L3 = [
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '####s###f#'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '##^...x..#'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', 'c#bB#G####'],
    EXIT_ROOM,
]

// L4 — the mirror: a barred corridor only the glass can cross; the shadow wakes.
const L4 = [
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '##########'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '####m#G#M#'],
    ['..........', '.o......o.', '..........', '..........', '..........', '....~~....', '..........', '..........', '###B####G#'],
    EXIT_ROOM,
]

// L5 — the shadow's path: leap the shaft; the shadow behind walks in and
// drinks the phantom poison at the bottom — its death, not yours.
const L5 = [
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '###__#####', '..........', '####b#####'],
    ['..........', '.o......o.', '..........', '..........', '..........', '....~~....', '..........', '..........', '###...x..#'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '###B####G#'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '#####g####'],
    EXIT_ROOM,
]

// L6 — the fat guard.
const L6 = [
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '#r########'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '#+####F###'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '###B##^#G#'],
    EXIT_ROOM,
]

// L7 — the long drop: stairs, feathers, then the shaft.
const L7 = [
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '##########'],
    ['..........', '.......o.o', '......#...', '..........', '....===...', '..........', '..===.....', '..........', '##f#####__'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '__########'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '##B####G##'],
    EXIT_ROOM,
]

// L8 — the mouse runs ahead and holds the button.
const L8 = [
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '##########'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '##h#B#G###'],
    ['..........', '.o......o.', '..........', '..........', '..........', '....~~....', '..........', '..........', '####x..#.#'],
    EXIT_ROOM,
]

// L9 — upside-down.
const L9 = [
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '##u#######'],
    ['..........', '.o......o.', '..........', '..........', '.....==...', '..........', '..........', '..........', '#..x..g.##'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '##B###G###'],
    EXIT_ROOM,
]

// L10 — the guards.
const L10 = [
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '#+###g####'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '###R#^####'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '###B##^#G#'],
    EXIT_ROOM,
]

// L11 — no escape: skeleton, red guard, twin jaws, a checkpoint.
const L11 = [
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '#s#####r##'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '#....R#^##'],
    ['..........', '.o......o.', '..........', '..........', '..........', '....~~....', '..........', '..........', '####x..x..'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '####c#BG##'],
    EXIT_ROOM,
]

// L12 — the lair: invisible bridge, Jaffar, and the merge.
const L12 = [
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '#r########'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '###iiiiii#'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '####J#####'],
    EXIT_ROOM,
]

const LEVELS = [
    { name: 'THE DUNGEON', theme: 'dungeon', rooms: L1, start: { room: 0, c: 1, r: 8 } },
    { name: 'THE PORT', theme: 'dungeon', rooms: L2, start: { room: 0, c: 1, r: 8 } },
    { name: 'THE CHECKPOINT', theme: 'palace', rooms: L3, start: { room: 0, c: 1, r: 8 } },
    { name: 'THE MIRROR', theme: 'dungeon', rooms: L4, start: { room: 0, c: 1, r: 8 }, shadow: true },
    { name: 'THE SHADOW PATH', theme: 'dungeon', rooms: L5, start: { room: 0, c: 1, r: 8 }, shadow: true },
    { name: 'THE FAT GUARD', theme: 'dungeon', rooms: L6, start: { room: 0, c: 1, r: 8 }, shadow: true },
    { name: 'THE LONG DROP', theme: 'dungeon', rooms: L7, start: { room: 0, c: 1, r: 8 }, shadow: true },
    { name: "THE MOUSE", theme: 'palace', rooms: L8, start: { room: 0, c: 1, r: 8 }, shadow: true },
    { name: 'UPSIDE-DOWN', theme: 'dungeon', rooms: L9, start: { room: 0, c: 1, r: 8 }, shadow: true },
    { name: 'THE GUARDS', theme: 'palace', rooms: L10, start: { room: 0, c: 1, r: 8 }, shadow: true },
    { name: 'NO ESCAPE', theme: 'palace', rooms: L11, start: { room: 0, c: 1, r: 8 }, shadow: true },
    { name: "THE LAIR", theme: 'palace', rooms: L12, start: { room: 0, c: 1, r: 8 }, shadow: true, merge: true },
]

export const LEVEL_NAMES = LEVELS.map((l) => l.name)
export const LEVEL_COUNT = LEVELS.length

export function makeLevel(i) {
    const src = LEVELS[i]
    const rooms = src.rooms
    const nRooms = rooms.length
    const W = RW * nRooms
    const grid = new Array(W * H).fill(EMPTY)
    const guards = []
    const pots = []
    const chomps = []
    const plates = []
    const torches = []
    const bridges = []
    const pits = new Set()
    let exit = null
    let sword = null
    let checkpoint = null
    let mirror = null
    let mirrorTo = null
    let mouse = null

    const key = (c, r) => r * W + c
    for (let rm = 0; rm < nRooms; rm++) {
        const block = rooms[rm]
        const rows = Math.min(block.length, H)
        for (let r = 0; r < rows; r++) {
            const row = block[r]
            if (row.length !== RW) throw new Error(`level ${i} room ${rm} row ${r} width ${row.length}`)
            for (let lc = 0; lc < RW; lc++) {
                const ch = row[lc]
                const c = rm * RW + lc
                grid[key(c, r)] = CODE[ch] ?? EMPTY
                if (ch === 'B') plates.push({ c, r, room: rm })
                if (ch === 'p') grid[key(c, r)] = EXITPLATE
                if (ch === '<') exit = { c, r, room: rm }
                if (ch === 'w') sword = { c, r }
                if (ch === 'x') chomps.push({ c, r, room: rm, phase: (c % 3) * 22 })
                if (ch === 'o') { torches.push({ c, r }); grid[key(c, r)] = TORCH }
                if (ch === 'c') { checkpoint = { c, r }; grid[key(c, r)] = SOLID }
                if (ch === 'm') { mirror = { c, r, room: rm }; grid[key(c, r)] = MIRROR }
                if (ch === 'M') { mirrorTo = { c, r }; grid[key(c, r)] = EMPTY }
                if (ch === 'h') { mouse = { c, r, room: rm }; grid[key(c, r)] = EMPTY }
                if (ch === 'i') bridges.push(key(c, r))
                if (ch === '_') pits.add(key(c, r))
                if (ch === 'g' || ch === 's' || ch === 'J' || ch === 'R' || ch === 'F') {
                    guards.push({
                        c, r, room: rm, patrol: [c - 2, c + 2],
                        hp: ch === 'J' ? 6 : ch === 's' ? 2 : ch === 'F' ? 5 : ch === 'R' ? 3 : 3,
                        boss: ch === 'J',
                        type: ch === 'J' ? 'jaffar' : ch === 's' ? 'skeleton' : ch === 'R' ? 'red' : ch === 'F' ? 'fat' : 'green',
                    })
                }
                if (ch === 'r' || ch === '+' || ch === 'b' || ch === 'f' || ch === 'u') pots.push({ c, r, room: rm, type: ch })
            }
        }
    }

    // the authored rooms are 9 rows; two pit rows live below the ground floor
    for (let c = 0; c < W; c++) if (grid[key(c, H - 1)] === EMPTY) grid[key(c, H - 1)] = SOLID

    // doorways: clear headroom over each room-edge column down to the ground
    for (let rm = 0; rm < nRooms; rm++) {
        for (const ec of [rm * RW, rm * RW + RW - 1]) {
            for (let r = 0; r < GROUND; r++) {
                const v = grid[key(ec, r)]
                if (v === SOLID || v === PLATFORM || v === SPIKE || v === LOOSE) grid[key(ec, r)] = EMPTY
            }
        }
    }
    // extend any gate marker into a ceiling-to-floor portcullis (not jumpable);
    // the ground row under a gate stays solid floor, so a lowering gate can
    // never swallow you into the void
    for (let c = 0; c < W; c++) {
        let lowGate = -1
        for (let r = 0; r <= GROUND; r++) if (grid[key(c, r)] === GATE) lowGate = r
        if (lowGate >= 0) for (let r = 0; r <= lowGate; r++) grid[key(c, r)] = GATE
        if (grid[key(c, GROUND)] === GATE) grid[key(c, GROUND)] = SOLID
    }
    // the level's left edge is a wall; the exit door is locked until the plate
    for (let r = 0; r < GROUND; r++) if (grid[key(0, r)] !== GATE && grid[key(0, r)] !== EXIT) grid[key(0, r)] = SOLID
    // the ground row is continuous brick except where the data opens a shaft
    for (let c = 0; c < W; c++) {
        const k = key(c, GROUND)
        if (grid[k] === EMPTY && !pits.has(k)) grid[k] = SOLID
    }
    // clamp guard patrols to their own room
    for (const gd of guards) gd.patrol = [Math.max(gd.room * RW + 1, gd.c - 2), Math.min((gd.room + 1) * RW - 2, gd.c + 2)]

    // room decoration seeds: pillars, arched windows and tapestries get stable
    // columns per room (pure math on the room index — no Math.random)
    const deco = []
    for (let rm = 0; rm < nRooms; rm++) {
        deco.push({ window: 2 + (rm * 3) % 6, windowRow: 0, tapestry: 7 - (rm * 2) % 5, pillar: rm % 2 ? 1 : 8 })
    }

    return {
        id: i, name: src.name, theme: src.theme || 'dungeon', W, H, nRooms, grid,
        guards, pots, chomps, plates, torches, bridges, deco, exit, sword, checkpoint,
        mirror, mirrorTo, mouse,
        shadow: !!src.shadow, merge: !!src.merge,
        start: { ...src.start },
        needBoss: !!guards.find((g) => g.boss),
    }
}

export const roomOf = (c) => Math.floor(c / RW)
