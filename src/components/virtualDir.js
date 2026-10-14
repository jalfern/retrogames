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
