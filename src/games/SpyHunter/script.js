// SPY HUNTER — the two stages, written as pure data.
//
// Every enemy that ever touches the road is one entry here: {t, type, ...}
// fires when the stage clock (ticks since stage start) reaches t. Nothing in
// the sim rolls a die: this table is the arcade's hand-authored traffic,
// and it is the exact thing scripts/huntercheck.mjs audits — it projects
// the road ahead of the player tick by tick and refuses to let the slicks,
// the walls or the sweeper seal all three lanes at once. A stage that
// cannot be audited cannot ship.
//
// Types: laker (paints oil), rambler (rams you), sweeper (shoves you),
// killer (matches speed, fires back), traffic (oncoming), heli (bombs),
// supporter (carries a crate — shoot it, then catch the crate).
// Boats run outside the table: one per stage, wrapping the river.

// Lane centers on the 26..198 road.
export const L1 = 55, L2 = 112, L3 = 169

export const STAGES = [
    {
        name: 'STAGE 1',
        ticks: 2100,           // ~35 s at 60 fps, SCROLL 3.2 px/tick
        events: [
            { t: 60, type: 'laker', x: L3 },
            { t: 170, type: 'traffic', x: L1 },
            { t: 300, type: 'laker', x: L1 },
            { t: 360, type: 'traffic', x: L3 },
            { t: 470, type: 'rambler', x: L3 },
            { t: 560, type: 'traffic', x: L2 },
            { t: 640, type: 'supporter', x: L2, crate: 'missile' },
            { t: 800, type: 'laker', x: L3 },
            { t: 880, type: 'traffic', x: L1 },
            { t: 960, type: 'rambler', x: L1 },
            { t: 1050, type: 'traffic', x: L2 },
            { t: 1140, type: 'killer', x: L2 },
            { t: 1280, type: 'sweeper', x: L1, push: 1 },
            { t: 1420, type: 'traffic', x: L3 },
            { t: 1500, type: 'heli', x: 235, vx: -1.7, bombs: 4 },
            { t: 1600, type: 'laker', x: L2 },
            { t: 1690, type: 'supporter', x: L1, crate: 'gun' },
            { t: 1810, type: 'traffic', x: L1 },
            { t: 1900, type: 'rambler', x: L3 },
            { t: 1990, type: 'traffic', x: L2 },
        ],
    },
    {
        name: 'STAGE 2',
        ticks: 2250,
        events: [
            { t: 60, type: 'laker', x: L3 },
            { t: 130, type: 'traffic', x: L1 },
            { t: 230, type: 'killer', x: L2 },
            { t: 300, type: 'laker', x: L1 },
            { t: 360, type: 'traffic', x: L2 },
            { t: 470, type: 'sweeper', x: L2, push: -1 },
            { t: 520, type: 'traffic', x: L1 },
            { t: 620, type: 'rambler', x: L3 },
            { t: 700, type: 'supporter', x: L2, crate: 'missile' },
            { t: 820, type: 'heli', x: 235, vx: -1.8, bombs: 4 },
            { t: 900, type: 'traffic', x: L3 },
            { t: 980, type: 'laker', x: L2 },
            { t: 1060, type: 'rambler', x: L1 },
            { t: 1140, type: 'traffic', x: L2 },
            { t: 1230, type: 'sweeper', x: L3, push: 1 },
            { t: 1320, type: 'killer', x: L1 },
            { t: 1380, type: 'supporter', x: L3, crate: 'repair' },
            { t: 1470, type: 'traffic', x: L1 },
            { t: 1540, type: 'heli', x: 30, vx: 1.8, bombs: 4 },
            { t: 1640, type: 'traffic', x: L2 },
            { t: 1720, type: 'laker', x: L3 },
            { t: 1800, type: 'rambler', x: L2 },
            { t: 1890, type: 'traffic', x: L1 },
            { t: 1970, type: 'laker', x: L1 },
            { t: 2050, type: 'traffic', x: L3 },
        ],
    },
]
