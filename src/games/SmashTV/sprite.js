// SMASH TV — the contestant's paint decisions (pure: drawPlayer renders exactly these).
// The star of the show: a 4-frame run cycle, and a gun layer that sits OVER the
// body (boots render under the gun), with a distinct silhouette per weapon, all
// laid out along the aim vector.

export const PLAYER_FRAMES = 4

// frame from accumulated walk distance; a resting contestant holds the neutral frame
export const playerFrame = (walk, moving) => (moving ? Math.floor(walk / 6) % PLAYER_FRAMES : 0)

// per-weapon gun silhouettes, drawn from the shoulder along the aim vector:
//   twin   — two slim barrels flanking the aim line
//   gun    — one stubby heavy barrel
//   spread — one short fat sawed-off vent
//   laser  — one boxy emitter with a hot tip
// off: perpendicular offsets of the barrels from the aim line; len: length;
// w: thickness; col: barrel colour; tip: hot muzzle pixel; flash: where the
// muzzle flash blooms (always beyond the muzzle).
export const GUN = {
    twin:   { off: [-2.5, 2.5], len: 8,   w: 1.5, col: '#8d99b5', tip: '#cfd8ff', flash: 9.5 },
    gun:    { off: [0],         len: 7,   w: 3,   col: '#6b7285', tip: '#8fff9f', flash: 8.5 },
    spread: { off: [0],         len: 5.5, w: 2.5, col: '#9aa5bd', tip: '#ffd23f', flash: 7 },
    laser:  { off: [0],         len: 6,   w: 3.5, col: '#5a6079', tip: '#ff4f4f', flash: 7.5 },
}

// render order: the gun layer comes last, so the boots render under the gun
export const LAYERS = ['feet', 'body', 'headband', 'gun']
