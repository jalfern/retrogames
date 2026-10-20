// GAUNTLET minimap — the pure half of the map panel (issue #275 item 8).
// index.jsx's drawPanel renders exactly what this module decides, and
// gauntletcheck proves the decisions in plain Node. No canvas at import.
//
// The arcade's side map admitted only what the cabinet actually knew:
//   - the corridors you had already walked (explored cells),
//   - the beasts your current view shows (seen, not all that exist),
//   - the stairs — which pulse once you carry a key.

import { W, H } from './levels.js'

// the overhead cabinet's view geometry: 256x200 px of maze at 16 px per cell
export const VW = 256
export const VH = 200
export const PX = 16

// panel layout: maze cells at 2 panel-px each, 8 px margin
export const MAP_CELL = 2
export const MAP_MARGIN = 8

// the shared screen in CELLS: the cabinet window is VW x VH px of maze at PX
// per cell, so the view spans exactly these many cells (#524 — the screen edge
// that walls a hero in is measured in the same units the camera is drawn in).
export const VWC = VW / PX
export const VHC = VH / PX

// the camera the overhead view uses. One hero: a VW x VH window centred on
// him, clamped to the maze (drawView and the minimap share this one definition,
// so "what is seen" can never drift from what the screen shows).
//
// Two heroes on the shared cabinet (#524): the window centres on the pair's
// midpoint, so BOTH stay framed and the screen edge is a wall neither can
// leave. When P2 is gone (down/absent) it falls back to centring P1 — one
// player plays exactly as before.
export function viewRect(hero, partner) {
    const p = partner && !partner.down ? partner : null
    const ax = p ? (hero.x + p.x) / 2 : hero.x
    const ay = p ? (hero.y + p.y) / 2 : hero.y
    let camX = ax * PX - VW / 2
    let camY = ay * PX - VH / 2
    camX = Math.max(0, Math.min(W * PX - VW, camX))
    camY = Math.max(0, Math.min(H * PX - VH, camY))
    return { camX, camY }
}

// the world-cell bounds of a view window. A hero must stay inside it: this is
// the shared screen edge that #524 makes a SIM rule, not just drawing.
export function viewBounds(rect) {
    return { minx: rect.camX / PX, miny: rect.camY / PX, maxx: rect.camX / PX + VWC, maxy: rect.camY / PX + VHC }
}

// a world point is seen when the clamped camera puts it in the window
export function inView(rect, x, y) {
    return x * PX >= rect.camX && x * PX <= rect.camX + VW &&
        y * PX >= rect.camY && y * PX <= rect.camY + VH
}

// the beasts the map admits it saw: every live monster the view shows,
// Death included — he is the one you most need to see coming
export function mapMonsters(gs, rect) {
    return gs.monsters.filter((m) => inView(rect, m.x, m.y))
}

// the stairs pulse once a key is held: a triangle beat 0 -> 0.5 -> 1 -> 0.5
// on a 16-tick cycle (a quarter-second), null until the first key is in
export function stairsPulse(keys, tick) {
    if (keys <= 0) return null
    const TRI = [0, 1, 2, 1]
    return TRI[(tick >> 2) % 4] / 2
}
