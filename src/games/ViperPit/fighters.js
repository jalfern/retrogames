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
        stance: { lean: 0.12, bobAmp: 0.022, bobHz: 2.8, dip: -0.06, head: 0.12, arms: [{ sh: -0.62, el: -1.95, z: 0.55 }, { sh: -0.28, el: -2.1, z: -0.5 }], legs: [{ hip: 0.16, kn: -0.22 }, { hip: -0.18, kn: -0.14 }] },
        intro: 'I DO NOT TALK BACK', win: 'NOTHING TO SEE', lose: 'YOU GET ANOTHER SHOT',
        cpuStyle: { zone: 0.18, jump: 0.3 },
        build: { h: 1.06, bulk: 0.9, hair: 'hood', gear: 'wrap' },
        color: { skin: 0xcf9a72, top: 0x3d3f4a, pants: 0x23252e, hair: 0x11131a, accent: 0x59e0c8 },
        walkMul: 1.14, jumpMul: 1.06, reach: 0.94,
        gait: { tempo: 12.5, stride: 0.52, bob: 0.018, armSwing: 0.24, toe: 0.14 },
        finish: 'SHADOW STITCH',
        specials: { qcf: { ex: true, super: true }, dp: { ex: true, super: true }, qcb: true, qcbf: true },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'special', startup: 7, active: 4, recovery: 16, dmg: 8, hitstun: 15, blockstun: 9, push: 0.1, box: [0.4, 0.95, 1.9, 1.55] } },
                { dmg: 11, active: 5 },
                { startup: 4, dmg: 15, active: 7, launch: 0.09 }),
            ...sp({ key: 'dp', move: { type: 'special', startup: 3, active: 7, recovery: 19, dmg: 9, hitstun: 18, blockstun: 11, push: 0.1, launch: 0.125, box: [0.2, 0.7, 1.4, 2.25] } },
                { dmg: 12, launch: 0.13 },
                { dmg: 17, launch: 0.14 }),
            qcbf: { type: 'special', startup: 6, active: 9, recovery: 24, dmg: 22, hitstun: 26, blockstun: 14, push: 0.22, launch: 0.13, finisher: true, finishAt: 30, beats: ['stitch', 'stitch', 'slam'], box: [0.3, 0.55, 2.0, 2.2] },
            qcb: { type: 'special', startup: 3, active: 4, recovery: 14, dmg: 8, hitstun: 16, blockstun: 9, push: 0.1, box: [0.25, 0.95, 1.6, 1.5] },
        },
    },
    {
        id: 'cinder', name: 'CINDER', tag: 'BRING THE HEAT', cpu: 'normal',
        stance: { lean: 0.0, bobAmp: 0.012, bobHz: 1.8, dip: -0.02, head: -0.05, arms: [{ sh: -0.3, el: -1.3, z: 0.35 }, { sh: -0.55, el: -2.15, z: -0.5 }], legs: [{ hip: 0.05, kn: -0.1 }, { hip: -0.16, kn: -0.2 }] },
        intro: 'YOU ASKED FOR HEAT', win: 'BURNT OUT', lose: 'STILL GOT A SPARK',
        cpuStyle: { zone: 0.55 },
        build: { h: 1.02, bulk: 0.95, hair: 'short', gear: 'jacket' },
        color: { skin: 0xb47a52, top: 0x7e2f22, pants: 0x2c2622, hair: 0x241612, accent: 0xff9a3c },
        reach: 1.0,
        gait: { tempo: 10.5, stride: 0.58, bob: 0.022, armSwing: 0.26, toe: 0.12 },
        finish: 'BONFIRE',
        specials: { qcf: { ex: true, super: true }, dp: { ex: true }, qcb: true, qcbf: true },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'special', startup: 11, active: 1, recovery: 21, dmg: 7, hitstun: 15, blockstun: 10, push: 0.12, projectile: { name: 'fire', speed: 0.19, dmg: 7, hitstun: 15, blockstun: 10 } } },
                { dmg: 9, projectile: { name: 'fire', speed: 0.25, dmg: 9, hitstun: 17 } },
                { startup: 8, dmg: 14, projectile: { name: 'fire', speed: 0.28, dmg: 14, hitstun: 22, ttl: 240, super: true } }),
            ...sp({ key: 'dp', move: { type: 'special', startup: 3, active: 7, recovery: 20, dmg: 9, hitstun: 18, blockstun: 11, push: 0.1, launch: 0.125, box: [0.22, 0.7, 1.45, 2.2] } },
                { dmg: 12, launch: 0.13 }, null),
            qcbf: { type: 'special', startup: 5, active: 9, recovery: 26, dmg: 22, hitstun: 24, blockstun: 13, push: 0.2, launch: 0.12, finisher: true, finishAt: 30, beats: ['charge', 'flare', 'blast'], box: [0.3, 0.5, 2.0, 2.1] },
            qcb: { type: 'special', startup: 5, active: 5, recovery: 16, dmg: 9, hitstun: 15, blockstun: 10, push: 0.12, box: [0.3, 0.6, 1.5, 1.2] },
        },
    },
    {
        id: 'vess', name: 'VESS', tag: 'UPSIDE THROUGH YOU', cpu: 'hard',
        stance: { lean: 0.07, bobAmp: 0.035, bobHz: 3.4, dip: 0.02, head: -0.1, arms: [{ sh: -0.42, el: -1.35, z: 0.4 }, { sh: -0.38, el: -1.45, z: -0.4 }], legs: [{ hip: 0.1, kn: -0.28 }, { hip: -0.12, kn: -0.24 }] },
        intro: 'CATCH ME IF YOU CAN', win: 'UPSIDE DOWN', lose: 'THAT ONE LANDED',
        cpuStyle: { zone: 0.22, jump: 0.5 },
        build: { h: 0.98, bulk: 0.85, hair: 'shaven', gear: 'wrap' },
        color: { skin: 0xe4c39b, top: 0x2f5d52, pants: 0x1f2a26, hair: 0x1a1410, accent: 0xb8ff5a },
        walkMul: 1.08, jumpMul: 1.24, reach: 0.96,
        gait: { tempo: 13.5, stride: 0.5, bob: 0.038, armSwing: 0.3, toe: 0.18 },
        finish: 'DRY LAND',
        specials: { qcf: { ex: true, super: true }, dp: { ex: true, super: true }, qcb: true, qcbf: true },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'special', startup: 9, active: 1, recovery: 18, dmg: 6, hitstun: 13, blockstun: 8, push: 0.08, projectile: { name: 'arc', speed: 0.22, y: 0.55, vy: 0.055, grav: true, dmg: 6, hitstun: 13, blockstun: 8 } } },
                { dmg: 8, projectile: { name: 'arc', speed: 0.27, y: 0.55, vy: 0.055, grav: true, dmg: 8 } },
                { dmg: 13, projectile: { name: 'arc', speed: 0.3, y: 0.55, vy: 0.055, grav: true, dmg: 13, hitstun: 20, super: true } }),
            ...sp({ key: 'dp', move: { type: 'special', startup: 4, active: 8, recovery: 17, dmg: 8, hitstun: 17, blockstun: 10, push: 0.1, launch: 0.135, box: [0.2, 0.6, 1.5, 2.3] } },
                { dmg: 11 },
                { dmg: 16, launch: 0.145 }),
            qcbf: { type: 'special', startup: 5, active: 10, recovery: 22, dmg: 21, hitstun: 24, blockstun: 13, push: 0.2, launch: 0.14, finisher: true, finishAt: 30, beats: ['grab', 'flip', 'slam'], box: [0.25, 0.45, 1.95, 2.35] },
            qcb: { type: 'special', startup: 3, active: 6, recovery: 17, dmg: 8, hitstun: 17, blockstun: 10, push: 0.1, launch: 0.11, box: [0.2, 0.7, 1.45, 1.9] },
        },
    },
    {
        id: 'riv', name: 'RIV', tag: 'LAST WORD STANDING', cpu: 'brutal',
        stance: { lean: 0.05, bobAmp: 0.015, bobHz: 2.2, dip: 0.0, head: 0.0, arms: [{ sh: -0.5, el: -1.7, z: 0.5 }, { sh: -0.35, el: -1.9, z: -0.45 }], legs: [{ hip: 0.05, kn: -0.12 }, { hip: -0.05, kn: -0.1 }] },
        intro: 'I END CONVERSATIONS', win: "LAST WORD'S MINE", lose: 'SAY IT AGAIN',
        cpuStyle: { zone: 0.4 },
        build: { h: 1.08, bulk: 1.02, hair: 'mohawk', gear: 'jacket' },
        color: { skin: 0xd69a6b, top: 0x44485a, pants: 0x1c1e26, hair: 0x8a2f3f, accent: 0xd8e04a },
        reach: 1.04,
        gait: { tempo: 11, stride: 0.6, bob: 0.02, armSwing: 0.22, toe: 0.12 },
        finish: 'NEON PURGE',
        specials: { qcf: { ex: true, super: true }, dp: { ex: true, super: true }, charge: { ex: true, super: true }, qcb: true, qcbf: true },
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
            qcb: { type: 'special', startup: 5, active: 5, recovery: 19, dmg: 11, hitstun: 19, blockstun: 12, push: 0.2, box: [0.3, 0.85, 1.9, 1.5] },
        },
    },
    {
        id: 'krax', name: 'KRAX', tag: 'SOLD BY THE KILO', cpu: 'insane',
        stance: { lean: 0.16, bobAmp: 0.028, bobHz: 1.6, dip: -0.04, head: 0.18, arms: [{ sh: -0.3, el: -1.15, z: 0.9 }, { sh: -0.2, el: -1.25, z: -0.9 }], legs: [{ hip: 0.24, kn: -0.3 }, { hip: -0.24, kn: -0.28 }] },
        intro: 'BIG BILL COMING', win: 'PAID IN FULL', lose: "THAT'LL BE EXTRA",
        cpuStyle: { zone: 0.05, jump: 0.04 },
        build: { h: 1.18, bulk: 1.4, hair: 'bald', gear: 'chain' },
        color: { skin: 0x9a6a44, top: 0x5a4632, pants: 0x33302b, hair: 0x141414, accent: 0xc0c8d0 },
        walkMul: 0.8, hp: 115, reach: 1.1,
        gait: { tempo: 8, stride: 0.72, bob: 0.03, armSwing: 0.16, toe: 0.08 },
        finish: 'SCRAP HEAP',
        specials: { qcf: { kick: true, ex: true, super: true }, charge: { ex: true, super: true }, qcb: true, qcbf: true },
        moves: {
            ...sp({ key: 'qcf', move: { type: 'throw', startup: 4, active: 3, recovery: 24, dmg: 17, hitstun: 36, push: 0.16, launch: 0.1, box: [0.4, 0.55, 1.8, 1.95] } },
                { dmg: 21 },
                { dmg: 28, launch: 0.12 }),
            ...sp({ key: 'charge', move: { type: 'special', startup: 6, active: 4, recovery: 22, dmg: 13, hitstun: 20, blockstun: 12, push: 0.2, launch: 0.09, box: [0.4, 0.7, 2.0, 1.75] } },
                { dmg: 16 }, { dmg: 22 }),
            qcbf: { type: 'throw', startup: 4, active: 4, recovery: 28, dmg: 26, hitstun: 40, push: 0.24, launch: 0.12, finisher: true, finishAt: 30, beats: ['grab', 'strike', 'slam'], box: [0.4, 0.5, 1.9, 2.0] },
            qcb: { type: 'special', startup: 5, active: 6, recovery: 22, dmg: 12, hitstun: 24, blockstun: 12, push: 0.2, launch: 0.09, box: [0.35, 0.7, 1.85, 1.7] },
        },
    },
]

export const ROSTER = defs.map((d) => ({ ...d, moves: fighterMoves(d) }))
export const BY_ID = Object.fromEntries(ROSTER.map((d) => [d.id, d]))

export const LADDER = ['nyx', 'cinder', 'vess', 'riv', 'krax']

// #1106 — round intro + K.O. quote selection, kept pure so viperpitcheck (Part A,
// plain Node) can pin them: the right fighter says the right line, and a stripped
// quote table is caught. `m` is a fighting-core match; the round winner is the
// fighter whose st is 'win' (set by koRound, cleared by nextRound), or m.winner
// (0/1) once the match is done.
export function introQuotes(a, b) {
    return { a: `${a.name} — ${a.intro}`, b: `${b.name} — ${b.intro}` }
}
export function koQuotes(m) {
    const wIdx = (m.phase === 'done' && m.winner != null)
        ? m.winner
        : m.fighters.findIndex((f) => f.st === 'win')
    if (wIdx !== 0 && wIdx !== 1) return null
    const wd = m.fighters[wIdx].def
    const ld = m.fighters[wIdx === 0 ? 1 : 0].def
    if (m.phase === 'done') return { a: `${wd.name} — ${wd.win}`, b: `${ld.name} — ${ld.lose}`, match: true }
    return { a: `${wd.name} — ${wd.win}`, b: null }
}
