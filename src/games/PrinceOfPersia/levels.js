// PRINCE OF PERSIA — the dungeon, as data. The 1989 game is a chain of rooms,
// each 10 tiles wide by three floors high; the screen flips (hard cut, no
// scroll) when you walk through a doorway onto the next room's floor. Every
// level here is such a chain. Pure data: the same wide grid the tab paints is
// what scripts/popcheck.mjs audits. No Math.random.
//
// A room is 10 columns (RW) by 9 rows (H). The bottom row (r=8) is the ground
// floor; the three floors sit at r=8 (ground), r=5 (middle) and r=2 (top),
// three rows (one floor = 3*T px) apart. Rooms are laid left-to-right into one
// wide grid; a doorway is the ground floor at a room's edge column with clear
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
//   'o' torch (decor)      'g' guard  's' skeleton  'J' Jaffar
//   'r' small red (+1)     '+' large red (+1 max)   'b' blue poison (-1)
//   'f' slow-fall          'u' upside-down
// Ground row is forced solid everywhere, so a feature char always sits on floor.

export const RW = 10
export const H = 9
export const T = 32
export const FLOOR_ROWS = [8, 5, 2]           // ground, middle, top
export const FH = 3 * T                        // one floor = 3 rows of px

export const EMPTY = 0, SOLID = 1, PLATFORM = 2, LOOSE = 3, SPIKE = 4,
    GATE = 5, RAISE = 6, DROP = 7, EXITPLATE = 8, TORCH = 9, EXIT = 10,
    SWORD = 11, CHOMP = 12, POTION = 13

export const SOLIDISH = new Set([SOLID, PLATFORM, LOOSE, SPIKE, GATE, RAISE, DROP, EXITPLATE, EXIT, SWORD, POTION])

export const CODE = {
    '.': EMPTY, '#': SOLID, '=': PLATFORM, '~': LOOSE, '^': SPIKE, 'G': GATE,
    'B': RAISE, 'D': DROP, 'p': EXITPLATE, 'o': TORCH, '<': EXIT, 'w': SWORD, 'x': SOLID, 'c': SOLID,
    'g': SOLID, 's': SOLID, 'J': SOLID, 'r': SOLID, '+': SOLID, 'b': SOLID, 'f': SOLID, 'u': SOLID,
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
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '#+###g##u#'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '#^######r#'],
    ['..........', '.o......o.', '..........', '..........', '....==....', '..........', '..........', '..........', '##B###G###'],
    EXIT_ROOM,
]

const L3 = [
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '####s###f#'],
    ['..........', '.o......o.', '..........', '..........', '..........', '..........', '..........', '..........', '##^...x..#'],
    ['..........', '.o......o.', '..........', '..........', '.....==...', '..........', '..........', '..........', 'c#Bb#G####'],
    EXIT_ROOM,
]

const LEVELS = [
    { name: 'THE DUNGEON', rooms: L1, start: { room: 0, c: 1, r: 8 } },
    { name: 'THE PORT', rooms: L2, start: { room: 0, c: 1, r: 8 } },
    { name: 'THE CHECKPOINT', rooms: L3, start: { room: 0, c: 1, r: 8 } },
]

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
    let exit = null
    let sword = null
    let checkpoint = null

    const key = (c, r) => r * W + c
    for (let rm = 0; rm < nRooms; rm++) {
        const block = rooms[rm]
        for (let r = 0; r < H; r++) {
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
                if (ch === 'g' || ch === 's' || ch === 'J') {
                    guards.push({
                        c, r, room: rm, patrol: [c - 2, c + 2],
                        hp: ch === 'J' ? 6 : ch === 's' ? 2 : 3,
                        boss: ch === 'J', type: ch === 'J' ? 'jaffar' : ch === 's' ? 'skeleton' : 'green',
                    })
                }
                if (ch === 'r' || ch === '+' || ch === 'b' || ch === 'f' || ch === 'u') pots.push({ c, r, room: rm, type: ch })
            }
        }
    }

    // doorways: clear headroom over each room-edge column on the ground floor
    for (let rm = 0; rm < nRooms; rm++) {
        for (const ec of [rm * RW, rm * RW + RW - 1]) {
            for (let r = 0; r < H - 1; r++) {
                const v = grid[key(ec, r)]
                if (v === SOLID || v === PLATFORM || v === SPIKE || v === LOOSE) grid[key(ec, r)] = EMPTY
            }
        }
    }
    // guarantee a continuous ground floor
    for (let c = 0; c < W; c++) if (grid[key(c, H - 1)] === EMPTY) grid[key(c, H - 1)] = SOLID
    // extend any gate marker into a ceiling-to-floor portcullis (not jumpable);
    // the ground row under a gate stays solid floor, so a lowering gate can
    // never swallow you into the void
    for (let c = 0; c < W; c++) {
        let lowGate = -1
        for (let r = 0; r < H; r++) if (grid[key(c, r)] === GATE) lowGate = r
        if (lowGate >= 0) for (let r = 0; r <= lowGate; r++) grid[key(c, r)] = GATE
        if (grid[key(c, H - 1)] === GATE) grid[key(c, H - 1)] = SOLID
    }
    // the level's left edge is a wall; the exit door is locked until the plate
    for (let r = 0; r < H - 1; r++) if (grid[key(0, r)] !== GATE && grid[key(0, r)] !== EXIT) grid[key(0, r)] = SOLID
    // clamp guard patrols to their own room
    for (const gd of guards) gd.patrol = [Math.max(gd.room * RW + 1, gd.c - 2), Math.min((gd.room + 1) * RW - 2, gd.c + 2)]

    return {
        id: i, name: src.name, W, H, nRooms, grid,
        guards, pots, chomps, plates, torches, exit, sword, checkpoint,
        start: { ...src.start },
        needBoss: !!guards.find((g) => g.boss),
    }
}

export const roomOf = (c) => Math.floor(c / RW)
