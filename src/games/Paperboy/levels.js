// PAPERBOY — the routes. Three hand-scripted stages; every house, crate, dog
// and cross-cart is named at an exact forward distance. Nothing here is
// generated at play time, so `papercheck` can audit the whole series offline:
// a window that a cross-cart sweep would occupy, an unreachable door, or a
// crate parked inside a delivery lane is a BUILD FAILURE, caught here.
//
//   houses:    one char per delivery slot — L/R = which side's door, ' ' = none.
//              slots sit at houseBase + i*houseStep.
//   crates:    {s, x, w} — wrecked furniture on the road (w defaults to CFG.crateW)
//   dogs:      {s, side} — lunge across the road when your s enters range
//   crossings: {s, P, ph, from} — a cart enters the road every P ticks (phase
//              ph, measured in ticks; at mid pedal that is a house length)
//              from side ±1, sweeping across.

export const STAGES = [
    {
        name: 'MAPLE STREET', theme: 'day', len: 5200,
        houseBase: 260, houseStep: 200,
        houses: 'LRRLRLLRLRLLRRLRLLRRLRL',
        crates: [
            { s: 900, x: 0, w: 16 }, { s: 1750, x: 22 }, { s: 2600, x: -24 },
            { s: 3500, x: 6 }, { s: 4400, x: -14 },
        ],
        dogs: [{ s0: 1250, side: 1 }, { s0: 2200, side: 1 }, { s0: 2950, side: -1 }],
        crossings: [
            { s: 1600, P: 150, ph: 100, from: -1 },
            { s: 3200, P: 135, ph: 75, from: 1 },
            { s: 4800, P: 120, ph: 40, from: -1 },
        ],
    },
    {
        name: 'RADISH DOWNTOWN', theme: 'dusk', len: 5600,
        houseBase: 240, houseStep: 180,
        houses: 'RLRRLRLLRRLRLLRRLRLLRRLRLL',
        crates: [
            { s: 900, x: -18 }, { s: 1550, x: 0, w: 16 }, { s: 2350, x: 20 },
            { s: 2850, x: -8, w: 14 }, { s: 3500, x: 26 }, { s: 4300, x: 0, w: 16 },
            { s: 5150, x: -20 },
        ],
        dogs: [
            { s0: 700, side: 1 }, { s0: 1800, side: -1 }, { s0: 2690, side: 1 },
            { s0: 4450, side: -1 },
        ],
        crossings: [
            { s: 1200, P: 140, ph: 84, from: -1 },
            { s: 2100, P: 130, ph: 65, from: 1 },
            { s: 3000, P: 150, ph: 105, from: -1 },
            { s: 3900, P: 130, ph: 91, from: 1 },
            { s: 4800, P: 140, ph: 70, from: -1 },
        ],
    },
    {
        name: 'IRON HILL', theme: 'night', len: 6000,
        houseBase: 260, houseStep: 190,
        houses: 'LRLRRLRLLRRLRLLRRLRLLRRLRLRL',
        crates: [
            { s: 800, x: -14, w: 10 }, { s: 800, x: 14, w: 10 },
            { s: 1800, x: 0, w: 16 }, { s: 2500, x: -22 }, { s: 3380, x: 18, w: 12 },
            { s: 4100, x: -6 }, { s: 4700, x: 22 }, { s: 5300, x: 0, w: 16 },
        ],
        dogs: [
            { s0: 1050, side: -1 }, { s0: 1900, side: 1 }, { s0: 3050, side: -1 },
            { s0: 3930, side: 1 }, { s0: 4950, side: -1 },
        ],
        crossings: [
            { s: 1400, P: 135, ph: 95, from: -1 },
            { s: 2600, P: 125, ph: 60, from: 1 },
            { s: 3800, P: 140, ph: 84, from: -1 },
            { s: 5000, P: 130, ph: 52, from: 1 },
        ],
    },
]

for (const st of STAGES) st.houseCount = st.houses.replace(/[^LR]/g, '').length

// Renderer palettes — every colour the painter uses lives here so a stage is
// one honest object, and the pixel probes in paperplay can name what they see.
export const PALETTES = {
    day: {
        skyTop: '#2f7fd6', skyBot: '#cfeaff', sun: '#fff3a8', hill: '#2c7a3d',
        grass: ['#43a94c', '#3c9e46'], road: ['#5c6069', '#565a63'], stripe: '#f2df8f',
        walk: '#cfc9bb', kerb: '#a59f91', tree: '#1e6b33', trunk: '#6a4a2c',
        wall: ['#d8b26c', '#c8685c', '#b0c4d8'], wall2: ['#b58f4e', '#a8564c', '#8fa3ba'],
        roof: '#7a3b3b', door: '#5a3a22', win: '#eaf4ff', box: '#3f6fd8', cart: '#c94f4f',
    },
    dusk: {
        skyTop: '#2b2050', skyBot: '#ff9d5c', sun: '#ffd27a', hill: '#26304d',
        grass: ['#2f6b3c', '#2a6036'], road: ['#484c58', '#434751'], stripe: '#e8cf8a',
        walk: '#8f887b', kerb: '#6e675c', tree: '#17442a', trunk: '#4c3420',
        wall: ['#a8885a', '#9c5c52', '#8798ac'], wall2: ['#8a6d46', '#7f4a42', '#6d7c8e'],
        roof: '#572e33', door: '#402818', win: '#ffd98a', box: '#2f55a0', cart: '#b04040',
    },
    night: {
        skyTop: '#05060f', skyBot: '#1c2650', sun: '#dfe6ff', hill: '#0d1226',
        grass: ['#173222', '#142c1e'], road: ['#2e313b', '#2a2d36'], stripe: '#b3ab72',
        walk: '#5c584e', kerb: '#45423a', tree: '#0e2c18', trunk: '#33241a',
        wall: ['#6b5a3e', '#64413c', '#4e5c70'], wall2: ['#57482f', '#513531', '#404c5c'],
        roof: '#38242b', door: '#2c1c12', win: '#ffe9a0', box: '#25407c', cart: '#8f3535',
    },
}
