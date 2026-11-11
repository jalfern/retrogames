// SMASH TV — the juice pass (pure: the render reads exactly these).
//   a per-weapon muzzle flash (the gun's own tip colour, blooming just past the
//   muzzle — never one shared white flash for every gun), spent-casing sparks
//   kicked out the muzzle in the gun's colour, kill shake (an ordinary kill
//   jolts the floor, a boss add hits harder, THE ANNOUNCER himself rattles the
//   cabinet), a per-room running score total that replaces the floating per-kill
//   numbers, and the exit shutter that rolls open over SHUTTER_TICKS once the
//   room falls — with a set of arrow chevrons pointing in, not the old red dot.

import { GUN } from './sprite.js'

// the muzzle flash: the gun's own tip colour, blooming a little past the muzzle
export const muzzleFlash = (weapon) => {
    const g = GUN[weapon]
    return { col: g.tip, r: 1.5 + (g.flash - g.len) }
}

// recoil kick (#1945): each shot snaps the shoulder carriage back along the aim
// vector; `since` is ticks since the last shot (fireT counts DOWN to the next,
// interval - fireT counts up from the last), so the kick is strongest on report
// and decays to zero within RECOIL_TICKS — never longer than the tightest fire
// interval (5), so the next shot always starts from a clean mount. An armed
// but un-fired player (fireT 0) reads since = interval → no phantom kick.
export const RECOIL_TICKS = 5
export const RECOIL_PX = 2
export const recoilKick = (since) => (since < RECOIL_TICKS ? RECOIL_PX * (1 - since / RECOIL_TICKS) : 0)

// spent-casing sparks kick out the muzzle in the gun's own tip colour
export const casingCol = (weapon) => GUN[weapon].tip

// shell shake on report (#1950): the 2px carriage kick vanishes once the
// 256x248 canvas downscales on a phone, so the heavy iron shakes the WHOLE
// shell — MG and LASER rattle it, SPREAD twitches, the twin is too light and
// too fast to ever move the cabinet. Never more than an ordinary kill jolt.
export const SHELL_KICK = { twin: 0, gun: 1.5, spread: 1, laser: 2, homing: 1.5, flame: 0 }
export const shellKick = (weapon) => SHELL_KICK[weapon] || 0

// barrel heat on report (#1950): for the first instants of the recoil the
// firing barrel glows in the gun's own muzzle colour instead of gunmetal —
// the shot reads even when the carriage travel is sub-pixel on a phone.
export const HOT_FLOOR = 1.5
export const barrelHot = (kick) => kick >= HOT_FLOOR

// mount glint (#1950): when a new weapon arrives the shoulder mounts flash
// and the bloom fades over GLINT_TICKS draw frames, calling out the swap.
export const GLINT_TICKS = 12
export const glintPhase = (t) => Math.max(0, Math.min(1, t / GLINT_TICKS))

// kill shake magnitude: an ordinary kill jolts the floor, a boss add lands
// harder, and killing THE ANNOUNCER himself rattles the whole cabinet
export const KILL_SHAKE = { kill: 2, bossAdd: 6, boss: 12 }
export const killShake = (kind, bossAdd) =>
    kind === 'boss' ? KILL_SHAKE.boss : bossAdd ? KILL_SHAKE.bossAdd : KILL_SHAKE.kill

// the exit shutter: 0 = sealed, 1 = fully open, over SHUTTER_TICKS
export const SHUTTER_TICKS = 18
export const shutterPhase = (t) => Math.min(1, Math.max(0, t / SHUTTER_TICKS))

// the per-room running total: every score event since the last room change.
// (The render mirrors this incrementally; this is the spec the harness pins.)
export function roomScore(events) {
    let room = 0, total = 0
    for (const e of events) {
        if (e.type === 'room') { room = e.room; total = 0 }
        else if (e.type === 'score') total += e.pts
    }
    return { room, total }
}

// #2044 — bonus-round gibs. The cabinet paid you to gun down the bonus crowd,
// and every kill SPLATTED: the contestant came apart into red chunks with a
// bone chip or two and a floor stain that slowly dried. The old presentation
// was a generic blue spark (the honest gap this closes). A gib is a MULTI-pixel
// shape — never the 1px `burst()` spark — and the whole set is a pure function
// of an injectable rng so the Node harness can pin count, shape and lifetime.
export const GORE_TICKS = 34 // gib flight: arcs, lands, gone
export const STAIN_TICKS = 120 // floor splatter fade — long enough to litter the round
export const GORE_GRAV = 0.22 // heavier than sparks (0.18): these have mass

// [w, h, col] — head, torso chunk, two limb strips, a bone chip, spatter dots.
// Reds are the two-tone palette (dark clot + bright spray); bone reads once.
const GORE_SHAPES = [
    [2, 2, '#e8464a'], // head-dot
    [3, 4, '#c81f2f'], // torso chunk (the big one)
    [4, 1, '#a01824'], // limb, long axis
    [1, 4, '#a01824'], // limb, tall axis
    [1, 3, '#f0e6d8'], // bone chip
    [2, 2, '#e8464a'], // spatter
    [2, 1, '#c81f2f'], // spatter dash
]

export function goreSet(rng = Math.random) {
    return GORE_SHAPES.map(([w, h, col]) => {
        const a = rng() * Math.PI * 2
        const s = 0.8 + rng() * 1.8
        return { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.6, w, h, col, grav: GORE_GRAV }
    })
}

// the stain a kill leaves on the studio floor: combo makes it a bigger pizza
export const stainRadius = (combo) => 3 + Math.min(3, combo)
