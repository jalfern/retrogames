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

// #1978 — the smooth pan. The old camera recomputed camX = round(mid − CW/2) each
// frame: a 1.2 px/tick walk made the world step 1,1,2,1,1,2 px — visible 1-px hops
// (the hero appeared to stutter backwards every fifth tick). The pan law replaces
// the rounding with a UNIFORM step: at most CAM_PAN px per drawn frame, so the
// world glides at a steady rate; the camera trails the hero by at most a few px
// while he runs and catches up the moment he stops. A jump larger than CAM_SNAP is
// not a walk — it is a teleport (new room, respawn, seat change) — and snaps
// instantly instead of panning across the whole board.
export const CAM_PAN = 1 // px per drawn frame — never more, so the pan never hops
export const CAM_SNAP = 24 // past this the framing jumped boards/respawned: snap
export const camPan = (cur, want) => {
    const d = want - cur
    if (Math.abs(d) > CAM_SNAP) return want
    return cur + Math.max(-CAM_PAN, Math.min(CAM_PAN, d))
}

// #1978 — the cross-screen door confirm. On a 384 px board the far door can sit a
// whole walk away when the room falls; the same 330→990 blip covered every exit.
// When the NEAREST open door is farther than FAR_EXIT_PX from the hero, the
// shutter answers with a heavier two-tone clank + noise — a bigger confirm for a
// bigger walk. A door already in view keeps the light blip.
export const FAR_EXIT_PX = 96 // more than half the screen's half-frame, less than a full pan
export const farExitPx = (x, y, exits) => Math.min(...exits.map((e) => Math.hypot(e.x - x, e.y - y)))
export const SHUTTER_CONFIRM = { notes: [[196, 0, 0.05], [147, 0.07, 0.09]], type: 'square', vol: 0.055, noise: 0.06 }

// #2011 — the long walk home. Since #2007 the whole show boards wide, so when a
// room falls the nearest open door can still sit up to a full pan away — the
// cleared hero crosses ~12 columns of quiet floor. Two beats fill that dead air:
// walkHype maps the px remaining to the door (0..1) so the crowd murmur keeps
// breathing toward the exit and SWELLS with distance — silent inside FAR_EXIT_PX,
// where the shutter's own clank confirm takes over; and camLead lets the camera
// settle up to CAM_LEAD px toward the door while the walk is on, previewing the
// exit. The bias moves the pan TARGET a few px; camPan still caps the pan itself
// at CAM_PAN px/frame, so the uniform-pan law (#1978) holds while the settle eases in.
export const CAM_LEAD = 8 // px — the settled frame leans toward the open door
export const walkHype = (dPx, boardPx) => (dPx > FAR_EXIT_PX ? Math.min(1, dPx / boardPx) : 0)
export const camLead = (doorDx, dPx) => (dPx > FAR_EXIT_PX ? Math.sign(doorDx) * Math.min(Math.abs(doorDx), CAM_LEAD) : 0)

// #1978 — off-screen legibility. The wide boards park spawns, threats and the bonus
// crowd past the frame edge; they telegraph and scream where they stand, unseen.
// markSide maps a board x to the screen edge to stamp its colour on: −1 left,
// +1 right, 0 in view. Colours reuse the game's own language: the spawn telegraph's
// yellow, the kill red, the exit green for the fleeing targets.
export const MARK = { enemy: '#ff5d5d', spawn: '#ffd23f', civ: '#8fff9f' }
export const markSide = (x, camX, cw) => (x < camX ? -1 : x > camX + cw ? 1 : 0)

// #2028 — the add entry cue. THE ANNOUNCER throws adds anywhere along the
// 384 px studio (24 + rng*(bw-48)); when the camera clamps toward the far
// edge, the host stays framed but the add and its materialize ring pulse
// off-screen — a new threat simply appears. When the host throws an add past
// the frame, the edge it sits on flares a spawn-yellow chip (the #1978
// language, but SOLID for the first half of SPAWN_CUE so a fresh entry reads
// louder than the generic blink). edgeRow folds the marks' HUD-safe clamp
// into one law: chips never crawl under the 1UP board or off the bottom.
export const SPAWN_CUE = 48
export const edgeRow = (y, hudH, ch) => Math.round(Math.max(hudH + 8, Math.min(ch - 8, y)))
