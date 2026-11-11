// BRITANNIA — the hull (#1829 item 1, hazard half): storms endanger the ship.
// The swell made the sea FELT (#1822) and the drag made it SLOW (#1829-drag);
// this closes the loop: a ship crossing water under a STORM sky takes strain
// per tile — the same sky the lightning and the veil and the surf roar already
// speak for, read through the same weatherAt the painter asks, so the hazard
// can never drift from what the player sees, and every replay reproduces it.
// Ashore the carpenters make her sound again. When the strain finishes her,
// she founders — and the sea gives the pilgrim back: the nearest shore is the
// deterministic BFS below, so the hazard is real but NEVER fatal and NEVER
// winnable-breaking (the pilgrimage survives any weather). Pure + deterministic
// like the rest of Britannia: same inputs, same verdict.
//
// Why the SKY and not just the swell: rain leaves the sea heaving for epochs
// after it moves off (the #1822 memory), and a heaving sea under a blue sky is
// the most beautiful thing in this game — it must be slow, not deadly. In the
// original (Ultima IV, 1985) it is the storm itself that damages shipping;
// so strain rides the storm overhead, scaled by the water's wind-memory.

import { WX } from './weather.js'
import { isSea, MAPW } from './britmap.js'

// Carrying capacity in strain points. Sized by the drive corridor (the heaviest
// 15-tile crossing under a clear-ish sky loses at most a few points) and by
// the human crossing: ~24 tiles of straight storm founders her — a race
// against the sky, announced by the groaning planks and the HUD's colour.
export const HULL_MAX = 12

// One tile crossed under a storm: STRAIN_STORM at a full sea, easing with any
// slack the wind-memory gives (rough is 1.0 under a living storm — the memory
// only ever lags behind, so this is the ceiling of the law, not a free pass).
// Rain, snow, clear: zero — the pre-hazard voyages replay bit-exact.
export const STRAIN_STORM = 0.5

export function strain(rough, wx) {
    if (wx !== WX.STORM) return 0
    const r = Math.max(0, Math.min(1, rough))
    // r >= 1 short-circuit: a living storm is rough 1.0 by construction, and
    // 0.5 * 1 must be exactly STRAIN_STORM (the sink-tile law is exact).
    return r >= 1 ? STRAIN_STORM : STRAIN_STORM * r
}

// Hull after crossing one sea tile: state is (hull, worn) with the remaining
// capacity = hull + worn (hull is the whole planks, worn the carried fraction,
// 0 <= worn < 1). Integer out, monotone down, never below zero. The sim keeps
// hull and fractional strain together so small strains accumulate honestly
// instead of rounding away into immortality; under a full storm the half-points
// land on whole planks every second tile. The ship is finished only when the
// LAST plank gives way — hull AND fraction spent (hull + worn <= 0) — so a
// heaving crossing of exactly 24 storm tiles founders her, not 23.
export function wear(hull, worn, rough, wx) {
    let total = hull + worn - strain(rough, wx)
    const near = Math.round(total)
    if (Math.abs(total - near) < 1e-9) total = near // snap fp drift: half-planks are exact
    const h = Math.max(0, Math.floor(total))
    const f = total - h
    return { hull: h, worn: f < 0 ? 0 : f }
}

// Ashore, the hull is made sound: a tick of repair dries and tightens her.
// Bit-exact ceiling (HULL_MAX stays HULL_MAX) so a repaired ship is exactly
// the pre-hazard ship — repair cannot over-maintain past the design capacity.
export function repair(hull) {
    return Math.min(HULL_MAX, hull + 1)
}

// Groan rate-limit (#1829): plank loss gets a voice, but capped — a hammering
// storm creaks at most once per GROAN_GAP ticks (the SPLAT_GAP law again: a
// storm rattles, never machine-guns, and a locked-loop harness must not be
// able to flood the audio renderer).
export const GROAN_GAP = 20

// The founder's answer: the nearest coast tile (open water with dry land at
// hand) from (sx, sy) on the wrapped world — deterministic BFS, cardinal
// neighbours in fixed order, so the rescue is reproducible from the seed. The
// map border is all ocean, but the sea is one body and the land fraction is
// >25% (the #1128 gates): the frontier sweeps the whole sea, so no position
// is unreachable and every wreck washes ashore (britanniacheck proves it over
// the real Britannia).
export function nearestCoast(sx, sy, world) {
    const coast = (x, y) => isSea(world.get(x, y)) &&
        (!isSea(world.get(x + 1, y)) || !isSea(world.get(x - 1, y)) || !isSea(world.get(x, y + 1)) || !isSea(world.get(x, y - 1)))
    if (coast(sx, sy)) return { x: sx, y: sy }
    const seen = new Set([sx + ',' + sy])
    const q = [[sx, sy]]
    while (q.length) {
        const [x, y] = q.shift()
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = ((x + dx) % MAPW + MAPW) % MAPW
            const ny = ((y + dy) % MAPW + MAPW) % MAPW
            const k = nx + ',' + ny
            if (seen.has(k)) continue
            if (!isSea(world.get(nx, ny))) continue
            if (coast(nx, ny)) return { x: nx, y: ny }
            seen.add(k); q.push([nx, ny])
        }
    }
    return null
}
