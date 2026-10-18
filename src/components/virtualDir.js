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

// --- 4 / 8-way "diamond gate" quantizer for the touch d-pad stick (#439) ---
//
// A cabinet's 4-way stick has a restrictor gate: the thumb slides freely in
// the plane, but the OUTPUT snaps to the DOMINANT axis. Near the 45-degree
// diagonal the last axis wins until the thumb clears it by more than a small
// wedge (hysteresis, ~±15 degrees), so the output does not flicker between two
// directions as the thumb crosses the diagonal. For `ways: 8` the thumb instead
// picks the nearest 45-degree sector (diagonals allowed), matching the legacy
// d-pad.
//
// Newest direction wins: every move re-derives from the current offset.
// `state.axis` is the hysteresis memory (the last dominant axis, 'x' | 'y'),
// carried across moves by the caller (a ref in the browser, a shared object in
// Node). Pure: importable in Node (vpadcheck) and the browser.
//
//   x, y       the thumb's offset from the stick centre (screen coords, y down)
//   ways       4 (dominant axis) or 8 (nearest sector)
//   state      { axis } — the last dominant axis, for hysteresis
//   deadZone   px before any direction engages (the shared DEAD_ZONE)
// Returns: the arrow code(s) to hold — one for ways 4, up to two for ways 8.
export const DPAD_HYST_RAD = 15 * Math.PI / 180
export const DPAD_SWAP_HI = Math.tan(Math.PI / 4 + DPAD_HYST_RAD)  // |y|/|x| to take the vertical axis (60 deg)
export const DPAD_SWAP_LO = Math.tan(Math.PI / 4 - DPAD_HYST_RAD)  // |y|/|x| to take the horizontal axis (30 deg)

export function dpadDirs(x, y, ways = 4, state = {}, deadZone = DEAD_ZONE) {
    if (Math.hypot(x, y) < deadZone) return []
    if (ways === 8) return SECTOR_DIRS[sectorFrom(x, y)]
    const ax = Math.abs(x), ay = Math.abs(y)
    const r = ax === 0 ? Infinity : ay / ax
    const last = state.axis
    let axis
    if (last === 'y') axis = r < DPAD_SWAP_LO ? 'x' : 'y'
    else if (last === 'x') axis = r > DPAD_SWAP_HI ? 'y' : 'x'
    else axis = r >= 1 ? 'y' : 'x'
    state.axis = axis
    if (axis === 'x') return [x >= 0 ? 'ArrowRight' : 'ArrowLeft']
    return [y >= 0 ? 'ArrowDown' : 'ArrowUp']
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
