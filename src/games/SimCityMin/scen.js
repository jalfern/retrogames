// SIMCITY-MIN — the scenarios. Maps are carved ASCII (the IronKeep lesson:
// a leaking map is the default when you type walls; here a buildable tile is
// a dot you must earn power to). Terrain never moves; disasters are SCRIPTED
// (named year + named cell) so the sim has no dice to roll and citycheck can
// audit a scenario the way missilecheck audits a barrage.

export const W = 24
export const H = 16

// '~' water, '#' rock, '.' grass. Every row exactly W chars.
export const SCEN = [
    {
        name: 'RIVERBEND',
        tax: 7,
        funds: 1200,
        target: 420,
        deadline: 45,
        blurb: 'a green field and a slow river',
        map: [
            '........................',
            '........................',
            '..##....................',
            '..##....................',
            '........................',
            '........................',
            '........................',
            '........................',
            '........................',
            '................~~~.....',
            '..............~~~~~~....',
            '.............~~~~~~~~...',
            '.............~~~~~~~~~..',
            '..............~~~~~~~...',
            '................~~~~~...',
            '.................~~~....',
        ],
        fires: [],
        tornado: null,
    },
    {
        name: 'SMOKESTACK',
        tax: 7,
        funds: 2000,
        target: 380,
        deadline: 52,
        blurb: 'industry pays — and burns',
        map: [
            '.~~~....................',
            '.~~~~...................',
            '..~~~...................',
            '..........#.............',
            '.........##.#...........',
            '........#####...........',
            '........#####...........',
            '.........###............',
            '.................#......',
            '................###.....',
            '................###.....',
            '................#.......',
            '........................',
            '........................',
            '........................',
            '........................',
        ],
        // two fires inside ONE station's reach (the station is the slack the
        // harness removes), and one late fire far across the map to prove the
        // second station earns its keep
        fires: [
            { year: 13, x: 11, y: 8 },
            { year: 22, x: 13, y: 12 },
            { year: 33, x: 19, y: 4 },
        ],
        tornado: null,
    },
    {
        name: 'EMBERFALL',
        tax: 7,
        funds: 2100,
        target: 440,
        deadline: 55,
        blurb: 'one river, two bridges, a funnel',
        // a derelict substation on the east bank from the town that failed
        // here before yours — one free plant, one stub of its private road
        seed: { plants: [[16, 6]], roads: [[15, 6], [17, 6]] },
        map: [
            '........................',
            '..........~~............',
            '..........~~............',
            '..........~~...##.......',
            '..........~~...##.......',
            '........................',
            '..........~~............',
            '..........~~............',
            '..........~~............',
            '........................',
            '..........~~............',
            '..........~~....#.......',
            '..........~~............',
            '..........~~............',
            '..........~~............',
            '........................',
        ],
        fires: [
            { year: 9, x: 4, y: 4 },
            { year: 19, x: 16, y: 7 },
            { year: 29, x: 17, y: 13 },
        ],
        // years 26..31, one cell per year across the lower bridge — it burns
        // every zone in a 3x3 footprint and cuts the road corridor the power
        // of the east side rides on (plants stand; roads do not).
        tornado: { startYear: 26, path: [[8, 9], [9, 9], [10, 9], [11, 9], [12, 9], [13, 9]] },
    },
]

export const terrainOf = (scenIdx) => {
    const rows = SCEN[scenIdx].map
    if (rows.some((r) => r.length !== W) || rows.length !== H) {
        throw new Error(`scenario ${scenIdx}: map must be ${H} rows of ${W} chars`)
    }
    return rows
}
