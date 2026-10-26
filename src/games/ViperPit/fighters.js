// VIPER PIT roster (#1096) — five original fighters as pure data on the shared
// fighting core. Grittier idiom than IRON RING: every fighter carries a rising
// uppercut (dp) that LAUNCHES, and a signature finishing move on the qcbf
// motion (down-back-down-forward + punch at a full bar). A finisher that drops
// an already-wounded opponent (<= finishAt HP) ends the round in style.
// Meter: >=50 = EX variant, 100 auto-super of the same motion; the finisher
// consumes the whole bar.

import { fighterMoves } from '../../engine/fighting.js'

function sp(base, ex, sup) {
    const out = { [base.key]: base.move }
    if (ex) out[`${base.key}x`] = { ...base.move, ...ex }
    if (sup) out[`${base.key}_S`] = { ...base.move, ...sup, super: true }
    return out
}

const defs = [
    {
        id: 'nyx', name: 'NYX', tag: 'QUIET ENTRY', cpu: 'easy',
        cpuStyle: { zone: 0.18, jump: 0.3 },
        build: { h: 1.06, bulk: 0.9, hair: 'hood', gear: 'wrap' },
        color: { skin: 0xcf9a72, top: 0x3d3f4a, pants: 0x23252e, hair: 0x11131a, accent: 0x59e0c8 },
        walkMul: 1.14, jumpMul: 1.06, reach: 0.94,
        finish: 'SHADOW STITCH',
        specials: { qcf: { ex: true, super: true }, dp: { ex: true, super: true }, qcbf: true },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'special', startup: 7, active: 4, recovery: 16, dmg: 8, hitstun: 15, blockstun: 9, push: 0.1, box: [0.4, 0.95, 1.9, 1.55] } },
                { dmg: 11, active: 5 },
                { startup: 4, dmg: 15, active: 7, launch: 0.09 }),
            ...sp({ key: 'dp', move: { type: 'special', startup: 3, active: 7, recovery: 19, dmg: 9, hitstun: 18, blockstun: 11, push: 0.1, launch: 0.125, box: [0.2, 0.7, 1.4, 2.25] } },
                { dmg: 12, launch: 0.13 },
                { dmg: 17, launch: 0.14 }),
            qcbf: { type: 'special', startup: 6, active: 9, recovery: 24, dmg: 22, hitstun: 26, blockstun: 14, push: 0.22, launch: 0.13, finisher: true, finishAt: 30, beats: ['stitch', 'stitch', 'slam'], box: [0.3, 0.55, 2.0, 2.2] },
        },
    },
    {
        id: 'cinder', name: 'CINDER', tag: 'BRING THE HEAT', cpu: 'normal',
        cpuStyle: { zone: 0.55 },
        build: { h: 1.02, bulk: 0.95, hair: 'short', gear: 'jacket' },
        color: { skin: 0xb47a52, top: 0x7e2f22, pants: 0x2c2622, hair: 0x241612, accent: 0xff9a3c },
        reach: 1.0,
        finish: 'BONFIRE',
        specials: { qcf: { ex: true, super: true }, dp: { ex: true }, qcbf: true },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'special', startup: 11, active: 1, recovery: 21, dmg: 7, hitstun: 15, blockstun: 10, push: 0.12, projectile: { name: 'fire', speed: 0.19, dmg: 7, hitstun: 15, blockstun: 10 } } },
                { dmg: 9, projectile: { name: 'fire', speed: 0.25, dmg: 9, hitstun: 17 } },
                { startup: 8, dmg: 14, projectile: { name: 'fire', speed: 0.28, dmg: 14, hitstun: 22, ttl: 240, super: true } }),
            ...sp({ key: 'dp', move: { type: 'special', startup: 3, active: 7, recovery: 20, dmg: 9, hitstun: 18, blockstun: 11, push: 0.1, launch: 0.125, box: [0.22, 0.7, 1.45, 2.2] } },
                { dmg: 12, launch: 0.13 }, null),
            qcbf: { type: 'special', startup: 5, active: 9, recovery: 26, dmg: 22, hitstun: 24, blockstun: 13, push: 0.2, launch: 0.12, finisher: true, finishAt: 30, beats: ['charge', 'flare', 'blast'], box: [0.3, 0.5, 2.0, 2.1] },
        },
    },
    {
        id: 'vess', name: 'VESS', tag: 'UPSIDE THROUGH YOU', cpu: 'hard',
        cpuStyle: { zone: 0.22, jump: 0.5 },
        build: { h: 0.98, bulk: 0.85, hair: 'shaven', gear: 'wrap' },
        color: { skin: 0xe4c39b, top: 0x2f5d52, pants: 0x1f2a26, hair: 0x1a1410, accent: 0xb8ff5a },
        walkMul: 1.08, jumpMul: 1.24, reach: 0.96,
        finish: 'DRY LAND',
        specials: { qcf: { ex: true, super: true }, dp: { ex: true, super: true }, qcbf: true },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'special', startup: 9, active: 1, recovery: 18, dmg: 6, hitstun: 13, blockstun: 8, push: 0.08, projectile: { name: 'arc', speed: 0.22, y: 0.55, vy: 0.055, grav: true, dmg: 6, hitstun: 13, blockstun: 8 } } },
                { dmg: 8, projectile: { name: 'arc', speed: 0.27, y: 0.55, vy: 0.055, grav: true, dmg: 8 } },
                { dmg: 13, projectile: { name: 'arc', speed: 0.3, y: 0.55, vy: 0.055, grav: true, dmg: 13, hitstun: 20, super: true } }),
            ...sp({ key: 'dp', move: { type: 'special', startup: 4, active: 8, recovery: 17, dmg: 8, hitstun: 17, blockstun: 10, push: 0.1, launch: 0.135, box: [0.2, 0.6, 1.5, 2.3] } },
                { dmg: 11 },
                { dmg: 16, launch: 0.145 }),
            qcbf: { type: 'special', startup: 5, active: 10, recovery: 22, dmg: 21, hitstun: 24, blockstun: 13, push: 0.2, launch: 0.14, finisher: true, finishAt: 30, beats: ['grab', 'flip', 'slam'], box: [0.25, 0.45, 1.95, 2.35] },
        },
    },
    {
        id: 'riv', name: 'RIV', tag: 'LAST WORD STANDING', cpu: 'brutal',
        cpuStyle: { zone: 0.4 },
        build: { h: 1.08, bulk: 1.02, hair: 'mohawk', gear: 'jacket' },
        color: { skin: 0xd69a6b, top: 0x44485a, pants: 0x1c1e26, hair: 0x8a2f3f, accent: 0xd8e04a },
        reach: 1.04,
        finish: 'NEON PURGE',
        specials: { qcf: { ex: true, super: true }, dp: { ex: true, super: true }, charge: { ex: true, super: true }, qcbf: true },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'special', startup: 10, active: 1, recovery: 20, dmg: 7, hitstun: 15, blockstun: 9, push: 0.12, projectile: { name: 'spit', speed: 0.21, dmg: 7, hitstun: 15, blockstun: 9 } } },
                { dmg: 9, projectile: { name: 'spit', speed: 0.27, dmg: 9 } },
                { startup: 7, dmg: 14, projectile: { name: 'spit', speed: 0.31, dmg: 14, hitstun: 21, super: true } }),
            ...sp({ key: 'dp', move: { type: 'special', startup: 3, active: 8, recovery: 19, dmg: 10, hitstun: 19, blockstun: 12, push: 0.1, launch: 0.13, box: [0.24, 0.7, 1.5, 2.3] } },
                { dmg: 13, launch: 0.135 },
                { dmg: 18, launch: 0.145 }),
            ...sp({ key: 'charge', move: { type: 'special', startup: 7, active: 4, recovery: 21, dmg: 12, hitstun: 19, blockstun: 12, push: 0.18, launch: 0.08, box: [0.4, 0.75, 1.95, 1.7] } },
                { dmg: 15 }, { dmg: 21 }),
            qcbf: { type: 'special', startup: 6, active: 10, recovery: 24, dmg: 24, hitstun: 26, blockstun: 14, push: 0.24, launch: 0.135, finisher: true, finishAt: 30, beats: ['charge', 'surge', 'blast'], box: [0.3, 0.5, 2.05, 2.25] },
        },
    },
    {
        id: 'krax', name: 'KRAX', tag: 'SOLD BY THE KILO', cpu: 'insane',
        cpuStyle: { zone: 0.05, jump: 0.04 },
        build: { h: 1.18, bulk: 1.4, hair: 'bald', gear: 'chain' },
        color: { skin: 0x9a6a44, top: 0x5a4632, pants: 0x33302b, hair: 0x141414, accent: 0xc0c8d0 },
        walkMul: 0.8, hp: 115, reach: 1.1,
        finish: 'SCRAP HEAP',
        specials: { qcf: { kick: true, ex: true, super: true }, charge: { ex: true, super: true }, qcbf: true },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'throw', startup: 4, active: 3, recovery: 24, dmg: 17, hitstun: 36, push: 0.16, launch: 0.1, box: [0.4, 0.55, 1.8, 1.95] } },
                { dmg: 21 },
                { dmg: 28, launch: 0.12 }),
            ...sp({ key: 'charge', move: { type: 'special', startup: 6, active: 4, recovery: 22, dmg: 13, hitstun: 20, blockstun: 12, push: 0.2, launch: 0.09, box: [0.4, 0.7, 2.0, 1.75] } },
                { dmg: 16 }, { dmg: 22 }),
            qcbf: { type: 'throw', startup: 4, active: 4, recovery: 28, dmg: 26, hitstun: 40, push: 0.24, launch: 0.12, finisher: true, finishAt: 30, beats: ['grab', 'strike', 'slam'], box: [0.4, 0.5, 1.9, 2.0] },
        },
    },
]

export const ROSTER = defs.map((d) => ({ ...d, moves: fighterMoves(d) }))
export const BY_ID = Object.fromEntries(ROSTER.map((d) => [d.id, d]))

export const LADDER = ['nyx', 'cinder', 'vess', 'riv', 'krax']
