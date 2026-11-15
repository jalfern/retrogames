// TEN-DEEP — mobview (#2318): the corridor billboards.
//
// The original showed its monsters in the 3D view before combat; ours kept
// them as hidden ambush tiles (README honest gap). The shared renderer
// (#1129) already draws lit, depth-occluded billboards with a two-frame
// shamble — this module is the derivation: the LIVE sim state in, a
// setSprites list out. Pure and RNG-free so tendeepcheck can re-derive every
// sprite in Node — and so sight never lies about the trigger cell: every
// billboard stands inside its own ambush tile (offsets capped), shambling in
// place. Stepping onto a tile you can see occupied fires its named group,
// exactly the stage-1 rule; nothing here moves sim state.

import { SIZE, MOBS } from './dungeon.js'

// Shape + colour per bestiary member onto the three-tile monster atlas
// (8 rat, 9 skeleton, 10 goblyn) — the shapes are the demo's, the tints and
// sizes make the bestiary readable: the Bog Troll walks wide and mossy, the
// Pale Wraith a tall pale drift, the Deep Wyrm a long low green.
export const MOB_LOOK = {
    RAT:      { mat: 8,  tint: [0.86, 0.72, 0.60], w: 0.46, h: 0.34 },
    SNAKE:    { mat: 8,  tint: [0.52, 0.80, 0.42], w: 0.52, h: 0.24 },
    GOBLIN:   { mat: 10, tint: [0.62, 0.84, 0.48], w: 0.52, h: 0.66 },
    SKELET:   { mat: 9,  tint: [1.00, 0.98, 0.88], w: 0.54, h: 0.74 },
    WRAITH:   { mat: 9,  tint: [0.72, 0.84, 1.00], w: 0.52, h: 0.88 },
    GHOUL:    { mat: 10, tint: [0.74, 0.66, 0.88], w: 0.56, h: 0.72 },
    TROLL:    { mat: 10, tint: [0.48, 0.78, 0.40], w: 0.74, h: 0.82 },
    MINOTAUR: { mat: 10, tint: [0.90, 0.56, 0.32], w: 0.78, h: 0.84 },
    WYRM:     { mat: 8,  tint: [0.40, 0.72, 0.52], w: 0.80, h: 0.40 },
    KING:     { mat: 9,  tint: [1.00, 0.80, 0.34], w: 0.60, h: 0.92 },
}

// Deterministic FNV-1a over the mob's identity — the same mob in the same
// den shuffles the same way every run (the harness can trust the pixels).
const hash = (s) => {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01001933) }
    return h >>> 0
}

// Slot layout inside a tile: the file stands the pack up to three abreast,
// back rows a hair higher; every base lands within OFFSET_CAP of the cell
// centre so the monster you SEE stands on the tile that takes your step.
const OFFSET_CAP = 0.30
export function packSlots(n) {
    const out = []
    for (let i = 0; i < n; i++) {
        const abreast = Math.min(n, 3)
        const col = i % abreast
        const row = Math.floor(i / abreast)
        out.push({
            ox: (col - (abreast - 1) / 2) * 0.30,
            oy: -0.10 - row * 0.26,
            back: row,
        })
    }
    return out
}

// One shamble beat: the renderer picks frames from `anim` (floor(anim/300)&1)
// and sways with it; seed each mob's phase so the pack never marches in step.
const MOB_PHASE = (key, floor, id, i) => (hash(`${key}:${floor}:${id}:${i}`) % 300)

// The live sprite list. `st` is the game's run state; `ms` is the shell's
// presentation clock (never the sim tick — the shamble must not freeze the
// proof). Only untriggered ambushes stand; the throne's wardens watch their
// beacon. Returns [] outside the dungeon so town/combat screens are blank.
export function mobSprites(st, ms = 0) {
    if (!st || st.mode !== 'map' || !st.map) return []
    const out = []
    const put = (floor, id, keys, tx, ty) => {
        const slots = packSlots(keys.length)
        keys.forEach((k, i) => {
            const look = MOB_LOOK[k]
            if (!look) return
            const s = slots[i]
            const jitter = ((hash(`${k}:${floor}:${id}:${i}:j`) % 41) - 20) / 1000   // ±0.020
            out.push({
                x: tx + Math.max(-OFFSET_CAP, Math.min(OFFSET_CAP, s.ox + jitter)),
                y: ty + Math.max(-OFFSET_CAP, Math.min(OFFSET_CAP, s.oy + jitter)),
                z: 0,
                mat: look.mat,
                tint: look.tint,
                w: look.w,
                h: look.h * (1 - s.back * 0.12),
                anim: ms + MOB_PHASE(k, floor, id, i),
            })
        })
    }
    for (const a of st.map.ambushes) {
        if (!st.ambushes.has(a.y * SIZE + a.x)) continue   // its group is spent
        put(st.floor, a.id, a.group, a.x + 0.5, a.y + 0.5)
    }
    if (st.map.throne) put(st.floor, 99, ['WYRM', 'KING', 'WYRM'], st.map.throne.x + 0.5, st.map.throne.y + 0.5)
    return out
}
