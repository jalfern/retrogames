// TAP SEMANTICS (#1712 S2) — one honest definition of what a canvas tap DOES,
// shared by the browser shell and the dataset replay (scripts/plaicraft-dataset.mjs).
//
// A tap used to mutate the sim directly, off the pad stream — recorded takes
// could not replay it (S1's law: a take replays tick-for-tick or ships
// nothing). So the shell banks the tap IN the pad channel — `pointer:{x,y,down}`
// is rec/v1 codec territory (onePad.js, #420) — and applies it at the tick that
// consumes it, drain-one-per-tick so live and replay run the same sequence:
// applyTap(gs, px, py) at tick t, then step. Node replays the same: decodes
// the pad, sees pointer.down, calls THIS file. Geometry and verbs live here,
// once; the painter imports the same constants.

import { COLS, ROWS, clickCell, setTool, toggleAuto, hireRobot, clickOrder } from './sim.js'

// Canvas geometry (the shell paints with these exact numbers).
export const W = 800, H = 520
export const TILE = 26
export const GX = 10, GY = 44

// HUD chip click zones (canvas space) — the same rects the shell paints.
export const CHIPS = {
    auto: { x: 512, y: 6, w: 54, h: 28 },
    rack: { x: 572, y: 6, w: 74, h: 28 },
    hire: { x: 652, y: 6, w: 78, h: 28 },
}
export const inRect = (r, x, y) => x >= r.x && x <= r.w + r.x && y >= r.y && y <= r.h + r.y
export const orderRect = (i) => ({ x: 694, y: 46 + i * 74, w: 96, h: 66 })

// applyTap — the ONE tap interpretation. Hit order mirrors the shell: chips →
// order cards → floor cell (cursor teleports there, the way a fingertip does,
// then the cell click fires). Deterministic: integer grid math on stored
// canvas pixels, so Node replay lands on the same cell the thumb hit.
export function applyTap(gs, px, py) {
    if (inRect(CHIPS.auto, px, py)) { toggleAuto(gs); return }
    if (inRect(CHIPS.rack, px, py)) { setTool(gs, 'rack'); return }
    if (inRect(CHIPS.hire, px, py)) { hireRobot(gs); return }
    const open = gs.orders.slice(0, 5)
    for (let i = 0; i < open.length; i++) {
        if (inRect(orderRect(i), px, py)) { clickOrder(gs, open[i].id); return }
    }
    const gx = Math.max(0, Math.min(COLS - 1, Math.floor((px - GX) / TILE)))
    const gy = Math.max(0, Math.min(ROWS - 1, Math.floor((py - GY) / TILE)))
    gs.cursor.x = gx
    gs.cursor.y = gy
    clickCell(gs, gx, gy)
}
