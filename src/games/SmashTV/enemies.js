// SMASH TV — the enemy paint and telegraph decisions (pure: the sim's charge
// and drawEnemies render exactly these). The cabinet telegraphs everything: a
// turret or a heavy tracks the player for TELEGRAPH ticks — barrel along the
// aim, muzzle glow growing — before the shot commits. Every kind runs its own
// four-frame cycle and wears its own outline, so a walkcam is never read as a
// runner at a glance.

export const ENEMY_FRAMES = 4

// ticks of visible charge before a turret/heavy commits its shot
export const TELEGRAPH = 20

// the kinds that track a target and must charge before firing
export const CHARGERS = { turret: true, heavy: true }

// charge render spec: barrel length from the enemy centre, the barrel colour,
// and the glow that grows at the muzzle as the charge runs to zero
export const CHARGE = {
    turret: { len: 9, col: '#8d99b5', glow: '#ffd23f' },
    heavy: { len: 11, col: '#4a5568', glow: '#ff8a3f' },
}

// per-kind outline, baked into the sprite sheet as a 1px rim — six distinct
// rims, each brighter than the studio floor
export const OUTLINE = {
    walkcam: '#8d99b5',
    runner: '#ff5d5d',
    turret: '#5dc8ff',
    thrower: '#8fff9f',
    heavy: '#ffd23f',
    boss: '#ffb0a0',
}

// frame from the enemy's own motion: walkers run the cycle from accumulated
// walk distance and hold the neutral frame at rest; the stationary turret and
// THE ANNOUNCER idle on the tick clock
export const enemyFrame = (e, tick) => {
    if (e.kind === 'turret') return Math.floor(tick / 8) % ENEMY_FRAMES
    if (e.kind === 'boss') return Math.floor(tick / 6) % ENEMY_FRAMES
    if (!e.moving) return 0
    return Math.floor((e.walk || 0) / 6) % ENEMY_FRAMES
}
