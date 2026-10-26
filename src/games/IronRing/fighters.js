// IRON RING roster (#1095) — six original fighters as pure data on top of the
// shared fighting core. Each fighter: silhouette (build + hair), palette, stats
// multipliers, reach, and a specials table keyed to the engine's motion names
// (qcf / qcfx / qcf_S, dp / dpx / dp_S, rdp…, charge) — ex costs 50 meter,
// super needs a full bar and auto-upgrades the same motion.

import { fighterMoves } from '../../engine/fighting.js'

function sp(base, ex, sup) {
    const out = { [base.key]: base.move }
    if (ex) out[`${base.key}x`] = { ...base.move, ...ex }
    if (sup) out[`${base.key}_S`] = { ...base.move, ...sup, super: true }
    return out
}

const defs = [
    {
        id: 'kade', name: 'KADE', tag: 'THE HEART OF THE RING', cpu: 'insane',
        cpuStyle: { zone: 0.4 },
        build: { h: 1.0, bulk: 1.0, hair: 'headband' },
        color: { skin: 0xd9a066, top: 0x2f8f4e, pants: 0xe8e2cf, hair: 0x2b2118, accent: 0xd83a2f },
        specials: { qcf: { ex: true, super: true }, dp: { ex: true, super: true } },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'special', startup: 11, active: 1, recovery: 22, dmg: 7, hitstun: 16, blockstun: 10, push: 0.12, projectile: { name: 'ember', speed: 0.16, dmg: 7, hitstun: 16, blockstun: 10 } } },
                { dmg: 9, projectile: { name: 'ember', speed: 0.22, dmg: 9, hitstun: 18, blockstun: 10 } },
                { startup: 8, dmg: 16, projectile: { name: 'ember', speed: 0.26, dmg: 16, hitstun: 24, blockstun: 14, ttl: 220, super: true } }),
            ...sp({ key: 'dp', move: { type: 'special', startup: 3, active: 8, recovery: 20, dmg: 10, hitstun: 20, blockstun: 12, push: 0.1, launch: 0.11, box: [0.25, 0.7, 1.45, 2.25] } },
                { dmg: 13, launch: 0.12 },
                { startup: 2, dmg: 18, launch: 0.135, super: true }),
        },
    },
    {
        id: 'vexa', name: 'VEXA', tag: 'TWICE THE STING', cpu: 'easy',
        cpuStyle: { zone: 0.2, jump: 0.3 },
        build: { h: 0.92, bulk: 0.85, hair: 'ponytail' },
        color: { skin: 0xe0b088, top: 0x2bb8d6, pants: 0x1b2f4a, hair: 0xd8c86a, accent: 0xffffff },
        walkMul: 1.18, jumpMul: 1.08, reach: 0.92,
        specials: { qcf: { ex: true, super: true }, dp: { ex: true, super: true } },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'special', startup: 10, active: 1, recovery: 20, dmg: 6, hitstun: 14, blockstun: 9, push: 0.1, projectile: { name: 'sting', speed: 0.24, dmg: 6, hitstun: 14, blockstun: 9 } } },
                { dmg: 8, projectile: { name: 'sting', speed: 0.3, dmg: 8, hitstun: 16 } },
                { startup: 7, dmg: 14, projectile: { name: 'sting', speed: 0.34, dmg: 14, hitstun: 22, super: true } }),
            ...sp({ key: 'dp', move: { type: 'special', startup: 3, active: 7, recovery: 18, dmg: 8, hitstun: 18, push: 0.1, launch: 0.1, box: [0.2, 0.65, 1.35, 2.15] } },
                { dmg: 11 },
                { dmg: 16, launch: 0.12 }),
        },
    },
    {
        id: 'brakk', name: 'BRAKK', tag: 'THE WALL THAT HUGS BACK', cpu: 'hard',
        cpuStyle: { zone: 0.05, jump: 0.05 },
        build: { h: 1.12, bulk: 1.35, hair: 'bald' },
        color: { skin: 0xb87a4a, top: 0x7a4b21, pants: 0x3c342b, hair: 0x141414, accent: 0xc9a227 },
        walkMul: 0.82, hp: 115, reach: 1.08,
        specials: { qcf: { kick: true, ex: true, super: true }, charge: { ex: true, super: true } },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'throw', startup: 4, active: 3, recovery: 24, dmg: 16, hitstun: 34, push: 0.16, launch: 0.1, box: [0.4, 0.55, 1.75, 1.9] } },
                { dmg: 20 },
                { dmg: 28, launch: 0.12 }),
            ...sp({ key: 'charge', move: { type: 'special', startup: 6, active: 4, recovery: 22, dmg: 13, hitstun: 20, blockstun: 12, push: 0.2, launch: 0.07, box: [0.4, 0.7, 1.9, 1.7] } },
                { dmg: 16 }, { dmg: 22 }),
        },
    },
    {
        id: 'sable', name: 'SABLE', tag: 'KEEPS HER DISTANCE', cpu: 'brutal',
        cpuStyle: { zone: 0.6 },
        build: { h: 1.02, bulk: 0.9, hair: 'bun' },
        color: { skin: 0x8d5a3b, top: 0x5a3d8f, pants: 0x2a2440, hair: 0x0e0e12, accent: 0x9f7aff },
        specials: { qcf: { ex: true, super: true }, charge: { ex: true, super: true } },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'special', startup: 13, active: 1, recovery: 24, dmg: 8, hitstun: 16, blockstun: 11, push: 0.14, projectile: { name: 'hex', speed: 0.13, dmg: 8, hitstun: 16, blockstun: 11, ttl: 200 } } },
                { dmg: 10, projectile: { name: 'hex', speed: 0.17, dmg: 10, ttl: 240 } },
                { dmg: 15, projectile: { name: 'hex', speed: 0.2, dmg: 15, hitstun: 22, ttl: 280, super: true } }),
            ...sp({ key: 'charge', move: { type: 'special', startup: 7, active: 5, recovery: 24, dmg: 12, hitstun: 20, blockstun: 12, push: 0.18, launch: 0.09, box: [0.35, 0.6, 2.0, 1.6] } },
                { dmg: 15 }, { dmg: 20 }),
        },
    },
    {
        id: 'hyde', name: 'HYDE', tag: 'NO AIR BETWEEN US', cpu: 'normal',
        cpuStyle: { zone: 0.15, jump: 0.25 },
        build: { h: 1.04, bulk: 1.05, hair: 'mohawk' },
        color: { skin: 0xcfa07a, top: 0xb03030, pants: 0x22222a, hair: 0xa03434, accent: 0xf0d264 },
        walkMul: 1.1,
        specials: { qcf: { ex: true, super: true }, dp: { ex: true, super: true } },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'special', startup: 6, active: 5, recovery: 18, dmg: 9, hitstun: 16, blockstun: 10, push: 0.1, box: [0.45, 0.9, 1.85, 1.6] } },
                { dmg: 12, active: 6 },
                { startup: 4, dmg: 17, active: 7, launch: 0.09 }),
            ...sp({ key: 'dp', move: { type: 'special', startup: 3, active: 7, recovery: 19, dmg: 9, hitstun: 19, push: 0.1, launch: 0.1, box: [0.2, 0.7, 1.4, 2.2] } },
                { dmg: 12 }, { dmg: 17 }),
        },
    },
    {
        id: 'tessa', name: 'TESSA', tag: 'GRAVITY IS A SUGGESTION', cpu: 'brutal',
        cpuStyle: { zone: 0.25, jump: 0.5 },
        build: { h: 0.96, bulk: 0.88, hair: 'braid' },
        color: { skin: 0xe8c09a, top: 0xe07a2a, pants: 0x2f4f3e, hair: 0x6a3a1a, accent: 0x7ee08a },
        walkMul: 1.05, jumpMul: 1.22, reach: 0.96,
        specials: { qcf: { ex: true, super: true }, dp: { ex: true, super: true } },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'special', startup: 10, active: 1, recovery: 19, dmg: 6, hitstun: 14, blockstun: 9, push: 0.1, projectile: { name: 'seed', speed: 0.2, dmg: 6, hitstun: 14 } } },
                { dmg: 8, projectile: { name: 'seed', speed: 0.26, dmg: 8 } },
                { dmg: 13, projectile: { name: 'seed', speed: 0.3, dmg: 13, hitstun: 20, super: true } }),
            ...sp({ key: 'dp', move: { type: 'special', startup: 4, active: 9, recovery: 16, dmg: 9, hitstun: 18, push: 0.1, launch: 0.06, box: [0.2, 0.55, 1.5, 2.05] } },
                { dmg: 12 }, { dmg: 16 }),
        },
    },
]

export const ROSTER = defs.map((d) => ({ ...d, moves: fighterMoves(d) }))
export const BY_ID = Object.fromEntries(ROSTER.map((d) => [d.id, d]))

// arcade ladder: order + difficulty (the shared core reads def.cpu).
export const LADDER = ['vexa', 'tessa', 'hyde', 'sable', 'brakk', 'kade']
