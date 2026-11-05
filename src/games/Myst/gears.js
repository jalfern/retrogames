// MYST — the gear gallery (#838 item 9): the five brass slots in the wall of
// Mechanical's tower, and what the Ages hand over to fill them. Pure: it reads
// the save and answers tables — no DOM, no three.js — so scripts/mystcheck.mjs
// imports THIS file unchanged.
//
// The lore the game already stamped ("One of five, it said on the tower of
// Mechanical. Five, to open something that should stay shut.") is the spec:
// four gears are carried, the fifth MYST carved for itself and keeps riding it
// inside its own clock tower. The wall shows all five; the hand can move four.

export const GEAR_SLOTS = 5

// One row per slot, in wall order, left to right as the plaque reads them.
// `fixed` is the island's own: seated by law, refused to the hand, and never
// taken — the tower's time runs on it.
export const GEARS = [
  { key: 'selenitic', sigil: 'the sun and moon', age: 'SELENITIC', fixed: false },
  { key: 'channelwood', sigil: 'the five-spoke star', age: 'CHANNELWOOD', fixed: false },
  { key: 'stoneship', sigil: 'the wave and the wheel', age: 'STONESHIP', fixed: false },
  { key: 'mechanical', sigil: 'three meshed cogs', age: 'MECHANICAL', fixed: false },
  { key: 'myst', sigil: 'the island dial', age: 'MYST', fixed: true },
]

export const GEAR_KEYS = GEARS.map((g) => g.key)
// The carried gears live in flags the game already ships (gearSelenitic,
// gearChannelwood); the same naming carries the two new pickups.
export const gearFlag = (key) => 'gear' + key[0].toUpperCase() + key.slice(1)

export function gearHeld(s, key) { return !!s.flags[gearFlag(key)] }
export function heldCount(s) { return GEAR_KEYS.filter((k) => gearHeld(s, k)).length }

// A slot is filled if the gear sits in it — or if the island's own gear never
// left. `gearsSeated` is the player's doing; the fixed row is the wall's.
export function gearSeated(s, key) {
  const g = GEARS.find((x) => x.key === key)
  if (!g) return false
  return g.fixed || !!s.gearsSeated[key]
}
export function seatedCount(s) { return GEARS.reduce((n, g) => n + (gearSeated(s, g.key) ? 1 : 0), 0) }

// What the niche stays shut behind. Five in the wall, every one of them.
export function galleryOpen(s) { return seatedCount(s) === GEAR_SLOTS }

// Panel rows for the browser: seat state plus what the hand can still do.
export function gearRows(s) {
  return GEARS.map((g) => ({
    key: g.key,
    sigil: g.sigil,
    age: g.age,
    fixed: g.fixed,
    held: gearHeld(s, g.key),
    seated: gearSeated(s, g.key),
  }))
}

// Seat weights: five slots, five answers, deepest first — the wall is bronze
// over stone and each gear drops further into the drive. Distinct by ear.
export const SEAT_TONES = [98, 110, 131, 165, 196]
export function seatWeight(key) {
  const i = GEAR_KEYS.indexOf(key)
  return i < 0 ? 0 : SEAT_TONES[i]
}
