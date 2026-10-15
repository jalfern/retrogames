// Pure 8-way direction logic for the VirtualControls d-pad.
// Importable in Node (vpadcheck) and the browser (VirtualControls.jsx).

export const DEAD_ZONE = 15

// sector 0..7, each 45 degrees, 0 = right (screen coords: y down)
export const SECTOR_DIRS = [
    ['ArrowRight'],
    ['ArrowDown', 'ArrowRight'],
    ['ArrowDown'],
    ['ArrowDown', 'ArrowLeft'],
    ['ArrowLeft'],
    ['ArrowUp', 'ArrowLeft'],
    ['ArrowUp'],
    ['ArrowUp', 'ArrowRight'],
]

export function sectorFrom(dx, dy) {
    if (dx === 0 && dy === 0) return -1
    let a = Math.atan2(dy, dx)
    if (a < 0) a += 2 * Math.PI
    return Math.round(a / (Math.PI / 4)) % 8
}

export function dirsFrom(dx, dy, deadZone = DEAD_ZONE) {
    if (Math.hypot(dx, dy) < deadZone) return []
    return SECTOR_DIRS[sectorFrom(dx, dy)]
}

// --- Floating-stick touch control (#290 step 3) ---
//
// A floating stick anchors wherever the thumb lands; the knob then follows the
// thumb within a fixed travel circle. `stickVec` turns the raw touch offset from
// the anchor into (a) the knob position, clamped to the travel circle (px), and
// (b) the normalized -1..1 analog vector a game reads when it opts in with
// pad.analog === true (the digital 8-way arrows are a separate, coarser read of
// the same offset via dirsFrom). Importable in Node (vpadcheck) and the browser.

export const STICK_TRAVEL = 56   // px — max knob travel from the anchor
export const STICK_DEAD = 14     // px — push this far before the stick engages

export function stickVec(dx, dy, travel = STICK_TRAVEL, dead = STICK_DEAD) {
    const mag = Math.hypot(dx, dy)
    if (mag < dead) return { px: 0, py: 0, x: 0, y: 0, push: 0, engaged: false }
    const push = Math.min(1, mag / travel)      // 0..1 push magnitude (1 = fully extended)
    const nx = dx / mag, ny = dy / mag           // unit direction (magnitude 1)
    return {
        px: nx * push * travel,                  // knob offset, clamped to the travel circle (px)
        py: ny * push * travel,
        x: nx * push,                            // normalized analog vector, -1..1
        y: ny * push,
        push,
        engaged: true,
    }
}
