// BRITANNIA — coastal swell (#1135 polish): the sea is never painted flat.
// A plane of swells rides west-to-east over every ocean tile — the same wind
// the weather fronts drift on — and foam gathers along the edges where land
// holds the sea back. The foam breaks into painted speckles (the ocean-demo
// lee-face dissolve technique, shrunk to tile scale). Pure math + hashes:
// same tile + tick + seed, same crests — the sim and its hashes are untouched.

import { hash2, TILE } from './tiles.js'
import { isSea } from './britmap.js'
import { WX, WX_EPOCH, weatherAt } from './weather.js'

export const SWELL_TILE = 24   // a crest advances one tile every 24 ticks (~1.3 px/tick)
export const SWELL_PH = 0.5    // one crest per 2 tiles
export const PH_T = -SWELL_PH / SWELL_TILE // phase falls as t rises at fixed x => crests run EAST
const PH_Y = 0.31              // wavefronts tilt slightly, so crests are not screen-perfect lines

// soft crest band in [0,1] for sea tile (tx,ty) at tick t.
// The exact value at (tx, ty, t) reappears at (tx+k, ty, t+k*SWELL_TILE):
// the pattern rides east without changing shape.
export function crest(tx, ty, t) {
    const u = tx * SWELL_PH + ty * PH_Y + t * PH_T
    const f = u - Math.floor(u)
    const c = Math.cos(f * Math.PI * 2) * 0.5 + 0.5
    return Math.max(0, c - 0.55) / 0.45
}

// where within the tile the crest line lies (6..26 px): per-tile jitter keeps
// neighbouring tiles from painting their crests in lockstep.
export function crestLane(tx, ty, seed = 0) {
    return 6 + hash2(tx, ty, seed ^ 0x5e3) * 20
}

// foam strength for a sea tile: open ocean never foams; shore foam is always
// there and SWELLS (0.35..1) as each crest passes.
export function foam(tx, ty, coast, t, seed = 0) {
    if (!coast) return 0

    const j = hash2(tx, ty, seed | 1)
    return 0.35 + 0.65 * crest(tx, ty, t) * (0.55 + 0.45 * j)
}

// which tile edges have land: 'n','s','e','w' (same wrap-free sampling the
// renderer uses for its coast sparkles).
export function landSides(tx, ty, world) {
    const out = []
    if (!isSea(world.get(tx, ty - 1))) out.push('n')
    if (!isSea(world.get(tx, ty + 1))) out.push('s')
    if (!isSea(world.get(tx - 1, ty))) out.push('w')
    if (!isSea(world.get(tx + 1, ty))) out.push('e')
    return out
}

// foam speckles hugging one land edge, tile-local px. The foam line is not a
// solid stroke: it breaks into blobs of seeded size whose density tracks the
// swell strength (ocean.html #462: crest foam reads as painted blobs).
export function foamPatches(tx, ty, side, t, seed = 0, strength = 1) {
    if (strength <= 0) return []
    const s2 = side.charCodeAt(0)
    const out = []
    const n = 4 + Math.floor(hash2(tx, ty, seed ^ 0x7d) * 5)
    const swell = 0.5 + 0.5 * strength
    for (let i = 0; i < n; i++) {
        const r1 = hash2(tx * 7 + i, ty * 13 + i, seed ^ s2)
        const r2 = hash2(ty * 17 + i, tx * 3 + i, seed ^ (s2 + 0xab))
        let x, y
        if (side === 'n') { x = 2 + r1 * 28; y = r2 * 12 }
        else if (side === 's') { x = 2 + r1 * 28; y = 20 + r2 * 12 }
        else if (side === 'w') { x = r2 * 12; y = 2 + r1 * 28 }
        else { x = 20 + r2 * 12; y = 2 + r1 * 28 }
        out.push({ x, y, sz: 1.4 + r1 * 2.2 * swell, a: Math.min(1, strength * (0.45 + 0.5 * r2)) })
    }
    return out
}

// rain on the sea (#1135): precipitation over open water used to add nothing
// beyond the screen tint — rain on the sea is dimples: seeded rings that
// open and die one drop at a time, more of them the wetter the sky. Snow is
// muted: fewer, gentler strikes. Intensity comes from weatherAt, so dimples
// sit exactly where the cell is raining/snowing/storming — a clear sea gets
// none, and a storm sea gets the most. Pure + deterministic like the swells
// they ride.
export const SPLAT = { rain: 0.55, snow: 0.35, storm: 1 }

export function splatIntensity(wx) {
    if (wx === WX.RAIN) return SPLAT.rain
    if (wx === WX.SNOW) return SPLAT.snow
    if (wx === WX.STORM) return SPLAT.storm
    return 0
}

// dimples on a wet sea tile, tile-local px. Each dimple has a seeded period
// (22..42 ticks): its ring opens (r grows), fades and dies, and a new one
// takes its place — the surface is struck, never decorated with static dots.
// `o` marks the tick a ring OPENS (ph === 0): the drop lands exactly there,
// so the splash voice (#1829 item 3) and the painted ring fire from ONE truth.
export function dimples(tx, ty, intensity, t, seed = 0) {
    if (intensity <= 0) return []
    const n = 2 + Math.floor(intensity * 5)
    const out = []
    for (let i = 0; i < n; i++) {
        const h1 = hash2(tx * 11 + i, ty * 23 + i, seed ^ 0xa17)
        const h2 = hash2(ty * 29 + i, tx * 7 + i, seed ^ 0x3c5)
        const per = 22 + Math.floor(h1 * 20)
        const ph = (((t + Math.floor(h2 * per)) % per) / per)
        out.push({ x: 3 + h1 * 24, y: 3 + h2 * 24, r: 0.8 + ph * 2.6, a: (1 - ph) * intensity * 0.5, o: ph === 0 })
    }
    return out
}

// how many dimple rings OPEN on this tile this tick — the count of drops that
// strike the water right now. Pure derivation from dimples (same hashes), so
// the voice can never drift from what the painter draws.
export function splashStrikes(tx, ty, intensity, t, seed = 0) {
    let k = 0
    for (const d of dimples(tx, ty, intensity, t, seed)) if (d.o) k++
    return k
}

// min ticks between splash voices: one ring opening is a tick; seven rings
// opening at once is still one tick. A storm shatters, but never machine-guns.
export const SPLAT_GAP = 8

// ---- rain winds the swell (#1822) --------------------------------------
// A front that passed leaves the sea it whipped still heaving. seaRough
// samples the sky over this tile at the epoch when it arrived and the three
// behind: whatever the drift speed (#1853 makes that 0..3 regions per epoch),
// reading weatherAt at (t - d*WX_EPOCH) reads exactly the sky that stood over
// this tile d epochs ago — the wind memory is the trail of fronts that moved
// off it. Weights halve per epoch back (1 / 0.5 / 0.24 / 0.11), clamped <=1:
// a storm now is a full sea, a storm one epoch gone is still half up, and a
// clear-for-four sea is bit-exactly the calm field today's gates prove.
// Pure derivation from weatherAt — same tile + tick + seed, same state; the
// drift field itself is untouched (this is how the sea remembers the wind).
export const ROUGH_MEMORY = [1, 0.5, 0.24, 0.11]

export function seaRough(tx, ty, t, seed = 0, terrainAt = null) {
    let r = 0
    for (let d = 0; d < ROUGH_MEMORY.length; d++) {
        r += splatIntensity(weatherAt(tx, ty, t - d * WX_EPOCH, seed, terrainAt)) * ROUGH_MEMORY[d]
    }
    return Math.min(1, r)
}

// wet skies raise the crest: stroke alpha/width scale by crestGain, shore
// foam by foamGain. Both are exactly 1 on a calm sea, so the pre-#1822
// painting survives unchanged wherever no front has passed.
export const CREST_GAIN = 0.6
export const FOAM_GAIN = 0.45
export const crestGain = (rough) => 1 + CREST_GAIN * rough
export const foamGain = (rough) => 1 + FOAM_GAIN * rough

// ---- The sea reads aboard (#1829 item 1) --------------------------------
// Rough water slows the ship. The sim stays honest: the cooldown for the
// next sea tile = the calm cadence plus drag scaled by the wind-memory the
// tile the ship just crossed carries (seaRough). Calm (rough 0) is
// bit-exactly the old cadence — every pre-existing voyage replay survives;
// the roughest water adds SAIL_DRAG ticks. Monotone, integer, clamped,
// pure function of seaRough, so the hash law and every replay survive.
// Hazard (storms damaging hulls) stays an honest gap: this stage makes the
// sea FELT, not fatal — the pilgrimage stays winnable in any weather.
export const SAIL_DRAG = 4
export function shipCd(rough, calmCd) {
    return calmCd + Math.round(SAIL_DRAG * Math.max(0, Math.min(1, rough)))
}

// A heaving sea slaps the hull. surfVoice is what that roar sounds like at
// a given roughness — null below SURF_FLOOR, so calm water aboard stays as
// quiet as it was before this rule existed. surfDue says WHEN: the gaps
// close as the sea heavies, with an 8-tick floor (the SPLAT_GAP law again —
// a storm rattles, never machine-guns). Pure rough+tick, so the voice can
// never drift from the swell the painter draws.
export const SURF_FLOOR = 0.35
export function surfVoice(rough) {
    if (rough < SURF_FLOOR) return null
    return { dur: 0.22 + 0.3 * rough, vol: 0.05 + 0.06 * rough }
}
export function surfDue(rough, tick) {
    const v = surfVoice(rough)
    return v && tick % Math.max(8, Math.round(28 - 20 * rough)) === 0 ? v : null
}
