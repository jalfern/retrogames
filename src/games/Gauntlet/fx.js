// GAUNTLET fx — the hazard-furniture polish decisions (issue #973, ten-maze
// follow-up to #950). index.jsx's drawView renders exactly what this module
// decides, and gauntletcheck proves the decisions in plain Node.
// No canvas, no audio at import — decisions only, like juice.js / walls.js.
//
// The cabinet's hazards announced themselves: a bonus door breathed green and
// burst when taken, the vanishing floor blinked the whole cell before it
// solidified, teleport swirls turned, stunned legs wore orbiting stars, and a
// crumbled block dropped rubble. The DECISIONS live here; the pixels are index.jsx's.

export const WARP_PERIOD = 48

// the warp arch's slow green breath: 0 -> 1 -> 0 while the arch is live.
export function warpGlow(tick) {
    const t = (tick % WARP_PERIOD) / WARP_PERIOD
    return 0.5 - 0.5 * Math.cos(t * Math.PI * 2)
}

// the living arches on this floor (same legality rule the sim fires on: the
// jump must land further ahead and inside the quest).
export const liveWarps = (gs) => (gs.levelData && gs.levelData.warps || [])
    .filter((w) => w.to > gs.level && w.to < gs.levelCount)

// distance from the hero to the nearest live arch mouth, or null when the
// floor offers none.
export function archNear(gs) {
    const h = gs.hero
    let best = null
    for (const w of liveWarps(gs)) {
        const d = Math.hypot(w.x + 0.5 - h.x, w.y + 0.5 - h.y)
        if (best === null || d < best) best = d
    }
    return best
}

// worth a rising approach sweep? live arch within ARCH_NEAR cells.
export const ARCH_NEAR = 2
export const nearArch = (gs) => {
    const d = archNear(gs)
    return d !== null && d <= ARCH_NEAR
}

// the vanishing-floor warning: the last slice of the OPEN window. null while
// there is no trap field or the slabs are already solid; a hard blink on/off
// once under TRAP_WARN_FRAC of the window is left.
export const TRAP_WARN_FRAC = 0.3
export const TRAP_BLINK = 4
export function trapWarn(gs, tick) {
    const t = gs.levelData && gs.levelData.trap
    if (!t) return null
    const frac = (gs.playT + t.phase) % t.period
    if (frac >= t.open) return null
    if (t.open - frac > t.open * TRAP_WARN_FRAC) return null
    return Math.floor(tick / TRAP_BLINK) % 2 === 0
}

// stun stars: three yellow stars orbiting the fallen hero's head on a fixed
// tempo, flickering (two lit frames, one dark) while stunT runs. null upright.
export const STUN_STARS = 3
export const STUN_FAN = Math.PI / 6
export function stunStars(stunT, tick) {
    if (stunT <= 0) return null
    return {
        n: STUN_STARS,
        spin: (tick >> 1) * STUN_FAN,
        on: (tick >> 2) % 3 !== 2,
    }
}

// teleport pads: the exit is a paler tint of the entrance's hue, so the
// destination reads as related; the spiral turns at SPIN tempo.
export const TELE_PAD = '#e08fff'
export const TELE_EXIT = '#fff0ff'
export const teleColor = (base) => (base === 'p' ? TELE_EXIT : TELE_PAD)
export const TELE_SPIN = 8
export const teleSpin = (tick) => Math.floor(tick / 2) % TELE_SPIN

// a revealed false wall grinds away over REVEAL_FRAMES: returns the stone's
// remaining opacity (1 solid, 0 fully open) frames after the reveal started.
export const REVEAL_FRAMES = 3
export function revealFade(startTick, tick) {
    const age = tick - startTick
    if (age < 0) return 1
    return Math.max(0, 1 - (age + 1) / REVEAL_FRAMES)
}

// debris: a crumbled breakable drops DEBRIS_N falling chips at its tile.
export const DEBRIS_N = 3
export function debrisVel(i) {
    return { vx: (i - (DEBRIS_N - 1) / 2) * 0.8, vy: 0.4 + 0.35 * i, g: 0.18 }
}

// the hazard's own voice, distinct from the door/drain buzzes: the arch take
// is a rising burst, the approach a two-note climb, the false wall a low grind
// (below the door sweep's 160 Hz start) and the crumble a falling triad.
export const FX_TONES = {
    warpTake: { wave: 'sine', notes: [330, 660, 990] },
    warpNear: { wave: 'triangle', notes: [220, 330] },
    grind: { wave: 'square', notes: [98, 82] },
    debris: { wave: 'triangle', notes: [147, 110, 82] },
}
