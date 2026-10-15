// DIG DUG — stage data. 18 cols x 12 rows of 16px cells (288x192 field, 224 incl HUD).
// Row 0 is the HUD band, rows 1-2 open air, rows 3-10 dirt (four 2-row color
// layers), row 11 solid floor. Nothing here is random: spawn order rotates by
// seed, so scripts/dugcheck.mjs can audit and replay every seed.
//
//   rocks      : {col,row} boulders; support = dirt cells directly above them.
//                support -> 0 and the rock falls, crushing what it lands on.
//   vegSpots   : after two rocks drop in a round, veggies sprout at these cells.
//   comp       : the round's roster; the round clears when every enemy in it
//                has fallen (cap = how many may be on the field at once).
//   goal       : enemies defeated to clear the round (= comp.length).

export const CELL = 16
export const COLS = 18
export const ROWS = 12
export const W = COLS * CELL
export const H = 224
export const HUD_ROW = 0
export const AIR_TOP = 1
export const AIR_BOT = 2
export const DIRT_TOP = 3
export const DIRT_BOT = 10
export const FLOOR_ROW = 11
export const FIELD_Y0 = 16

export const LAYERS = ['#3fae4c', '#2fa8cc', '#3a53c8', '#8f3fa0']

// layer 0..3 from a grid row; air rows read as layer 0
export function layerOf(row) {
    if (row <= AIR_BOT) return 0
    return Math.min(3, Math.floor((row - DIRT_TOP) / 2))
}

export const ROUNDS = [
    {
        name: 'ROUND 1',
        goal: 8,
        comp: ['pooka', 'pooka', 'fygar', 'pooka', 'fygar', 'pooka', 'pooka', 'fygar'],
        cap: 3,
        ghostSpeed: 0.42,
        walkSpeed: 0.8,
        breathCd: 320,
        rocks: [{ col: 3, row: 5 }, { col: 7, row: 5 }, { col: 11, row: 5 }, { col: 15, row: 5 }],
        vegSpots: [{ col: 5, row: 8 }, { col: 9, row: 9 }, { col: 13, row: 8 }],
    },
    {
        name: 'ROUND 2',
        goal: 10,
        comp: ['pooka', 'fygar', 'pooka', 'pooka', 'fygar', 'pooka', 'fygar', 'pooka', 'fygar', 'pooka'],
        cap: 3,
        ghostSpeed: 0.58,
        walkSpeed: 1.05,
        breathCd: 220,
        rocks: [{ col: 2, row: 5 }, { col: 6, row: 7 }, { col: 10, row: 5 }, { col: 14, row: 7 }, { col: 16, row: 5 }],
        vegSpots: [{ col: 4, row: 9 }, { col: 8, row: 8 }, { col: 12, row: 9 }, { col: 15, row: 9 }],
    },
    {
        name: 'ROUND 3',
        goal: 12,
        comp: ['fygar', 'pooka', 'pooka', 'fygar', 'pooka', 'fygar', 'pooka', 'pooka', 'fygar', 'pooka', 'fygar', 'pooka'],
        cap: 4,
        ghostSpeed: 0.66,
        walkSpeed: 1.15,
        breathCd: 190,
        rocks: [{ col: 2, row: 7 }, { col: 5, row: 5 }, { col: 9, row: 7 }, { col: 12, row: 5 }, { col: 15, row: 7 }],
        vegSpots: [{ col: 3, row: 9 }, { col: 7, row: 9 }, { col: 11, row: 9 }, { col: 14, row: 9 }],
    },
]

// pump kill value by kind and dirt layer (deep = the classic's big numbers);
// a kill up in the open air pays half of layer 0.
export const PUMP_POINTS = {
    pooka: [200, 400, 800, 1000],
    fygar: [300, 600, 1000, 1200],
}
export const ROCK_BASE = 300 // per enemy: ROCK_BASE * (layer+1) * how-many-this-rock-crushed
export const ROUND_BONUS = (round) => 1000 * (round + 1)
