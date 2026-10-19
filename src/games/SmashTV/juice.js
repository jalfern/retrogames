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

// spent-casing sparks kick out the muzzle in the gun's own tip colour
export const casingCol = (weapon) => GUN[weapon].tip

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
