// IRON RING stages (#1095) — lively backdrops, designed from the SFII arcade
// idiom: a fighting floor, a standing crowd that moves, flags, neon, flood
// lamps. Three ports of call, each with its own palette.

export const STAGES = [
    {
        id: 'docklands', name: 'NEON DOCKLANDS',
        ground: '#6b5a3e', groundLine: '#57482f', wall: '#181425',
        crowdColors: ['#c84a4a', '#4a7ac8', '#c8a44a', '#5aa664', '#9a5ab0', '#d0d0d8'],
        banner: '#b83a2e', accent: 0xffb03c,
        neon: [
            { x: -6.5, y: 8.2, c: 0xff3c6a, w: 3.4, h: 0.5 },
            { x: 5.8, y: 9.1, c: 0x3cd6ff, w: 2.6, h: 0.42 },
            { x: 8.4, y: 7.4, c: 0xffd23e, w: 1.4, h: 1.4 },
            { x: -9.2, y: 6.6, c: 0x7aff9e, w: 1.8, h: 0.4 },
        ],
        midground: [
            { t: 'crane', x: -9.5, z: -11.6, s: 1.25, c: 0x2b3040, beacon: 0xff3c6a },
            { t: 'box', x: -6.4, y: 0.7, z: -11.7, w: 2.5, h: 1.4, d: 1.4, c: 0x7a3b2a },
            { t: 'box', x: -6.5, y: 1.95, z: -11.7, w: 2.0, h: 1.05, d: 1.2, c: 0x2f5a6a },
            { t: 'box', x: 8.6, y: 0.6, z: -11.8, w: 2.6, h: 1.2, d: 1.4, c: 0x6a5a2a },
            { t: 'box', x: 8.3, y: 1.6, z: -11.8, w: 1.8, h: 0.9, d: 1.1, c: 0x4a5a3a },
            { t: 'box', x: 0.6, y: 0.42, z: -11.9, w: 1.5, h: 0.84, d: 1.2, c: 0x3a3f4a },
        ],
    },
    {
        id: 'dojo', name: 'IRON DOJO',
        ground: '#7a5a36', groundLine: '#66482a', wall: '#241418',
        crowdColors: ['#d8d8e0', '#b0b0c0', '#c8c0a8', '#a0a8b8', '#c0b090', '#909098'],
        banner: '#8a2430', accent: 0xd83a2f,
        neon: [
            { x: 0, y: 9.4, c: 0xff5a3c, w: 4.4, h: 0.5 },
            { x: -7.6, y: 8, c: 0xffb03c, w: 1.6, h: 0.4 },
            { x: 7.6, y: 8, c: 0xffb03c, w: 1.6, h: 0.4 },
        ],
        midground: [
            { t: 'disc', x: 0, y: 8.3, z: -12.9, r: 2.2, c: 0xf2e6c8, e: 0.32 },
            { t: 'torii', x: 0, z: -12.4, s: 1.55, c: 0x7a2a2a },
            { t: 'lantern', x: -5.6, y: 5.7, z: -12.2, r: 0.5, c: 0xffb04a, e: 1.6 },
            { t: 'lantern', x: 5.6, y: 5.7, z: -12.2, r: 0.5, c: 0xffb04a, e: 1.6 },
            { t: 'box', x: -2.5, y: 9.7, z: -12.6, w: 10, h: 0.3, d: 0.4, c: 0x4a2a1a },
            { t: 'box', x: 3, y: 9.0, z: -12.6, w: 6.5, h: 0.25, d: 0.35, c: 0x5a3320 },
        ],
    },
    {
        id: 'skybridge', name: 'SKYBRIDGE AT DUSK',
        ground: '#3e4a5c', groundLine: '#313c4c', wall: '#0e1626',
        crowdColors: ['#5a7ac8', '#7a5ab0', '#4a9ab0', '#8a6ac0', '#3a6a9a', '#a090d0'],
        banner: '#3c5aff', accent: 0x7aa0ff,
        neon: [
            { x: -8.4, y: 8.6, c: 0x3cd6ff, w: 2.2, h: 0.44 },
            { x: 6.4, y: 9.3, c: 0xff3c6a, w: 3.2, h: 0.5 },
            { x: -3.2, y: 7.2, c: 0xffd23e, w: 1.2, h: 0.36 },
            { x: 9, y: 7, c: 0x7aff9e, w: 1.2, h: 1.2 },
        ],
        midground: [
            { t: 'skyline', z: -13.6, base: 0, c: 0x1a2438, window: 0xffd27a, beacon: 0xff4a5a, n: 9, seed: 7 },
            { t: 'girder', x: -7.5, y: 3.2, z: -12.7, w: 6.5, h: 1.0, c: 0x3a4a6a },
            { t: 'girder', x: 7.5, y: 2.6, z: -12.7, w: 5.2, h: 0.8, c: 0x3a4a6a },
            { t: 'box', x: 0, y: 0.9, z: -13.3, w: 23, h: 0.25, d: 0.6, c: 0x2a3448 },
        ],
    },
]
