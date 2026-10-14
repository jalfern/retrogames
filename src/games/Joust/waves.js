// JOUST — the five waves. Terrain is DATA (segments, hands, rosters) so
// scripts/joustcheck.mjs can audit it in plain Node before anyone draws it.
// Ground top is y=204, lava surface y=212, screen 256x224 (the arcade frame).

export const WAVES = [
    {
        name: 'WAVE 1',
        segs: [
            { x0: 0, x1: 104, y: 204, kind: 'ground' },
            { x0: 152, x1: 256, y: 204, kind: 'ground' },
            { x0: 48, x1: 96, y: 152, kind: 'plat' },
            { x0: 160, x1: 208, y: 152, kind: 'plat' },
        ],
        hands: [
            { x: 72, period: 360, phase: 0, outY: 150 },
            { x: 184, period: 360, phase: 180, outY: 150 },
        ],
        roster: [
            { kind: 'bounder', x: 64, delay: 60 },
            { kind: 'bounder', x: 128, delay: 260 },
            { kind: 'bounder', x: 192, delay: 460 },
        ],
        spawns: [[72, 120], [184, 120]],
    },
    {
        name: 'WAVE 2',
        segs: [
            { x0: 0, x1: 40, y: 204, kind: 'ground' },
            { x0: 88, x1: 168, y: 204, kind: 'ground' },
            { x0: 216, x1: 256, y: 204, kind: 'ground' },
            { x0: 104, x1: 152, y: 136, kind: 'plat' },
        ],
        hands: [
            { x: 64, period: 320, phase: 40, outY: 150 },
            { x: 192, period: 320, phase: 200, outY: 150 },
        ],
        roster: [
            { kind: 'bounder', x: 56, delay: 60 },
            { kind: 'bounder', x: 128, delay: 240 },
            { kind: 'bounder', x: 200, delay: 420 },
            { kind: 'bounder', x: 96, delay: 640 },
        ],
        spawns: [[24, 120], [232, 120]],
    },
    {
        name: 'WAVE 3',
        segs: [
            { x0: 0, x1: 96, y: 204, kind: 'ground' },
            { x0: 160, x1: 256, y: 204, kind: 'ground' },
            { x0: 24, x1: 80, y: 146, kind: 'plat', crumble: true },
            { x0: 176, x1: 232, y: 146, kind: 'plat', crumble: true },
        ],
        hands: [
            { x: 52, period: 280, phase: 0, outY: 150 },
            { x: 128, period: 280, phase: 93, outY: 150 },
            { x: 204, period: 280, phase: 186, outY: 150 },
        ],
        roster: [
            { kind: 'bounder', x: 64, delay: 60 },
            { kind: 'bounder', x: 192, delay: 240 },
            { kind: 'bounder', x: 128, delay: 420 },
            { kind: 'hunter', x: 40, delay: 640 },
            { kind: 'hunter', x: 216, delay: 760 },
        ],
        spawns: [[48, 120], [204, 120]],
    },
    {
        name: 'WAVE 4',
        segs: [
            { x0: 0, x1: 32, y: 204, kind: 'ground' },
            { x0: 72, x1: 184, y: 204, kind: 'ground' },
            { x0: 224, x1: 256, y: 204, kind: 'ground' },
            { x0: 96, x1: 160, y: 132, kind: 'plat', crumble: true },
        ],
        hands: [
            { x: 52, period: 240, phase: 0, outY: 146 },
            { x: 128, period: 240, phase: 80, outY: 146 },
            { x: 204, period: 240, phase: 160, outY: 146 },
        ],
        roster: [
            { kind: 'bounder', x: 104, delay: 60 },
            { kind: 'bounder', x: 152, delay: 240 },
            { kind: 'hunter', x: 48, delay: 420 },
            { kind: 'hunter', x: 208, delay: 600 },
            { kind: 'hunter', x: 128, delay: 780 },
        ],
        spawns: [[16, 120], [240, 120]],
    },
    {
        name: 'WAVE 5',
        segs: [
            { x0: 0, x1: 104, y: 204, kind: 'ground' },
            { x0: 152, x1: 256, y: 204, kind: 'ground' },
            { x0: 48, x1: 96, y: 150, kind: 'plat', crumble: true },
            { x0: 160, x1: 208, y: 150, kind: 'plat', crumble: true },
            { x0: 104, x1: 152, y: 96, kind: 'plat' },
        ],
        hands: [
            { x: 72, period: 210, phase: 0, outY: 140 },
            { x: 128, period: 210, phase: 70, outY: 140 },
            { x: 184, period: 210, phase: 140, outY: 140 },
        ],
        roster: [
            { kind: 'bounder', x: 64, delay: 60 },
            { kind: 'bounder', x: 192, delay: 220 },
            { kind: 'hunter', x: 48, delay: 380 },
            { kind: 'hunter', x: 208, delay: 540 },
            { kind: 'shadow', x: 128, delay: 760 },
            { kind: 'shadow', x: 96, delay: 1000 },
        ],
        spawns: [[128, 60], [128, 84]],
    },
]

export const LAVA_TOP = 212
export const GROUND_Y = 204

// The issue asks for the pterodactyl; the original cycled mounts per level.
// Deviation ledger in README.md — the mount stays the pterodactyl, the waves
// get meaner instead.
