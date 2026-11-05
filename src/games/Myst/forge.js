// Pure forge law for MECHANICAL (#838 item 13 — "the forge breathes").
//
// The 1993 original's Bronze Age is lit from inside its own mechanism: a
// smithy-fire under the tower that never holds one brightness, brass that
// glows hot near the source and cools to rust on the far ground, steam
// vents puffing on their own cadences, and sparks drifting up off the
// meshed gears. Everything here is a deterministic function of the world
// clock `t` (seconds) — the same discipline as sea.js/storm.js — so the
// sim is reproducible frame-for-frame and mystcheck can gate the law, not
// the pixels.
//
// Scope is the whole point: `forgeLight` answers 0 outside MECHANICAL.
// The other Ages keep their own skies (item 8's storm rule, on light).

export const FORGE_VIEWS = ['mechanical', 'mechWalk', 'mechCar', 'mechTop', 'mechRoom']

// One furnace seat per Mechanical view — where the fire lives in that
// view's own coordinates [x, z]. The tower is one place, so the seats
// trace it: the drum from the landing, the slabs from the walk, the
// shaft from the cage, the door from the top, the gear-wall from inside.
export const FORGE_SEATS = {
  mechanical: [2, 30],
  mechWalk: [0, 11],
  mechCar: [0, 5],
  mechTop: [0, 14.4],
  mechRoom: [0, -4.4],
}

export const FORGE = {
  lamp: 9, // nominal lamp intensity at full breath
  pumpHz: 0.9, // the slow bellows
  flickerA: 0.05, // the hammer on the anvil
  flickerHz1: 7.3,
  flickerHz2: 17.7,
  flickerA2: 0.03,
  reach: 26, // metres: past this the forge is only fog-light
  min: 0.55, // envelope bounds — a fire that gutters still burns
  max: 1.15,
  bounce: [0.32, 0.16, 0.05], // warm brass bounce tint (near hot, far rust)
}

// The breath: a slow pump with a fast double flicker riding it.
// Deterministic in t, always inside [min, max], never flat.
export function forgeBreath(t) {
  const pump = 0.85 + 0.15 * Math.sin(t * FORGE.pumpHz)
  const flick = FORGE.flickerA * Math.sin(t * FORGE.flickerHz1)
    + FORGE.flickerA2 * Math.sin(t * FORGE.flickerHz2)
  return Math.min(FORGE.max, Math.max(FORGE.min, pump + flick))
}

// Gain the forge paints at a point: the breath × a squared distance falloff
// from the view's furnace seat. Near brass ~1 (hot), the far ground 0 (rust),
// and every non-Mechanical view is dead zero — the forge stays home.
export function forgeLight(t, x, z, view) {
  if (!FORGE_VIEWS.includes(view)) return 0
  const [sx, sz] = FORGE_SEATS[view]
  const d = Math.hypot(x - sx, z - sz)
  const fall = Math.max(0, 1 - d / FORGE.reach) ** 2
  return forgeBreath(t) * fall
}

// FNV-style string hash in [0,1) — deterministic, no Math.random anywhere.
function h01(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 100000) / 100000
}

export const VENT = {
  period0: 2.4, // shortest cadence in seconds…
  period1: 2.2, // …plus this much, hashed per vent: every vent its own rhythm
  duty: 0.8, // fraction of the cycle the puff is alive; the rest is a rest gap
}

// A vent's puff envelope in [0,1]: swell and fade on the vent's own period,
// with a true rest gap between puffs (a hissing vent that never stops is a
// leak, not a valve).
export function ventPuff(t, key) {
  const k = String(key)
  const period = VENT.period0 + h01(k) * VENT.period1
  const phase = ((t / period) + h01(k + '#p')) % 1
  if (phase >= VENT.duty) return 0
  const u = Math.sin((Math.PI * phase) / VENT.duty)
  return u * u
}

export const SPARK = {
  rise: 1.6, // metres a spark climbs before it dies
  spread: 0.5, // lateral drift from the seat at birth
  life0: 0.8, // seconds…
  life1: 1.4, // …plus this much, hashed per spark
  swirl: 0.3, // cross-draft sway
}

// A deterministic pool of sparks off the furnace: each rides up from the
// seat, sways on the cross-draft and dies (life 1 → 0, amber → red in the
// scene). [] outside Mechanical — the other Ages shed no sparks.
export function forgeSparks(n, t, view) {
  if (!FORGE_VIEWS.includes(view)) return []
  const [sx, sz] = FORGE_SEATS[view]
  const out = []
  for (let i = 0; i < n; i++) {
    const life = SPARK.life0 + h01(`${view}:${i}`) * SPARK.life1
    const u = (((t + h01(`${view}#${i}`) * life * 7) % life) / life) // 0 birth → 1 death
    const out0 = 1 - u
    out.push({
      x: sx + (h01(`${view}x${i}`) - 0.5) * 2 * SPARK.spread * (0.4 + u)
        + SPARK.swirl * Math.sin(t * 2.3 + i * 1.7) * u,
      y: u * SPARK.rise,
      z: sz + (h01(`${view}z${i}`) - 0.5) * 2 * SPARK.spread * (0.4 + u),
      life: out0,
    })
  }
  return out
}
