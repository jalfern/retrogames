// ARKANOID — round data. Every round is authored as ASCII so the harness
// (scripts/arkanoidcheck.mjs) can audit reachability before anyone plays:
//   '.' empty   '#' standard brick (1 hit)   's' silver (3 hits)   'g' gold (indestructible)
//   capsule carriers (each type ships EXACTLY once across the game):
//   'L' LASER  'S' SLOW  'D' DISRUPT(3 balls)   'C' CATCH  'B' BREAK  'E' EXPAND   '+' extra life
// The final round has no destructibles — it belongs to DOH.

export const COLS = 15

export const ROUNDS = [
    {
        name: 'ROUND 1',
        gates: [80, 176],
        enemyPeriod: 900,
        enemyCap: 2,
        rows: [
            '#g##L#####S##g#',
            '#g###g###g###g#',
            '#g###g#Dg###g##',
        ],
    },
    {
        name: 'ROUND 2',
        gates: [64, 192],
        enemyPeriod: 760,
        enemyCap: 3,
        rows: [
            '......#C#......',
            '.....#sBs#.....',
            '....#s###s#....',
            '...#s#E##s#....',
            '..#s#######s#..',
        ],
    },
    {
        name: 'ROUND 3',
        gates: [48, 208],
        enemyPeriod: 640,
        enemyCap: 3,
        rows: [
            '.gggggg.gggggg.',
            '.g#s#####s###g.',
            '.g#s#s#+#s#s#g.',
            '.g#s#####s###g.',
            '.gggggg.gggggg.',
        ],
    },
    {
        name: 'ROUND 4',
        gates: [128],
        enemyPeriod: 520,
        enemyCap: 4,
        rows: [
            '#s#s#s#s#s#s#s#',
            's#s#s#s#s#s#s#s',
            '#s#s#s#s#s#s#s#',
            'sssssssssssssss',
        ],
    },
    {
        name: 'ROUND 5',
        gates: [56, 200],
        enemyPeriod: 460,
        enemyCap: 4,
        rows: [
            'ggg.....ggg..gg',
            '#s#s..g..s#s.#s',
            '#s#s..g..s#s.#s',
            'ggg.....ggg..gg',
        ],
    },
    {
        name: 'ROUND 6',
        gates: [48, 128, 208],
        enemyPeriod: 380,
        enemyCap: 5,
        rows: [
            'g#g#g#g#g#g#g#g',
            'sssssssssssssss',
            '#s#s#s#s#s#s#s#',
            '#s#s#s#s#s#s#s#',
            'sssssssssssssss',
        ],
    },
    {
        name: 'DOH',
        boss: true,
        gates: [48, 208],
        enemyPeriod: 620,
        enemyCap: 2,
        rows: [
            'gg...........gg',
        ],
    },
]
