// MISSILE BATTLE — the attack scripts. Every warhead that ever falls is named
// here: tick, spawn column, target, flight time, split. No random, no
// snowflakes — three deterministic saturations, tuned against planner.js so
// the slack rule (one fewer interceptor in EVERY battery) still wins.
//
// Entry shapes (t is play-relative; banner ticks before the first entry):
//   { t, kind:'icbm',   x0, ti, spd, split?:{ y, n, spd } }
//   { t, kind:'smart',  x0, ti, spd, amp }
//   { t, kind:'bomber', y,  x0, vx,  drops:[{ t, ti }] }
// ti indexes TARGETS (6 cities then 3 bases). spd = flight ticks to ground.

export const CITIES = [54, 82, 110, 146, 174, 202]
export const BASES = [16, 128, 240]
export const TARGETS = [...CITIES, ...BASES]

export const WAVES = [
    {
        name: 'FIRST SALVO',
        entries: [
            { t: 60, kind: 'icbm', x0: 30, ti: 0, spd: 330 },
            { t: 200, kind: 'icbm', x0: 226, ti: 5, spd: 320 },
            { t: 330, kind: 'icbm', x0: 120, ti: 2, spd: 310, split: { y: 84, n: 2, spd: 240 } },
            { t: 470, kind: 'icbm', x0: 8, ti: 7, spd: 300 },
            { t: 600, kind: 'icbm', x0: 250, ti: 4, spd: 300 },
            { t: 740, kind: 'icbm', x0: 160, ti: 3, spd: 290 },
            { t: 880, kind: 'icbm', x0: 60, ti: 1, spd: 280, split: { y: 92, n: 2, spd: 230 } },
            { t: 1020, kind: 'icbm', x0: 200, ti: 5, spd: 280 },
            { t: 1170, kind: 'icbm', x0: 140, ti: 2, spd: 270 },
            { t: 1310, kind: 'icbm', x0: 24, ti: 0, spd: 265, split: { y: 76, n: 2, spd: 225 } },
            { t: 1460, kind: 'icbm', x0: 214, ti: 3, spd: 265 },
            { t: 1610, kind: 'icbm', x0: 96, ti: 1, spd: 255 },
            { t: 1760, kind: 'icbm', x0: 236, ti: 8, spd: 250 },
            { t: 1910, kind: 'icbm', x0: 70, ti: 4, spd: 245 },
        ],
    },
    {
        name: 'SATURATION',
        entries: [
            { t: 60, kind: 'icbm', x0: 20, ti: 0, spd: 285, split: { y: 96, n: 2, spd: 230 } },
            { t: 130, kind: 'icbm', x0: 236, ti: 5, spd: 280, split: { y: 88, n: 2, spd: 225 } },
            { t: 210, kind: 'bomber', y: 42, x0: -18, vx: 0.62, drops: [{ t: 120, ti: 1 }, { t: 260, ti: 2 }, { t: 400, ti: 3 }, { t: 540, ti: 6 }] },
            { t: 280, kind: 'icbm', x0: 128, ti: 2, spd: 270 },
            { t: 360, kind: 'icbm', x0: 180, ti: 4, spd: 265, split: { y: 82, n: 3, spd: 220 } },
            { t: 440, kind: 'icbm', x0: 66, ti: 1, spd: 260 },
            { t: 520, kind: 'icbm', x0: 92, ti: 2, spd: 258, split: { y: 94, n: 2, spd: 216 } },
            { t: 600, kind: 'bomber', y: 56, x0: 274, vx: -0.6, drops: [{ t: 140, ti: 4 }, { t: 300, ti: 3 }, { t: 460, ti: 7 }] },
            { t: 690, kind: 'icbm', x0: 250, ti: 8, spd: 250 },
            { t: 780, kind: 'icbm', x0: 34, ti: 0, spd: 246, split: { y: 90, n: 2, spd: 215 } },
            { t: 870, kind: 'icbm', x0: 150, ti: 3, spd: 242 },
            { t: 960, kind: 'icbm', x0: 210, ti: 4, spd: 240, split: { y: 84, n: 3, spd: 212 } },
            { t: 1060, kind: 'icbm', x0: 96, ti: 1, spd: 236, split: { y: 78, n: 2, spd: 210 } },
            { t: 1160, kind: 'icbm', x0: 174, ti: 3, spd: 232 },
            { t: 1270, kind: 'icbm', x0: 50, ti: 2, spd: 228 },
            { t: 1390, kind: 'icbm', x0: 186, ti: 5, spd: 224, split: { y: 86, n: 2, spd: 205 } },
            { t: 1510, kind: 'icbm', x0: 120, ti: 3, spd: 222 },
        ],
    },
    {
        name: 'GRAND BARRAGE',
        entries: [
            { t: 45, kind: 'icbm', x0: 16, ti: 0, spd: 255, split: { y: 92, n: 2, spd: 215 } },
            { t: 110, kind: 'smart', x0: 240, ti: 5, spd: 252, amp: 11 },
            { t: 180, kind: 'icbm', x0: 120, ti: 2, spd: 248, split: { y: 84, n: 3, spd: 210 } },
            { t: 250, kind: 'bomber', y: 38, x0: -18, vx: 0.72, drops: [{ t: 110, ti: 1 }, { t: 240, ti: 2 }, { t: 370, ti: 3 }, { t: 500, ti: 4 }] },
            { t: 320, kind: 'icbm', x0: 66, ti: 1, spd: 244 },
            { t: 390, kind: 'smart', x0: 30, ti: 6, spd: 240, amp: 9 },
            { t: 460, kind: 'icbm', x0: 196, ti: 4, spd: 238, split: { y: 80, n: 2, spd: 205 } },
            { t: 540, kind: 'icbm', x0: 150, ti: 3, spd: 234 },
            { t: 610, kind: 'icbm', x0: 82, ti: 1, spd: 232, split: { y: 90, n: 2, spd: 208 } },
            { t: 690, kind: 'bomber', y: 52, x0: 274, vx: -0.68, drops: [{ t: 130, ti: 5 }, { t: 300, ti: 6 }, { t: 470, ti: 8 }] },
            { t: 770, kind: 'smart', x0: 220, ti: 4, spd: 230, amp: 13 },
            { t: 850, kind: 'icbm', x0: 40, ti: 0, spd: 228, split: { y: 88, n: 2, spd: 200 } },
            { t: 930, kind: 'icbm', x0: 170, ti: 3, spd: 226 },
            { t: 1020, kind: 'smart', x0: 90, ti: 1, spd: 224, amp: 10 },
            { t: 1110, kind: 'icbm', x0: 146, ti: 2, spd: 222, split: { y: 82, n: 3, spd: 200 } },
            { t: 1210, kind: 'icbm', x0: 250, ti: 8, spd: 220, split: { y: 76, n: 2, spd: 200 } },
            { t: 1310, kind: 'icbm', x0: 110, ti: 2, spd: 218 },
            { t: 1420, kind: 'smart', x0: 200, ti: 5, spd: 215, amp: 12 },
        ],
    },
]
