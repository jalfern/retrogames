// SMASH TV — the contestant's paint decisions (pure: drawPlayer renders exactly these).
// The star of the show: a 4-frame run cycle, and a gun carriage that rides the
// SHOULDERS (boots render under the gun), with a distinct silhouette per weapon,
// all laid out along the aim vector.

export const PLAYER_FRAMES = 4

// frame from accumulated walk distance; a resting contestant holds the neutral frame
export const playerFrame = (walk, moving) => (moving ? Math.floor(walk / 6) % PLAYER_FRAMES : 0)

// the over-the-shoulder carriage (#1945): the cabinet camera hovers above and
// behind the contestant, so every gun mounts BEHIND the body plane (back) and ON
// the shoulder line (rise), the barrel running out past the head — poster pose,
// never a waist pistol.
export const CARRIAGE = { back: 1, rise: 2.5 }
// the laws the pose must satisfy, in px along the aim vector from body centre:
export const POSE = { mountBack: 1, muzzlePast: 3 }
// stock stubs trail every mount in dark gunmetal
export const STOCK = { len: 3, col: '#2b2f3d' }

// per-weapon gun silhouettes, carried on the shoulder line along the aim vector:
//   twin   — one slim barrel over each shoulder (dual flash)
//   gun    — one long heavy barrel, right shoulder, drum-mag stub
//   spread — one short fat sawed-off across the chest, two muzzle dots
//   laser  — one boxy emitter with a hot tip and side-cell glow
// off: perpendicular offsets of the mounts from the aim line; len: barrel
// length; w: thickness; col: barrel colour; tip: hot muzzle pixel; flash: where
// the muzzle flash blooms (always beyond the muzzle); stock: stub length;
// mag/dots/box/cells: the carriage extras that make each gun read apart.
export const GUN = {
    twin:   { off: [-2.5, 2.5], len: 8,   w: 1.5, col: '#8d99b5', tip: '#cfd8ff', flash: 9.5, stock: 3 },
    gun:    { off: [2],         len: 7.5, w: 3,   col: '#6b7285', tip: '#8fff9f', flash: 9,   stock: 3.5, mag: true },
    spread: { off: [0],         len: 5.5, w: 2.5, col: '#9aa5bd', tip: '#ffd23f', flash: 7,   stock: 2.5, dots: 2 },
    laser:  { off: [0],         len: 6,   w: 3.5, col: '#5a6079', tip: '#ff4f4f', flash: 7.5, stock: 3,   box: true, cells: 2.5 },
}

// the carriage geometry for one weapon aimed along [ax, ay] at (x, y), snapped
// back by `kick` (juice.js recoil): one entry per barrel, each with base (the
// shoulder mount), muz (muzzle), stock (stub end behind the mount) and flash.
// diagonal spread floor (#1950): the shoulder offsets ride the PERPENDICULAR
// of the aim and the carriage leans back along it, so at 45° the front barrel
// sits ~1px off the body centre — inside the 6px head column, and the twin
// stacks as one blob behind the visor. A twin's mount slides along the
// perpendicular until the barrel clears ±SPREAD_FLOOR px of the CENTRE line,
// so one gun stays visibly behind each shoulder at every aim. Only the
// crowded barrel moves; cardinal geometry is byte-identical (it clears the
// floor already) and flat aims keep their vertical stack.
export const SPREAD_FLOOR = 2
export function spreadOff(o, ax, ox, back, paired) {
    if (!paired || ox === 0) return o
    const h = -ax * back + ox * o
    if (Math.abs(h) >= SPREAD_FLOOR) return o
    return o + ((h < 0 ? -SPREAD_FLOOR : SPREAD_FLOOR) - h) / ox
}

export function gunPose(weapon, aim, kick = 0, x = 0, y = 0) {
    const g = GUN[weapon]
    const [ax, ay] = aim
    const ox = -ay, oy = ax
    const back = CARRIAGE.back + kick
    const paired = g.off.length > 1
    return g.off.map((o) => {
        const o2 = spreadOff(o, ax, ox, back, paired)
        const bx = x - ax * back + ox * o2
        const by = y - ay * back + oy * o2 - CARRIAGE.rise
        return {
            perp: o2,
            base: { x: bx, y: by },
            muz: { x: bx + ax * g.len, y: by + ay * g.len },
            stock: { x: bx - ax * g.stock, y: by - ay * g.stock },
            flash: { x: bx + ax * g.flash, y: by + ay * g.flash },
        }
    })
}

// render order: the gun layer comes last, so the boots render under the gun
export const LAYERS = ['feet', 'body', 'headband', 'gun']
